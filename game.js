import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const CHUNK_SIZE = 24;
const GRID = 6;
const CELL = CHUNK_SIZE / GRID;
const PLAYER_RADIUS = 0.34;
const EYE_HEIGHT = 1.62;
const WALK_SPEED = 3.25;
const RUN_SPEED = 5.15;
const INTERACT_DISTANCE = 2.35;
const NET_HZ = 10;
const MAX_PLAYERS = 4;

const LEVELS = [
  level('Level 0', 'The Yellow Rooms', '#c9ad4e', '#8f793a', '#d2c680', '#796a2c', 'balloon', 'collect', 3, .25, .30, 'carpet'),
  level('Level 1', 'Habitable Zone', '#8e856a', '#5a5549', '#9b967f', '#3c3930', 'wire', 'terminals', 3, .31, .24, 'concrete'),
  level('Level 2', 'Pipe Dreams', '#77705c', '#4d463a', '#817a68', '#27251f', 'brute', 'sequence', 4, .39, .16, 'concrete'),
  level('Level 3', 'Electrical Station', '#7d754a', '#4b4430', '#7b734f', '#28251a', 'eye', 'terminals', 4, .43, .12, 'concrete'),
  level('Level 4', 'Abandoned Office', '#c8bd8e', '#7d755e', '#cfc8a5', '#6e684d', 'wire', 'collect', 4, .33, .23, 'office'),
  level('Level 5', 'Terror Hotel', '#8d684f', '#59473e', '#8b795f', '#3d2f28', 'brute', 'sequence', 4, .40, .14, 'carpet'),
  level('Level 6', 'Lights Out', '#383a34', '#20231f', '#44463f', '#11130f', 'eye', 'collect', 3, .34, .20, 'concrete'),
  level('Level 7', 'Flooded Rooms', '#a7c0b7', '#557876', '#d4ddd4', '#608b88', 'maw', 'terminals', 3, .23, .18, 'pool'),
  level('Level 8', 'Cave System', '#665b49', '#413a30', '#675f52', '#24201a', 'crawler', 'collect', 4, .18, .34, 'concrete'),
  level('Level 9', 'Suburban Simulation', '#c0b889', '#6e7258', '#d3cc9c', '#6c704d', 'balloon', 'sequence', 4, .20, .18, 'carpet'),
  level('Level 10', 'Field of Wheat', '#b9a966', '#796a35', '#d1c884', '#8b7c3e', 'eye', 'collect', 4, .12, .37, 'carpet'),
  level('Level 11', 'Endless City', '#7e8589', '#4f5358', '#8e9192', '#34383c', 'brute', 'terminals', 4, .35, .16, 'concrete'),
  level('Level 12', 'The Matrix', '#62806c', '#303e34', '#6d7c72', '#1b261f', 'wire', 'sequence', 5, .42, .10, 'concrete'),
  level('Level 13', 'Infinite Apartments', '#b19c78', '#705e49', '#b8aa8d', '#625240', 'crawler', 'collect', 4, .36, .22, 'carpet'),
  level('Level 14', 'Military Hospital', '#c0c6af', '#697268', '#d4d5c5', '#5f685d', 'brute', 'terminals', 5, .40, .15, 'office'),
  level('Level 15', 'Futuristic Halls', '#9da6a8', '#515d61', '#bdc3bf', '#526067', 'eye', 'sequence', 5, .28, .18, 'office'),
  level('Level 16', 'Altered Reality', '#775d7b', '#403445', '#8b718f', '#3b2c40', 'maw', 'collect', 4, .22, .29, 'carpet'),
  level('Level 17', 'Carrier Deck', '#737a76', '#343b39', '#939b95', '#29302f', 'brute', 'terminals', 5, .34, .14, 'concrete'),
  level('Level 18', 'Memories', '#b9a78c', '#766a5a', '#c8bca6', '#6c5f51', 'balloon', 'sequence', 4, .24, .24, 'carpet'),
  level('Level 19', 'Attic Maze', '#8e795d', '#524739', '#9a8b73', '#3e352a', 'wire', 'collect', 5, .46, .08, 'wood'),
  level('Level 20', 'Warehouse', '#9a9482', '#57564e', '#aaa696', '#48483f', 'crawler', 'terminals', 5, .30, .33, 'concrete'),
  level('Level 21', 'The Poolrooms', '#cfd4c6', '#6fa6aa', '#e7e7d7', '#75a5a8', 'maw', 'sequence', 5, .18, .12, 'pool'),
];

function level(name, subtitle, wall, floor, ceiling, fog, entity, puzzle, count, wallDensity, columnDensity, floorMode) {
  return { name, subtitle, wall, floor, ceiling, fog, entity, puzzle, count, wallDensity, columnDensity, floorMode };
}

const $ = (s) => document.querySelector(s);
const app = $('#app');
const menu = $('#menu');
const startButton = $('#start');
const qualitySelect = $('#quality');
const filterSelect = $('#filter');
const micButton = $('#micButton');
const gyroButton = $('#gyroButton');
const hostButton = $('#hostButton');
const joinButton = $('#joinButton');
const roomInput = $('#roomInput');
const roomCode = $('#roomCode');
const levelNameEl = $('#levelName');
const objectiveEl = $('#objective');
const statusEl = $('#status');
const entityStatusEl = $('#entityStatus');
const micMeter = $('#micMeter');
const micStateEl = $('#micState');
const netStateEl = $('#netState');
const interactionEl = $('#interaction');
const fpsEl = $('#fps');
const cameraTimeEl = $('#cameraTime');
const toastEl = $('#toast');
const damageEl = $('#damage');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 90);
camera.rotation.order = 'YXZ';
camera.position.set(0, EYE_HEIGHT, 0);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .94;
renderer.shadowMap.enabled = false;
app.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);
controls.pointerSpeed = .68;

const hemi = new THREE.HemisphereLight(0xffefb4, 0x3b351d, 1.38);
scene.add(hemi);
const fillLight = new THREE.DirectionalLight(0xfff0c5, .42);
fillLight.position.set(3, 8, 1);
scene.add(fillLight);

const textures = createTextures();
const materials = createMaterials();
const geo = createGeometry();

const chunks = new Map();
const pressed = new Set();
const clock = new THREE.Clock();
const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpMove = new THREE.Vector3();
const tmpMat = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpPos = new THREE.Vector3();
const tmpEuler = new THREE.Euler();
const worldUp = new THREE.Vector3(0, 1, 0);

let currentLevelIndex = 0;
let lastChunkX = Number.NaN;
let lastChunkZ = Number.NaN;
let loadRadius = 1;
let qualityMode = 'auto';
let renderScale = 1;
let fpsAverage = 60;
let fpsAccum = 0;
let fpsFrames = 0;
let fpsWindow = 0;
let elapsed = 0;
let moving = false;
let sprinting = false;
let stepTimer = 0;
let humEnabled = true;
let audioState = null;
let scareCooldown = 0;
let currentInteract = null;
let objectiveState = null;
let exitPortal = null;

const objectiveRoot = new THREE.Group();
const entityRoot = new THREE.Group();
const remoteRoot = new THREE.Group();
scene.add(objectiveRoot, entityRoot, remoteRoot);
const entities = [];
const remotePlayers = new Map();

const mic = { enabled: false, stream: null, ctx: null, analyser: null, data: null, level: 0 };
const gyro = { enabled: false, alpha: 0, beta: 0, gamma: 0, orient: 0, quaternion: new THREE.Quaternion() };
const net = { mode: 'solo', peer: null, hostConn: null, conns: new Map(), lastSend: 0, id: '' };

