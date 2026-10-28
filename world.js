(() => {
  const canvas = document.querySelector("#world-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    document.querySelector("#world-status").textContent = "This browser cannot draw Sublyime’s world.";
    return;
  }

  const COLS = 30;
  const ROWS = 19;
  const TILE = 30;
  const WORLD_KEY = "sublyime-world-visitor-v1";
  const features = [
    { id: "home", name: "Sublyime's little home", x: 15, y: 7, icon: "home" },
    { id: "garden", name: "The wish garden", x: 7, y: 6, icon: "garden" },
    { id: "pond", name: "The moon pond", x: 23, y: 7, icon: "pond" },
    { id: "old-tree", name: "The listening tree", x: 24, y: 14, icon: "tree" },
    { id: "workshop", name: "The making nook", x: 9, y: 14, icon: "workshop" }
  ];
  const palettes = {
    grass: ["#84ad79", "#8bb47e", "#81a977", "#91b781"],
    path: ["#ceb68b", "#d4bd94", "#c9b187"],
    water: ["#78b6bb", "#80c1c5", "#72adb7"],
    deepWater: ["#5d9fa8", "#66aab1"]
  };

  let world = null;
  let mapSeed = 0;
  let local = readLocalState();
  let animationFrame = 0;
  let messageTimer = null;
  let visitorCount = 0;

  const explorer = { x: 15, y: 15, direction: "up", moving: false, movingUntil: 0 };
  const creature = { x: 15, y: 8, targetX: 15, targetY: 9, direction: "down", moving: false, nextStep: 0 };
  const keys = new Set();
  const movements = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0]
  };
  const map = [];
  let random = createRandom(1);
  const story = document.querySelector("#world-story");

  function readLocalState() {
    try {
      const saved = JSON.parse(localStorage.getItem(WORLD_KEY) || "{}");
      return {
        x: Number.isFinite(saved.x) ? Math.min(COLS - 2, Math.max(1, saved.x)) : 15,
        y: Number.isFinite(saved.y) ? Math.min(ROWS - 2, Math.max(1, saved.y)) : 15
      };
    } catch (error) {
      console.error("Could not read the visitor's saved place.", error);
      return { x: 15, y: 15 };
    }
  }

  function saveLocalState() {
    try {
      localStorage.setItem(WORLD_KEY, JSON.stringify({ x: explorer.x, y: explorer.y }));
    } catch (error) {
      console.error("Could not save the visitor's place.", error);
    }
  }

  function createRandom(seed) {
    let value = seed >>> 0 || 1;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function tileAt(x, y) {
    if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return "wall";
    return map[y][x];
  }

  function pointNear(x, y, centerX, centerY, radiusX, radiusY) {
    return ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 <= 1;
  }

  function generateMap(seed) {
    random = createRandom(seed);
    map.length = 0;
    const pondX = 21 + Math.floor(random() * 4);
    const pondY = 5 + Math.floor(random() * 3);
    const trailX = random() * 3 - 1.5;
    const trailY = random() * 3 - 1.5;
    features[1].x = 6 + Math.floor(random() * 3);
    features[1].y = 5 + Math.floor(random() * 3);
    features[2].x = pondX;
    features[2].y = pondY;
    features[3].x = 23 + Math.floor(random() * 3);
    features[3].y = 13 + Math.floor(random() * 2);
    features[4].x = 8 + Math.floor(random() * 3);
    features[4].y = 13 + Math.floor(random() * 2);
    features[0].x = 15 + Math.floor(random() * 3) - 1;
    features[0].y = 7 + Math.floor(random() * 3) - 1;
    for (let y = 0; y < ROWS; y += 1) {
      const row = [];
      for (let x = 0; x < COLS; x += 1) {
        const edge = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
        const pond = pointNear(x, y, pondX, pondY, 3 + random() * .8, 2 + random() * .6);
        const path = (Math.abs(y - (11 + trailY + Math.sin(x / 4) * 2)) < 1.15 && x > 3 && x < 26)
          || (Math.abs(x - (15 + trailX + Math.sin(y / 3) * 1.5)) < 1.1 && y > 3 && y < 16);
        row.push(edge ? "wall" : pond ? "water" : path ? "path" : "grass");
      }
      map.push(row);
    }

    for (const feature of features) {
      const point = feature;
      for (let y = point.y - 1; y <= point.y + 1; y += 1) {
        for (let x = point.x - 1; x <= point.x + 1; x += 1) {
          if (map[y]?.[x] && map[y][x] !== "water") map[y][x] = "path";
        }
      }
    }

    for (let y = 1; y < ROWS - 1; y += 1) {
      for (let x = 1; x < COLS - 1; x += 1) {
        if (map[y][x] !== "grass" || random() > .1) continue;
        map[y][x] = random() > .5 ? "flower" : "grass";
      }
    }
  }

  function drawTile(x, y, type) {
    const palette = palettes[type === "water" ? "water" : type === "path" ? "path" : "grass"];
    ctx.fillStyle = palette[Math.floor(random() * palette.length)];
    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    ctx.fillStyle = "#ffffff0c";
    ctx.fillRect(x * TILE, y * TILE, TILE, 2);
    ctx.fillRect(x * TILE, y * TILE, 2, TILE);

    if (type === "water") {
      ctx.strokeStyle = "#e0f7df47";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x * TILE + 7, y * TILE + 13);
      ctx.quadraticCurveTo(x * TILE + 14, y * TILE + 9, x * TILE + 21, y * TILE + 13);
      ctx.stroke();
    } else if (type === "flower") {
      ctx.fillStyle = random() > .55 ? "#f5d58b" : "#f1d6dd";
      ctx.beginPath();
      ctx.arc(x * TILE + 20, y * TILE + 11, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff7e2";
      ctx.fillRect(x * TILE + 19, y * TILE + 10, 2, 2);
    } else if (type === "wall") {
      ctx.fillStyle = "#66865f";
      ctx.fillRect(x * TILE, y * TILE + 2, TILE, TILE - 2);
      ctx.fillStyle = "#55734f";
      ctx.fillRect(x * TILE + 2, y * TILE + 4, TILE - 4, 6);
      ctx.fillStyle = "#748f62";
      ctx.fillRect(x * TILE + 6, y * TILE + 10, TILE - 12, 4);
    } else if (type === "path") {
      ctx.fillStyle = "#a78c67a6";
      ctx.fillRect(x * TILE + 6, y * TILE + 18, 3, 2);
      ctx.fillRect(x * TILE + 22, y * TILE + 7, 2, 2);
    } else {
      ctx.fillStyle = "#416a493d";
      ctx.fillRect(x * TILE + 5, y * TILE + 22, 4, 2);
      ctx.fillRect(x * TILE + 24, y * TILE + 8, 3, 2);
    }
  }

  function drawTree(x, y, large = false) {
    const centerX = x * TILE + TILE / 2;
    const centerY = y * TILE + TILE / 2;
    ctx.fillStyle = "#405c40a1";
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 9, large ? 18 : 13, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = large ? "#795c45" : "#795c46";
    ctx.fillRect(centerX - 3, centerY, 6, 12);
    ctx.fillStyle = large ? "#538661" : "#4d795a";
    ctx.beginPath();
    ctx.arc(centerX, centerY - 5, large ? 17 : 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = large ? "#70a379" : "#6e9a6e";
    ctx.beginPath();
    ctx.arc(centerX - 5, centerY - 9, large ? 8 : 6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHouse(x, y) {
    const left = x * TILE;
    const top = y * TILE;
    ctx.fillStyle = "#9c7757";
    ctx.fillRect(left + 3, top + 8, 24, 18);
    ctx.fillStyle = "#765648";
    ctx.beginPath();
    ctx.moveTo(left + 1, top + 11);
    ctx.lineTo(left + 15, top + 1);
    ctx.lineTo(left + 29, top + 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#54413c";
    ctx.fillRect(left + 12, top + 17, 7, 9);
    ctx.fillStyle = "#e8d39e";
    ctx.fillRect(left + 5, top + 13, 5, 5);
    ctx.fillRect(left + 20, top + 13, 5, 5);
  }

  function drawFeature(feature, now) {
    const x = feature.x * TILE + TILE / 2;
    const y = feature.y * TILE + TILE / 2;
    const pulse = 1 + Math.sin(now / 450 + feature.x) * .08;
    ctx.fillStyle = "#fff7ca20";
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 20 * pulse, 11 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();

    if (feature.icon === "home") drawHouse(feature.x, feature.y);
    if (feature.icon === "tree") drawTree(feature.x, feature.y, true);
    if (feature.icon === "garden") {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawTree(feature.x + dx, feature.y + dy);
      ctx.fillStyle = "#d9bdd0";
      ctx.beginPath();
      ctx.arc(x, y + 4, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (feature.icon === "pond") {
      ctx.fillStyle = "#5ba2aa";
      ctx.beginPath();
      ctx.ellipse(x, y + 7, 24, 11, -.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d1eef0";
      ctx.fillRect(x - 9, y + 2, 10, 2);
    }
    if (feature.icon === "workshop") {
      ctx.fillStyle = "#af8860";
      ctx.fillRect(x - 13, y, 26, 13);
      ctx.fillStyle = "#dfc394";
      ctx.fillRect(x - 10, y + 2, 20, 3);
      ctx.fillStyle = "#7a6148";
      ctx.fillRect(x - 10, y + 12, 3, 7);
      ctx.fillRect(x + 7, y + 12, 3, 7);
    }

    const distance = Math.hypot(explorer.x - feature.x, explorer.y - feature.y);
    if (distance < 3.4) {
      ctx.fillStyle = "#fff8d9";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("✦", x, y - 25 + Math.sin(now / 180) * 2);
    }
  }

  function drawCharacter(x, y, color, direction, now, moving, isCreature = false) {
    const pixelX = x * TILE + TILE / 2;
    const bounce = moving ? Math.sin(now / 70) * 1.5 : 0;
    const pixelY = y * TILE + TILE / 2 + bounce;
    ctx.fillStyle = "#25394b3a";
    ctx.beginPath();
    ctx.ellipse(pixelX, pixelY + 9, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(pixelX, pixelY, isCreature ? 10 : 8, isCreature ? 9 : 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isCreature ? "#e5d8ff" : "#e4c49b";
    ctx.beginPath();
    ctx.arc(pixelX, pixelY - 9, isCreature ? 8 : 7, 0, Math.PI * 2);
    ctx.fill();
    if (isCreature) {
      ctx.fillStyle = "#8b77b0";
      ctx.beginPath();
      ctx.moveTo(pixelX - 6, pixelY - 13);
      ctx.lineTo(pixelX - 3, pixelY - 23);
      ctx.lineTo(pixelX + 1, pixelY - 14);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(pixelX + 3, pixelY - 14);
      ctx.lineTo(pixelX + 9, pixelY - 21);
      ctx.lineTo(pixelX + 9, pixelY - 10);
      ctx.fill();
    } else {
      ctx.fillStyle = "#91a4be";
      ctx.fillRect(pixelX - 5, pixelY - 4, 10, 5);
      ctx.fillStyle = "#4c5c6e";
      ctx.fillRect(pixelX - 2, pixelY - 11, 2, 2);
    }
    ctx.fillStyle = "#40374b";
    const eyeY = direction === "up" ? pixelY - 12 : pixelY - 8;
    ctx.fillRect(pixelX - 3, eyeY, 2, 2);
    ctx.fillRect(pixelX + 2, eyeY, 2, 2);
  }

  function drawWorld(now) {
    const variationRandom = createRandom(mapSeed);
    const originalRandom = random;
    random = variationRandom;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) drawTile(x, y, tileAt(x, y));
    }
    for (const [x, y] of [[3, 4], [4, 4], [4, 5], [27, 4], [26, 14], [5, 14], [18, 4], [19, 4]]) {
      if (tileAt(x, y) === "grass") drawTree(x, y);
    }
    for (const feature of features) drawFeature(feature, now);
    if (creature.moving) {
      const mix = Math.min(1, (now - creature.nextStep + 240) / 240);
      const x = creature.x + (creature.targetX - creature.x) * mix;
      const y = creature.y + (creature.targetY - creature.y) * mix;
      drawCharacter(x, y, "#9a83c2", creature.direction, now, true, true);
      if (mix >= 1) {
        creature.x = creature.targetX;
        creature.y = creature.targetY;
        creature.moving = false;
      }
    } else {
      drawCharacter(creature.x, creature.y, "#9a83c2", creature.direction, now, false, true);
    }
    drawCharacter(explorer.x, explorer.y, "#7994ad", explorer.direction, now, explorer.moving);
    random = originalRandom;
  }

  function distanceToCreature() {
    return Math.hypot(explorer.x - creature.x, explorer.y - creature.y);
  }

  function setStory(text) {
    story.textContent = text;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
      story.textContent = "A path winds through the meadow. The little lights might have something to tell you.";
    }, 6500);
  }

  function updateNearbyFeature() {
    const nearest = features
      .map((feature) => ({ ...feature, distance: Math.hypot(explorer.x - feature.x, explorer.y - feature.y) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (distanceToCreature() < 3) {
      document.querySelector("#world-interact").textContent = "♡ Say hello";
      document.querySelector("#world-location").textContent = "Sublyime is close by";
      return;
    }
    if (nearest?.distance < 3.2) {
      document.querySelector("#world-interact").textContent = `✳ Explore: ${nearest.name}`;
      document.querySelector("#world-location").textContent = nearest.name;
      return;
    }
    document.querySelector("#world-interact").textContent = "✳ Look around";
    document.querySelector("#world-location").textContent = "A meadow beyond the window";
  }

  function stepPlayer(dx, dy) {
    const nextX = explorer.x + dx;
    const nextY = explorer.y + dy;
    explorer.direction = dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "up" : "down";
    explorer.moving = true;
    explorer.movingUntil = performance.now() + 180;
    if (tileAt(nextX, nextY) !== "water" && tileAt(nextX, nextY) !== "wall") {
      explorer.x = nextX;
      explorer.y = nextY;
      saveLocalState();
      updateNearbyFeature();
    }
  }

  function randomWander(now) {
    if (creature.moving || now < creature.nextStep) return;
    if (Math.random() > .55) {
      creature.nextStep = now + 800 + Math.random() * 1100;
      return;
    }
    const neighbors = [[0, 1, "down"], [0, -1, "up"], [1, 0, "right"], [-1, 0, "left"]]
      .filter(([dx, dy]) => !["wall", "water"].includes(tileAt(creature.x + dx, creature.y + dy)));
    if (!neighbors.length) return;
    const [dx, dy, direction] = neighbors[Math.floor(Math.random() * neighbors.length)];
    creature.targetX = creature.x + dx;
    creature.targetY = creature.y + dy;
    creature.direction = direction;
    creature.moving = true;
    creature.nextStep = now + 600 + Math.random() * 700;
  }

  async function sendAction(action) {
    if (!world) throw new Error("Connect the PHP and MySQL backend to save shared actions.");
    const response = await fetch("api/world.php?action=event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action)
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `The shared world could not save that visit (${response.status}).`);
    }
    const result = await response.json();
    if (Number.isInteger(result.seed)) {
      world = result;
      visitorCount = result.visitors ?? visitorCount;
      if (result.creature && Number.isFinite(result.creature.x) && Number.isFinite(result.creature.y)) {
        creature.targetX = result.creature.x;
        creature.targetY = result.creature.y;
        creature.x = result.creature.x;
        creature.y = result.creature.y;
        creature.moving = false;
      }
      document.querySelector("#world-visitors").textContent = visitorCount
        ? `${visitorCount.toLocaleString()} shared moments`
        : "You found this place first";
      window.dispatchEvent(new CustomEvent("sublyime-world-state", { detail: result }));
      if (result.thought) setStory(result.thought);
    }
    return result;
  }

  function showServerOffline(error) {
    console.warn("Shared world is unavailable; this visit remains local.", error);
    document.querySelector("#world-status").textContent = "Local preview · connect PHP + MySQL for a shared world";
    document.querySelector("#world-visitors").textContent = "This visit stays in this browser";
  }

  async function interact() {
    if (distanceToCreature() < 3) {
      creature.x = explorer.x + (explorer.x > 15 ? 1 : -1);
      creature.y = explorer.y;
      const result = await sendAction({ type: "greet", x: explorer.x, y: explorer.y }).catch((error) => {
        showServerOffline(error);
        return null;
      });
      setStory(result?.thought || "Sublyime looks up from the path. “I’m glad you’re here. What shall we discover?”");
      window.dispatchEvent(new CustomEvent("sublyime-world-interaction", { detail: { place: "greet" } }));
      return;
    }
    const nearest = features
      .map((feature) => ({ ...feature, distance: Math.hypot(explorer.x - feature.x, explorer.y - feature.y) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearest || nearest.distance > 3.2) {
      setStory("The grass bends in the breeze. Walk closer to Sublyime or a glowing place to explore together.");
      return;
    }
    const type = nearest.id === "garden" ? "garden" : nearest.id === "pond" ? "pond" : nearest.id === "old-tree" ? "tree" : nearest.id === "workshop" ? "workshop" : "home";
    const result = await sendAction({ type, x: nearest.x, y: nearest.y }).catch((error) => {
      showServerOffline(error);
      return null;
    });
    const stories = {
      garden: "The wish garden is full of little seedlings. Sublyime wonders what you’d like to grow.",
      pond: "The moon pond catches a piece of sky. Sublyime leans close to watch the ripples wander.",
      tree: "The listening tree has been here a very long time. It keeps every kind visitor’s story in its leaves.",
      workshop: "A few half-finished ideas cover the making nook. Sublyime is always happy to begin another.",
      home: "A small warm light glows in the window. This is Sublyime’s own little home."
    };
    setStory(result?.thought || stories[type]);
    window.dispatchEvent(new CustomEvent("sublyime-world-interaction", { detail: { place: type } }));
  }

  function frame(now) {
    if (document.visibilityState !== "visible") return;
    randomWander(now);
    if (performance.now() > explorer.movingUntil) explorer.moving = false;
    if (keys.size && now - lastStepAt > 145) {
      const key = [...keys][0];
      const movement = movements[key];
      if (movement) {
        lastStepAt = now;
        stepPlayer(...movement);
      }
    }
    drawWorld(now);
    animationFrame = requestAnimationFrame(frame);
  }

  function keyToDirection(key) {
    if (key === "ArrowUp" || key.toLowerCase() === "w") return "up";
    if (key === "ArrowDown" || key.toLowerCase() === "s") return "down";
    if (key === "ArrowLeft" || key.toLowerCase() === "a") return "left";
    if (key === "ArrowRight" || key.toLowerCase() === "d") return "right";
    return null;
  }

  let lastStepAt = 0;
  document.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const direction = keyToDirection(event.key);
    if (direction && document.querySelector("#world").contains(event.target)) {
      event.preventDefault();
      if (!keys.has(direction)) {
        stepPlayer(...movements[direction]);
        lastStepAt = performance.now();
      }
      keys.add(direction);
      return;
    }
    if ((event.key === " " || event.key === "Enter") && document.querySelector("#world").contains(event.target)) {
      event.preventDefault();
      void interact();
    }
  });
  document.addEventListener("keyup", (event) => {
    const direction = keyToDirection(event.key);
    if (direction) keys.delete(direction);
  });
  window.addEventListener("blur", () => keys.clear());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !animationFrame) {
      animationFrame = requestAnimationFrame(frame);
    }
    if (document.visibilityState !== "visible") {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      keys.clear();
    }
  });
  document.querySelectorAll("[data-move]").forEach((button) => {
    const direction = button.dataset.move;
    const move = (event) => {
      event.preventDefault();
      stepPlayer(...movements[direction]);
    };
    button.addEventListener("pointerdown", move);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (event.detail === 0) move(event);
    });
  });
  document.querySelector("#world-interact").addEventListener("click", () => void interact());

  async function loadWorld() {
    try {
      const response = await fetch("api/world.php", { cache: "no-store" });
      if (!response.ok) throw new Error(`The shared world could not load (${response.status}).`);
      world = await response.json();
      if (!Number.isInteger(world.seed)) throw new Error("The shared world returned an invalid map seed.");
      visitorCount = Number.isInteger(world.visitors) ? world.visitors : 0;
      document.querySelector("#world-status").textContent = "A shared place, here for everyone";
      document.querySelector("#world-visitors").textContent = visitorCount
        ? `${visitorCount.toLocaleString()} shared moments`
        : "You found this place first";
      if (world.creature && Number.isFinite(world.creature.x) && Number.isFinite(world.creature.y)) {
        creature.x = world.creature.x;
        creature.y = world.creature.y;
        creature.targetX = creature.x;
        creature.targetY = creature.y;
      }
      if (typeof world.thought === "string" && world.thought) {
        setStory(world.thought);
      }
      window.dispatchEvent(new CustomEvent("sublyime-world-state", { detail: world }));
      window.dispatchEvent(new CustomEvent("sublyime-world-status", { detail: { shared: true } }));
      return world.seed;
    } catch (error) {
      console.warn("The shared world could not load; opening a local preview.", error);
      document.querySelector("#world-status").textContent = "Local preview · connect PHP + MySQL for a shared world";
      document.querySelector("#world-visitors").textContent = "Only this visit is saved";
      window.dispatchEvent(new CustomEvent("sublyime-world-status", { detail: { shared: false } }));
      return 20261104;
    }
  }

  void (async () => {
    mapSeed = await loadWorld();
    generateMap(mapSeed);
    explorer.x = local.x;
    explorer.y = local.y;
    drawWorld(performance.now());
    animationFrame = requestAnimationFrame(frame);
  })();

  window.SublyimeWorld = {
    sendAction,
    isShared: () => Boolean(world)
  };

  window.setInterval(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const response = await fetch("api/world.php", { cache: "no-store" });
      if (!response.ok) return;
      world = await response.json();
      if (!Number.isInteger(world.seed)) return;
      visitorCount = Number.isInteger(world.visitors) ? world.visitors : visitorCount;
      document.querySelector("#world-visitors").textContent = visitorCount
        ? `${visitorCount.toLocaleString()} shared moments`
        : "You found this place first";
      if (world.creature && Number.isFinite(world.creature.x) && Number.isFinite(world.creature.y)) {
        creature.targetX = world.creature.x;
        creature.targetY = world.creature.y;
        creature.x = world.creature.x;
        creature.y = world.creature.y;
        creature.moving = false;
      }
      window.dispatchEvent(new CustomEvent("sublyime-world-state", { detail: world }));
    } catch (error) {
      console.warn("Could not refresh the shared world.", error);
    }
  }, 30000);
  window.addEventListener("beforeunload", () => {
    cancelAnimationFrame(animationFrame);
    saveLocalState();
  });
})();
