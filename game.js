import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const ROOM_HEIGHT = 2.72;
const CHUNK_SIZE = 28;
const GRID = 6;
const CELL = CHUNK_SIZE / GRID;
const LOAD_RADIUS = 2;
const PLAYER_RADIUS = 0.34;
const EYE_HEIGHT = 1.62;
const WALK_SPEED = 3.45;
const RUN_SPEED = 5.25;
const WALL_THICK = 0.18;
const WALL_SEGMENT = CELL * 0.82;

const app = document.querySelector('#app');
const startButton = document.querySelector('#start');
const statusEl = document.querySelector('#status');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x786a2c);
scene.fog = new THREE.FogExp2(0x8c7c38, 0.024);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 95);
camera.position.set(0, EYE_HEIGHT, 0);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.96;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);
controls.pointerSpeed = 0.7;

scene.add(new THREE.HemisphereLight(0xfff1b4, 0x4b401b, 1.35));

const textureMaxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const textures = createTextures();
const materials = createMaterials();
const geometries = createGeometries();

const chunks = new Map();
const pressed = new Set();
const clock = new THREE.Clock();
let lastChunkX = Number.NaN;
let lastChunkZ = Number.NaN;
let humEnabled = true;
let audioState = null;
let elapsed = 0;

const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpMove = new THREE.Vector3();

startButton.addEventListener('click', () => controls.lock());
renderer.domElement.addEventListener('click', () => {
  if (!controls.isLocked) controls.lock();
});

controls.addEventListener('lock', () => {
  startButton.classList.add('hidden');
  ensureHum();
});
controls.addEventListener('unlock', () => startButton.classList.remove('hidden'));

addEventListener('keydown', (event) => {
  pressed.add(event.code);
  if (event.code === 'KeyM' && !event.repeat) {
    humEnabled = !humEnabled;
    if (audioState?.gain) {
      audioState.gain.gain.setTargetAtTime(humEnabled ? 0.018 : 0, audioState.ctx.currentTime, 0.08);
    }
  }
});
addEventListener('keyup', (event) => pressed.delete(event.code));
addEventListener('blur', () => pressed.clear());
addEventListener('resize', onResize);

updateChunks(true);
animate();

function createTextures() {
  const wallpaper = makeWallpaperTexture();
  const carpet = makeCarpetTexture();
  const ceiling = makeCeilingTexture();
  const wallRoughness = makeNoiseTexture(256, 0.42, 0.58);
  const carpetRoughness = makeNoiseTexture(256, 0.68, 0.94);

  for (const tex of [wallpaper, carpet, ceiling, wallRoughness, carpetRoughness]) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = tex === wallpaper || tex === carpet || tex === ceiling ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = textureMaxAnisotropy;
  }

  wallpaper.repeat.set(3.1, 2.25);
  wallRoughness.repeat.copy(wallpaper.repeat);
  carpet.repeat.set(CHUNK_SIZE / 2.15, CHUNK_SIZE / 2.15);
  carpetRoughness.repeat.copy(carpet.repeat);
  ceiling.repeat.set(GRID, GRID);
  return { wallpaper, carpet, ceiling, wallRoughness, carpetRoughness };
}