startButton.addEventListener('click', enterGame);
renderer.domElement.addEventListener('click', () => { if (!controls.isLocked && !isTouchDevice()) controls.lock(); });
controls.addEventListener('lock', () => { menu.classList.add('hidden'); ensureAudio(); });
controls.addEventListener('unlock', () => { if (!isTouchDevice()) menu.classList.remove('hidden'); });
qualitySelect.addEventListener('change', () => { qualityMode = qualitySelect.value; applyQuality(true); });
filterSelect.addEventListener('change', () => setFilter(filterSelect.value));
micButton.addEventListener('click', toggleMic);
gyroButton.addEventListener('click', enableGyro);
hostButton.addEventListener('click', hostRoom);
joinButton.addEventListener('click', joinRoom);
addEventListener('keydown', onKeyDown);
addEventListener('keyup', (e) => pressed.delete(e.code));
addEventListener('blur', () => pressed.clear());
addEventListener('resize', onResize);
addEventListener('orientationchange', () => gyro.orient = screen.orientation?.angle || window.orientation || 0);
addEventListener('deviceorientation', onDeviceOrientation, true);

let touchId = null, touchX = 0, touchY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  touchId = e.pointerId; touchX = e.clientX; touchY = e.clientY;
  renderer.domElement.setPointerCapture?.(e.pointerId);
  menu.classList.add('hidden'); ensureAudio();
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerId !== touchId || gyro.enabled) return;
  const dx = e.clientX - touchX, dy = e.clientY - touchY;
  touchX = e.clientX; touchY = e.clientY;
  camera.rotation.y -= dx * .0045;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * .0042, -1.42, 1.42);
});
renderer.domElement.addEventListener('pointerup', (e) => { if (e.pointerId === touchId) touchId = null; });

setFilter('bodycam');
applyQuality(true);
switchLevel(0, true);
animate();

function enterGame() { menu.classList.add('hidden'); ensureAudio(); if (!isTouchDevice()) controls.lock(); }
function onKeyDown(event) {
  pressed.add(event.code);
  if (event.code === 'KeyE' && !event.repeat) interact();
  if (event.code === 'KeyM' && !event.repeat) { humEnabled = !humEnabled; updateHumGain(); showToast(humEnabled ? '環境音 ON' : '環境音 OFF'); }
  if (event.code === 'KeyK' && !event.repeat) toggleMic();
  if (event.code === 'KeyV' && !event.repeat) cycleFilter();
  if (event.code === 'Escape') menu.classList.remove('hidden');
}

function createTextures() {
  const wallpaper = wallpaperTexture(), carpet = carpetTexture(), tile = tileTexture(), concrete = concreteTexture(), ceiling = ceilingTexture(), wood = woodTexture();
  for (const tex of [wallpaper, carpet, tile, concrete, ceiling, wood]) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  }
  wallpaper.repeat.set(2.8, 2.1); carpet.repeat.set(CHUNK_SIZE / 2.1, CHUNK_SIZE / 2.1); tile.repeat.set(CHUNK_SIZE / 2.3, CHUNK_SIZE / 2.3); concrete.repeat.set(CHUNK_SIZE / 3.1, CHUNK_SIZE / 3.1); wood.repeat.set(CHUNK_SIZE / 2.7, CHUNK_SIZE / 2.7); ceiling.repeat.set(GRID, GRID);
  return { wallpaper, carpet, tile, concrete, ceiling, wood };
}
function createMaterials() {
  const wall = new THREE.MeshStandardMaterial({ color: 0xc9ad4e, map: textures.wallpaper, roughness: .9, metalness: 0 });
  const floor = new THREE.MeshStandardMaterial({ color: 0x8f793a, map: textures.carpet, roughness: .98, metalness: 0 });
  const ceiling = new THREE.MeshStandardMaterial({ color: 0xd2c680, map: textures.ceiling, roughness: .92, metalness: 0, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: 0x786632, roughness: .9 });
  const fixture = new THREE.MeshStandardMaterial({ color: 0xf4edc8, emissive: 0xffe8a5, emissiveIntensity: 2.3, roughness: .32 });
  const objective = new THREE.MeshStandardMaterial({ color: 0xf3d86a, emissive: 0xffc82e, emissiveIntensity: 1.4, roughness: .45 });
  const objectiveDone = new THREE.MeshStandardMaterial({ color: 0x5f6958, emissive: 0x263a25, emissiveIntensity: .2, roughness: .75 });
  const portal = new THREE.MeshStandardMaterial({ color: 0xb8e7ee, emissive: 0x71d8ff, emissiveIntensity: 2.4, transparent: true, opacity: .75, side: THREE.DoubleSide, roughness: .2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x171713, roughness: .92 });
  const flesh = new THREE.MeshStandardMaterial({ color: 0x5f4e2c, roughness: .8 });
  const grayFlesh = new THREE.MeshStandardMaterial({ color: 0x6e6a64, roughness: .82 });
  const red = new THREE.MeshStandardMaterial({ color: 0x6a1010, emissive: 0x260000, emissiveIntensity: .35, roughness: .63 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x7e6a42, roughness: .36 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: .25 });
  const maw = new THREE.MeshStandardMaterial({ color: 0x8f6d28, roughness: .72 });
  const remote = new THREE.MeshStandardMaterial({ color: 0x93b5b1, emissive: 0x162c2e, emissiveIntensity: .4, roughness: .65 });
  return { wall, floor, ceiling, trim, fixture, objective, objectiveDone, portal, dark, flesh, grayFlesh, red, eye, pupil, maw, remote };
}
function createGeometry() {
  return { box: new THREE.BoxGeometry(1, 1, 1), plane: new THREE.PlaneGeometry(1, 1), sphere: new THREE.SphereGeometry(.5, 10, 8), cylinder: new THREE.CylinderGeometry(.5, .5, 1, 8), cone: new THREE.ConeGeometry(.5, 1, 9), torus: new THREE.TorusGeometry(.5, .12, 8, 18) };
}

function applyTheme(theme) {
  scene.background = new THREE.Color(theme.fog); scene.fog = new THREE.FogExp2(theme.fog, theme.name === 'Level 6' ? .055 : .031);
  materials.wall.color.set(theme.wall); materials.floor.color.set(theme.floor); materials.ceiling.color.set(theme.ceiling); materials.trim.color.set(theme.floor).multiplyScalar(.72);
  materials.floor.map = theme.floorMode === 'pool' || theme.floorMode === 'office' ? textures.tile : theme.floorMode === 'wood' ? textures.wood : theme.floorMode === 'concrete' ? textures.concrete : textures.carpet;
  materials.floor.needsUpdate = true;
  hemi.color.set(theme.ceiling); hemi.groundColor.set(theme.floor); hemi.intensity = theme.name === 'Level 6' ? .68 : 1.28;
  fillLight.color.set(theme.ceiling); fillLight.intensity = theme.name === 'Level 6' ? .16 : .34;
}

