// Camera-only stability guard.
// This intentionally does NOT alter generateChunk(), add perimeter walls, columns,
// or starter partitions. The room layout remains the original game-core layout.

var cameraStabilityLastGood = new THREE.Vector3(0, EYE_HEIGHT, 0);
var cameraStabilityBaseUpdateMovement = updateMovement;

controls.minPolarAngle = 0.24;
controls.maxPolarAngle = Math.PI - 0.24;

function cameraStabilitySanitize() {
  var badPosition = !Number.isFinite(camera.position.x) || !Number.isFinite(camera.position.y) || !Number.isFinite(camera.position.z);
  var badRotation = !Number.isFinite(camera.rotation.x) || !Number.isFinite(camera.rotation.y) || !Number.isFinite(camera.rotation.z);

  if (badPosition) camera.position.copy(cameraStabilityLastGood);
  if (badRotation) camera.rotation.set(0, 0, 0);

  camera.position.y = THREE.MathUtils.clamp(camera.position.y, EYE_HEIGHT - .12, EYE_HEIGHT + .12);

  if (!gyro.enabled) {
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x, -1.30, 1.30);
    camera.rotation.z = THREE.MathUtils.clamp(camera.rotation.z, -.14, .14);
  }

  // Rebuild only the normal streamed chunks if the current one is ever missing.
  // No extra walls or geometry are introduced.
  var cx = chunkCoord(camera.position.x);
  var cz = chunkCoord(camera.position.z);
  var current = chunks.get(`${cx},${cz}`);
  if (!current || !current.group || current.group.parent !== scene) {
    lastChunkX = Number.NaN;
    lastChunkZ = Number.NaN;
    updateChunks(true);
  }

  cameraStabilityLastGood.set(camera.position.x, EYE_HEIGHT, camera.position.z);
}

updateMovement = function cameraStableMovement(dt) {
  cameraStabilityBaseUpdateMovement(dt);
  cameraStabilitySanitize();
};

setInterval(function cameraStabilityWatchdog() {
  try { cameraStabilitySanitize(); }
  catch (err) { console.warn('[camera-stability-lite]', err); }
}, 1400);