function createMaterials() {
  const wall = new THREE.MeshStandardMaterial({
    color: 0xf2de79,
    map: textures.wallpaper,
    roughnessMap: textures.wallRoughness,
    roughness: 0.88,
    metalness: 0,
    bumpMap: textures.wallRoughness,
    bumpScale: 0.017,
  });

  const column = wall.clone();
  column.color.setHex(0xe8d16b);

  const floor = new THREE.MeshStandardMaterial({
    color: 0xb89b4a,
    map: textures.carpet,
    roughnessMap: textures.carpetRoughness,
    roughness: 1,
    metalness: 0,
    bumpMap: textures.carpetRoughness,
    bumpScale: 0.035,
  });

  const ceiling = new THREE.MeshStandardMaterial({
    color: 0xd9d18f,
    map: textures.ceiling,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const baseboard = new THREE.MeshStandardMaterial({ color: 0x9b8742, roughness: 0.86, metalness: 0 });
  const fixture = new THREE.MeshStandardMaterial({ color: 0xe3ddba, roughness: 0.35, metalness: 0.04 });
  const tube = new THREE.MeshStandardMaterial({
    color: 0xf3efc9,
    emissive: new THREE.Color(0xffeaa6),
    emissiveIntensity: 3.1,
    roughness: 0.25,
  });

  return { wall, column, floor, ceiling, baseboard, fixture, tube };
}

function createGeometries() {
  return {
    floor: new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE),
    wallX: new THREE.BoxGeometry(WALL_SEGMENT, ROOM_HEIGHT, WALL_THICK),
    wallZ: new THREE.BoxGeometry(WALL_THICK, ROOM_HEIGHT, WALL_SEGMENT),
    baseX: new THREE.BoxGeometry(WALL_SEGMENT + 0.03, 0.085, WALL_THICK + 0.025),
    baseZ: new THREE.BoxGeometry(WALL_THICK + 0.025, 0.085, WALL_SEGMENT + 0.03),
    column: new THREE.BoxGeometry(0.72, ROOM_HEIGHT, 0.72),
    columnBase: new THREE.BoxGeometry(0.82, 0.09, 0.82),
    fixture: new THREE.BoxGeometry(1.28, 0.055, 0.42),
    tube: new THREE.PlaneGeometry(1.08, 0.27),
  };
}

function generateChunk(cx, cz) {
  const group = new THREE.Group();
  group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
  scene.add(group);

  const colliders = [];
  const flickers = [];
  const rng = mulberry32(hash2(cx, cz));
  const min = -CHUNK_SIZE / 2;

  const floor = new THREE.Mesh(geometries.floor, materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(geometries.floor, materials.ceiling);
  ceiling.position.y = ROOM_HEIGHT;
  ceiling.rotation.x = Math.PI / 2;
  group.add(ceiling);

  for (let gx = 1; gx < GRID; gx++) {
    for (let gz = 1; gz < GRID; gz++) {
      const wx = min + gx * CELL;
      const wz = min + gz * CELL;
      const nearStart = cx === 0 && cz === 0 && Math.hypot(wx, wz) < 5.8;
      if (nearStart || rng() > 0.66) continue;

      const column = new THREE.Mesh(geometries.column, materials.column);
      column.position.set(wx, ROOM_HEIGHT / 2, wz);
      column.castShadow = true;
      column.receiveShadow = true;
      group.add(column);

      const trim = new THREE.Mesh(geometries.columnBase, materials.baseboard);
      trim.position.set(wx, 0.045, wz);
      group.add(trim);

      colliders.push(makeCollider(cx, cz, wx, wz, 0.72, 0.72));
    }
  }

  for (let gx = 1; gx < GRID; gx++) {
    for (let gz = 0; gz < GRID; gz++) {
      if (rng() > 0.34) continue;
      const x = min + gx * CELL;
      const z = min + (gz + 0.5) * CELL;
      if (isStartClear(cx, cz, x, z)) continue;
      addWall(group, colliders, cx, cz, x, z, 'z');
    }
  }

  for (let gz = 1; gz < GRID; gz++) {
    for (let gx = 0; gx < GRID; gx++) {
      if (rng() > 0.34) continue;
      const x = min + (gx + 0.5) * CELL;
      const z = min + gz * CELL;
      if (isStartClear(cx, cz, x, z)) continue;
      addWall(group, colliders, cx, cz, x, z, 'x');
    }
  }

  const lightSlots = [[-0.25, -0.27], [0.29, -0.18], [-0.14, 0.28], [0.32, 0.31]];
  for (let i = 0; i < lightSlots.length; i++) {
    const [sx, sz] = lightSlots[i];
    const x = sx * CHUNK_SIZE + (rng() - 0.5) * 1.4;
    const z = sz * CHUNK_SIZE + (rng() - 0.5) * 1.4;
    const fixture = addFluorescent(group, x, z, rng() > 0.5);
    flickers.push({
      mesh: fixture.tube,
      light: fixture.light,
      base: 2.85 + rng() * 0.6,
      phase: rng() * Math.PI * 2,
      rate: 0.7 + rng() * 1.7,
      broken: rng() < 0.11,
    });
  }

  return { group, colliders, flickers };
}

function addWall(group, colliders, cx, cz, x, z, axis) {
  const geometry = axis === 'x' ? geometries.wallX : geometries.wallZ;
  const wall = new THREE.Mesh(geometry, materials.wall);
  wall.position.set(x, ROOM_HEIGHT / 2, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  const baseGeometry = axis === 'x' ? geometries.baseX : geometries.baseZ;
  const base = new THREE.Mesh(baseGeometry, materials.baseboard);
  base.position.set(x, 0.045, z);
  group.add(base);

  const width = axis === 'x' ? WALL_SEGMENT : WALL_THICK;
  const depth = axis === 'x' ? WALL_THICK : WALL_SEGMENT;
  colliders.push(makeCollider(cx, cz, x, z, width, depth));
}

function addFluorescent(group, x, z, rotate) {
  const holder = new THREE.Group();
  holder.position.set(x, ROOM_HEIGHT - 0.032, z);
  holder.rotation.y = rotate ? Math.PI / 2 : 0;
  group.add(holder);

  const frame = new THREE.Mesh(geometries.fixture, materials.fixture);
  frame.castShadow = true;
  holder.add(frame);

  const tubeMaterial = materials.tube.clone();
  const tube = new THREE.Mesh(geometries.tube, tubeMaterial);
  tube.rotation.x = Math.PI / 2;
  tube.position.y = -0.032;
  holder.add(tube);

  let light = null;
  if ((Math.abs(Math.round(x)) + Math.abs(Math.round(z))) % 2 === 0) {
    light = new THREE.PointLight(0xffe8a6, 17, 16, 1.7);
    light.position.set(0, -0.18, 0);
    light.castShadow = false;
    holder.add(light);
  }

  return { tube, light };
}

function updateChunks(force = false) {
  const cx = chunkCoord(camera.position.x);
  const cz = chunkCoord(camera.position.z);
  if (!force && cx === lastChunkX && cz === lastChunkZ) return;
  lastChunkX = cx;
  lastChunkZ = cz;

  const keep = new Set();
  for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
    for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
      const nx = cx + dx;
      const nz = cz + dz;
      const key = `${nx},${nz}`;
      keep.add(key);
      if (!chunks.has(key)) chunks.set(key, generateChunk(nx, nz));
    }
  }

  for (const [key, chunk] of chunks) {
    if (keep.has(key)) continue;
    scene.remove(chunk.group);
    for (const item of chunk.flickers) item.mesh.material.dispose();
    chunks.delete(key);
  }

  statusEl.textContent = `zone ${cx}:${cz} · ${chunks.size} chunks · ${humEnabled ? 'hum on' : 'hum off'}`;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.045);
  elapsed += dt;
  if (controls.isLocked) updateMovement(dt);
  updateChunks();
  updateFlicker(elapsed);
  renderer.toneMappingExposure = 0.955 + Math.sin(elapsed * 0.19) * 0.012;
  renderer.render(scene, camera);
}

