// ═══════════════════════════════════════════════════════════════
//  2D BLOCK WORLD  —  Full Edition
//  Features: Mining, Mobs, Combat, Bow & Arrows, Quests, Parkour
// ═══════════════════════════════════════════════════════════════

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = innerWidth;
canvas.height = innerHeight;
addEventListener("resize", () => { canvas.width = innerWidth; canvas.height = innerHeight; });

const TILE = 40;
const WORLD_W = 300;
const WORLD_H = 150;
const GRAVITY = 0.55;
const REACH = 6;

// ──────────────────────────────────────────
//  INPUT
// ──────────────────────────────────────────
const keys = {};
addEventListener("keydown", e => {
  keys[e.key] = true;
  if (e.key === "e" || e.key === "E") toggleInventory();
  const n = parseInt(e.key);
  if (n >= 1 && n <= 9) { selectedSlot = n - 1; renderHotbar(); }
  if (e.key === "f" || e.key === "F") meleeAttack();
});
addEventListener("keyup", e => keys[e.key] = false);

let mouse = { x: 0, y: 0, down: false, rightDown: false };
addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
addEventListener("mousedown", e => {
  if (e.button === 0) { mouse.down = true; tryShootBow(); }
  if (e.button === 2) mouse.rightDown = true;
});
addEventListener("mouseup", e => {
  if (e.button === 0) mouse.down = false;
  if (e.button === 2) { mouse.rightDown = false; placeBlock(); }
});
addEventListener("wheel", e => {
  selectedSlot = (selectedSlot + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
  renderHotbar();
});
addEventListener("contextmenu", e => e.preventDefault());

// ──────────────────────────────────────────
//  TILE DEFINITIONS
// ──────────────────────────────────────────
const TILES = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COAL: 4, IRON: 5, WOOD: 6, LEAVES: 7, SAND: 8, WATER: 9 };

const TILE_DATA = {
  0: { solid: false, name: "Air" },
  1: { solid: true,  name: "Grass",  hardness: 0.4, drop: 2, topColor: "#4caf50", sideColor: "#66bb6a" },
  2: { solid: true,  name: "Dirt",   hardness: 0.5, drop: 2, topColor: "#795548", sideColor: "#6d4c41" },
  3: { solid: true,  name: "Stone",  hardness: 1.5, drop: 3, topColor: "#9e9e9e", sideColor: "#757575" },
  4: { solid: true,  name: "Coal",   hardness: 2.0, drop: 4, topColor: "#37474f", sideColor: "#263238" },
  5: { solid: true,  name: "Iron",   hardness: 3.0, drop: 5, topColor: "#bf8654", sideColor: "#a0693a" },
  6: { solid: true,  name: "Wood",   hardness: 1.0, drop: 6, topColor: "#6d4c41", sideColor: "#8d6e63" },
  7: { solid: true,  name: "Leaves", hardness: 0.2, drop: 7, topColor: "#2e7d32", sideColor: "#388e3c" },
  8: { solid: true,  name: "Sand",   hardness: 0.3, drop: 8, topColor: "#f9a825", sideColor: "#f57f17" },
  9: { solid: false, name: "Water",  hardness: 99,  drop: 0, topColor: "#1565c099", sideColor: "#0d47a188" },
};

// Item IDs beyond tiles: 10=Bow, 11=Arrow
const ITEMS = {
  10: { name: "Bow",   icon: "🏹" },
  11: { name: "Arrow", icon: "➶"  },
};

// ──────────────────────────────────────────
//  WORLD GENERATION
// ──────────────────────────────────────────
const world = Array.from({ length: WORLD_H }, () => new Uint8Array(WORLD_W));
const lighting = Array.from({ length: WORLD_H }, () => new Float32Array(WORLD_W).fill(1));
const surfaceH = [];

function generateWorld() {
  for (let x = 0; x < WORLD_W; x++) {
    const h = Math.round(62 + Math.sin(x * 0.04) * 5 + Math.sin(x * 0.013) * 8 + Math.sin(x * 0.1) * 2);
    surfaceH[x] = Math.max(45, Math.min(90, h));
  }

  for (let x = 0; x < WORLD_W; x++) {
    const sh = surfaceH[x];
    for (let y = 0; y < WORLD_H; y++) {
      if (y < sh) world[y][x] = TILES.AIR;
      else if (y === sh) world[y][x] = TILES.GRASS;
      else if (y < sh + 4) world[y][x] = TILES.DIRT;
      else if (y < sh + 8) world[y][x] = Math.random() < 0.1 ? TILES.COAL : TILES.DIRT;
      else {
        const r = Math.random(), depth = y - sh;
        const iron = 0.02 + depth * 0.0008, coal = 0.05 + depth * 0.001;
        world[y][x] = r < iron ? TILES.IRON : r < iron + coal ? TILES.COAL : TILES.STONE;
      }
    }
    // Trees
    if (Math.random() < 0.06 && x > 3 && x < WORLD_W - 3) {
      const sh2 = surfaceH[x], th = 4 + Math.floor(Math.random() * 3);
      for (let ty = sh2 - th; ty < sh2; ty++) if (ty >= 0) world[ty][x] = TILES.WOOD;
      for (let ly = sh2 - th - 2; ly < sh2 - th + 2; ly++)
        for (let lx = x - 2; lx <= x + 2; lx++)
          if (ly >= 0 && lx >= 0 && lx < WORLD_W && world[ly][lx] === TILES.AIR && Math.random() < 0.8)
            world[ly][lx] = TILES.LEAVES;
    }
  }

  // ── Parkour Islands ── scattered above ground, get harder further right
  const parkourZones = [
    { cx: 30, difficulty: 1 }, { cx: 70, difficulty: 2 }, { cx: 120, difficulty: 3 },
    { cx: 170, difficulty: 4 }, { cx: 220, difficulty: 5 }, { cx: 265, difficulty: 6 },
  ];
  for (const zone of parkourZones) {
    const baseY = surfaceH[zone.cx] - 8 - zone.difficulty * 3;
    const gap = 3 + zone.difficulty;        // harder = wider gaps
    const plats = 5 + zone.difficulty;
    let px = zone.cx - plats * 2;
    let py = baseY;
    for (let i = 0; i < plats; i++) {
      const platW = 2 + Math.floor(Math.random() * 3);
      const hOff = (Math.random() - 0.5) * 3;
      py = Math.max(20, Math.min(surfaceH[Math.max(0, Math.min(WORLD_W - 1, px))] - 6, py + Math.round(hOff)));
      for (let bx = 0; bx < platW; bx++) {
        const wx = Math.max(0, Math.min(WORLD_W - 1, px + bx));
        if (py >= 0 && py < WORLD_H) world[py][wx] = TILES.STONE;
      }
      // Place chest/goal on last platform
      if (i === plats - 1) {
        parkourGoals.push({ tx: Math.max(0, Math.min(WORLD_W - 1, px)), ty: py - 1, zone: zone.difficulty, collected: false });
      }
      px += platW + gap;
    }
  }

  updateLighting();
}

