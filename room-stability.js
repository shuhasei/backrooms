// Room visibility + camera stability patch.
// Keeps every streamed chunk recognisably room-like and repairs rare streaming/
// camera states that could leave the player seeing almost nothing but the floor.

var ROOM_STABILITY_WALL = 0.18;
var ROOM_STABILITY_DOOR = 3.25;
var roomStabilityBaseGenerateChunk = generateChunk;
var roomStabilityBaseUpdateChunks = updateChunks;
var roomStabilityBaseUpdateMovement = updateMovement;
var roomStabilityLastGood = new THREE.Vector3(0, EYE_HEIGHT, 0);
var roomStabilityLastRepairAt = -999;

// Do not let PointerLock reach the exact vertical poles. At the pole the floor can
// occupy the entire frame and it also makes movement direction numerically poor.
controls.minPolarAngle = 0.24;
controls.maxPolarAngle = Math.PI - 0.24;

function roomStabilityHash(a, b, c) {
  var h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul((b | 0) ^ 0xc2b2ae35, 0x27d4eb2d);
  h ^= Math.imul((c | 0) ^ 0x165667b1, 0x7feb352d);
  h ^= h >>> 16;
  return h >>> 0;
}

function roomStabilityDoor(axis, a, b) {
  var slots = [-4.4, 0, 4.4];
  return slots[roomStabilityHash(axis, a, b) % slots.length];
}

function roomStabilityPushSegment(list, colliders, cx, cz, x, z, sx, sz, height) {
  if (sx < .35 || sz < .12) return;
  list.push({ x: x, y: height / 2, z: z, sx: sx, sy: height, sz: sz });
  colliders.push(makeCollider(cx, cz, x, z, sx, sz));
}

function roomStabilitySplitHorizontal(list, colliders, cx, cz, z, doorX, height) {
  var half = CHUNK_SIZE / 2;
  var holeL = doorX - ROOM_STABILITY_DOOR / 2;
  var holeR = doorX + ROOM_STABILITY_DOOR / 2;
  var leftLen = holeL + half;
  var rightLen = half - holeR;
  roomStabilityPushSegment(list, colliders, cx, cz, -half + leftLen / 2, z, leftLen, ROOM_STABILITY_WALL, height);
  roomStabilityPushSegment(list, colliders, cx, cz, holeR + rightLen / 2, z, rightLen, ROOM_STABILITY_WALL, height);
}

function roomStabilitySplitVertical(list, colliders, cx, cz, x, doorZ, height) {
  var half = CHUNK_SIZE / 2;
  var holeL = doorZ - ROOM_STABILITY_DOOR / 2;
  var holeR = doorZ + ROOM_STABILITY_DOOR / 2;
  var lowLen = holeL + half;
  var highLen = half - holeR;
  roomStabilityPushSegment(list, colliders, cx, cz, x, -half + lowLen / 2, ROOM_STABILITY_WALL, lowLen, height);
  roomStabilityPushSegment(list, colliders, cx, cz, x, holeR + highLen / 2, ROOM_STABILITY_WALL, highLen, height);
}

function roomStabilityAddInstances(group, transforms, material) {
  if (!transforms.length) return;
  var instanced = new THREE.InstancedMesh(geo.box, material, transforms.length);
  instanced.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  var m = new THREE.Matrix4();
  var q = new THREE.Quaternion();
  var p = new THREE.Vector3();
  var s = new THREE.Vector3();
  for (var i = 0; i < transforms.length; i++) {
    var t = transforms[i];
    p.set(t.x, t.y, t.z);
    q.identity();
    s.set(t.sx, t.sy, t.sz);
    m.compose(p, q, s);
    instanced.setMatrixAt(i, m);
  }
  instanced.instanceMatrix.needsUpdate = true;
  group.add(instanced);
}

