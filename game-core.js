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
  level('Level 2', 'Pipe Dreams', '#77705c', '#4d463a', '#817a68', '#27251f', 'splitface', 'sequence', 4, .39, .16, 'concrete'),
  level('Level 3', 'Electrical Station', '#7d754a', '#4b4430', '#7b734f', '#28251a', 'eye', 'terminals', 4, .43, .12, 'concrete'),
  level('Level 4', 'Abandoned Office', '#c8bd8e', '#7d755e', '#cfc8a5', '#6e684d', 'wire', 'collect', 4, .33, .23, 'office'),
  level('Level 5', 'Terror Hotel', '#8d684f', '#59473e', '#8b795f', '#3d2f28', 'splitface', 'sequence', 4, .40, .14, 'carpet'),
  level('Level 6', 'Lights Out', '#383a34', '#20231f', '#44463f', '#11130f', 'eye', 'collect', 3, .34, .20, 'concrete'),
  level('Level 7', 'Flooded Rooms', '#a7c0b7', '#557876', '#d4ddd4', '#608b88', 'floorhead', 'terminals', 3, .23, .18, 'pool'),
  level('Level 8', 'Cave System', '#665b49', '#413a30', '#675f52', '#24201a', 'winged', 'collect', 4, .18, .34, 'concrete'),
  level('Level 9', 'Suburban Simulation', '#c0b889', '#6e7258', '#d3cc9c', '#6c704d', 'balloon', 'sequence', 4, .20, .18, 'carpet'),
  level('Level 10', 'Field of Wheat', '#b9a966', '#796a35', '#d1c884', '#8b7c3e', 'eye', 'collect', 4, .12, .37, 'carpet'),
  level('Level 11', 'Endless City', '#7e8589', '#4f5358', '#8e9192', '#34383c', 'splitface', 'terminals', 4, .35, .16, 'concrete'),
  level('Level 12', 'The Matrix', '#62806c', '#303e34', '#6d7c72', '#1b261f', 'wire', 'sequence', 5, .42, .10, 'concrete'),
  level('Level 13', 'Infinite Apartments', '#b19c78', '#705e49', '#b8aa8d', '#625240', 'winged', 'collect', 4, .36, .22, 'carpet'),
  level('Level 14', 'Military Hospital', '#c0c6af', '#697268', '#d4d5c5', '#5f685d', 'splitface', 'terminals', 5, .40, .15, 'office'),
  level('Level 15', 'Futuristic Halls', '#9da6a8', '#515d61', '#bdc3bf', '#526067', 'eye', 'sequence', 5, .28, .18, 'office'),
  level('Level 16', 'Altered Reality', '#775d7b', '#403445', '#8b718f', '#3b2c40', 'floorhead', 'collect', 4, .22, .29, 'carpet'),
  level('Level 17', 'Carrier Deck', '#737a76', '#343b39', '#939b95', '#29302f', 'splitface', 'terminals', 5, .34, .14, 'concrete'),
  level('Level 18', 'Memories', '#b9a78c', '#766a5a', '#c8bca6', '#6c5f51', 'balloon', 'sequence', 4, .24, .24, 'carpet'),
  level('Level 19', 'Attic Maze', '#8e795d', '#524739', '#9a8b73', '#3e352a', 'wire', 'collect', 5, .46, .08, 'wood'),
  level('Level 20', 'Warehouse', '#9a9482', '#57564e', '#aaa696', '#48483f', 'winged', 'terminals', 5, .30, .33, 'concrete'),
  level('Level 21', 'The Poolrooms', '#cfd4c6', '#6fa6aa', '#e7e7d7', '#75a5a8', 'floorhead', 'sequence', 5, .18, .12, 'pool'),
  level('Level !', 'RUN FOR YOUR LIFE', '#6d2620', '#281817', '#5e352d', '#150908', 'splitface', 'collect', 1, .16, .08, 'concrete'),
];

function level(name, subtitle, wall, floor, ceiling, fog, entity, puzzle, count, wallDensity, columnDensity, floorMode) {
  return { name, subtitle, wall, floor, ceiling, fog, entity, puzzle, count, wallDensity, columnDensity, floorMode };
}