function updateLighting() {
  for (let x = 0; x < WORLD_W; x++) {
    let light = 1.0;
    for (let y = 0; y < WORLD_H; y++) {
      const t = world[y][x];
      if (t === TILES.AIR || t === TILES.LEAVES) light = Math.min(1.0, light + 0.1);
      else { light -= 0.15; light = Math.max(0.05, light); }
      lighting[y][x] = light;
    }
  }
}

// Parkour goals (treasure chests to reach)
const parkourGoals = [];
generateWorld();

// ──────────────────────────────────────────
//  PLAYER
// ──────────────────────────────────────────
const player = {
  x: WORLD_W / 2 * TILE, y: 0,
  w: 22, h: 36,
  vx: 0, vy: 0,
  speed: 3.8, jump: 11,
  grounded: false,
  facing: 1,
  walkCycle: 0,
  hp: 20, maxHp: 20,
  invincible: 0,       // frames of invincibility after hit
  xp: 0,
  kills: 0,
  arrows: 12,          // starting arrows
  bowCooldown: 0,
  meleeCooldown: 0,
  meleeSwoosh: 0,      // visual only, counts down
};

// Spawn
for (let y = 0; y < WORLD_H; y++) {
  if (world[y][Math.floor(WORLD_W / 2)] !== TILES.AIR) { player.y = (y - 2) * TILE; break; }
}

// Give starting bow
const hotbar = Array.from({ length: 9 }, () => ({ id: 0, count: 0 }));
const inventory = Array.from({ length: 27 }, () => ({ id: 0, count: 0 }));
hotbar[7] = { id: 10, count: 1 };   // Bow in slot 8
hotbar[8] = { id: 11, count: 12 };  // Arrows in slot 9
let selectedSlot = 0;
let inventoryOpen = false;

function toggleInventory() {
  inventoryOpen = !inventoryOpen;
  document.getElementById("inventory").style.display = inventoryOpen ? "flex" : "none";
  renderInventory();
}

function addItem(id) {
  if (id === 0) return;
  const all = [...hotbar, ...inventory];
  for (const s of all) { if (s.id === id && s.count < 64) { s.count++; renderHotbar(); return; } }
  for (const s of hotbar) { if (s.count === 0) { s.id = id; s.count = 1; renderHotbar(); return; } }
  for (const s of inventory) { if (s.count === 0) { s.id = id; s.count = 1; return; } }
}

function tileIcon(id) {
  if (id >= 10) return ITEMS[id]?.icon || "?";
  const icons = ["", "🟩", "🟫", "⬜", "⬛", "🟤", "🪵", "🍃", "🟨", "💧"];
  return icons[id] || "";
}
function tileName(id) {
  if (id >= 10) return ITEMS[id]?.name || "?";
  return TILE_DATA[id]?.name || "?";
}

function renderHotbar() {
  const bar = document.getElementById("hotbar");
  bar.innerHTML = "";
  hotbar.forEach((s, i) => {
    const div = document.createElement("div");
    div.className = "slot" + (i === selectedSlot ? " selected" : "");
    if (s.count > 0) {
      div.innerHTML = `<span class="tile-icon">${tileIcon(s.id)}</span><span class="count">${s.count > 1 ? s.count : ""}</span>`;
      div.title = tileName(s.id);
    }
    div.addEventListener("click", () => { selectedSlot = i; renderHotbar(); });
    bar.appendChild(div);
  });
}
function renderInventory() {
  if (!inventoryOpen) return;
  const grid = document.getElementById("inv-grid");
  grid.innerHTML = "";
  inventory.forEach(s => {
    const div = document.createElement("div");
    div.className = "slot inv-slot";
    if (s.count > 0) div.innerHTML = `<span class="tile-icon">${tileIcon(s.id)}</span><span class="count">${s.count}</span>`;
    grid.appendChild(div);
  });
}
renderHotbar();

// ──────────────────────────────────────────
//  TILE HELPERS
// ──────────────────────────────────────────
function tileAt(x, y) {
  if (y < 0 || y >= WORLD_H || x < 0 || x >= WORLD_W) return TILES.AIR;
  return world[y][x];
}
function solidAt(x, y) { return !!TILE_DATA[tileAt(x, y)]?.solid; }

// ──────────────────────────────────────────
//  PHYSICS / COLLISION (generic AABB)
// ──────────────────────────────────────────
function entityOnGround(e) {
  const x0 = Math.floor(e.x / TILE), x1 = Math.floor((e.x + e.w - 1) / TILE);
  const y1 = Math.floor((e.y + e.h) / TILE);
  for (let x = x0; x <= x1; x++) if (solidAt(x, y1)) return true;
  return false;
}
function entityCollideX(e) {
  const x0 = Math.floor(e.x / TILE), x1 = Math.floor((e.x + e.w - 1) / TILE);
  const y0 = Math.floor(e.y / TILE), y1 = Math.floor((e.y + e.h - 1) / TILE);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (solidAt(x, y)) return true;
  return false;
}
function entityCollideY(e) { return entityCollideX(e); }

function moveEntity(e) {
  e.x += e.vx;
  e.x = Math.max(0, Math.min(WORLD_W * TILE - e.w, e.x));
  if (entityCollideX(e)) { e.x -= e.vx; e.vx = 0; }
  e.y += e.vy;
  e.grounded = false;
  if (entityCollideY(e)) {
    if (e.vy > 0) e.grounded = true;
    e.y -= e.vy; e.vy = 0;
  }
}

// ──────────────────────────────────────────
//  MOBS
// ──────────────────────────────────────────
const mobs = [];

