(() => {
  "use strict";
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const $ = id => document.getElementById(id);
  const ui = {
    playerScore:$("playerScore"), botScore:$("botScore"), targetCaption:$("targetCaption"),
    overlay:$("overlay"), overlayKicker:$("overlayKicker"), overlayTitle:$("overlayTitle"),
    overlayText:$("overlayText"), startBtn:$("startBtn"), startBtnText:$("startBtnText"),
    pauseBtn:$("pauseBtn"), resetBtn:$("resetBtn"), stateText:$("stateText"), stateDot:$("stateDot"),
    difficulty:$("difficulty"), difficultyDesc:$("difficultyDesc"), speedRange:$("speedRange"),
    speedValue:$("speedValue"), shots:$("shotsStat"), goals:$("goalsStat"), streak:$("streakStat"),
    accuracy:$("accuracyStat"), best:$("bestLabel"), soundToggle:$("soundToggle"), soundIcon:$("soundIcon"),
    goalFlash:$("goalFlash"), applyBtn:$("applyBtn")
  };
  const W=1000,H=600, wall=22, goalHalf=93;
  const difficultySettings = {
    rookie:{label:"Rookie", speed:.57, reaction:.19, aim:.22, predict:.1, desc:"A gentle opponent. Great for warm-ups."},
    pro:{label:"Pro", speed:.76, reaction:.105, aim:.48, predict:.3, desc:"Balanced reflexes and smart positioning."},
    elite:{label:"Elite", speed:.9, reaction:.065, aim:.72, predict:.62, desc:"Quick reactions and stronger counterattacks."},
    nightmare:{label:"Nightmare", speed:1.0, reaction:.035, aim:.88, predict:.86, desc:"Merciless tracking. Every opening matters."}
  };
  let targetScore=7, speedMultiplier=1, difficulty="pro", running=false, paused=false, over=false;
  let playerScore=0, botScore=0, shots=0, goals=0, streak=0, best=0, wins=0, soundOn=true;
  try { best = Number(localStorage.getItem("neonRinkBest") || 0); } catch(e) {}
  const keys = Object.create(null);
  let lastTime=0, aiThink=0, goalTimer=0, countdown=0, toastTimer;
  let audioCtx=null;
  const table={x:wall,y:wall,w:W-wall*2,h:H-wall*2};
  const player={x:W/2,y:H-125,px:W/2,py:H-125,vx:0,vy:0,r:35,color:"#4ce7ff"};
  const bot={x:W/2,y:125,px:W/2,py:125,vx:0,vy:0,r:35,color:"#ff4db8"};
  const puck={x:W/2,y:H/2,vx:0,vy:0,r:17,trail:[]};
  const particles=[];
  const pointer={x:W/2,y:H-125,active:false};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const rand=(a,b)=>a+Math.random()*(b-a);
  const len=(x,y)=>Math.hypot(x,y);
  function sound(freq=440,duration=.06,type="sine",volume=.035){
    if(!soundOn)return;
    try{
      audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==="suspended")audioCtx.resume();
      const o=audioCtx.createOscillator(),g=audioCtx.createGain();
      o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);
      g.gain.setValueAtTime(volume,audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);
      o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration);
    }catch(e){}
  }
  function toast(msg){
    let el=document.querySelector(".toast");
    if(!el){el=document.createElement("div");el.className="toast";document.body.appendChild(el);}
    el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),1900);
  }
  function updateUI(){
    ui.playerScore.textContent=playerScore;ui.botScore.textContent=botScore;ui.targetCaption.textContent=targetScore;
    ui.shots.textContent=shots;ui.goals.textContent=goals;ui.streak.textContent=streak;
    ui.accuracy.textContent=shots?Math.round(goals/shots*100)+"%":"—";
    ui.best.textContent="PERSONAL BEST · "+best;
  }
  function resetPuck(toward="random"){
    puck.x=W/2;puck.y=H/2;puck.vx=0;puck.vy=0;puck.trail=[];
    const angle=rand(-.62,.62);
    let dir=toward==="player"?1:toward==="bot"?-1:(Math.random()<.5?1:-1);
    setTimeout(()=>{
      if(!running||paused||over)return;
      const base=4.3*speedMultiplier;
      puck.vx=Math.sin(angle)*base;
      puck.vy=Math.cos(angle)*base*dir;
      sound(520,.08,"triangle",.025);
    },650);
  }
  function resetPositions(){
    player.x=W/2;player.y=H-125;player.px=player.x;player.py=player.y;player.vx=player.vy=0;
    bot.x=W/2;bot.y=125;bot.px=bot.x;bot.py=bot.y;bot.vx=bot.vy=0;
    pointer.x=player.x;pointer.y=player.y;resetPuck();
  }
  function showOverlay(mode){
    ui.overlay.classList.remove("hidden");
    if(mode==="ready"){
      ui.overlayKicker.textContent="ARCADE CHALLENGE";ui.overlayTitle.innerHTML="READY TO<br><span>RUMBLE?</span>";
      ui.overlayText.textContent=`First to ${targetScore} points wins. Keep your striker on your half and send the puck past NOVA-09.`;
      ui.startBtnText.textContent="START MATCH";
    }else if(mode==="paused"){
      ui.overlayKicker.textContent="MATCH PAUSED";ui.overlayTitle.innerHTML="TAKE A<br><span>BREATHER.</span>";
      ui.overlayText.textContent="The rink is frozen. Resume when you're ready to play.";
      ui.startBtnText.textContent="RESUME MATCH";
    }else{
      const won=playerScore>=targetScore;
      ui.overlayKicker.textContent=won?"RINK DOMINATED":"MATCH COMPLETE";
      ui.overlayTitle.innerHTML=won?'YOU <span>WIN!</span>':'BOT <span>WINS.</span>';
      ui.overlayText.textContent=won?`NOVA-09 defeated. Final score ${playerScore} : ${botScore}. Can you do it again on a harder level?`:`NOVA-09 takes this one, ${playerScore} : ${botScore}. Adjust your strategy and run it back.`;
      ui.startBtnText.textContent="PLAY AGAIN";
    }
  }
  function startMatch(){
    if(over){playerScore=0;botScore=0;shots=0;goals=0;over=false;resetPositions();updateUI();}
    running=true;paused=false;ui.overlay.classList.add("hidden");ui.pauseBtn.disabled=false;
    ui.pauseBtn.textContent="Ⅱ PAUSE";ui.stateText.textContent="MATCH IN PROGRESS";ui.stateDot.classList.add("active");
    lastTime=performance.now();sound(660,.1,"triangle",.04);
  }
  function togglePause(){
    if(!running||over)return;
    paused=!paused;
    if(paused){showOverlay("paused");ui.pauseBtn.textContent="▶ RESUME";ui.stateText.textContent="PAUSED";ui.stateDot.classList.remove("active");}
    else{ui.overlay.classList.add("hidden");ui.pauseBtn.textContent="Ⅱ PAUSE";ui.stateText.textContent="MATCH IN PROGRESS";ui.stateDot.classList.add("active");lastTime=performance.now();}
  }
  function resetMatch(){
    running=false;paused=false;over=false;playerScore=botScore=shots=goals=0;
    resetPositions();updateUI();ui.pauseBtn.disabled=true;ui.pauseBtn.textContent="Ⅱ PAUSE";
    ui.stateText.textContent="READY TO PLAY";ui.stateDot.classList.remove("active");showOverlay("ready");
  }
  function goal(who){
    if(who==="player"){playerScore++;goals++;streak++;best=Math.max(best,streak);ui.goalFlash.textContent="GOAL!";ui.goalFlash.style.color="#4ce7ff";sound(760,.17,"triangle",.06);sound(980,.22,"sine",.045);}
    else{botScore++;streak=0;ui.goalFlash.textContent="BOT SCORES";ui.goalFlash.style.color="#ff4db8";sound(190,.16,"sawtooth",.045);}
    ui.goalFlash.classList.remove("show");void ui.goalFlash.offsetWidth;ui.goalFlash.classList.add("show");
    burst(W/2,who==="player"?35:H-35,who==="player"?"#4ce7ff":"#ff4db8",35);
    updateUI();
    if(playerScore>=targetScore||botScore>=targetScore){
      running=false;over=true;ui.pauseBtn.disabled=true;ui.stateText.textContent="MATCH COMPLETE";ui.stateDot.classList.remove("active");
      if(playerScore>=targetScore)wins++;showOverlay("over");return;
    }
    puck.x=W/2;puck.y=H/2;puck.vx=puck.vy=0;puck.trail=[];
    player.x=W/2;player.y=H-125;bot.x=W/2;bot.y=125;
    resetPuck(who==="player"?"bot":"player");
  }
  function burst(x,y,color,n=15){
    for(let i=0;i<n;i++){const a=rand(0,Math.PI*2),s=rand(1,5);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.25,.75),max:.75,color,r:rand(1,4)});}
  }
  function moveStriker(s,tx,ty,dt,maxSpeed,half){
    s.px=s.x;s.py=s.y;
    const minY=half==="player"?H/2+s.r+7:s.r+wall+5;
    const maxY=half==="player"?H-wall-s.r-5:H/2-s.r-7;
    tx=clamp(tx,wall+s.r+5,W-wall-s.r-5);ty=clamp(ty,minY,maxY);
    const dx=tx-s.x,dy=ty-s.y,d=len(dx,dy),step=maxSpeed*dt;
    if(d>step&&d>0){s.x+=dx/d*step;s.y+=dy/d*step;}else{s.x=tx;s.y=ty;}
    s.vx=(s.x-s.px)/Math.max(dt,.001);s.vy=(s.y-s.py)/Math.max(dt,.001);
  }
  function updateAI(dt){
    const d=difficultySettings[difficulty];
    aiThink-=dt;
    let targetX=W/2,targetY=125;
    if(puck.y<H*.61 && puck.vy<0){
      const t=clamp((puck.y-110)/Math.max(1,-puck.vy*60),0,.45);
      targetX=puck.x+puck.vx*t*60*d.predict;
      targetY=clamp(puck.y-45,70,H/2-55);
    }else if(puck.y<H*.62){
      targetX=W/2+(puck.x-W/2)*.24;targetY=145;
    }else{
      targetX=W/2+(puck.x-W/2)*.18;targetY=118;
    }
    targetX=clamp(targetX,wall+bot.r+5,W-wall-bot.r-5);
    targetY=clamp(targetY,wall+bot.r+5,H/2-bot.r-8);
    if(aiThink<=0){
      aiThink=d.reaction;
      bot._tx=targetX+rand(-1,1)*(1-d.aim)*105;
      bot._ty=targetY+rand(-1,1)*(1-d.aim)*22;
    }
    moveStriker(bot,bot._tx||targetX,bot._ty||targetY,dt,560*d.speed, "bot");
  }
  function collideStriker(s,isPlayer){
    const dx=puck.x-s.x,dy=puck.y-s.y,dist=len(dx,dy),min=puck.r+s.r;
    if(dist<min&&dist>0){
      const nx=dx/dist,ny=dy/dist,overlap=min-dist;
      puck.x+=nx*(overlap+1);puck.y+=ny*(overlap+1);
      const rel=(puck.vx-s.vx)*nx+(puck.vy-s.vy)*ny;
      if(rel<0){
        puck.vx-=2*rel*nx;puck.vy-=2*rel*ny;
      }else{
        puck.vx+=nx*1.7;puck.vy+=ny*1.7;
      }
      puck.vx+=s.vx*.12;puck.vy+=s.vy*.12;
      const max=12.5*speedMultiplier,sp=len(puck.vx,puck.vy);
      if(sp>max){puck.vx=puck.vx/sp*max;puck.vy=puck.vy/sp*max;}
      if(isPlayer){shots++;sound(360+Math.min(500,sp*28),.045,"triangle",.022);}
      else sound(290+sp*22,.04,"sine",.015);
      burst(puck.x,puck.y,isPlayer?"#4ce7ff":"#ff4db8",6);
    }
  }
  function update(dt){
    if(!running||paused)return;
    moveStriker(player,pointer.x,pointer.y,dt,1000,"player");
    updateAI(dt);
    puck.trail.unshift({x:puck.x,y:puck.y});if(puck.trail.length>12)puck.trail.pop();
    puck.x+=puck.vx*60*dt;puck.y+=puck.vy*60*dt;
    const friction=Math.pow(.997,dt*60);puck.vx*=friction;puck.vy*=friction;
    const max=13.5*speedMultiplier,sp=len(puck.vx,puck.vy);if(sp>max){puck.vx=puck.vx/sp*max;puck.vy=puck.vy/sp*max;}
    // Side walls and goal openings.
    if(puck.x-puck.r<wall){puck.x=wall+puck.r;puck.vx=Math.abs(puck.vx)*.94;sound(220,.025,"sine",.01);burst(puck.x,puck.y,"#40e7ff",3);}
    if(puck.x+puck.r>W-wall){puck.x=W-wall-puck.r;puck.vx=-Math.abs(puck.vx)*.94;sound(220,.025,"sine",.01);burst(puck.x,puck.y,"#40e7ff",3);}
    if(puck.y-puck.r<wall){
      if(Math.abs(puck.x-W/2)<goalHalf-puck.r*.15){goal("player");return;}
      puck.y=wall+puck.r;puck.vy=Math.abs(puck.vy)*.94;
    }
    if(puck.y+puck.r>H-wall){
      if(Math.abs(puck.x-W/2)<goalHalf-puck.r*.15){goal("bot");return;}
      puck.y=H-wall-puck.r;puck.vy=-Math.abs(puck.vy)*.94;
    }
    collideStriker(player,true);collideStriker(bot,false);
    // Enforce half-line for strikers and recover slow pucks.
    player.y=clamp(player.y,H/2+player.r+6,H-wall-player.r-5);
    bot.y=clamp(bot.y,wall+bot.r+5,H/2-bot.r-6);
    if(sp<.18&&len(puck.x-W/2,puck.y-H/2)>50){puck.vx+=(W/2-puck.x)*.0007;puck.vy+=(H/2-puck.y)*.0007;}
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*60*dt;p.y+=p.vy*60*dt;p.vx*=.98;p.vy*=.98;p.life-=dt;if(p.life<=0)particles.splice(i,1);}
    updateUI();
  }
  function roundedRect(x,y,w,h,r){
    ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
  }
  function drawTable(){
    ctx.clearRect(0,0,W,H);
    const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,"#0a1830");bg.addColorStop(.5,"#071326");bg.addColorStop(1,"#0b1025");
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    // subtle rink grid
    ctx.save();ctx.globalAlpha=.16;ctx.strokeStyle="#2b5b87";ctx.lineWidth=1;
    for(let x=wall+20;x<W-wall;x+=40){ctx.beginPath();ctx.moveTo(x,wall);ctx.lineTo(x,H-wall);ctx.stroke();}
    for(let y=wall+20;y<H-wall;y+=40){ctx.beginPath();ctx.moveTo(wall,y);ctx.lineTo(W-wall,y);ctx.stroke();}
    ctx.restore();
    // Outer neon rails
    ctx.save();ctx.shadowBlur=18;ctx.shadowColor="#36c9ff";ctx.strokeStyle="#2b8bb9";ctx.lineWidth=3;
    roundedRect(wall,wall,W-wall*2,H-wall*2,17);ctx.stroke();ctx.restore();
    // goal cutouts
    ctx.fillStyle="#040914";ctx.fillRect(W/2-goalHalf,wall-5,goalHalf*2,14);ctx.fillRect(W/2-goalHalf,H-wall-9,goalHalf*2,14);
    ctx.save();ctx.strokeStyle="#ff4db8";ctx.shadowColor="#ff4db8";ctx.shadowBlur=16;ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(W/2-goalHalf,wall+2);ctx.lineTo(W/2-goalHalf,wall+17);ctx.moveTo(W/2+goalHalf,wall+2);ctx.lineTo(W/2+goalHalf,wall+17);ctx.stroke();
    ctx.strokeStyle="#40e7ff";ctx.shadowColor="#40e7ff";ctx.beginPath();ctx.moveTo(W/2-goalHalf,H-wall-2);ctx.lineTo(W/2-goalHalf,H-wall-17);ctx.moveTo(W/2+goalHalf,H-wall-2);ctx.lineTo(W/2+goalHalf,H-wall-17);ctx.stroke();ctx.restore();
    // center line and circle
    ctx.save();ctx.setLineDash([9,10]);ctx.strokeStyle="#6886ac65";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(wall+8,H/2);ctx.lineTo(W-wall-8,H/2);ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle="#5f82ac55";ctx.lineWidth=2;ctx.beginPath();ctx.arc(W/2,H/2,78,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(W/2,H/2,7,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle="#7c91b4";ctx.font="700 10px Orbitron";ctx.textAlign="center";ctx.fillText("NOVA-09",W/2,wall+36);ctx.fillText("PLAYER ONE",W/2,H-wall-24);ctx.restore();
    // goal mouth glow
    ctx.save();let g=ctx.createLinearGradient(W/2-goalHalf,0,W/2+goalHalf,0);g.addColorStop(0,"#ff4db808");g.addColorStop(.5,"#ff4db830");g.addColorStop(1,"#ff4db808");ctx.fillStyle=g;ctx.fillRect(W/2-goalHalf,wall,W/2*0+goalHalf*2,13);let g2=ctx.createLinearGradient(W/2-goalHalf,0,W/2+goalHalf,0);g2.addColorStop(0,"#40e7ff08");g2.addColorStop(.5,"#40e7ff30");g2.addColorStop(1,"#40e7ff08");ctx.fillStyle=g2;ctx.fillRect(W/2-goalHalf,H-wall-13,goalHalf*2,13);ctx.restore();
  }
  function drawPuck(){
    puck.trail.forEach((p,i)=>{const a=(1-i/puck.trail.length)*.17;ctx.beginPath();ctx.fillStyle=`rgba(111,231,255,${a})`;ctx.arc(p.x,p.y,puck.r*(1-i/puck.trail.length)*.82,0,Math.PI*2);ctx.fill();});
    ctx.save();ctx.shadowColor="#baf8ff";ctx.shadowBlur=22;
    const grad=ctx.createRadialGradient(puck.x-5,puck.y-6,2,puck.x,puck.y,puck.r+2);grad.addColorStop(0,"#ffffff");grad.addColorStop(.35,"#d6fbff");grad.addColorStop(1,"#42a9c7");
    ctx.fillStyle=grad;ctx.beginPath();ctx.arc(puck.x,puck.y,puck.r,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(puck.x,puck.y,puck.r-3,0,Math.PI*2);ctx.stroke();
  }
  function drawStriker(s,label,isBot){
    ctx.save();
    ctx.shadowColor=s.color;ctx.shadowBlur=24;
    const g=ctx.createRadialGradient(s.x-s.r*.25,s.y-s.r*.35,2,s.x,s.y,s.r);
    g.addColorStop(0,isBot?"#ffd4ed":"#d8fbff");g.addColorStop(.35,s.color);g.addColorStop(1,isBot?"#8a1b67":"#164d9e");
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;ctx.strokeStyle=isBot?"#ffb2df":"#aaf6ff";ctx.lineWidth=3;ctx.beginPath();ctx.arc(s.x,s.y,s.r-5,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle=isBot?"#48113a":"#0b2856";ctx.beginPath();ctx.arc(s.x,s.y,s.r*.47,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=isBot?"#ff8bd0":"#6ceeff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,s.r*.47,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle="#fff";ctx.font="800 12px Orbitron";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(label,s.x,s.y+1);
    ctx.restore();
  }
  function drawParticles(){
    for(const p of particles){ctx.save();ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=10;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.restore();}
  }
  function render(){
    drawTable();drawParticles();drawPuck();drawStriker(bot,"AI",true);drawStriker(player,"YOU",false);
    if(!running&&!over){
      ctx.save();ctx.fillStyle="#8ba5cb";ctx.globalAlpha=.45;ctx.font="700 11px Orbitron";ctx.textAlign="center";ctx.fillText("MOVE YOUR STRIKER TO AIM",W/2,H/2+125);ctx.restore();
    }
  }
  function loop(t){
    const dt=Math.min(.032,(t-(lastTime||t))/1000||0);lastTime=t;
    update(dt);render();requestAnimationFrame(loop);
  }
  function canvasPoint(e){
    const r=canvas.getBoundingClientRect();
    return {x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H};
  }
  canvas.addEventListener("pointermove",e=>{const p=canvasPoint(e);pointer.x=p.x;pointer.y=p.y;pointer.active=true;});
  canvas.addEventListener("pointerdown",e=>{const p=canvasPoint(e);pointer.x=p.x;pointer.y=p.y;pointer.active=true;if(!running&&!over)startMatch();});
  canvas.addEventListener("contextmenu",e=>e.preventDefault());
  window.addEventListener("keydown",e=>{
    if(e.code==="Space"){e.preventDefault();if(running)togglePause();}
    if(e.key.toLowerCase()==="r")resetMatch();
    if(e.key==="Escape"&&running)togglePause();
  });
  ui.startBtn.addEventListener("click",()=>{if(running&&paused){togglePause();return;}startMatch();});
  ui.pauseBtn.addEventListener("click",()=>{if(running)togglePause();else if(paused)togglePause();});
  ui.resetBtn.addEventListener("click",()=>{resetMatch();toast("MATCH RESET");});
  ui.difficulty.addEventListener("change",()=>{difficulty=ui.difficulty.value;ui.difficultyDesc.textContent=difficultySettings[difficulty].desc;toast(difficultySettings[difficulty].label+" difficulty selected");});
  document.querySelectorAll("#targetPicker button").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll("#targetPicker button").forEach(x=>x.classList.remove("active"));b.classList.add("active");targetScore=Number(b.dataset.target);ui.targetCaption.textContent=targetScore;
  }));
  ui.speedRange.addEventListener("input",()=>{speedMultiplier=Number(ui.speedRange.value)/100;ui.speedValue.textContent=ui.speedRange.value+"%";});
  ui.applyBtn.addEventListener("click",()=>{difficulty=ui.difficulty.value;speedMultiplier=Number(ui.speedRange.value)/100;ui.difficultyDesc.textContent=difficultySettings[difficulty].desc;ui.targetCaption.textContent=targetScore;toast("SETTINGS APPLIED");sound(580,.07,"triangle",.025);});
  ui.soundToggle.addEventListener("click",()=>{soundOn=!soundOn;ui.soundIcon.textContent=soundOn?"♫":"♪̸";ui.soundToggle.style.opacity=soundOn?"1":".55";toast(soundOn?"SOUND ENABLED":"SOUND MUTED");if(soundOn)sound(520,.08);});
  resetPositions();updateUI();showOverlay("ready");requestAnimationFrame(loop);
})();