function roomStabilityAddPerimeter(chunk, cx, cz) {
  var theme = LEVELS[currentLevelIndex];
  var height = roomHeight(theme);
  var half = CHUNK_SIZE / 2;
  var walls = [];
  var trims = [];

  // Door positions are keyed by the shared world edge, so neighbouring chunks
  // always agree on where their connecting doorway is.
  var doorNorth = roomStabilityDoor(1, cx, cz);
  var doorSouth = roomStabilityDoor(1, cx, cz + 1);
  var doorWest = roomStabilityDoor(2, cx, cz);
  var doorEast = roomStabilityDoor(2, cx + 1, cz);

  var before = chunk.colliders.length;
  roomStabilitySplitHorizontal(walls, chunk.colliders, cx, cz, -half + .11, doorNorth, height);
  roomStabilitySplitHorizontal(walls, chunk.colliders, cx, cz,  half - .11, doorSouth, height);
  roomStabilitySplitVertical(walls, chunk.colliders, cx, cz, -half + .11, doorWest, height);
  roomStabilitySplitVertical(walls, chunk.colliders, cx, cz,  half - .11, doorEast, height);

  for (var i = 0; i < walls.length; i++) {
    var w = walls[i];
    trims.push({ x: w.x, y: .045, z: w.z, sx: w.sx + .025, sy: .09, sz: w.sz + .025 });
  }
  roomStabilityAddInstances(chunk.group, walls, materials.wall);
  roomStabilityAddInstances(chunk.group, trims, materials.trim);

  // A single landmark column guarantees depth cues even in a very sparse random
  // chunk. Skip it when another collider already occupies that spot.
  var signX = (roomStabilityHash(3, cx, cz) & 1) ? 1 : -1;
  var signZ = (roomStabilityHash(4, cx, cz) & 1) ? 1 : -1;
  var lx = signX * 5.15;
  var lz = signZ * 4.75;
  var wx = cx * CHUNK_SIZE + lx;
  var wz = cz * CHUNK_SIZE + lz;
  if (!hitsAny(wx, wz, chunk.colliders.slice(0, before), .72)) {
    var col = new THREE.Mesh(geo.box, materials.wall);
    col.position.set(lx, height / 2, lz);
    col.scale.set(.84, height, .84);
    chunk.group.add(col);
    var trim = new THREE.Mesh(geo.box, materials.trim);
    trim.position.set(lx, .045, lz);
    trim.scale.set(.91, .09, .91);
    chunk.group.add(trim);
    chunk.colliders.push(makeCollider(cx, cz, lx, lz, .84, .84));
  }
}

generateChunk = function stableGenerateChunk(cx, cz) {
  var chunk = roomStabilityBaseGenerateChunk(cx, cz);
  roomStabilityAddPerimeter(chunk, cx, cz);
  chunk._roomStable = true;
  return chunk;
};

function roomStabilityChunkHealthy(cx, cz) {
  var chunk = chunks.get(`${cx},${cz}`);
  return !!(chunk && chunk.group && chunk.group.parent === scene && chunk.group.children.length >= 4 && chunk._roomStable);
}

function roomStabilityRepairWorld() {
  if (elapsed - roomStabilityLastRepairAt < .65) return;
  roomStabilityLastRepairAt = elapsed;
  lastChunkX = Number.NaN;
  lastChunkZ = Number.NaN;
  roomStabilityBaseUpdateChunks(true);

  var cx = chunkCoord(camera.position.x);
  var cz = chunkCoord(camera.position.z);
  // Older/malformed current chunks can survive in the map after a hot reload.
  // Replace just those chunks rather than rebuilding the entire world.
  for (var dx = -1; dx <= 1; dx++) {
    for (var dz = -1; dz <= 1; dz++) {
      var x = cx + dx, z = cz + dz, key = `${x},${z}`;
      var c = chunks.get(key);
      if (c && c._roomStable) continue;
      if (c?.group) scene.remove(c.group);
      chunks.set(key, generateChunk(x, z));
    }
  }
}

updateChunks = function stableUpdateChunks(force) {
  roomStabilityBaseUpdateChunks(force);
  var cx = chunkCoord(camera.position.x);
  var cz = chunkCoord(camera.position.z);
  if (!roomStabilityChunkHealthy(cx, cz)) roomStabilityRepairWorld();
};

function roomStabilitySanitizeCamera() {
  var badPosition = !Number.isFinite(camera.position.x) || !Number.isFinite(camera.position.y) || !Number.isFinite(camera.position.z);
  var badRotation = !Number.isFinite(camera.rotation.x) || !Number.isFinite(camera.rotation.y) || !Number.isFinite(camera.rotation.z);

  if (badPosition) camera.position.copy(roomStabilityLastGood);
  if (badRotation) camera.rotation.set(0, 0, 0);

  // The game is first-person on a flat floor: the eye must never sink into the
  // floor or jump above the ceiling, even after tab switching / sensor glitches.
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, EYE_HEIGHT - .10, EYE_HEIGHT + .10);

  if (!gyro.enabled) {
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x, -1.30, 1.30);
    camera.rotation.z = THREE.MathUtils.clamp(camera.rotation.z, -.16, .16);
  }

  var cx = chunkCoord(camera.position.x);
  var cz = chunkCoord(camera.position.z);
  if (roomStabilityChunkHealthy(cx, cz)) roomStabilityLastGood.set(camera.position.x, EYE_HEIGHT, camera.position.z);
}

updateMovement = function stableUpdateMovement(dt) {
  roomStabilityBaseUpdateMovement(dt);
  roomStabilitySanitizeCamera();
};

// Passive watchdog catches cases that happen while stationary (for example after
// returning to a backgrounded mobile tab), not only while WASD movement runs.
setInterval(function roomStabilityWatchdog() {
  try {
    roomStabilitySanitizeCamera();
    var cx = chunkCoord(camera.position.x);
    var cz = chunkCoord(camera.position.z);
    if (!roomStabilityChunkHealthy(cx, cz)) roomStabilityRepairWorld();
  } catch (err) {
    console.warn('[room-stability] watchdog', err);
  }
}, 1200);