const MOB_TYPES = {
  zombie: {
    w: 20, h: 32, hp: 10, speed: 1.2, damage: 2, color: "#4caf50", eyeColor: "#f00",
    xpDrop: 5, aggroRange: 12, jumpChance: 0.02,
    draw(m) { drawMobZombie(m); }
  },
  skeleton: {
    w: 18, h: 32, hp: 7, speed: 1.6, damage: 1, color: "#eceff1", eyeColor: "#00f",
    xpDrop: 8, aggroRange: 16, jumpChance: 0.015, ranged: true,
    shootCooldown: 120,
    draw(m) { drawMobSkeleton(m); }
  },
  spider: {
    w: 28, h: 18, hp: 8, speed: 2.0, damage: 1.5, color: "#7b1fa2", eyeColor: "#f00",
    xpDrop: 6, aggroRange: 14, jumpChance: 0.04, canClimbWalls: true,
    draw(m) { drawMobSpider(m); }
  },
};

function spawnMobs() {
  const spawnData = [
    { type: "zombie",   count: 18 },
    { type: "skeleton", count: 10 },
    { type: "spider",   count: 10 },
  ];
  for (const { type, count } of spawnData) {
    const def = MOB_TYPES[type];
    for (let i = 0; i < count; i++) {
      const sx = Math.floor(Math.random() * WORLD_W);
      for (let sy = 0; sy < WORLD_H; sy++) {
        if (world[sy][sx] !== TILES.AIR) {
          mobs.push({
            type, ...def,
            x: sx * TILE, y: (sy - 2) * TILE,
            vx: 0, vy: 0, grounded: false,
            hp: def.hp, maxHp: def.hp,
            facing: 1,
            walkCycle: Math.random() * 6,
            shootTimer: def.shootCooldown || 0,
            hitFlash: 0,
            knockback: 0,
            aggro: false,
          });
          break;
        }
      }
    }
  }
}
spawnMobs();

function updateMobs() {
  const px = player.x + player.w / 2;
  const py = player.y + player.h / 2;

  for (let i = mobs.length - 1; i >= 0; i--) {
    const m = mobs[i];
    if (m.hp <= 0) {
      // Drop XP & loot
      player.xp += m.xpDrop;
      player.kills++;
      if (Math.random() < 0.4) addItem(Math.random() < 0.5 ? TILES.STONE : TILES.COAL);
      if (m.type === "skeleton" && Math.random() < 0.5) addItem(11); // arrow drop
      spawnParticles(m.x + m.w / 2, m.y + m.h / 2, "#e53935", 10);
      checkQuestProgress();
      mobs.splice(i, 1);
      continue;
    }

    const mx = m.x + m.w / 2, my = m.y + m.h / 2;
    const distX = mx - px, distY = my - py;
    const dist = Math.hypot(distX, distY);

    // Aggro
    if (dist < m.aggroRange * TILE) m.aggro = true;
    if (dist > m.aggroRange * TILE * 1.5) m.aggro = false;

    if (m.aggro) {
      const dir = distX > 0 ? -1 : 1;
      m.facing = dir;

      // Ranged attack (skeleton)
      if (m.ranged && m.shootTimer <= 0 && dist < 15 * TILE && dist > 4 * TILE) {
        m.shootTimer = MOB_TYPES[m.type].shootCooldown;
        const dx = px - mx, dy = py - my, mag = Math.hypot(dx, dy);
        arrows.push({
          x: mx, y: my,
          vx: (dx / mag) * 7, vy: (dy / mag) * 7,
          fromMob: true, life: 80
        });
      }
      if (m.shootTimer > 0) m.shootTimer--;

      // Move toward player (if not a skeleton at range)
      if (!m.ranged || dist < 5 * TILE) {
        m.vx = dir * m.speed;
      } else if (m.ranged) {
        m.vx *= 0.8; // skeleton strafes slightly
      }

      // Jump to reach player or get over obstacle
      if (m.grounded && (m.jumpChance > 0)) {
        if (Math.random() < m.jumpChance || (!m.canClimbWalls && solidAt(Math.floor((m.x + (dir > 0 ? m.w : -1)) / TILE), Math.floor(m.y / TILE)))) {
          m.vy = -9;
        }
      }

      // Melee damage to player
      if (dist < (m.w + player.w) / 1.5 && player.invincible <= 0) {
        player.hp = Math.max(0, player.hp - m.damage);
        player.invincible = 40;
        // Knockback
        player.vx = (px - mx > 0 ? 1 : -1) * 5;
        player.vy = -4;
        showDamageNumber(player.x, player.y, m.damage, "#f44");
        if (player.hp <= 0) handlePlayerDeath();
      }
    } else {
      // Idle wander
      if (Math.random() < 0.005) m.vx = (Math.random() - 0.5) * m.speed * 2;
      if (m.grounded && Math.random() < 0.003) m.vy = -7;
    }

    m.vy += GRAVITY;
    if (m.vy > 18) m.vy = 18;
    moveEntity(m);

    if (Math.abs(m.vx) > 0.3) m.walkCycle += 0.15;
    if (m.hitFlash > 0) m.hitFlash--;
    if (!m.aggro) m.vx *= 0.85;
  }
}

// ──────────────────────────────────────────
//  ARROWS / PROJECTILES
// ──────────────────────────────────────────
const arrows = [];
let bowCooldown = 0;

function tryShootBow() {
  if (inventoryOpen) return;
  // Check if bow is selected
  const slot = hotbar[selectedSlot];
  if (slot.id !== 10) return;
  if (bowCooldown > 0) return;
  // Find arrows in hotbar
  let arrowSlot = null;
  for (const s of hotbar) { if (s.id === 11 && s.count > 0) { arrowSlot = s; break; } }
  for (const s of inventory) { if (s.id === 11 && s.count > 0 && !arrowSlot) { arrowSlot = s; break; } }
  if (!arrowSlot) { showMessage("No arrows!", 60); return; }

  arrowSlot.count--;
  if (arrowSlot.count === 0) arrowSlot.id = 0;
  renderHotbar();

  const originX = player.x + player.w / 2;
  const originY = player.y + player.h / 2 - 4;
  const worldMX = mouse.x + camera.x;
  const worldMY = mouse.y + camera.y;
  const dx = worldMX - originX, dy = worldMY - originY;
  const mag = Math.hypot(dx, dy) || 1;

  arrows.push({ x: originX, y: originY, vx: (dx / mag) * 14, vy: (dy / mag) * 14, fromMob: false, life: 100 });
  bowCooldown = 25;

  // Arm raise animation
  player.meleeSwoosh = 15;
}