function generateChunk(cx, cz) {
  const theme = LEVELS[currentLevelIndex], group = new THREE.Group(); group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE); scene.add(group);
  const colliders = [], rng = mulberry32(hash3(currentLevelIndex + 1, cx, cz)), min = -CHUNK_SIZE / 2, height = roomHeight(theme);
  const floor = new THREE.Mesh(geo.plane, materials.floor); floor.rotation.x = -Math.PI / 2; floor.scale.set(CHUNK_SIZE, CHUNK_SIZE, 1); group.add(floor);
  if (theme.floorMode === 'pool') {
    const waterMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.floor).offsetHSL(.02, .05, .12), emissive: new THREE.Color(theme.floor).multiplyScalar(.12), emissiveIntensity: .4, roughness: .18, metalness: .04, transparent: true, opacity: .68 });
    const water = new THREE.Mesh(geo.plane, waterMat); water.rotation.x = -Math.PI / 2; water.position.y = .055; water.scale.set(CHUNK_SIZE, CHUNK_SIZE, 1); group.add(water); group.userData.disposables = [waterMat];
  }
  const ceiling = new THREE.Mesh(geo.plane, materials.ceiling); ceiling.rotation.x = Math.PI / 2; ceiling.position.y = height; ceiling.scale.set(CHUNK_SIZE, CHUNK_SIZE, 1); group.add(ceiling);
  const walls = [], trims = [], columns = [], fixtures = [];
  for (let gx = 1; gx < GRID; gx++) for (let gz = 1; gz < GRID; gz++) {
    if (rng() > theme.columnDensity) continue;
    const x = min + gx * CELL, z = min + gz * CELL; if (isStartClear(cx, cz, x, z)) continue;
    columns.push({ x, y: height / 2, z, sx: .72 + rng() * .28, sy: height, sz: .72 + rng() * .28 });
    const c = columns[columns.length - 1]; colliders.push(makeCollider(cx, cz, x, z, c.sx, c.sz));
  }
  for (let gx = 1; gx < GRID; gx++) for (let gz = 0; gz < GRID; gz++) {
    if (rng() > theme.wallDensity) continue;
    const x = min + gx * CELL, z = min + (gz + .5) * CELL; if (isStartClear(cx, cz, x, z)) continue;
    const length = CELL * (.78 + rng() * .2); walls.push({ x, y: height / 2, z, sx: .16, sy: height, sz: length }); trims.push({ x, y: .045, z, sx: .20, sy: .09, sz: length + .04 }); colliders.push(makeCollider(cx, cz, x, z, .16, length));
  }
  for (let gz = 1; gz < GRID; gz++) for (let gx = 0; gx < GRID; gx++) {
    if (rng() > theme.wallDensity) continue;
    const x = min + (gx + .5) * CELL, z = min + gz * CELL; if (isStartClear(cx, cz, x, z)) continue;
    const length = CELL * (.78 + rng() * .2); walls.push({ x, y: height / 2, z, sx: length, sy: height, sz: .16 }); trims.push({ x, y: .045, z, sx: length + .04, sy: .09, sz: .20 }); colliders.push(makeCollider(cx, cz, x, z, length, .16));
  }
  const slots = [[-.29,-.28],[.18,-.28],[.30,.02],[-.20,.21],[.17,.29],[-.02,-.02]], lightCount = theme.name === 'Level 6' ? 2 : 5;
  for (let i = 0; i < lightCount; i++) {
    const [sx, sz] = slots[i]; fixtures.push({ x: sx * CHUNK_SIZE + (rng() - .5) * 1.1, y: height - .045, z: sz * CHUNK_SIZE + (rng() - .5) * 1.1, sx: rng() > .5 ? 1.55 : .46, sy: .05, sz: rng() > .5 ? .46 : 1.55 });
  }
  addInstances(group, walls, materials.wall); addInstances(group, trims, materials.trim); addInstances(group, columns, materials.wall); addInstances(group, fixtures, materials.fixture);
  return { group, colliders };
}
function addInstances(group, transforms, material) {
  if (!transforms.length) return;
  const mesh = new THREE.InstancedMesh(geo.box, material, transforms.length); mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  for (let i = 0; i < transforms.length; i++) { const t = transforms[i]; tmpPos.set(t.x, t.y, t.z); tmpQuat.identity(); tmpScale.set(t.sx, t.sy, t.sz); tmpMat.compose(tmpPos, tmpQuat, tmpScale); mesh.setMatrixAt(i, tmpMat); }
  mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = true; group.add(mesh);
}
function updateChunks(force = false) {
  const cx = chunkCoord(camera.position.x), cz = chunkCoord(camera.position.z); if (!force && cx === lastChunkX && cz === lastChunkZ) return; lastChunkX = cx; lastChunkZ = cz;
  const keep = new Set();
  for (let dx = -loadRadius; dx <= loadRadius; dx++) for (let dz = -loadRadius; dz <= loadRadius; dz++) { const x = cx + dx, z = cz + dz, key = `${x},${z}`; keep.add(key); if (!chunks.has(key)) chunks.set(key, generateChunk(x, z)); }
  for (const [key, chunk] of chunks) { if (keep.has(key)) continue; scene.remove(chunk.group); disposeChunk(chunk); chunks.delete(key); }
  updateWorldStatus();
}
function disposeChunk(chunk) { for (const d of chunk.group.userData.disposables || []) d.dispose?.(); }
function clearChunks() { for (const chunk of chunks.values()) { scene.remove(chunk.group); disposeChunk(chunk); } chunks.clear(); lastChunkX = Number.NaN; lastChunkZ = Number.NaN; }

function updateMovement(dt) {
  let xAxis = 0, zAxis = 0;
  if (pressed.has('KeyW') || pressed.has('ArrowUp')) zAxis += 1; if (pressed.has('KeyS') || pressed.has('ArrowDown')) zAxis -= 1; if (pressed.has('KeyD') || pressed.has('ArrowRight')) xAxis += 1; if (pressed.has('KeyA') || pressed.has('ArrowLeft')) xAxis -= 1;
  moving = xAxis !== 0 || zAxis !== 0; sprinting = moving && (pressed.has('ShiftLeft') || pressed.has('ShiftRight'));
  if (gyro.enabled) applyGyroOrientation();
  if (!moving) { camera.position.y = THREE.MathUtils.lerp(camera.position.y, EYE_HEIGHT, Math.min(1, dt * 8)); stepTimer = Math.max(0, stepTimer - dt); return; }
  camera.getWorldDirection(tmpForward); tmpForward.y = 0; if (tmpForward.lengthSq() < .0001) tmpForward.set(0, 0, -1); tmpForward.normalize(); tmpRight.crossVectors(tmpForward, worldUp).normalize();
  tmpMove.set(0,0,0).addScaledVector(tmpForward, zAxis).addScaledVector(tmpRight, xAxis); if (tmpMove.lengthSq() > 1) tmpMove.normalize();
  tmpMove.multiplyScalar((sprinting ? RUN_SPEED : WALK_SPEED) * dt);
  const colliders = getNearbyColliders(camera.position.x, camera.position.z), nextX = camera.position.x + tmpMove.x; if (!hitsAny(nextX, camera.position.z, colliders, PLAYER_RADIUS)) camera.position.x = nextX;
  const nextZ = camera.position.z + tmpMove.z; if (!hitsAny(camera.position.x, nextZ, colliders, PLAYER_RADIUS)) camera.position.z = nextZ;
  const bobRate = sprinting ? 12.5 : 9.2, bobAmp = sprinting ? .046 : .028; camera.position.y = EYE_HEIGHT + Math.sin(elapsed * bobRate) * bobAmp;
  camera.fov = THREE.MathUtils.lerp(camera.fov, sprinting ? 77 : 72, Math.min(1, dt * 5)); camera.updateProjectionMatrix();
  stepTimer -= dt; if (stepTimer <= 0) { playFootstep(); stepTimer = sprinting ? .31 : .46; }
}