function encounterProfileFor(index) {
  if (index === LEVELS.length - 1) {
    return { mode: 'forced', base: 1, grace: 0, timeRate: 0, max: 1, spawnAt: 0, soundGain: 1.8, lightGain: .8 };
  }
  if (index === 10 || index === 18) {
    return { mode: 'safe', base: 0, grace: 9999, timeRate: 0, max: 0, spawnAt: 2, soundGain: 0, lightGain: 0 };
  }
  const tier = Math.min(1, index / 21);
  return {
    mode: 'normal',
    base: .035 + tier * .085,
    grace: Math.max(8, 22 - index * .48),
    timeRate: .0042 + tier * .0048,
    max: .78 + tier * .20,
    spawnAt: Math.max(.56, .76 - tier * .13),
    soundGain: 1.05 + tier * .55,
    lightGain: .30 + tier * .28,
  };
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
const threatMeter = $('#threatMeter');
const threatStateEl = $('#threatState');
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

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
  alpha: false,
  stencil: false,
  depth: true,
});
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
const tmpViewForward = new THREE.Vector3();
const tmpToEntity = new THREE.Vector3();

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
let toastTimer = 0;
let currentInteract = null;
let objectiveState = null;
let exitPortal = null;
let levelWon = false;
let flashlightOn = false;

const encounter = {
  pressure: 0,
  dwell: 0,
  noiseHeat: 0,
  lightHeat: 0,
  spawnCooldown: 0,
  calmTimer: 0,
  levelStartedAt: 0,
  areaAnchor: new THREE.Vector3(),
  lastNoisePos: new THREE.Vector3(),
  lastNoiseAt: -999,
  lastNoiseStrength: 0,
  profile: null,
};

const objectiveRoot = new THREE.Group();
const entityRoot = new THREE.Group();
const remoteRoot = new THREE.Group();
scene.add(objectiveRoot, entityRoot, remoteRoot);
scene.add(camera);

const flashlightTarget = new THREE.Object3D();
flashlightTarget.position.set(0, -.08, -1);
camera.add(flashlightTarget);
const flashlight = new THREE.SpotLight(0xfff1cf, 0, 28, Math.PI / 7, .48, 1.6);
flashlight.position.set(.10, -.08, -.02);
flashlight.target = flashlightTarget;
camera.add(flashlight);

const entities = [];
const remotePlayers = new Map();

const mic = { enabled: false, denied: false, stream: null, ctx: null, analyser: null, data: null, level: 0 };
const gyro = { enabled: false, alpha: 0, beta: 0, gamma: 0, orient: 0, quaternion: new THREE.Quaternion() };
const net = { mode: 'solo', peer: null, hostConn: null, conns: new Map(), lastSend: 0, id: '' };

function enterGame() {
  menu.classList.add('hidden');
  ensureAudio();
  if (!isTouchDevice()) controls.lock();
}

function onKeyDown(event) {
  pressed.add(event.code);
  if (event.code === 'KeyE' && !event.repeat) interact();
  if (event.code === 'KeyM' && !event.repeat) {
    humEnabled = !humEnabled;
    updateHumGain();
    showToast(humEnabled ? '環境音 ON' : '環境音 OFF');
  }
  if (event.code === 'KeyK' && !event.repeat) toggleMic();
  if (event.code === 'KeyF' && !event.repeat) toggleFlashlight();
  if (event.code === 'KeyV' && !event.repeat) cycleFilter();
  if (event.code === 'Escape') menu.classList.remove('hidden');
}