function updateMovement(dt) {
  let xAxis = 0;
  let zAxis = 0;
  if (pressed.has('KeyW') || pressed.has('ArrowUp')) zAxis += 1;
  if (pressed.has('KeyS') || pressed.has('ArrowDown')) zAxis -= 1;
  if (pressed.has('KeyD') || pressed.has('ArrowRight')) xAxis += 1;
  if (pressed.has('KeyA') || pressed.has('ArrowLeft')) xAxis -= 1;
  if (xAxis === 0 && zAxis === 0) return;

  camera.getWorldDirection(tmpForward);
  tmpForward.y = 0;
  tmpForward.normalize();
  tmpRight.crossVectors(tmpForward, camera.up).normalize();

  tmpMove.set(0, 0, 0).addScaledVector(tmpForward, zAxis).addScaledVector(tmpRight, xAxis);
  if (tmpMove.lengthSq() > 1) tmpMove.normalize();

  const speed = pressed.has('ShiftLeft') || pressed.has('ShiftRight') ? RUN_SPEED : WALK_SPEED;
  tmpMove.multiplyScalar(speed * dt);

  const colliders = getNearbyColliders(camera.position.x, camera.position.z);
  const nextX = camera.position.x + tmpMove.x;
  if (!hitsAny(nextX, camera.position.z, colliders)) camera.position.x = nextX;
  const nextZ = camera.position.z + tmpMove.z;
  if (!hitsAny(camera.position.x, nextZ, colliders)) camera.position.z = nextZ;
  camera.position.y = EYE_HEIGHT;
}

function updateFlicker(time) {
  for (const chunk of chunks.values()) {
    for (const item of chunk.flickers) {
      let intensity = item.base + Math.sin(time * item.rate + item.phase) * 0.08;
      if (item.broken) {
        const pulse = Math.sin(time * 18.7 + item.phase) + Math.sin(time * 31.3 + item.phase * 2.1);
        if (pulse > 1.45) intensity *= 0.08;
      }
      item.mesh.material.emissiveIntensity = intensity;
      if (item.light) item.light.intensity = 13 + intensity * 1.4;
    }
  }
}

function getNearbyColliders(x, z) {
  const cx = chunkCoord(x);
  const cz = chunkCoord(z);
  const result = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const chunk = chunks.get(`${cx + dx},${cz + dz}`);
      if (chunk) result.push(...chunk.colliders);
    }
  }
  return result;
}

function hitsAny(x, z, colliders) {
  for (const box of colliders) {
    const nearestX = THREE.MathUtils.clamp(x, box.minX, box.maxX);
    const nearestZ = THREE.MathUtils.clamp(z, box.minZ, box.maxZ);
    const dx = x - nearestX;
    const dz = z - nearestZ;
    if (dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS) return true;
  }
  return false;
}

function makeCollider(cx, cz, localX, localZ, width, depth) {
  const wx = cx * CHUNK_SIZE + localX;
  const wz = cz * CHUNK_SIZE + localZ;
  return { minX: wx - width / 2, maxX: wx + width / 2, minZ: wz - depth / 2, maxZ: wz + depth / 2 };
}