function updateArrows() {
  if (bowCooldown > 0) bowCooldown--;
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.x += a.vx;
    a.y += a.vy;
    a.vy += 0.25; // gravity
    a.life--;

    const tx = Math.floor(a.x / TILE), ty = Math.floor(a.y / TILE);
    if (solidAt(tx, ty)) {
      spawnParticles(a.x, a.y, "#a0522d", 4);
      arrows.splice(i, 1); continue;
    }

    if (!a.fromMob) {
      // Hit mobs
      for (const m of mobs) {
        if (a.x > m.x && a.x < m.x + m.w && a.y > m.y && a.y < m.y + m.h) {
          m.hp -= 3;
          m.hitFlash = 8;
          m.aggro = true;
          m.vx = (a.vx > 0 ? 1 : -1) * 2;
          showDamageNumber(m.x, m.y, 3, "#ff0");
          spawnParticles(a.x, a.y, "#e53935", 5);
          arrows.splice(i, 1); break;
        }
      }
    } else {
      // Mob arrow hits player
      if (a.x > player.x && a.x < player.x + player.w && a.y > player.y && a.y < player.y + player.h && player.invincible <= 0) {
        player.hp = Math.max(0, player.hp - 2);
        player.invincible = 40;
        showDamageNumber(player.x, player.y, 2, "#f44");
        if (player.hp <= 0) handlePlayerDeath();
        arrows.splice(i, 1); continue;
      }
    }

    if (a.life <= 0) arrows.splice(i, 1);
  }
}

// ──────────────────────────────────────────
//  MELEE COMBAT
// ──────────────────────────────────────────
function meleeAttack() {
  if (player.meleeCooldown > 0) return;
  player.meleeCooldown = 20;
  player.meleeSwoosh = 15;
  const range = 60;
  const px = player.x + player.w / 2, py = player.y + player.h / 2;
  for (const m of mobs) {
    const mx = m.x + m.w / 2, my = m.y + m.h / 2;
    if (Math.hypot(mx - px, my - py) < range && Math.sign(mx - px) === player.facing) {
      m.hp -= 4;
      m.hitFlash = 10;
      m.aggro = true;
      m.vx = player.facing * 3;
      m.vy = -3;
      showDamageNumber(m.x, m.y, 4, "#ffeb3b");
    }
  }
}

// ──────────────────────────────────────────
//  DAMAGE NUMBERS & MESSAGES
// ──────────────────────────────────────────
const damageNumbers = [];
let messageText = "", messageDuration = 0;

function showDamageNumber(x, y, val, color) {
  damageNumbers.push({ x, y, val, color, life: 40, vy: -1.5 });
}
function showMessage(text, dur) { messageText = text; messageDuration = dur; }

// ──────────────────────────────────────────
//  QUESTS
// ──────────────────────────────────────────
const quests = [
  { id: "first_blood",  label: "Slay 1 Mob",          type: "kill",    target: 1,  xpReward: 20,  arrowReward: 5,  done: false },
  { id: "hunter",       label: "Slay 10 Mobs",         type: "kill",    target: 10, xpReward: 50,  arrowReward: 10, done: false },
  { id: "parkour_1",    label: "Reach Parkour Zone 1",  type: "parkour", target: 1,  xpReward: 30,  arrowReward: 5,  done: false },
  { id: "parkour_3",    label: "Reach Parkour Zone 3",  type: "parkour", target: 3,  xpReward: 60,  arrowReward: 8,  done: false },
  { id: "miner",        label: "Mine 10 Stone",         type: "mine",    target: 10, xpReward: 25,  arrowReward: 5,  done: false },
  { id: "archer",       label: "Kill 5 with Bow",       type: "bow",     target: 5,  xpReward: 40,  arrowReward: 15, done: false },
];

let questKills = 0, questMines = 0, questBowKills = 0;
let parkourReached = 0;

function checkQuestProgress() {
  for (const q of quests) {
    if (q.done) continue;
    let val = 0;
    if (q.type === "kill") val = player.kills;
    if (q.type === "mine") val = questMines;
    if (q.type === "parkour") val = parkourReached;
    if (q.type === "bow") val = questBowKills;
    if (val >= q.target) {
      q.done = true;
      player.xp += q.xpReward;
      player.arrows += q.arrowReward;
      addItem(11); // add arrow item too
      showMessage(`✅ Quest Done: ${q.label}  (+${q.xpReward} XP)`, 180);
      renderQuestPanel();
    }
  }
}

function renderQuestPanel() {
  const panel = document.getElementById("quest-panel");
  panel.innerHTML = "<div class='quest-title'>📜 Quests</div>";
  for (const q of quests) {
    const div = document.createElement("div");
    div.className = "quest-item" + (q.done ? " done" : "");
    div.textContent = (q.done ? "✅ " : "⬜ ") + q.label;
    panel.appendChild(div);
  }
}
renderQuestPanel();

// ──────────────────────────────────────────
//  PARKOUR GOAL CHECKING
// ──────────────────────────────────────────
function checkParkourGoals() {
  for (const g of parkourGoals) {
    if (g.collected) continue;
    const gx = g.tx * TILE, gy = g.ty * TILE;
    if (player.x < gx + TILE && player.x + player.w > gx &&
        player.y < gy + TILE && player.y + player.h > gy) {
      g.collected = true;
      if (g.zone > parkourReached) parkourReached = g.zone;
      player.xp += g.zone * 15;
      showMessage(`🏆 Parkour Zone ${g.zone} cleared! +${g.zone * 15} XP`, 200);
      spawnParticles(gx + TILE / 2, gy + TILE / 2, "#ffd700", 20);
      checkQuestProgress();
    }
  }
}

// ──────────────────────────────────────────
//  PLAYER DEATH
// ──────────────────────────────────────────
let deathScreen = false;

function handlePlayerDeath() {
  if (deathScreen) return;
  deathScreen = true;
  document.getElementById("death-screen").style.display = "flex";
}

function respawn() {
  player.hp = player.maxHp;
  player.x = WORLD_W / 2 * TILE;
  for (let y = 0; y < WORLD_H; y++) {
    if (world[y][Math.floor(WORLD_W / 2)] !== TILES.AIR) { player.y = (y - 2) * TILE; break; }
  }
  player.vx = 0; player.vy = 0;
  player.invincible = 60;
  deathScreen = false;
  document.getElementById("death-screen").style.display = "none";
}

// ──────────────────────────────────────────
//  MINING
// ──────────────────────────────────────────
let mining = null;
const particles = [];

function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 5,
      vy: -Math.random() * 4 - 1,
      life: 25 + Math.random() * 20,
      color
    });
  }
}