function createObjectives() {
  clearObjectiveRoot(); objectiveState = { solved: 0, total: LEVELS[currentLevelIndex].count, expected: 0, items: [] };
  const theme = LEVELS[currentLevelIndex], rng = mulberry32(hash3(0x51f15e, currentLevelIndex, 7));
  for (let i = 0; i < theme.count; i++) { const p = findWalkablePoint(7 + i * 1.7, 19 + i * 1.4, rng), item = buildObjective(theme.puzzle, i); item.group.position.set(p.x, 0, p.z); objectiveRoot.add(item.group); objectiveState.items.push(item); }
  updateObjectiveHud();
}
function buildObjective(type, index) {
  const group = new THREE.Group(); let core;
  if (type === 'collect') { core = new THREE.Mesh(geo.box, materials.objective); core.scale.set(.34,.55,.22); core.position.y=.42; const handle=new THREE.Mesh(geo.torus,materials.dark); handle.scale.set(.28,.28,.11); handle.position.y=.78; group.add(core,handle); }
  else if (type === 'terminals') { core=new THREE.Mesh(geo.box,materials.dark); core.scale.set(.55,1.05,.28); core.position.y=.58; const screen=new THREE.Mesh(geo.box,materials.objective); screen.scale.set(.38,.24,.04); screen.position.set(0,.74,-.165); group.add(core,screen,makeLabelSprite(String(index+1))); }
  else { core=new THREE.Mesh(geo.cylinder,materials.dark); core.scale.set(.42,.56,.42); core.position.y=.45; const ring=new THREE.Mesh(geo.torus,materials.objective); ring.rotation.x=Math.PI/2; ring.position.y=.82; ring.scale.set(.52,.52,.16); const label=makeLabelSprite(String(index+1)); label.position.y=1.28; group.add(core,ring,label); }
  return { group, core, index, solved:false, type };
}
function makeLabelSprite(text) {
  const c=document.createElement('canvas'); c.width=c.height=128; const ctx=c.getContext('2d'); ctx.fillStyle='rgba(18,16,10,.78)'; ctx.fillRect(28,28,72,72); ctx.strokeStyle='rgba(255,240,156,.8)'; ctx.lineWidth=4; ctx.strokeRect(30,30,68,68); ctx.font='bold 54px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#fff1a9'; ctx.fillText(text,64,66);
  const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace; const mat=new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}), sprite=new THREE.Sprite(mat); sprite.position.set(0,1.35,0); sprite.scale.set(.7,.7,.7); sprite.userData.dispose=()=>{tex.dispose();mat.dispose();}; return sprite;
}
function clearObjectiveRoot() {
  while (objectiveRoot.children.length) { const child=objectiveRoot.children.pop(); child.traverse((o)=>o.userData.dispose?.()); }
  if (exitPortal) { scene.remove(exitPortal); disposeObject(exitPortal); exitPortal=null; }
}
function interact() { if (!currentInteract) return; if (currentInteract.kind==='objective') solveObjective(currentInteract.item); if (currentInteract.kind==='exit') nextLevel(); }
function solveObjective(item) {
  if (!item || item.solved || !objectiveState) return; const theme=LEVELS[currentLevelIndex];
  if (theme.puzzle==='sequence' && item.index!==objectiveState.expected) { objectiveState.expected=0; for(const it of objectiveState.items){ if(it.solved){ it.solved=false; setObjectiveSolvedVisual(it,false);} } objectiveState.solved=0; playErrorTone(); showToast('順番が違う。シーケンスがリセットされた'); updateObjectiveHud(); return; }
  item.solved=true; objectiveState.solved++; if(theme.puzzle==='sequence') objectiveState.expected++; setObjectiveSolvedVisual(item,true); playConfirmTone(); if(theme.puzzle==='collect') item.group.visible=false;
  if(objectiveState.solved>=objectiveState.total){ showToast('出口信号を検出'); spawnExitPortal(); } else showToast(`${objectiveState.solved}/${objectiveState.total} 完了`); updateObjectiveHud();
}
function setObjectiveSolvedVisual(item, solved) { item.group.traverse((o)=>{ if(!o.isMesh)return; if(o.material===materials.objective||o.material===materials.objectiveDone)o.material=solved?materials.objectiveDone:materials.objective; }); item.group.visible=true; }
function spawnExitPortal() {
  if(exitPortal)return; const p=findWalkablePoint(8,13,mulberry32(hash3(currentLevelIndex,0xfeed,9))), g=new THREE.Group(); g.position.set(p.x,0,p.z);
  const top=new THREE.Mesh(geo.box,materials.portal); top.scale.set(2,.13,.14); top.position.y=2.05; const left=new THREE.Mesh(geo.box,materials.portal); left.scale.set(.13,2.05,.14); left.position.set(-.94,1.02,0); const right=left.clone(); right.position.x=.94; const veil=new THREE.Mesh(geo.plane,materials.portal); veil.scale.set(1.74,1.82,1); veil.position.y=1.03; g.add(top,left,right,veil); g.userData.veil=veil; scene.add(g); exitPortal=g;
}
function updateInteraction() {
  let best=null,bestDist=INTERACT_DISTANCE; if(objectiveState) for(const item of objectiveState.items){ if(item.solved||!item.group.visible)continue; const d=distanceXZ(camera.position,item.group.position); if(d<bestDist){bestDist=d;best={kind:'objective',item};} }
  if(exitPortal){ const d=distanceXZ(camera.position,exitPortal.position); if(d<bestDist+.5) best={kind:'exit'}; }
  currentInteract=best; if(!best) interactionEl.textContent=''; else if(best.kind==='exit') interactionEl.textContent='[E] 次のレベルへ'; else { const theme=LEVELS[currentLevelIndex]; interactionEl.textContent=theme.puzzle==='collect'?'[E] 取得':theme.puzzle==='sequence'?`[E] 端末 ${best.item.index+1}`:'[E] 起動'; }
}