function createTextures() {
  const wallpaper = wallpaperTexture();
  const carpet = carpetTexture();
  const tile = tileTexture();
  const concrete = concreteTexture();
  const ceiling = ceilingTexture();
  const wood = woodTexture();
  for (const tex of [wallpaper, carpet, tile, concrete, ceiling, wood]) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  }
  wallpaper.repeat.set(2.8, 2.1);
  carpet.repeat.set(CHUNK_SIZE / 2.1, CHUNK_SIZE / 2.1);
  tile.repeat.set(CHUNK_SIZE / 2.3, CHUNK_SIZE / 2.3);
  concrete.repeat.set(CHUNK_SIZE / 3.1, CHUNK_SIZE / 3.1);
  wood.repeat.set(CHUNK_SIZE / 2.7, CHUNK_SIZE / 2.7);
  ceiling.repeat.set(GRID, GRID);
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
  const grayFlesh = new THREE.MeshStandardMaterial({ color: 0x6e6a64, roughness: .82 });
  const red = new THREE.MeshStandardMaterial({ color: 0x6a1010, emissive: 0x260000, emissiveIntensity: .35, roughness: .63 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: .25 });
  const remote = new THREE.MeshStandardMaterial({ color: 0x93b5b1, emissive: 0x162c2e, emissiveIntensity: .4, roughness: .65 });
  const sinew = new THREE.MeshStandardMaterial({ color: 0x6f622d, roughness: .88 });
  const sinewDark = new THREE.MeshStandardMaterial({ color: 0x332b18, roughness: .96 });
  const ink = new THREE.MeshStandardMaterial({ color: 0x060705, roughness: .97 });
  const mouth = new THREE.MeshStandardMaterial({ color: 0x250607, emissive: 0x160000, emissiveIntensity: .35, roughness: .82 });
  const blood = new THREE.MeshStandardMaterial({ color: 0x551010, emissive: 0x210000, emissiveIntensity: .22, roughness: .72 });
  const tooth = new THREE.MeshStandardMaterial({ color: 0xb6b09b, roughness: .66 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x5e3a1f, roughness: .92 });
  const rustDark = new THREE.MeshStandardMaterial({ color: 0x24160f, roughness: 1 });
  const organic = new THREE.MeshStandardMaterial({ color: 0x8b7427, roughness: .86 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x344257, roughness: .94 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8c6753, roughness: .86 });
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0x918f7b, roughness: .42 });
  const iris = new THREE.MeshStandardMaterial({ color: 0x4c3219, roughness: .28 });
  return { wall, floor, ceiling, trim, fixture, objective, objectiveDone, portal, dark, grayFlesh, red, pupil, remote, sinew, sinewDark, ink, mouth, blood, tooth, rust, rustDark, organic, pants, skin, eyeWhite, iris };
}

function createGeometry() {
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    plane: new THREE.PlaneGeometry(1, 1),
    sphere: new THREE.SphereGeometry(.5, 10, 8),
    cylinder: new THREE.CylinderGeometry(.5, .5, 1, 8),
    cone: new THREE.ConeGeometry(.5, 1, 9),
    torus: new THREE.TorusGeometry(.5, .12, 8, 18),
    icosa: new THREE.IcosahedronGeometry(.5, 1),
  };
}

function applyTheme(theme) {
  scene.background = new THREE.Color(theme.fog);
  scene.fog = new THREE.FogExp2(theme.fog, theme.name === 'Level 6' ? .055 : .031);
  materials.wall.color.set(theme.wall);
  materials.floor.color.set(theme.floor);
  materials.ceiling.color.set(theme.ceiling);
  materials.trim.color.set(theme.floor).multiplyScalar(.72);
  materials.floor.map = theme.floorMode === 'pool' || theme.floorMode === 'office' ? textures.tile : theme.floorMode === 'wood' ? textures.wood : theme.floorMode === 'concrete' ? textures.concrete : textures.carpet;
  materials.floor.needsUpdate = true;
  hemi.color.set(theme.ceiling);
  hemi.groundColor.set(theme.floor);
  hemi.intensity = theme.name === 'Level 6' ? .68 : 1.28;
  fillLight.color.set(theme.ceiling);
  fillLight.intensity = theme.name === 'Level 6' ? .16 : .34;
}