function handleMining() {
  if (inventoryOpen) return;
  const slot = hotbar[selectedSlot];
  if (slot.id >= 10) return; // Tool selected, not mining

  const tx = Math.floor((mouse.x + camera.x) / TILE);
  const ty = Math.floor((mouse.y + camera.y) / TILE);
  const dx = (tx + 0.5) - (player.x + player.w / 2) / TILE;
  const dy = (ty + 0.5) - (player.y + player.h / 2) / TILE;
  if (Math.hypot(dx, dy) > REACH) { mining = null; return; }

  if (mouse.down && tileAt(tx, ty) !== TILES.AIR && tileAt(tx, ty) !== TILES.WATER) {
    if (!mining || mining.x !== tx || mining.y !== ty) {
      mining = { x: tx, y: ty, progress: 0, total: TILE_DATA[tileAt(tx, ty)].hardness * 45 };
    }
    mining.progress++;
    if (Math.random() < 0.3) spawnParticles(tx * TILE + Math.random() * TILE, ty * TILE + Math.random() * TILE, TILE_DATA[tileAt(tx, ty)].sideColor, 1);
    if (mining.progress >= mining.total) {
      const drop = TILE_DATA[tileAt(tx, ty)].drop;
      addItem(drop);
      if (tileAt(tx, ty) === TILES.STONE) { questMines++; checkQuestProgress(); }
      spawnParticles(tx * TILE + TILE / 2, ty * TILE + TILE / 2, TILE_DATA[tileAt(tx, ty)].sideColor, 8);
      world[ty][tx] = TILES.AIR;
      updateLighting();
      mining = null;
    }
  } else mining = null;
}

function placeBlock() {
  if (inventoryOpen) return;
  const slot = hotbar[selectedSlot];
  if (!slot.count || slot.id >= 10) return;
  const tx = Math.floor((mouse.x + camera.x) / TILE);
  const ty = Math.floor((mouse.y + camera.y) / TILE);
  const dx = (tx + 0.5) - (player.x + player.w / 2) / TILE;
  const dy = (ty + 0.5) - (player.y + player.h / 2) / TILE;
  if (Math.hypot(dx, dy) > REACH || tileAt(tx, ty) !== TILES.AIR) return;
  const px0 = Math.floor(player.x / TILE), px1 = Math.floor((player.x + player.w - 1) / TILE);
  const py0 = Math.floor(player.y / TILE), py1 = Math.floor((player.y + player.h - 1) / TILE);
  if (tx >= px0 && tx <= px1 && ty >= py0 && ty <= py1) return;
  world[ty][tx] = slot.id;
  slot.count--;
  if (slot.count === 0) slot.id = 0;
  updateLighting();
  renderHotbar();
}

// ──────────────────────────────────────────
//  CAMERA
// ──────────────────────────────────────────
const camera = { x: 0, y: 0 };
function updateCamera() {
  const tx = player.x + player.w / 2 - canvas.width / 2;
  const ty = player.y + player.h / 2 - canvas.height / 2;
  camera.x += (tx - camera.x) * 0.12;
  camera.y += (ty - camera.y) * 0.12;
  camera.x = Math.max(0, Math.min(WORLD_W * TILE - canvas.width, camera.x));
  camera.y = Math.max(0, Math.min(WORLD_H * TILE - canvas.height, camera.y));
}

// ──────────────────────────────────────────
//  PLAYER UPDATE
// ──────────────────────────────────────────
function updatePlayer() {
  if (deathScreen) return;

  if (keys["a"] || keys["ArrowLeft"]) { player.vx = -player.speed; player.facing = -1; }
  else if (keys["d"] || keys["ArrowRight"]) { player.vx = player.speed; player.facing = 1; }
  else player.vx *= 0.75;

  if ((keys["w"] || keys[" "] || keys["ArrowUp"]) && player.grounded) {
    player.vy = -player.jump; player.grounded = false;
  }

  player.vy += GRAVITY;
  if (player.vy > 20) player.vy = 20;

  player.x += player.vx;
  player.x = Math.max(0, Math.min(WORLD_W * TILE - player.w, player.x));
  if (entityCollideX(player)) { player.x -= player.vx; player.vx = 0; }

  player.grounded = false;
  player.y += player.vy;
  if (entityCollideY(player)) {
    if (player.vy > 0) player.grounded = true;
    player.y -= player.vy; player.vy = 0;
  }

  if (Math.abs(player.vx) > 0.5 && player.grounded) player.walkCycle += 0.18;
  else player.walkCycle *= 0.8;

  if (player.invincible > 0) player.invincible--;
  if (player.meleeCooldown > 0) player.meleeCooldown--;
  if (player.meleeSwoosh > 0) player.meleeSwoosh--;

  handleMining();
  checkParkourGoals();

  if (messageDuration > 0) messageDuration--;
}

// ──────────────────────────────────────────
//  DRAW — TILES
// ──────────────────────────────────────────
function drawTile(x, y, t) {
  const td = TILE_DATA[t]; if (!td) return;
  const sx = x * TILE - camera.x, sy = y * TILE - camera.y;
  const light = Math.max(0.08, lighting[y][x]);
  ctx.fillStyle = td.sideColor; ctx.fillRect(sx, sy, TILE, TILE);
  ctx.fillStyle = td.topColor;  ctx.fillRect(sx, sy, TILE, 4);
  ctx.fillStyle = `rgba(0,0,0,${0.9 - light * 0.9})`; ctx.fillRect(sx, sy, TILE, TILE);
  ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 0.5;
  ctx.strokeRect(sx + 0.25, sy + 0.25, TILE - 0.5, TILE - 0.5);
  if (t === TILES.COAL) {
    ctx.fillStyle = `rgba(255,255,255,${light * 0.12})`;
    [[0.25, 0.3],[0.6,0.6],[0.4,0.75]].forEach(([fx, fy]) => ctx.fillRect(sx + fx * TILE, sy + fy * TILE, 3, 3));
  }
  if (t === TILES.IRON) {
    ctx.fillStyle = `rgba(255,200,150,${light * 0.25})`;
    [[0.3,0.25],[0.65,0.55],[0.2,0.7]].forEach(([fx, fy]) => ctx.fillRect(sx + fx * TILE, sy + fy * TILE, 4, 4));
  }
  if (t === TILES.WATER) {
    ctx.fillStyle = `rgba(100,180,255,${0.5 + Math.sin(Date.now() * 0.003 + x) * 0.1})`;
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = `rgba(255,255,255,${0.15 + Math.sin(Date.now() * 0.004 + x * 0.5) * 0.08})`;
    ctx.fillRect(sx, sy, TILE, 5);
  }
}

