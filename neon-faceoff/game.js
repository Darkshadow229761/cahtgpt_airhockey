"use strict";

(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const message = document.getElementById("message");
  const messageTitle = document.getElementById("messageTitle");
  const messageText = document.getElementById("messageText");
  const playButton = document.getElementById("playButton");
  const difficultySelect = document.getElementById("difficulty");
  const playerScoreElement = document.getElementById("playerScore");
  const botScoreElement = document.getElementById("botScore");
  const matchLabel = document.getElementById("matchLabel");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const WALL = 22;
  const GOAL_HALF = 92;
  const PADDLE_RADIUS = 27;
  const PUCK_RADIUS = 12;
  const WIN_SCORE = 7;

  const BOT_LEVELS = {
    easy: { speed: 3.8, reaction: 0.075, aimError: 47 },
    medium: { speed: 5, reaction: 0.115, aimError: 20 },
    hard: { speed: 6.3, reaction: 0.17, aimError: 4 }
  };

  const player = { x: 190, y: HEIGHT / 2, vx: 0, vy: 0 };
  const bot = { x: WIDTH - 190, y: HEIGHT / 2, vx: 0, vy: 0 };
  const puck = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 };

  let playerScore = 0;
  let botScore = 0;
  let running = false;
  let animationFrame = 0;
  let lastTime = 0;
  let serveDelay = 0;
  let keyboardTarget = { x: player.x, y: player.y };
  let keys = new Set();
  let particles = [];
  let shake = 0;
  let goalFlash = 0;
  let lastPoint = "";

  const clamp = (value, min, max) =>
    Math.max(min, Math.min(max, value));

  function showMessage(title, text, buttonText = "Play again") {
    messageTitle.textContent = title;
    messageText.textContent = text;
    playButton.textContent = buttonText;
    message.classList.remove("hidden");
  }

  function hideMessage() {
    message.classList.add("hidden");
  }

  function resetPositions(direction = Math.random() < 0.5 ? -1 : 1) {
    player.x = 190;
    player.y = HEIGHT / 2;
    player.vx = 0;
    player.vy = 0;

    bot.x = WIDTH - 190;
    bot.y = HEIGHT / 2;
    bot.vx = 0;
    bot.vy = 0;

    puck.x = WIDTH / 2;
    puck.y = HEIGHT / 2;
    puck.vx = direction * 3.2;
    puck.vy = (Math.random() - 0.5) * 2;

    keyboardTarget = { x: player.x, y: player.y };
    serveDelay = 42;
  }

  function startGame() {
    playerScore = 0;
    botScore = 0;

    playerScoreElement.textContent = "0";
    botScoreElement.textContent = "0";
    matchLabel.textContent = "First to 7";

    particles = [];
    lastPoint = "";
    resetPositions();

    running = true;
    hideMessage();

    lastTime = performance.now();
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(gameLoop);
  }

  function finishGame(winner) {
    running = false;
    matchLabel.textContent = "Match over";

    if (winner === "player") {
      showMessage("You win!", "A brilliant match. Want to play again?");
    } else {
      showMessage("Bot wins!", "The bot takes this round. Run it back?");
    }
  }

  function createBurst(x, y, color, amount) {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 5;

      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 25 + Math.random() * 25,
        maxLife: 50,
        color,
        size: 2 + Math.random() * 4
      });
    }
  }

  function scoreGoal(scorer) {
    if (scorer === "player") {
      playerScore++;
      playerScoreElement.textContent = playerScore;
      lastPoint = "player";
    } else {
      botScore++;
      botScoreElement.textContent = botScore;
      lastPoint = "bot";
    }

    goalFlash = 1;
    shake = 8;

    createBurst(
      puck.x,
      puck.y,
      scorer === "player" ? "#51f6ff" : "#ff4fa3",
      25
    );

    if (playerScore >= WIN_SCORE || botScore >= WIN_SCORE) {
      finishGame(playerScore >= WIN_SCORE ? "player" : "bot");
      return;
    }

    matchLabel.textContent = scorer === "player" ? "You scored!" : "Bot scored!";
    resetPositions(scorer === "player" ? 1 : -1);
  }

  function movePaddle(paddle, targetX, targetY, minX, maxX, maxSpeed) {
    targetX = clamp(targetX, minX, maxX);
    targetY = clamp(
      targetY,
      WALL + PADDLE_RADIUS,
      HEIGHT - WALL - PADDLE_RADIUS
    );

    let dx = targetX - paddle.x;
    let dy = targetY - paddle.y;
    const distance = Math.hypot(dx, dy);

    if (distance > maxSpeed) {
      dx = (dx / distance) * maxSpeed;
      dy = (dy / distance) * maxSpeed;
    }

    paddle.vx = dx;
    paddle.vy = dy;
    paddle.x += dx;
    paddle.y += dy;
  }

  function updateBot() {
    const level = BOT_LEVELS[difficultySelect.value];
    let targetX = WIDTH * 0.77;
    let targetY = HEIGHT / 2;

    if (puck.vx > 0) {
      const timeToBot = (bot.x - puck.x) / Math.max(1.2, puck.vx);
      const predictedY = puck.y + puck.vy * Math.max(0, timeToBot);

      targetY = clamp(
        predictedY,
        WALL + PADDLE_RADIUS,
        HEIGHT - WALL - PADDLE_RADIUS
      );

      if (puck.x > WIDTH * 0.52) {
        targetX = clamp(
          puck.x + 42,
          WIDTH * 0.56,
          WIDTH - WALL - PADDLE_RADIUS
        );

        targetY += (Math.random() - 0.5) * level.aimError * 0.08;
      }
    } else {
      targetY = clamp(
        HEIGHT / 2 + (puck.y - HEIGHT / 2) * 0.28,
        WALL + PADDLE_RADIUS,
        HEIGHT - WALL - PADDLE_RADIUS
      );
    }

    bot.x += (targetX - bot.x) * level.reaction;
    bot.y += (targetY - bot.y) * level.reaction;

    bot.x = clamp(
      bot.x,
      WIDTH / 2 + PADDLE_RADIUS + 10,
      WIDTH - WALL - PADDLE_RADIUS
    );

    bot.y = clamp(
      bot.y,
      WALL + PADDLE_RADIUS,
      HEIGHT - WALL - PADDLE_RADIUS
    );
  }

  function collidePuckWithPaddle(paddle, side) {
    let dx = puck.x - paddle.x;
    let dy = puck.y - paddle.y;
    let distance = Math.hypot(dx, dy);

    const minimumDistance = PUCK_RADIUS + PADDLE_RADIUS;
    if (distance >= minimumDistance) return;

    if (distance === 0) {
      dx = side === "left" ? 1 : -1;
      dy = 0;
      distance = 1;
    }

    const normalX = dx / distance;
    const normalY = dy / distance;
    const overlap = minimumDistance - distance;

    puck.x += normalX * overlap;
    puck.y += normalY * overlap;

    const relativeVx = puck.vx - paddle.vx;
    const relativeVy = puck.vy - paddle.vy;
    const approach = relativeVx * normalX + relativeVy * normalY;

    if (approach < 0) {
      puck.vx -= 2 * approach * normalX;
      puck.vy -= 2 * approach * normalY;
    } else {
      puck.vx += normalX * 1.4;
      puck.vy += normalY * 1.4;
    }

    puck.vx += paddle.vx * 0.48;
    puck.vy += paddle.vy * 0.48;

    const speed = Math.hypot(puck.vx, puck.vy);
    const adjustedSpeed = Math.min(11.5, Math.max(4.2, speed));

    if (speed > 0) {
      puck.vx = (puck.vx / speed) * adjustedSpeed;
      puck.vy = (puck.vy / speed) * adjustedSpeed;
    }

    createBurst(
      puck.x,
      puck.y,
      side === "left" ? "#51f6ff" : "#ff4fa3",
      5
    );
  }

  function update(deltaTime) {
    const step = Math.min(deltaTime / 16.667, 2);

    for (const particle of particles) {
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.vx *= 0.97;
      particle.vy *= 0.97;
      particle.life -= step;
    }

    particles = particles.filter(particle => particle.life > 0);
    shake *= 0.84;
    goalFlash *= 0.91;

    if (serveDelay > 0) {
      serveDelay -= step;
      return;
    }

    const keyboardSpeed = 7;

    if (keys.has("ArrowLeft") || keys.has("a")) {
      keyboardTarget.x -= keyboardSpeed * step;
    }
    if (keys.has("ArrowRight") || keys.has("d")) {
      keyboardTarget.x += keyboardSpeed * step;
    }
    if (keys.has("ArrowUp") || keys.has("w")) {
      keyboardTarget.y -= keyboardSpeed * step;
    }
    if (keys.has("ArrowDown") || keys.has("s")) {
      keyboardTarget.y += keyboardSpeed * step;
    }

    movePaddle(
      player,
      keyboardTarget.x,
      keyboardTarget.y,
      WALL + PADDLE_RADIUS,
      WIDTH / 2 - PADDLE_RADIUS - 10,
      10 * step
    );

    updateBot();

    puck.x += puck.vx * step;
    puck.y += puck.vy * step;

    // Top and bottom rails.
    if (puck.y - PUCK_RADIUS < WALL) {
      puck.y = WALL + PUCK_RADIUS;
      puck.vy = Math.abs(puck.vy);
      createBurst(puck.x, puck.y, "#7bdcff", 4);
    } else if (puck.y + PUCK_RADIUS > HEIGHT - WALL) {
      puck.y = HEIGHT - WALL - PUCK_RADIUS;
      puck.vy = -Math.abs(puck.vy);
      createBurst(puck.x, puck.y, "#7bdcff", 4);
    }

    // Side rails have openings for the goals.
    const inGoalLane =
      Math.abs(puck.y - HEIGHT / 2) < GOAL_HALF - PUCK_RADIUS * 0.25;

    if (puck.x - PUCK_RADIUS < WALL && !inGoalLane) {
      puck.x = WALL + PUCK_RADIUS;
      puck.vx = Math.abs(puck.vx);
    } else if (puck.x + PUCK_RADIUS > WIDTH - WALL && !inGoalLane) {
      puck.x = WIDTH - WALL - PUCK_RADIUS;
      puck.vx = -Math.abs(puck.vx);
    }

    collidePuckWithPaddle(player, "left");
    collidePuckWithPaddle(bot, "right");

    puck.vx *= Math.pow(0.9993, step);
    puck.vy *= Math.pow(0.9993, step);

    const puckSpeed = Math.hypot(puck.vx, puck.vy);
    if (puckSpeed > 12) {
      puck.vx *= 12 / puckSpeed;
      puck.vy *= 12 / puckSpeed;
    }

    if (puck.x < WALL - PUCK_RADIUS && inGoalLane) {
      scoreGoal("bot");
    } else if (puck.x > WIDTH - WALL + PUCK_RADIUS && inGoalLane) {
      scoreGoal("player");
    }
  }

  function drawRoundedRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  function drawTable() {
    const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    background.addColorStop(0, "#10223a");
    background.addColorStop(0.5, "#0c1930");
    background.addColorStop(1, "#102039");

    ctx.fillStyle = background;
    drawRoundedRect(0, 0, WIDTH, HEIGHT, 12);
    ctx.fill();

    // Subtle table lines.
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#6cc8e8";
    ctx.lineWidth = 1;

    for (let x = 20; x < WIDTH; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, WALL);
      ctx.lineTo(x, HEIGHT - WALL);
      ctx.stroke();
    }
    ctx.restore();

    // Outer rails.
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#6b89aa";
    drawRoundedRect(
      WALL,
      WALL,
      WIDTH - WALL * 2,
      HEIGHT - WALL * 2,
      6
    );
    ctx.stroke();

    // Goal openings.
    ctx.fillStyle = "#030815";
    ctx.fillRect(0, HEIGHT / 2 - GOAL_HALF, WALL + 3, GOAL_HALF * 2);
    ctx.fillRect(
      WIDTH - WALL - 3,
      HEIGHT / 2 - GOAL_HALF,
      WALL + 3,
      GOAL_HALF * 2
    );

    drawGoalLine(WALL, "#51f6ff");
    drawGoalLine(WIDTH - WALL, "#ff4fa3");

    // Centre line and face-off circle.
    ctx.save();
    ctx.setLineDash([9, 12]);
    ctx.strokeStyle = "#6a83a466";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2, WALL + 5);
    ctx.lineTo(WIDTH / 2, HEIGHT - WALL - 5);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "#91a7c544";
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT / 2, 75, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#91a7c566";
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (goalFlash > 0.03) {
      ctx.save();
      ctx.globalAlpha = goalFlash * 0.45;
      ctx.fillStyle = lastPoint === "player" ? "#51f6ff" : "#ff4fa3";
      ctx.fillRect(
        lastPoint === "player" ? 0 : WIDTH - 24,
        HEIGHT / 2 - GOAL_HALF,
        24,
        GOAL_HALF * 2
      );
      ctx.restore();
    }
  }

  function drawGoalLine(x, color) {
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, HEIGHT / 2 - GOAL_HALF);
    ctx.lineTo(x, HEIGHT / 2 + GOAL_HALF);
    ctx.stroke();
    ctx.restore();
  }

  function drawPaddle(paddle, color, label) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;

    const gradient = ctx.createRadialGradient(
      paddle.x - 8,
      paddle.y - 9,
      2,
      paddle.x,
      paddle.y,
      PADDLE_RADIUS
    );

    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.2, color);
    gradient.addColorStop(1, `${color}88`);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(paddle.x, paddle.y, PADDLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffffffaa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(paddle.x, paddle.y, PADDLE_RADIUS - 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#08101c";
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, paddle.x, paddle.y + 1);
    ctx.restore();
  }

  function drawPuck() {
    ctx.save();

    // Puck motion trail.
    for (let i = 5; i >= 1; i--) {
      ctx.globalAlpha = 0.035 * (6 - i);
      ctx.fillStyle = "#c7fbff";
      ctx.beginPath();
      ctx.arc(
        puck.x - puck.vx * i * 1.5,
        puck.y - puck.vy * i * 1.5,
        PUCK_RADIUS * (1 - i * 0.09),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.shadowColor = "#d7ffff";
    ctx.shadowBlur = 20;

    const gradient = ctx.createRadialGradient(
      puck.x - 4,
      puck.y - 4,
      1,
      puck.x,
      puck.y,
      PUCK_RADIUS
    );

    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.45, "#d3ffff");
    gradient.addColorStop(1, "#58ddeb");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(puck.x, puck.y, PUCK_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.save();

    if (shake > 0.4) {
      ctx.translate(
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake
      );
    }

    drawTable();
    drawParticles();
    drawPaddle(player, "#51f6ff", "YOU");
    drawPaddle(bot, "#ff4fa3", "BOT");
    drawPuck();

    if (serveDelay > 0 && running) {
      ctx.fillStyle = "#d9faff";
      ctx.font = "700 14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("GET READY", WIDTH / 2, HEIGHT / 2 - 105);
    }

    ctx.restore();
  }

  function gameLoop(now) {
    if (!running) return;

    const deltaTime = Math.min(now - lastTime, 34);
    lastTime = now;

    update(deltaTime);
    render();

    animationFrame = requestAnimationFrame(gameLoop);
  }

  function setPointerTarget(event) {
    const rect = canvas.getBoundingClientRect();

    keyboardTarget.x =
      ((event.clientX - rect.left) / rect.width) * WIDTH;

    keyboardTarget.y =
      ((event.clientY - rect.top) / rect.height) * HEIGHT;
  }

  canvas.addEventListener("pointermove", setPointerTarget);

  canvas.addEventListener("pointerdown", event => {
    canvas.setPointerCapture?.(event.pointerId);
    setPointerTarget(event);

    if (!running) {
      startGame();
    }
  });

  window.addEventListener("keydown", event => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(key)) {
      event.preventDefault();
    }

    keys.add(key);
  });

  window.addEventListener("keyup", event => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keys.delete(key);
  });

  playButton.addEventListener("click", startGame);
  document.getElementById("restart").addEventListener("click", startGame);

  resetPositions();
  render();
})();