function generateChunk(cx, cz) {
  const theme = LEVELS[currentLevelIndex];
  const group = new THREE.Group();
  group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
  scene.add(group);
  const colliders = [];
  const rng = mulberry32(hash3(currentLevelIndex + 1, cx, cz));
  const min = -CHUNK_SIZE / 2;
  const height = roomHeight(theme);
  const floor = new THREE.Mesh(geo.plane, materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.scale.set(CHUNK_SIZE, CHUNK_SIZE, 1);
  group.add(floor);
  const ceiling = new THREE.Mesh(geo.plane, materials.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = height;
  ceiling.scale.set(CHUNK_SIZE, CHUNK_SIZE, 1);
  group.add(ceiling);
  const walls = [], trims = [], columns = [], fixtures = [];
  for (let gx = 1; gx < GRID; gx++) for (let gz = 1; gz < GRID; gz++) {
    if (rng() > theme.columnDensity) continue;
    const x = min + gx * CELL, z = min + gz * CELL;
    if (isStartClear(cx, cz, x, z)) continue;
    columns.push({ x, y: height / 2, z, sx: .72 + rng() * .28, sy: height, sz: .72 + rng() * .28 });
    const c = columns[columns.length - 1];
    colliders.push(makeCollider(cx, cz, x, z, c.sx, c.sz));
  }
  for (let gx = 1; gx < GRID; gx++) for (let gz = 0; gz < GRID; gz++) {
    if (rng() > theme.wallDensity) continue;
    const x = min + gx * CELL, z = min + (gz + .5) * CELL;
    if (isStartClear(cx, cz, x, z)) continue;
    const length = CELL * (.78 + rng() * .2);
    walls.push({ x, y: height / 2, z, sx: .16, sy: height, sz: length });
    trims.push({ x, y: .045, z, sx: .20, sy: .09, sz: length + .04 });
    colliders.push(makeCollider(cx, cz, x, z, .16, length));
  }
  for (let gz = 1; gz < GRID; gz++) for (let gx = 0; gx < GRID; gx++) {
    if (rng() > theme.wallDensity) continue;
    const x = min + (gx + .5) * CELL, z = min + gz * CELL;
    if (isStartClear(cx, cz, x, z)) continue;
    const length = CELL * (.78 + rng() * .2);
    walls.push({ x, y: height / 2, z, sx: length, sy: height, sz: .16 });
    trims.push({ x, y: .045, z, sx: length + .04, sy: .09, sz: .20 });
    colliders.push(makeCollider(cx, cz, x, z, length, .16));
  }
  const slots = [[-.29,-.28],[.18,-.28],[.30,.02],[-.20,.21],[.17,.29],[-.02,-.02]];
  const lightCount = theme.name === 'Level 6' ? 2 : 5;
  for (let i = 0; i < lightCount; i++) {
    const [sx, sz] = slots[i];
    fixtures.push({ x: sx * CHUNK_SIZE + (rng() - .5) * 1.1, y: height - .045, z: sz * CHUNK_SIZE + (rng() - .5) * 1.1, sx: rng() > .5 ? 1.55 : .46, sy: .05, sz: rng() > .5 ? .46 : 1.55 });
  }
  addInstances(group, walls, materials.wall);
  addInstances(group, trims, materials.trim);
  addInstances(group, columns, materials.wall);
  addInstances(group, fixtures, materials.fixture);
  return { group, colliders };
}

function addInstances(group, transforms, material) {
  if (!transforms.length) return;
  const instanced = new THREE.InstancedMesh(geo.box, material, transforms.length);
  instanced.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  for (let i = 0; i < transforms.length; i++) {
    const t = transforms[i];
    tmpPos.set(t.x, t.y, t.z);
    tmpQuat.identity();
    tmpScale.set(t.sx, t.sy, t.sz);
    tmpMat.compose(tmpPos, tmpQuat, tmpScale);
    instanced.setMatrixAt(i, tmpMat);
  }
  instanced.instanceMatrix.needsUpdate = true;
  group.add(instanced);
}

function updateChunks(force = false) {
  const cx = chunkCoord(camera.position.x), cz = chunkCoord(camera.position.z);
  if (!force && cx === lastChunkX && cz === lastChunkZ) return;
  lastChunkX = cx; lastChunkZ = cz;
  const keep = new Set();
  for (let dx = -loadRadius; dx <= loadRadius; dx++) for (let dz = -loadRadius; dz <= loadRadius; dz++) {
    const x = cx + dx, z = cz + dz, key = `${x},${z}`;
    keep.add(key);
    if (!chunks.has(key)) chunks.set(key, generateChunk(x, z));
  }
  for (const [key, chunk] of chunks) if (!keep.has(key)) {
    scene.remove(chunk.group);
    chunks.delete(key);
  }
  updateWorldStatus();
}

function clearChunks() {
  for (const chunk of chunks.values()) scene.remove(chunk.group);
  chunks.clear();
  lastChunkX = lastChunkZ = Number.NaN;
}