function spawnEntities() {
  clearEntities(); const theme=LEVELS[currentLevelIndex], count=currentLevelIndex<3?1:(currentLevelIndex%5===0?2:1), rng=mulberry32(hash3(currentLevelIndex,0xdead,0xbeef));
  for(let i=0;i<count;i++){ const p=findWalkablePoint(12+i*4,22+i*4,rng), e=createEntity(theme.entity); e.group.position.set(p.x,0,p.z); e.phase=rng()*Math.PI*2; e.wander=rng()*Math.PI*2; e.chaseUntil=0; e.speed=entitySpeed(theme.entity)*(1+currentLevelIndex*.008); e.hearing=23+currentLevelIndex*.4; e.sight=9.5+currentLevelIndex*.15; entityRoot.add(e.group); entities.push(e); }
}
function createEntity(kind){ if(kind==='balloon')return createBalloonEntity(); if(kind==='wire')return createWireEntity(); if(kind==='brute')return createBruteEntity(); if(kind==='eye')return createEyeEntity(); if(kind==='maw')return createMawEntity(); return createCrawlerEntity(); }
function createBalloonEntity(){ const g=new THREE.Group(),torso=mesh(geo.cylinder,materials.flesh,[0,1.12,0],[.55,1.1,.55]),head=mesh(geo.sphere,materials.flesh,[0,1.95,0],[.46,.60,.44]),armL=limb(materials.flesh,[-.48,1.25,0],.10,.92,.26),armR=limb(materials.flesh,[.48,1.35,0],.10,.88,-.34),legL=limb(materials.flesh,[-.22,.48,0],.12,1.05,.05),legR=limb(materials.flesh,[.22,.48,0],.12,1.05,-.05),balloon=mesh(geo.sphere,materials.red,[.72,3.25,0],[.55,.78,.48]),string=limb(materials.dark,[.72,2.45,0],.018,1.25,0); g.add(torso,head,armL,armR,legL,legR,balloon,string); return{group:g,parts:{armL,armR,legL,legR,balloon},kind:'balloon'}; }
function createWireEntity(){ const g=new THREE.Group(),head=mesh(geo.sphere,materials.dark,[0,2.25,0],[.27,.22,.27]),chest=limb(materials.dark,[0,1.55,0],.045,1.25,0),armL=limb(materials.dark,[-.32,1.56,0],.035,1.55,.55),armR=limb(materials.dark,[.32,1.56,0],.035,1.55,-.55),legL=limb(materials.dark,[-.18,.72,0],.04,1.55,.08),legR=limb(materials.dark,[.18,.72,0],.04,1.55,-.08),ring=new THREE.Mesh(geo.torus,materials.dark); ring.position.set(0,1.95,0); ring.rotation.x=Math.PI/2; ring.scale.set(.58,.58,.25); g.add(head,chest,armL,armR,legL,legR,ring); return{group:g,parts:{armL,armR,legL,legR,head},kind:'wire'}; }
function createBruteEntity(){ const g=new THREE.Group(),torso=mesh(geo.cylinder,materials.grayFlesh,[0,1.25,0],[.68,1.25,.55]),head=mesh(geo.sphere,materials.grayFlesh,[0,2.12,0],[.48,.53,.44]),maw=mesh(geo.cone,materials.dark,[0,2.08,-.39],[.17,.52,.16]),armL=limb(materials.grayFlesh,[-.62,1.3,0],.15,1.05,.30),armR=limb(materials.grayFlesh,[.62,1.3,0],.15,1.05,-.30),legL=limb(materials.grayFlesh,[-.26,.52,0],.17,1.1,.05),legR=limb(materials.grayFlesh,[.26,.52,0],.17,1.1,-.05); maw.rotation.x=Math.PI/2; g.add(torso,head,maw,armL,armR,legL,legR); return{group:g,parts:{armL,armR,legL,legR,head},kind:'brute'}; }
function createEyeEntity(){ const g=new THREE.Group(),eyeBall=mesh(geo.sphere,materials.eye,[0,1.85,0],[.58,.58,.42]),pupil=mesh(geo.sphere,materials.pupil,[0,1.86,-.38],[.28,.28,.09]),tentacles=[]; for(let i=0;i<4;i++){const t=limb(materials.dark,[(i-1.5)*.20,1.12,0],.06,1.35,(i-1.5)*.18);tentacles.push(t);g.add(t);} g.add(eyeBall,pupil); return{group:g,parts:{tentacles,eyeBall},kind:'eye'}; }
function createMawEntity(){ const g=new THREE.Group(),body=mesh(geo.cone,materials.maw,[0,1.45,0],[.72,1.9,.72]),mouth=mesh(geo.torus,materials.dark,[0,1.65,-.43],[.55,.68,.16]),tendrils=[]; body.rotation.x=Math.PI; mouth.rotation.x=Math.PI/2; for(let i=0;i<6;i++){const angle=(i/6)*Math.PI*2,t=limb(materials.dark,[Math.sin(angle)*.4,1.55+Math.cos(angle)*.2,0],.035,1.45,angle-Math.PI/2);tendrils.push(t);g.add(t);} g.add(body,mouth); return{group:g,parts:{tendrils,body},kind:'maw'}; }
function createCrawlerEntity(){ const g=new THREE.Group(),shadow=new THREE.Mesh(new THREE.CircleGeometry(1,18),materials.dark); shadow.rotation.x=-Math.PI/2; shadow.position.y=.015; shadow.scale.set(1.2,.72,1); const torso=mesh(geo.cylinder,materials.dark,[0,.62,0],[.25,.8,.25]); torso.rotation.z=Math.PI/2; const arms=[]; for(let i=0;i<4;i++){const t=limb(materials.dark,[(i-1.5)*.28,.38,0],.045,1.15,(i-1.5)*.35);arms.push(t);g.add(t);} g.add(shadow,torso); return{group:g,parts:{arms,torso},kind:'crawler'}; }
function mesh(geometry,material,p,s){const m=new THREE.Mesh(geometry,material);m.position.set(...p);m.scale.set(...s);return m;}
function limb(material,p,radius,length,zRotation){const m=new THREE.Mesh(geo.cylinder,material);m.position.set(...p);m.scale.set(radius*2,length,radius*2);m.rotation.z=zRotation;return m;}
function entitySpeed(kind){return{balloon:2.45,wire:3.15,brute:2.8,eye:3.35,maw:2.65,crawler:3.55}[kind]||2.8;}
function updateEntities(dt){
  let nearest=Infinity,chasing=0; const colliders=getNearbyColliders(camera.position.x,camera.position.z);
  for(const e of entities){ const pos=e.group.position,d=distanceXZ(pos,camera.position); nearest=Math.min(nearest,d); const heard=mic.level>.055&&d<e.hearing; if(heard)e.chaseUntil=Math.max(e.chaseUntil,elapsed+5.8+mic.level*7); if(d<e.sight)e.chaseUntil=Math.max(e.chaseUntil,elapsed+3.5); const chase=e.chaseUntil>elapsed; if(chase)chasing++;
    let dirX,dirZ; if(chase){dirX=camera.position.x-pos.x;dirZ=camera.position.z-pos.z;} else {e.wander+=Math.sin(elapsed*.27+e.phase)*dt*.18;dirX=Math.sin(e.wander);dirZ=Math.cos(e.wander);} const len=Math.hypot(dirX,dirZ)||1;dirX/=len;dirZ/=len; const speed=e.speed*(chase?1.22:.42),dx=dirX*speed*dt,dz=dirZ*speed*dt; const nx=pos.x+dx,nz=pos.z+dz; if(!hitsAny(nx,pos.z,colliders,.42))pos.x=nx;else e.wander+=1.1; if(!hitsAny(pos.x,nz,colliders,.42))pos.z=nz;else e.wander-=.9; e.group.rotation.y=Math.atan2(dirX,dirZ); animateEntity(e,chase); if(d<1.05&&scareCooldown<=0)triggerScare(e); if(d>48){const p=findWalkablePoint(16,24,mulberry32((elapsed*1000+e.phase*99)|0));pos.set(p.x,0,p.z);} }
  entityStatusEl.textContent=entities.length?(chasing?`ENTITY: ALERT ×${chasing} · nearest ${nearest.toFixed(1)}m`:`ENTITY: wandering · nearest ${nearest.toFixed(1)}m`):'ENTITY: none detected'; updateThreatAudio(nearest);
}
function animateEntity(e,chase){const t=elapsed,amp=chase?.9:.45,swing=Math.sin(t*(chase?9:4.5)+e.phase)*amp;e.group.position.y=Math.sin(t*3.4+e.phase)*.025;const p=e.parts;if(p.armL)p.armL.rotation.x=swing;if(p.armR)p.armR.rotation.x=-swing;if(p.legL)p.legL.rotation.x=-swing*.72;if(p.legR)p.legR.rotation.x=swing*.72;if(p.balloon){p.balloon.position.y=3.25+Math.sin(t*1.7+e.phase)*.12;p.balloon.rotation.z=Math.sin(t*.8)*.08;}if(p.tentacles)p.tentacles.forEach((x,i)=>{x.rotation.x=Math.sin(t*3.2+i)*.35;x.rotation.z+=Math.sin(t*2.1+i)*.003;});if(p.arms)p.arms.forEach((x,i)=>x.rotation.x=Math.sin(t*5+i)*.5);if(p.head)p.head.rotation.z=Math.sin(t*1.9+e.phase)*.08;if(p.eyeBall)p.eyeBall.rotation.y=Math.sin(t*1.1)*.18;}
function triggerScare(entity){scareCooldown=3.2;damageEl.classList.add('hit');setTimeout(()=>damageEl.classList.remove('hit'),520);playScareTone();const ax=camera.position.x-entity.group.position.x,az=camera.position.z-entity.group.position.z,len=Math.hypot(ax,az)||1;camera.position.x+=(ax/len)*3;camera.position.z+=(az/len)*3;camera.rotation.z=(Math.random()-.5)*.12;setTimeout(()=>camera.rotation.z=0,600);entity.chaseUntil=elapsed+1.2;}
function clearEntities(){entities.length=0;while(entityRoot.children.length)entityRoot.remove(entityRoot.children[0]);}