function isStartClear(cx, cz, x, z) {
  return cx === 0 && cz === 0 && Math.hypot(x, z) < 6.2;
}

function chunkCoord(value) {
  return Math.floor((value + CHUNK_SIZE / 2) / CHUNK_SIZE);
}

function makeWallpaperTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const seed = mulberry32(0x5f3759df);

  for (let i = 0; i < img.data.length; i += 4) {
    const n = (seed() - 0.5) * 15;
    img.data[i] = 186 + n;
    img.data[i + 1] = 169 + n * 0.92;
    img.data[i + 2] = 91 + n * 0.55;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  ctx.globalAlpha = 0.11;
  for (let x = 0; x < size; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? '#6f632f' : '#f0df8e';
    ctx.fillRect(x, 0, 1, size);
  }

  ctx.globalAlpha = 0.26;
  ctx.strokeStyle = '#75662e';
  ctx.fillStyle = '#7c6c31';
  ctx.lineWidth = 1;
  for (let y = -8; y < size + 20; y += 32) {
    for (let x = -8; x < size + 20; x += 24) {
      const offset = ((y / 32) & 1) ? 12 : 0;
      const px = x + offset;
      ctx.beginPath();
      ctx.moveTo(px, y + 3);
      ctx.quadraticCurveTo(px + 5, y + 8, px, y + 14);
      ctx.quadraticCurveTo(px - 5, y + 8, px, y + 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, y + 19, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px - 4, y + 23);
      ctx.lineTo(px, y + 27);
      ctx.lineTo(px + 4, y + 23);
      ctx.stroke();
    }
  }

  const gradient = ctx.createLinearGradient(0, 0, size, 0);
  gradient.addColorStop(0, 'rgba(74,58,18,0.06)');
  gradient.addColorStop(0.35, 'rgba(255,245,173,0.03)');
  gradient.addColorStop(0.72, 'rgba(71,57,20,0.045)');
  gradient.addColorStop(1, 'rgba(255,241,156,0.015)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

function makeCarpetTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const seed = mulberry32(0x1b873593);

  for (let i = 0; i < img.data.length; i += 4) {
    const coarse = Math.floor(seed() * 5) * 3;
    const n = (seed() - 0.5) * 24 - coarse;
    img.data[i] = 148 + n;
    img.data[i + 1] = 126 + n * 0.85;
    img.data[i + 2] = 58 + n * 0.45;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#d7c47a';
  for (let i = 0; i < 680; i++) {
    const x = seed() * size;
    const y = seed() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (seed() - 0.5) * 3.2, y + seed() * 2.4);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#4f431d';
  for (let i = 0; i < 42; i++) {
    const x = seed() * size;
    const y = seed() * size;
    const r = 4 + seed() * 15;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

function makeCeilingTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const seed = mulberry32(0xc2b2ae35);

  ctx.fillStyle = '#d7d09c';
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 1150; i++) {
    const v = Math.floor(128 + seed() * 65);
    ctx.fillStyle = `rgb(${v},${v - 3},${Math.max(0, v - 26)})`;
    ctx.fillRect(seed() * size, seed() * size, 1, 1);
  }
  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = '#80784c';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#fff7c8';
  ctx.lineWidth = 1;
  ctx.strokeRect(4, 4, size - 8, size - 8);
  return new THREE.CanvasTexture(canvas);
}

function makeNoiseTexture(size, min, max) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const seed = mulberry32(size * 2654435761);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor((min + (max - min) * seed()) * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function hash2(x, z) {
  let h = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(z ^ 0xc2b2ae35, 0x27d4eb2d);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return h >>> 0;
}

function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ensureHum() {
  if (audioState) {
    if (audioState.ctx.state === 'suspended') audioState.ctx.resume();
    return;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const gain = ctx.createGain();
  gain.gain.value = humEnabled ? 0.018 : 0;
  gain.connect(ctx.destination);

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -32;
  compressor.knee.value = 18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.02;
  compressor.release.value = 0.35;
  compressor.connect(gain);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 540;
  filter.Q.value = 0.7;
  filter.connect(compressor);

  const humA = ctx.createOscillator();
  const humB = ctx.createOscillator();
  const flutter = ctx.createOscillator();
  const flutterGain = ctx.createGain();
  const humGain = ctx.createGain();

  humA.type = 'sine';
  humA.frequency.value = 60;
  humB.type = 'triangle';
  humB.frequency.value = 120;
  flutter.type = 'sine';
  flutter.frequency.value = 0.23;
  flutterGain.gain.value = 0.8;
  humGain.gain.value = 0.9;

  flutter.connect(flutterGain);
  flutterGain.connect(humGain.gain);
  humA.connect(humGain);
  humB.connect(humGain);
  humGain.connect(filter);
  humA.start();
  humB.start();
  flutter.start();
  audioState = { ctx, gain, humA, humB, flutter };
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
}