// Chest (parkour goal)
function drawChest(tx, ty, collected) {
  const sx = tx * TILE - camera.x, sy = ty * TILE - camera.y;
  if (collected) {
    ctx.fillStyle = "#5d4037"; ctx.fillRect(sx + 4, sy + 10, TILE - 8, TILE - 12);
    return;
  }
  // Bob animation
  const bob = Math.sin(Date.now() * 0.003) * 3;
  ctx.save(); ctx.translate(sx + TILE / 2, sy + TILE / 2 + bob);
  // Gold glow
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, TILE * 0.8);
  glow.addColorStop(0, "rgba(255,215,0,0.35)"); glow.addColorStop(1, "rgba(255,215,0,0)");
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, TILE * 0.8, 0, Math.PI * 2); ctx.fill();
  // Body
  ctx.fillStyle = "#8d6e63"; ctx.fillRect(-TILE / 2 + 3, -TILE / 2 + 5, TILE - 6, TILE - 10);
  // Lid
  ctx.fillStyle = "#a1887f"; ctx.fillRect(-TILE / 2 + 3, -TILE / 2 + 1, TILE - 6, 8);
  // Gold trim
  ctx.fillStyle = "#ffd54f";
  ctx.fillRect(-TILE / 2 + 3, -2, TILE - 6, 4);
  ctx.fillRect(-3, -TILE / 2 + 5, 6, TILE - 10);
  // Lock
  ctx.fillStyle = "#ffb300"; ctx.beginPath(); ctx.arc(0, 2, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ──────────────────────────────────────────
//  DRAW — PLAYER
// ──────────────────────────────────────────
function drawPlayer() {
  if (deathScreen) return;
  const px = player.x - camera.x, py = player.y - camera.y;
  const f = player.facing, wc = player.walkCycle;
  const flash = player.invincible > 0 && Math.floor(player.invincible / 4) % 2 === 0;
  if (flash) { ctx.globalAlpha = 0.4; }

  ctx.save(); ctx.translate(px + player.w / 2, py + player.h / 2);
  if (f < 0) ctx.scale(-1, 1);

  const legSwing = Math.sin(wc) * 0.35;
  ctx.save(); ctx.translate(-4, 6); ctx.rotate(legSwing);
  ctx.fillStyle = "#37474f"; ctx.fillRect(-4, 0, 8, 14); ctx.restore();
  ctx.save(); ctx.translate(4, 6); ctx.rotate(-legSwing);
  ctx.fillStyle = "#37474f"; ctx.fillRect(-4, 0, 8, 14); ctx.restore();

  ctx.fillStyle = "#1565c0"; ctx.fillRect(-7, -10, 14, 16);
  ctx.fillStyle = "#0d47a1"; ctx.fillRect(-7, -4, 14, 3);

  const armSwing = Math.sin(wc) * 0.4;
  // Back arm
  ctx.save(); ctx.translate(7, -8); ctx.rotate(-armSwing);
  ctx.fillStyle = "#e8a87c"; ctx.fillRect(0, 0, 6, 12); ctx.restore();
  // Front arm — raise if melee swoosh
  ctx.save(); ctx.translate(-13, -8);
  const swooshRot = player.meleeSwoosh > 0 ? -1.2 : armSwing;
  ctx.rotate(swooshRot);
  ctx.fillStyle = "#e8a87c"; ctx.fillRect(0, 0, 6, 12);
  // Sword/bow in hand
  if (hotbar[selectedSlot].id === 10) {
    ctx.fillStyle = "#a1887f"; ctx.fillRect(2, -6, 3, 14);
    ctx.fillStyle = "#ffb300"; ctx.fillRect(0, -6, 2, 2); ctx.fillRect(0, 6, 2, 2);
  } else if (hotbar[selectedSlot].id === 0 || (hotbar[selectedSlot].id < 10)) {
    // Sword
    ctx.fillStyle = "#90a4ae"; ctx.fillRect(2, -10, 3, 16);
    ctx.fillStyle = "#cfd8dc"; ctx.fillRect(1, -10, 2, 4);
  }
  ctx.restore();

  // Melee swoosh arc
  if (player.meleeSwoosh > 0) {
    const a = (1 - player.meleeSwoosh / 15);
    ctx.strokeStyle = `rgba(255,255,255,${0.7 - a * 0.7})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 35, -Math.PI * 0.2, Math.PI * 0.4);
    ctx.stroke();
  }

  ctx.fillStyle = "#e8a87c"; ctx.fillRect(-8, -22, 16, 14);
  ctx.fillStyle = "#4e342e"; ctx.fillRect(-8, -22, 16, 5); ctx.fillRect(-8, -22, 3, 8);
  ctx.fillStyle = "#fff"; ctx.fillRect(2, -16, 4, 5);
  ctx.fillStyle = "#333"; ctx.fillRect(3, -15, 2, 3);
  ctx.fillStyle = "#fff"; ctx.fillRect(4, -15, 1, 1);

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ──────────────────────────────────────────
//  DRAW — MOBS
// ──────────────────────────────────────────
function drawMobZombie(m) {
  const sx = m.x - camera.x, sy = m.y - camera.y;
  ctx.save(); ctx.translate(sx + m.w / 2, sy + m.h / 2);
  if (m.facing < 0) ctx.scale(-1, 1);
  if (m.hitFlash > 0) { ctx.globalAlpha = 0.5 + Math.sin(m.hitFlash) * 0.5; }
  const wc = m.walkCycle;
  const leg = Math.sin(wc) * 0.3;
  ctx.fillStyle = "#1b5e20"; ctx.save(); ctx.translate(-4, 6); ctx.rotate(leg);
  ctx.fillRect(-4, 0, 8, 12); ctx.restore();
  ctx.save(); ctx.translate(4, 6); ctx.rotate(-leg);
  ctx.fillRect(-4, 0, 8, 12); ctx.restore();
  ctx.fillStyle = "#388e3c"; ctx.fillRect(-7, -8, 14, 14);
  // outstretched arm (zombie pose)
  ctx.save(); ctx.translate(7, -6); ctx.rotate(-0.8);
  ctx.fillStyle = "#2e7d32"; ctx.fillRect(0, 0, 6, 11); ctx.restore();
  ctx.save(); ctx.translate(-13, -6); ctx.rotate(-0.8);
  ctx.fillStyle = "#2e7d32"; ctx.fillRect(0, 0, 6, 11); ctx.restore();
  ctx.fillStyle = "#4caf50"; ctx.fillRect(-7, -20, 14, 13);
  ctx.fillStyle = "#f00"; ctx.fillRect(-3, -17, 3, 3); ctx.fillRect(1, -17, 3, 3);
  ctx.restore(); ctx.globalAlpha = 1;
  drawMobHealthBar(m, sx, sy);
}

function drawMobSkeleton(m) {
  const sx = m.x - camera.x, sy = m.y - camera.y;
  ctx.save(); ctx.translate(sx + m.w / 2, sy + m.h / 2);
  if (m.facing < 0) ctx.scale(-1, 1);
  if (m.hitFlash > 0) ctx.globalAlpha = 0.4 + Math.sin(m.hitFlash) * 0.6;
  const wc = m.walkCycle, leg = Math.sin(wc) * 0.35;
  // Bones (thin white segments)
  ctx.fillStyle = "#eceff1";
  ctx.save(); ctx.translate(-3, 6); ctx.rotate(leg);   ctx.fillRect(-2, 0, 5, 11); ctx.restore();
  ctx.save(); ctx.translate(3, 6);  ctx.rotate(-leg);  ctx.fillRect(-2, 0, 5, 11); ctx.restore();
  ctx.fillRect(-6, -8, 12, 14); // torso
  ctx.save(); ctx.translate(6, -7); ctx.rotate(-0.3);  ctx.fillRect(0, 0, 4, 10); ctx.restore();
  ctx.save(); ctx.translate(-10,-7); ctx.rotate(0.3);  ctx.fillRect(0, 0, 4, 10); ctx.restore();
  // Skull
  ctx.fillStyle = "#eceff1"; ctx.beginPath(); ctx.ellipse(0, -18, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#212121"; ctx.fillRect(-4, -20, 3, 4); ctx.fillRect(1, -20, 3, 4);
  ctx.restore(); ctx.globalAlpha = 1;
  drawMobHealthBar(m, sx, sy);
}

function drawMobSpider(m) {
  const sx = m.x - camera.x, sy = m.y - camera.y;
  ctx.save(); ctx.translate(sx + m.w / 2, sy + m.h / 2);
  if (m.hitFlash > 0) ctx.globalAlpha = 0.4 + Math.sin(m.hitFlash) * 0.6;
  ctx.fillStyle = "#4a148c";
  // Legs
  const legAngles = [-0.6, -0.3, 0.3, 0.6];
  for (const a of legAngles) {
    ctx.save(); ctx.rotate(a + Math.sin(m.walkCycle) * 0.2);
    ctx.fillStyle = "#7b1fa2"; ctx.fillRect(-2, 0, 4, 13);
    ctx.restore();
    ctx.save(); ctx.rotate(-a + Math.sin(m.walkCycle + 1) * 0.2);
    ctx.fillRect(-2, 0, 4, 13); ctx.restore();
  }
  // Body
  ctx.fillStyle = "#6a1b9a"; ctx.beginPath(); ctx.ellipse(-5, 0, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#4a148c"; ctx.beginPath(); ctx.ellipse(5, 0, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
  // Eyes
  ctx.fillStyle = "#f44336";
  [[-2,-2],[0,-3],[2,-2],[-3,-1],[3,-1]].forEach(([ex,ey]) => { ctx.beginPath(); ctx.arc(ex+3, ey, 1.5, 0, Math.PI*2); ctx.fill(); });
  ctx.restore(); ctx.globalAlpha = 1;
  drawMobHealthBar(m, sx, sy);
}

function drawMobHealthBar(m, sx, sy) {
  const bw = m.w + 4;
  ctx.fillStyle = "#c62828"; ctx.fillRect(sx - 2, sy - 9, bw, 5);
  ctx.fillStyle = "#66bb6a"; ctx.fillRect(sx - 2, sy - 9, bw * (m.hp / m.maxHp), 5);
  ctx.strokeStyle = "#000"; ctx.lineWidth = 0.5; ctx.strokeRect(sx - 2, sy - 9, bw, 5);
}

// ──────────────────────────────────────────
//  DRAW — ARROWS
// ──────────────────────────────────────────
function drawArrows() {
  for (const a of arrows) {
    const sx = a.x - camera.x, sy = a.y - camera.y;
    const angle = Math.atan2(a.vy, a.vx);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(angle);
    ctx.fillStyle = a.fromMob ? "#ef9a9a" : "#a0522d";
    ctx.fillRect(-10, -1.5, 20, 3);
    ctx.fillStyle = a.fromMob ? "#c62828" : "#607d8b";
    ctx.fillRect(8, -2.5, 6, 5);
    ctx.restore();
  }
}

// ──────────────────────────────────────────
//  DRAW — HUD
// ──────────────────────────────────────────
function drawHUD() {
  // Health bar
  const hw = 180, hh = 14;
  const hx = 14, hy = 14;
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(hx - 2, hy - 2, hw + 4, hh + 4);
  ctx.fillStyle = "#c62828"; ctx.fillRect(hx, hy, hw, hh);
  ctx.fillStyle = "#e53935"; ctx.fillRect(hx, hy, hw * (player.hp / player.maxHp), hh);
  ctx.fillStyle = "#fff"; ctx.font = "bold 11px 'Courier New'";
  ctx.fillText(`❤ ${player.hp} / ${player.maxHp}`, hx + 4, hy + 11);

  // XP
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(hx - 2, hy + 20, hw + 4, 12);
  ctx.fillStyle = "#43a047"; ctx.fillRect(hx, hy + 22, hw * Math.min((player.xp % 100) / 100, 1), 8);
  ctx.fillStyle = "#fff"; ctx.font = "10px 'Courier New'";
  ctx.fillText(`⭐ XP: ${player.xp}  Kills: ${player.kills}`, hx + 2, hy + 30);

  // Arrows
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(hx - 2, hy + 38, 120, 14);
  ctx.fillStyle = "#fff"; ctx.font = "11px 'Courier New'";
  let totalArrows = 0;
  for (const s of [...hotbar, ...inventory]) if (s.id === 11) totalArrows += s.count;
  ctx.fillText(`➶ Arrows: ${totalArrows}`, hx + 4, hy + 50);

  // Coords + controls
  ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(8, hy + 60, 195, 36);
  ctx.fillStyle = "#ccc"; ctx.font = "11px 'Courier New'";
  ctx.fillText(`X:${Math.floor(player.x/TILE)} Y:${Math.floor(player.y/TILE)}`, 14, hy + 75);
  ctx.fillText(`[F] Melee  [E] Inv  [RMB] Place`, 14, hy + 90);

  // Mini-map
  drawMinimap();

  // Center message
  if (messageDuration > 0) {
    const alpha = Math.min(1, messageDuration / 30);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(canvas.width / 2 - 200, 70, 400, 36);
    ctx.fillStyle = "#fff"; ctx.font = "bold 16px 'Courier New'"; ctx.textAlign = "center";
    ctx.fillText(messageText, canvas.width / 2, 94);
    ctx.textAlign = "left"; ctx.globalAlpha = 1;
  }

  // Damage numbers
  for (let i = damageNumbers.length - 1; i >= 0; i--) {
    const d = damageNumbers[i];
    d.y += d.vy; d.life--;
    if (d.life <= 0) { damageNumbers.splice(i, 1); continue; }
    ctx.globalAlpha = d.life / 40;
    ctx.fillStyle = d.color; ctx.font = "bold 18px 'Courier New'"; ctx.textAlign = "center";
    ctx.fillText(`-${d.val}`, d.x - camera.x, d.y - camera.y);
    ctx.textAlign = "left"; ctx.globalAlpha = 1;
  }
}

function drawMinimap() {
  const mw = 120, mh = 60;
  const mx = canvas.width - mw - 14, my = 14;
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
  for (let x = 0; x < mw; x++) {
    for (let y = 0; y < mh; y++) {
      const wx = Math.floor(x / mw * WORLD_W), wy = Math.floor(y / mh * WORLD_H);
      const t = world[wy]?.[wx];
      if (t === TILES.AIR) continue;
      ctx.fillStyle = TILE_DATA[t]?.topColor || "#888";
      ctx.fillRect(mx + x, my + y, 1, 1);
    }
  }
  // Player dot
  const pdx = Math.floor(player.x / TILE / WORLD_W * mw);
  const pdy = Math.floor(player.y / TILE / WORLD_H * mh);
  ctx.fillStyle = "#fff"; ctx.fillRect(mx + pdx - 1, my + pdy - 1, 3, 3);
  // Mob dots
  ctx.fillStyle = "#f44";
  for (const m of mobs) {
    const mdx = Math.floor(m.x / TILE / WORLD_W * mw);
    const mdy = Math.floor(m.y / TILE / WORLD_H * mh);
    ctx.fillRect(mx + mdx, my + mdy, 2, 2);
  }
}

// ──────────────────────────────────────────
//  DRAW — MINING OVERLAY
// ──────────────────────────────────────────
function drawMiningOverlay() {
  if (!mining) return;
  const sx = mining.x * TILE - camera.x, sy = mining.y * TILE - camera.y;
  const pct = mining.progress / mining.total;
  ctx.fillStyle = `rgba(0,0,0,${pct * 0.7})`; ctx.fillRect(sx, sy, TILE, TILE);
  ctx.strokeStyle = `rgba(255,255,255,${pct * 0.8})`; ctx.lineWidth = 1;
  const cracks = Math.floor(pct * 5) + 1;
  for (let i = 0; i < cracks; i++) {
    const angle = (i / cracks) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(sx + TILE / 2, sy + TILE / 2);
    ctx.lineTo(sx + TILE / 2 + Math.cos(angle) * TILE * 0.6, sy + TILE / 2 + Math.sin(angle) * TILE * 0.6);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(sx, sy + TILE + 2, TILE, 5);
  ctx.fillStyle = `hsl(${120 - pct * 120},80%,50%)`; ctx.fillRect(sx, sy + TILE + 2, TILE * pct, 5);
}

// ──────────────────────────────────────────
//  DRAW — PARTICLES + CROSSHAIR + SKY
// ──────────────────────────────────────────
function drawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life--;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = p.life / 40;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - camera.x - 2, p.y - camera.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function drawCrosshair() {
  const tx = Math.floor((mouse.x + camera.x) / TILE), ty = Math.floor((mouse.y + camera.y) / TILE);
  const dx = (tx + 0.5) - (player.x + player.w / 2) / TILE;
  const dy = (ty + 0.5) - (player.y + player.h / 2) / TILE;
  if (Math.hypot(dx, dy) <= REACH && tileAt(tx, ty) !== TILES.AIR) {
    ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 2;
    ctx.strokeRect(tx * TILE - camera.x + 1, ty * TILE - camera.y + 1, TILE - 2, TILE - 2);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mouse.x - 8, mouse.y); ctx.lineTo(mouse.x + 8, mouse.y);
  ctx.moveTo(mouse.x, mouse.y - 8); ctx.lineTo(mouse.x, mouse.y + 8);
  ctx.stroke();
}

function drawSky() {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#87ceeb"); grad.addColorStop(1, "#c8e6f5");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const sunX = canvas.width * 0.82, sunY = 55;
  const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 45);
  sg.addColorStop(0, "rgba(255,250,200,1)"); sg.addColorStop(0.5, "rgba(255,230,100,0.7)"); sg.addColorStop(1, "rgba(255,200,50,0)");
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sunX, sunY, 45, 0, Math.PI * 2); ctx.fill();
}

// ──────────────────────────────────────────
//  MAIN DRAW
// ──────────────────────────────────────────
function draw() {
  drawSky();
  const startX = Math.max(0, Math.floor(camera.x / TILE) - 1);
  const endX = Math.min(WORLD_W - 1, startX + Math.ceil(canvas.width / TILE) + 2);
  const startY = Math.max(0, Math.floor(camera.y / TILE) - 1);
  const endY = Math.min(WORLD_H - 1, startY + Math.ceil(canvas.height / TILE) + 2);

  for (let y = startY; y <= endY; y++)
    for (let x = startX; x <= endX; x++)
      if (world[y][x] !== TILES.AIR) drawTile(x, y, world[y][x]);

  // Draw parkour goals
  for (const g of parkourGoals) {
    const sx = g.tx * TILE - camera.x, sy = g.ty * TILE - camera.y;
    if (sx > -TILE * 2 && sx < canvas.width + TILE && sy > -TILE * 2 && sy < canvas.height + TILE)
      drawChest(g.tx, g.ty, g.collected);
  }

  drawMiningOverlay();
  drawParticles();
  drawArrows();

  for (const m of mobs) {
    const sx = m.x - camera.x;
    if (sx > -60 && sx < canvas.width + 60) MOB_TYPES[m.type].draw(m);
  }

  drawPlayer();
  drawCrosshair();
  drawHUD();
}

// ──────────────────────────────────────────
//  MAIN LOOP
// ──────────────────────────────────────────
let last = 0;
function loop(ts) {
  if (!deathScreen) {
    updatePlayer();
    updateMobs();
    updateArrows();
  }
  updateCamera();
  draw();
  last = ts;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