function switchLevel(index,silent=false){currentLevelIndex=THREE.MathUtils.clamp(index,0,LEVELS.length-1);clearChunks();clearObjectiveRoot();clearEntities();camera.position.set(0,EYE_HEIGHT,0);camera.rotation.set(0,0,0);applyTheme(LEVELS[currentLevelIndex]);updateChunks(true);createObjectives();spawnEntities();updateObjectiveHud();if(!silent){const t=LEVELS[currentLevelIndex];showToast(`${t.name} — ${t.subtitle}`);}}
function nextLevel(){if(!exitPortal)return;if(currentLevelIndex>=LEVELS.length-1){showToast('ESCAPE SIGNAL FOUND — 全ステージ走破');objectiveEl.textContent='ESCAPED · 全22ステージ完了';return;}const next=currentLevelIndex+1;switchLevel(next);broadcastLevel(next);}
function updateObjectiveHud(){const theme=LEVELS[currentLevelIndex];levelNameEl.textContent=`${theme.name.toUpperCase()} · ${theme.subtitle}`;if(!objectiveState)return;const action=theme.puzzle==='collect'?'ヒューズ回収':theme.puzzle==='sequence'?`順番に起動 · 次 ${objectiveState.expected+1}`:'端末起動';objectiveEl.textContent=`${action} ${objectiveState.solved}/${objectiveState.total}${exitPortal?' · EXIT OPEN':''}`;}
function animateObjectives(){if(!objectiveState)return;objectiveState.items.forEach((item,i)=>{if(!item.group.visible)return;item.group.rotation.y+=.003+i*.0002;item.group.position.y=Math.sin(elapsed*2.1+i)*.035;});if(exitPortal){exitPortal.userData.veil.rotation.z+=.006;const pulse=1+Math.sin(elapsed*4.2)*.035;exitPortal.userData.veil.scale.set(1.74*pulse,1.82*pulse,1);}}

function findWalkablePoint(minRadius,maxRadius,rng=Math.random){const colliders=getNearbyColliders(camera.position.x,camera.position.z);for(let i=0;i<42;i++){const a=rng()*Math.PI*2,r=minRadius+rng()*(maxRadius-minRadius),x=camera.position.x+Math.cos(a)*r,z=camera.position.z+Math.sin(a)*r;if(!hitsAny(x,z,colliders,.65))return{x,z};}return{x:camera.position.x+minRadius,z:camera.position.z};}
function getNearbyColliders(x,z){const cx=chunkCoord(x),cz=chunkCoord(z),result=[];for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const chunk=chunks.get(`${cx+dx},${cz+dz}`);if(chunk)result.push(...chunk.colliders);}return result;}
function hitsAny(x,z,colliders,radius){for(const box of colliders){const nx=THREE.MathUtils.clamp(x,box.minX,box.maxX),nz=THREE.MathUtils.clamp(z,box.minZ,box.maxZ),dx=x-nx,dz=z-nz;if(dx*dx+dz*dz<radius*radius)return true;}return false;}
function makeCollider(cx,cz,localX,localZ,width,depth){const x=cx*CHUNK_SIZE+localX,z=cz*CHUNK_SIZE+localZ;return{minX:x-width/2,maxX:x+width/2,minZ:z-depth/2,maxZ:z+depth/2};}
function isStartClear(cx,cz,x,z){return cx===0&&cz===0&&Math.hypot(x,z)<5.8;}
function chunkCoord(v){return Math.floor((v+CHUNK_SIZE/2)/CHUNK_SIZE);}
function roomHeight(theme){if(theme.floorMode==='pool')return 2.95;if(theme.name==='Level 11')return 3.15;return 2.68;}

function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.045);elapsed+=dt;scareCooldown=Math.max(0,scareCooldown-dt);if(controls.isLocked||isTouchDevice())updateMovement(dt);updateChunks();updateMic();updateEntities(dt);updateInteraction();animateObjectives();updateRemotePlayers(dt);updateNetworking();updatePerformance(dt);updateCameraOverlay();materials.fixture.emissiveIntensity=2.15+Math.sin(elapsed*7.3)*.035+(Math.sin(elapsed*26.7)>.995?-.8:0);renderer.toneMappingExposure=.935+Math.sin(elapsed*.19)*.008;renderer.render(scene,camera);}
function updatePerformance(dt){fpsAccum+=1/Math.max(.0001,dt);fpsFrames++;fpsWindow+=dt;if(fpsWindow<1)return;fpsAverage=fpsAccum/fpsFrames;fpsEl.textContent=`${Math.round(fpsAverage)} FPS`;fpsAccum=0;fpsFrames=0;fpsWindow=0;if(qualityMode==='auto'){const old=renderScale;if(fpsAverage<43)renderScale=Math.max(.62,renderScale-.08);else if(fpsAverage>57)renderScale=Math.min(1.12,renderScale+.04);if(Math.abs(old-renderScale)>.001)updateRendererScale();}updateWorldStatus();}
function applyQuality(force=false){if(qualityMode==='low'){renderScale=.70;loadRadius=1;}else if(qualityMode==='balanced'){renderScale=.92;loadRadius=1;}else if(qualityMode==='high'){renderScale=Math.min(1.25,devicePixelRatio||1);loadRadius=2;}else{renderScale=Math.min(1,devicePixelRatio||1);loadRadius=1;}updateRendererScale();if(force){lastChunkX=Number.NaN;lastChunkZ=Number.NaN;updateChunks(true);}}
function updateRendererScale(){const base=Math.min(devicePixelRatio||1,1.5),dpr=qualityMode==='high'?renderScale:Math.min(base,renderScale);renderer.setPixelRatio(Math.max(.55,dpr));renderer.setSize(innerWidth,innerHeight,false);}
function updateWorldStatus(){statusEl.textContent=`${chunks.size} chunks · q:${qualityMode} ${Math.round(renderer.getPixelRatio()*100)}% · stage ${currentLevelIndex+1}/${LEVELS.length}`;}

async function toggleMic(){if(mic.enabled){stopMic();return;}if(!navigator.mediaDevices?.getUserMedia){showToast('このブラウザはマイク入力に対応していません');return;}try{const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:false},video:false}),AudioCtx=window.AudioContext||window.webkitAudioContext,ctx=new AudioCtx(),source=ctx.createMediaStreamSource(stream),analyser=ctx.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.42;source.connect(analyser);mic.enabled=true;mic.stream=stream;mic.ctx=ctx;mic.analyser=analyser;mic.data=new Uint8Array(analyser.fftSize);micButton.textContent='マイク感知を停止';micStateEl.textContent='LISTENING';showToast('声の大きさを怪物AIが感知します。録音・送信はしません');}catch(err){micStateEl.textContent='DENIED';showToast('マイク許可がありません');}}
function stopMic(){mic.stream?.getTracks().forEach((t)=>t.stop());mic.ctx?.close?.();mic.enabled=false;mic.level=0;mic.stream=null;mic.ctx=null;mic.analyser=null;mic.data=null;micMeter.style.transform='scaleX(0)';micStateEl.textContent='OFF';micButton.textContent='マイク感知を有効化';}
function updateMic(){if(!mic.enabled||!mic.analyser||!mic.data)return;mic.analyser.getByteTimeDomainData(mic.data);let sum=0;for(let i=0;i<mic.data.length;i+=4){const v=(mic.data[i]-128)/128;sum+=v*v;}const rms=Math.sqrt(sum/(mic.data.length/4));mic.level=THREE.MathUtils.lerp(mic.level,Math.min(1,rms*5.4),.18);micMeter.style.transform=`scaleX(${Math.min(1,mic.level)})`;micStateEl.textContent=mic.level>.055?'NOISE!':'LISTENING';}

async function enableGyro(){try{if(typeof DeviceOrientationEvent==='undefined'){showToast('端末の向きセンサーが利用できません');return;}if(typeof DeviceOrientationEvent.requestPermission==='function'){const result=await DeviceOrientationEvent.requestPermission();if(result!=='granted')throw new Error('permission denied');}gyro.enabled=!gyro.enabled;gyroButton.textContent=gyro.enabled?'視点追従 ON':'端末の向きで視点追従';showToast(gyro.enabled?'端末を向けた方向へ視点が追従します':'視点追従 OFF');}catch(err){showToast('端末の向きセンサーを有効にできませんでした');}}
function onDeviceOrientation(e){if(!gyro.enabled)return;gyro.alpha=e.alpha||0;gyro.beta=e.beta||0;gyro.gamma=e.gamma||0;gyro.orient=screen.orientation?.angle||window.orientation||0;}
function applyGyroOrientation(){const alpha=THREE.MathUtils.degToRad(gyro.alpha),beta=THREE.MathUtils.degToRad(gyro.beta),gamma=THREE.MathUtils.degToRad(gyro.gamma),orient=THREE.MathUtils.degToRad(gyro.orient||0);tmpEuler.set(beta,alpha,-gamma,'YXZ');gyro.quaternion.setFromEuler(tmpEuler);gyro.quaternion.multiply(new THREE.Quaternion(-Math.sqrt(.5),0,0,Math.sqrt(.5)));gyro.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-orient));camera.quaternion.slerp(gyro.quaternion,.22);}

function setFilter(name){const allowed=['clean','vhs','bodycam','night'],filter=allowed.includes(name)?name:'bodycam';document.body.dataset.filter=filter;filterSelect.value=filter;}
function cycleFilter(){const list=['clean','vhs','bodycam','night'],next=list[(list.indexOf(document.body.dataset.filter)+1)%list.length];setFilter(next);showToast(`FILTER: ${next.toUpperCase()}`);}
function updateCameraOverlay(){const total=Math.floor(elapsed),h=String(Math.floor(total/3600)).padStart(2,'0'),m=String(Math.floor((total%3600)/60)).padStart(2,'0'),s=String(total%60).padStart(2,'0');cameraTimeEl.textContent=`${h}:${m}:${s}`;}

function ensureAudio(){if(audioState){if(audioState.ctx.state==='suspended')audioState.ctx.resume();return;}const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;const ctx=new AudioCtx(),master=ctx.createGain();master.gain.value=.58;master.connect(ctx.destination);const humGain=ctx.createGain();humGain.gain.value=humEnabled?.028:0;humGain.connect(master);const humFilter=ctx.createBiquadFilter();humFilter.type='lowpass';humFilter.frequency.value=420;humFilter.Q.value=.55;humFilter.connect(humGain);const humA=ctx.createOscillator(),humB=ctx.createOscillator();humA.type='sine';humB.type='triangle';humA.frequency.value=60;humB.frequency.value=120;const humBGain=ctx.createGain();humBGain.gain.value=.18;humA.connect(humFilter);humB.connect(humBGain);humBGain.connect(humFilter);humA.start();humB.start();const threatOsc=ctx.createOscillator(),threatGain=ctx.createGain();threatOsc.type='sine';threatOsc.frequency.value=44;threatGain.gain.value=0;threatOsc.connect(threatGain);threatGain.connect(master);threatOsc.start();audioState={ctx,master,humGain,humA,humB,threatOsc,threatGain};}
function updateHumGain(){if(audioState)audioState.humGain.gain.setTargetAtTime(humEnabled?.028:0,audioState.ctx.currentTime,.08);}
function updateThreatAudio(distance){if(!audioState)return;const amount=Number.isFinite(distance)?THREE.MathUtils.clamp((8-distance)/8,0,1):0;audioState.threatGain.gain.setTargetAtTime(amount*.045,audioState.ctx.currentTime,.08);audioState.threatOsc.frequency.setTargetAtTime(42+amount*18,audioState.ctx.currentTime,.08);}
function playFootstep(){if(!audioState)return;const{ctx,master}=audioState,osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=LEVELS[currentLevelIndex].floorMode==='pool'?420:190;osc.type='triangle';osc.frequency.value=LEVELS[currentLevelIndex].floorMode==='pool'?115:72+Math.random()*18;gain.gain.setValueAtTime(.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.025,ctx.currentTime+.008);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.07);osc.connect(filter);filter.connect(gain);gain.connect(master);osc.start();osc.stop(ctx.currentTime+.075);}
function playConfirmTone(){tone(330,520,.08,.025);}function playErrorTone(){tone(130,86,.18,.034);}function playScareTone(){tone(72,31,.38,.09,'sawtooth');}
function tone(from,to,duration,volume,type='sine'){ensureAudio();if(!audioState)return;const{ctx,master}=audioState,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(from,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(1,to),ctx.currentTime+duration);gain.gain.setValueAtTime(volume,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);osc.connect(gain);gain.connect(master);osc.start();osc.stop(ctx.currentTime+duration);}

async function getPeerCtor(){const mod=await import('https://cdn.jsdelivr.net/npm/peerjs@1.5.5/+esm');return mod.Peer||mod.default;}
async function hostRoom(){if(net.peer)disconnectNetwork();roomCode.textContent='接続サービスを読み込み中...';try{const Peer=await getPeerCtor(),code=`backrooms-${randomCode(8)}`,peer=new Peer(code);net.peer=peer;net.mode='host';net.id=code;peer.on('open',(id)=>{net.id=id;roomCode.textContent=`ROOM: ${id}`;netStateEl.textContent=`HOST · 1/${MAX_PLAYERS}`;showToast('ルームを作成しました');});peer.on('connection',(conn)=>{if(net.conns.size>=MAX_PLAYERS-1){conn.on('open',()=>{conn.send({type:'full'});conn.close();});return;}attachConnection(conn,true);});peer.on('error',()=>{roomCode.textContent='オンライン接続に失敗しました。ソロプレイは継続できます。';});}catch(err){roomCode.textContent='PeerJS を読み込めませんでした。ネットワーク環境を確認してください。';}}
async function joinRoom(){const code=roomInput.value.trim();if(!code){showToast('ルームコードを入力してください');return;}if(net.peer)disconnectNetwork();roomCode.textContent='接続中...';try{const Peer=await getPeerCtor(),peer=new Peer();net.peer=peer;net.mode='client';peer.on('open',(id)=>{net.id=id;const conn=peer.connect(code,{reliable:false,serialization:'json'});net.hostConn=conn;attachConnection(conn,false);});peer.on('error',()=>{roomCode.textContent='参加できませんでした。コードと通信環境を確認してください。';});}catch(err){roomCode.textContent='PeerJS を読み込めませんでした。';}}
function attachConnection(conn,hostSide){conn.on('open',()=>{if(hostSide){net.conns.set(conn.peer,conn);conn.send({type:'welcome',level:currentLevelIndex,host:net.id});broadcastRoster();}else{roomCode.textContent=`JOINED: ${conn.peer}`;netStateEl.textContent='CLIENT · connected';conn.send({type:'hello'});}});conn.on('data',(data)=>handleNetworkData(data,conn));conn.on('close',()=>{net.conns.delete(conn.peer);removeRemotePlayer(conn.peer);broadcastRoster();updateNetHud();});conn.on('error',()=>updateNetHud());}
function handleNetworkData(data,conn){if(!data||typeof data!=='object')return;if(data.type==='full'){roomCode.textContent='このルームは満員です（最大4人）';conn.close();return;}if(data.type==='welcome'&&net.mode==='client'){if(Number.isInteger(data.level))switchLevel(data.level,true);updateNetHud();return;}if(data.type==='level'&&net.mode==='client'){if(Number.isInteger(data.level)&&data.level!==currentLevelIndex)switchLevel(data.level,true);return;}if(data.type==='state'){const id=data.id||conn.peer;if(id===net.id)return;updateRemoteState(id,data);if(net.mode==='host')broadcast({...data,id},id);return;}if(data.type==='roster')updateNetHud(data.count);}
function updateNetworking(){if(!net.peer||elapsed-net.lastSend<1/NET_HZ)return;net.lastSend=elapsed;const packet={type:'state',id:net.id,p:[round2(camera.position.x),round2(EYE_HEIGHT),round2(camera.position.z)],r:[round2(camera.rotation.y),round2(camera.rotation.x)],level:currentLevelIndex,mic:round2(mic.level)};if(net.mode==='host')broadcast(packet);else if(net.mode==='client'&&net.hostConn?.open)net.hostConn.send(packet);}
function broadcast(data,exceptId=''){for(const[id,conn]of net.conns){if(id===exceptId||!conn.open)continue;conn.send(data);}}
function broadcastLevel(levelIndex){if(net.mode==='host')broadcast({type:'level',level:levelIndex});}
function broadcastRoster(){if(net.mode!=='host')return;const count=1+net.conns.size;broadcast({type:'roster',count});updateNetHud(count);}
function updateRemoteState(id,data){if(!Array.isArray(data.p)||data.p.length<3)return;let rp=remotePlayers.get(id);if(!rp){rp=createRemotePlayer(id);remotePlayers.set(id,rp);remoteRoot.add(rp.group);}rp.target.set(data.p[0],0,data.p[2]);rp.targetYaw=Array.isArray(data.r)?data.r[0]:0;rp.lastSeen=elapsed;}
function createRemotePlayer(id){const g=new THREE.Group(),body=mesh(geo.cylinder,materials.remote,[0,.78,0],[.30,.75,.30]),head=mesh(geo.sphere,materials.remote,[0,1.56,0],[.30,.32,.30]),lamp=mesh(geo.sphere,materials.fixture,[0,1.52,-.28],[.07,.07,.06]);g.add(body,head,lamp);return{id,group:g,target:new THREE.Vector3(),targetYaw:0,lastSeen:elapsed};}
function updateRemotePlayers(dt){for(const[id,rp]of remotePlayers){rp.group.position.lerp(rp.target,Math.min(1,dt*9));rp.group.rotation.y=lerpAngle(rp.group.rotation.y,rp.targetYaw,Math.min(1,dt*8));rp.group.position.y=Math.sin(elapsed*7+id.length)*.018;if(elapsed-rp.lastSeen>8)removeRemotePlayer(id);}}
function removeRemotePlayer(id){const rp=remotePlayers.get(id);if(!rp)return;remoteRoot.remove(rp.group);remotePlayers.delete(id);}
function disconnectNetwork(){for(const conn of net.conns.values())conn.close?.();net.hostConn?.close?.();net.peer?.destroy?.();net.peer=null;net.hostConn=null;net.conns.clear();net.mode='solo';net.id='';for(const id of[...remotePlayers.keys()])removeRemotePlayer(id);updateNetHud();}
function updateNetHud(count){if(net.mode==='solo'){netStateEl.textContent='SOLO';return;}if(net.mode==='host'){const n=Number.isInteger(count)?count:1+net.conns.size;netStateEl.textContent=`HOST · ${n}/${MAX_PLAYERS}`;}else netStateEl.textContent=`CLIENT · ${net.hostConn?.open?'connected':'connecting'}`;}
function randomCode(n){const chars='abcdefghjkmnpqrstuvwxyz23456789';let out='';for(let i=0;i<n;i++)out+=chars[(Math.random()*chars.length)|0];return out;}

function showToast(text){toastEl.textContent=text;toastEl.classList.add('show');clearTimeout(showToast._timer);showToast._timer=setTimeout(()=>toastEl.classList.remove('show'),2300);}
function onResize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();updateRendererScale();}
function isTouchDevice(){return matchMedia('(pointer: coarse)').matches||'ontouchstart'in window;}
function distanceXZ(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}function round2(v){return Math.round(v*100)/100;}function lerpAngle(a,b,t){const d=Math.atan2(Math.sin(b-a),Math.cos(b-a));return a+d*t;}
function disposeObject(root){root.traverse((o)=>{if(o.geometry&&!Object.values(geo).includes(o.geometry))o.geometry.dispose?.();if(o.material&&!Object.values(materials).includes(o.material))o.material.dispose?.();});}
function hash3(a,b,c){let h=Math.imul((a|0)^0x9e3779b9,0x85ebca6b);h^=Math.imul((b|0)^0xc2b2ae35,0x27d4eb2d);h^=Math.imul((c|0)^0x165667b1,0x7feb352d);h^=h>>>16;h=Math.imul(h,0x846ca68b);h^=h>>>13;return h>>>0;}
function mulberry32(seed){return function random(){seed|=0;seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}

function wallpaperTexture(){const size=256,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false}),img=ctx.createImageData(size,size),rng=mulberry32(0x3f9a1012);for(let i=0;i<img.data.length;i+=4){const n=(rng()-.5)*18;img.data[i]=194+n;img.data[i+1]=190+n;img.data[i+2]=157+n*.7;img.data[i+3]=255;}ctx.putImageData(img,0,0);ctx.globalAlpha=.11;for(let x=0;x<size;x+=4){ctx.fillStyle=x%8?'#e7dfb8':'#706a4d';ctx.fillRect(x,0,1,size);}ctx.globalAlpha=.26;ctx.strokeStyle='#70694d';ctx.fillStyle='#696246';ctx.lineWidth=1;for(let y=-12;y<size+22;y+=30)for(let x=-12;x<size+22;x+=22){const off=((y/30)&1)?11:0,px=x+off;ctx.beginPath();ctx.moveTo(px,y+2);ctx.quadraticCurveTo(px+5,y+7,px,y+13);ctx.quadraticCurveTo(px-5,y+7,px,y+2);ctx.stroke();ctx.beginPath();ctx.moveTo(px-4,y+20);ctx.lineTo(px,y+25);ctx.lineTo(px+4,y+20);ctx.stroke();ctx.fillRect(px-1,y+16,2,2);}ctx.globalAlpha=.055;ctx.fillStyle='#443f2b';for(let i=0;i<18;i++){ctx.beginPath();ctx.ellipse(rng()*size,rng()*size,3+rng()*16,6+rng()*24,rng()*Math.PI,0,Math.PI*2);ctx.fill();}return new THREE.CanvasTexture(c);}
function carpetTexture(){return fiberTexture(256,145,128,87,0x2a7011);}function concreteTexture(){return fiberTexture(256,150,149,138,0xc0ffee);}
function fiberTexture(size,r,g,b,seed){const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false}),img=ctx.createImageData(size,size),rng=mulberry32(seed);for(let i=0;i<img.data.length;i+=4){const n=(rng()-.5)*32;img.data[i]=r+n;img.data[i+1]=g+n*.9;img.data[i+2]=b+n*.72;img.data[i+3]=255;}ctx.putImageData(img,0,0);ctx.globalAlpha=.11;ctx.strokeStyle='#f2edc9';for(let i=0;i<650;i++){const x=rng()*size,y=rng()*size;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(rng()-.5)*3,y+rng()*2.2);ctx.stroke();}return new THREE.CanvasTexture(c);}
function tileTexture(){const size=256,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false}),rng=mulberry32(0x71ae9);ctx.fillStyle='#d7d7c9';ctx.fillRect(0,0,size,size);ctx.strokeStyle='#7d8077';ctx.lineWidth=2;for(let x=0;x<=size;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,size);ctx.stroke();}for(let y=0;y<=size;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(size,y);ctx.stroke();}ctx.globalAlpha=.12;ctx.fillStyle='#6f716b';for(let i=0;i<90;i++)ctx.fillRect(rng()*size,rng()*size,1,1);return new THREE.CanvasTexture(c);}
function woodTexture(){const size=256,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false}),rng=mulberry32(0x7700aa);ctx.fillStyle='#a58a66';ctx.fillRect(0,0,size,size);for(let y=0;y<size;y+=20){ctx.fillStyle=y%40?'#8a7254':'#b69a73';ctx.fillRect(0,y,size,2);for(let x=0;x<size;x+=70){ctx.fillStyle='rgba(45,34,25,.18)';ctx.fillRect(x+rng()*20,y+2,1,18);}}return new THREE.CanvasTexture(c);}
function ceilingTexture(){const size=256,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false}),rng=mulberry32(0x445566);ctx.fillStyle='#d2cfb5';ctx.fillRect(0,0,size,size);ctx.globalAlpha=.16;ctx.fillStyle='#696650';for(let i=0;i<1100;i++)ctx.fillRect(rng()*size,rng()*size,1,1);ctx.globalAlpha=.42;ctx.strokeStyle='#77735c';ctx.lineWidth=2;ctx.strokeRect(1,1,size-2,size-2);return new THREE.CanvasTexture(c);}
