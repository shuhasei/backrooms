// Reference polish layer
// - yellow hazmat co-op teammates inspired by the supplied reference image
// - relative/calibrated device-orientation tracking so follow mode cannot pitch into the floor
// - compact HUD with optional diagnostics
// - warmer, softer flashlight beam + visible teammate flashlights

// -----------------------------------------------------------------------------
// 1) Co-op teammate: yellow protective suit, black seam/ports, no floating label
// -----------------------------------------------------------------------------
if (typeof avatarShared !== 'undefined') {
  avatarShared.suit.color.setHex(0xe0cf32);
  avatarShared.suit.roughness = .92;
  avatarShared.suitDark.color.setHex(0xb8a825);
  avatarShared.suitDark.roughness = .96;
  avatarShared.rubber.color.setHex(0x10110f);
  avatarShared.black.color.setHex(0x0c0d0c);
  avatarShared.visor.color.setHex(0x0b0c0a);
  avatarShared.metal.color.setHex(0x343932);
}

var referenceBaseCreateRemotePlayer = createRemotePlayer;
createRemotePlayer = function(id) {
  var rp = referenceBaseCreateRemotePlayer(id);
  if (!rp?.visual) return rp;

  // The reference reads best as a clean yellow silhouette. Hide the floating
  // name label and let the physical suit be the identification cue.
  rp.visual.traverse(function(o) {
    if (o.isSprite) o.visible = false;
  });

  var seamMat = avatarShared?.black || new THREE.MeshStandardMaterial({ color: 0x0c0d0c, roughness: .95 });
  var ringMat = avatarShared?.rubber || seamMat;

  // Hood/back zipper seam.
  var hoodSeam = avatarMesh(geo.box, seamMat, 0, 1.76, .315, .022, .37, .018);
  hoodSeam.rotation.x = -.05;
  var backSeam = avatarMesh(geo.box, seamMat, 0, 1.39, .322, .020, .31, .018);

  // Two black circular ports down the back, matching the visual language in the reference.
  function backPort(y, radius) {
    var disc = avatarMesh(geo.cylinder, ringMat, 0, y, .338, radius, .025, radius);
    disc.rotation.x = Math.PI / 2;
    return disc;
  }
  var portA = backPort(1.18, .065);
  var portB = backPort(.96, .075);

  // A slim dark hose hanging from the left rear side gives the suit a believable utility silhouette.
  avatarSegment(rp.visual, -.26, 1.44, .31, -.39, 1.18, .34, .022, seamMat);
  avatarSegment(rp.visual, -.39, 1.18, .34, -.43, .88, .29, .022, seamMat);
  avatarSegment(rp.visual, -.43, .88, .29, -.39, .67, .18, .020, seamMat);

  rp.visual.add(hoodSeam, backSeam, portA, portB);
  rp.visual.scale.setScalar(.98);

  // Teammate flashlight. Max three remote lights exist in a four-player room,
  // shadows stay disabled, so the visual gain is large for a modest cost.
  var remoteLightTarget = new THREE.Object3D();
  remoteLightTarget.position.set(0, 1.42, -5.0);
  var remoteLight = new THREE.SpotLight(0xfff0c7, 0, 22, Math.PI / 7.2, .72, 1.55);
  remoteLight.position.set(.12, 1.50, -.28);
  remoteLight.castShadow = false;
  remoteLight.target = remoteLightTarget;
  rp.group.add(remoteLight, remoteLightTarget);
  rp.remoteLight = remoteLight;
  rp.remoteLightTarget = remoteLightTarget;

  return rp;
};

var referenceBaseUpdateRemotePlayers = updateRemotePlayers;
updateRemotePlayers = function(dt) {
  referenceBaseUpdateRemotePlayers(dt);
  for (var rp of remotePlayers.values()) {
    if (!rp.remoteLight) continue;
    var target = rp.light && rp.alive !== false ? (qualityMode === 'low' ? 8 : 17) : 0;
    rp.remoteLight.intensity = THREE.MathUtils.lerp(rp.remoteLight.intensity, target, Math.min(1, dt * 10));
  }
};

// -----------------------------------------------------------------------------
// 2) Device orientation: relative calibration instead of absolute phone attitude
// -----------------------------------------------------------------------------
var referenceGyroBaseline = new THREE.Quaternion();
var referenceGyroBaseCamera = new THREE.Quaternion();
var referenceGyroSensor = new THREE.Quaternion();
var referenceGyroDelta = new THREE.Quaternion();
var referenceGyroTarget = new THREE.Quaternion();
var referenceGyroEuler = new THREE.Euler(0, 0, 0, 'YXZ');
var referenceGyroCalibrated = false;
var referenceGyroZ = new THREE.Vector3(0, 0, 1);
var referenceGyroQ1 = new THREE.Quaternion(-Math.sqrt(.5), 0, 0, Math.sqrt(.5));

function referenceSensorQuaternion(out) {
  var alpha = THREE.MathUtils.degToRad(gyro.alpha || 0);
  var beta = THREE.MathUtils.degToRad(gyro.beta || 0);
  var gamma = THREE.MathUtils.degToRad(gyro.gamma || 0);
  var orient = THREE.MathUtils.degToRad(gyro.orient || 0);
  referenceGyroEuler.set(beta, alpha, -gamma, 'YXZ');
  out.setFromEuler(referenceGyroEuler);
  out.multiply(referenceGyroQ1);
  out.multiply(new THREE.Quaternion().setFromAxisAngle(referenceGyroZ, -orient));
  return out.normalize();
}

var referenceBaseEnableGyro = enableGyro;
enableGyro = async function() {
  // Keep the browser permission path from the original implementation, then
  // calibrate the current physical pose as "look straight ahead".
  var wasEnabled = gyro.enabled;
  await referenceBaseEnableGyro();
  if (gyro.enabled && !wasEnabled) {
    referenceGyroCalibrated = false;
    referenceGyroBaseCamera.copy(camera.quaternion);
    camera.rotation.z = 0;
    gyroButton.textContent = '視点追従 ON（現在位置を正面）';
    showToast('視点追従を調整しました。今の持ち方を正面として追従します');
  } else if (!gyro.enabled) {
    referenceGyroCalibrated = false;
    gyroButton.textContent = '端末の向きで視点追従';
  }
};

applyGyroOrientation = function() {
  if (!gyro.enabled) return;
  referenceSensorQuaternion(referenceGyroSensor);
  if (!referenceGyroCalibrated) {
    referenceGyroBaseline.copy(referenceGyroSensor);
    referenceGyroBaseCamera.copy(camera.quaternion);
    referenceGyroCalibrated = true;
    return;
  }

  // qRelative = inverse(qStart) * qNow. The camera starts from the pose the
  // player was already looking at rather than inheriting the phone's absolute pitch.
  referenceGyroDelta.copy(referenceGyroBaseline).invert().multiply(referenceGyroSensor);
  referenceGyroTarget.copy(referenceGyroBaseCamera).multiply(referenceGyroDelta);
  referenceGyroEuler.setFromQuaternion(referenceGyroTarget, 'YXZ');

  // Hard floor/ceiling guard. Roll is intentionally removed for comfort and to
  // prevent sensor drift from rotating the entire Backrooms horizon.
  referenceGyroEuler.x = THREE.MathUtils.clamp(referenceGyroEuler.x, -1.16, 1.16);
  referenceGyroEuler.z = 0;
  referenceGyroTarget.setFromEuler(referenceGyroEuler);
  camera.quaternion.slerp(referenceGyroTarget, .18);
};

// Recalibrate when orientation changes (portrait <-> landscape).
addEventListener('orientationchange', function() {
  if (!gyro.enabled) return;
  referenceGyroCalibrated = false;
  referenceGyroBaseCamera.copy(camera.quaternion);
});

// -----------------------------------------------------------------------------
// 3) Compact HUD: keep the game readable, diagnostics available with H
// -----------------------------------------------------------------------------
var referenceHudStyle = document.createElement('style');
referenceHudStyle.textContent = `
  #hud{width:min(270px,calc(100vw - 24px));left:12px;top:10px;padding:8px 9px;border-radius:4px;background:linear-gradient(90deg,rgba(5,7,5,.36),rgba(5,7,5,.08),transparent);font-size:10px;line-height:1.2}
  #hud .title,#status,#entityStatus,#netState,#voiceState{display:none!important}
  #hud .hudRow{align-items:center;gap:8px}
  #hud #fps{font-size:8px;opacity:.34}
  #objective{margin-top:4px;font-size:10px;max-width:245px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.86}
  #hud .meterRow{margin-top:5px;gap:6px;font-size:9px}
  #hud .meter{width:68px;height:5px}
  #hud .meterRow:first-of-type{display:none}
  #survivalHud{left:12px!important;bottom:10px!important;width:250px!important;transform:scale(.82);transform-origin:left bottom;opacity:.78}
  #gameplayCodeHud{right:12px!important;bottom:10px!important;font-size:9px!important;opacity:.78}
  #cameraOverlay{right:12px;top:10px;font-size:9px;opacity:.58}
  #interaction{top:calc(50% + 24px);font-size:10px;opacity:.82}
  #toast{max-width:min(420px,82vw);text-align:center;background:rgba(8,9,7,.62);font-size:10px}
  body.hud-details #hud .title,body.hud-details #status,body.hud-details #entityStatus,body.hud-details #netState,body.hud-details #voiceState{display:block!important}
  body.hud-details #hud .meterRow:first-of-type{display:flex}
  @media(max-width:720px){#hud{left:8px;top:7px;width:230px}#survivalHud{left:8px!important;bottom:7px!important;transform:scale(.72)}}
`;
document.head.appendChild(referenceHudStyle);

var referenceBaseOnKeyDown = onKeyDown;
onKeyDown = function(event) {
  if (event.code === 'KeyH' && !event.repeat) {
    document.body.classList.toggle('hud-details');
    showToast(document.body.classList.contains('hud-details') ? 'HUD 詳細表示' : 'HUD シンプル表示');
    return;
  }
  referenceBaseOnKeyDown(event);
};

// Show the mic row only while microphone detection is actually active.
function referenceRefreshMicHud() {
  var row = micMeter?.closest?.('.meterRow');
  if (!row) return;
  row.style.display = mic.enabled || document.body.classList.contains('hud-details') ? 'flex' : 'none';
}
var referenceBaseToggleMic = toggleMic;
toggleMic = async function() {
  await referenceBaseToggleMic();
  referenceRefreshMicHud();
};
referenceRefreshMicHud();

// -----------------------------------------------------------------------------
// 4) Softer flashlight: warm spot + volumetric-looking beam and better falloff
// -----------------------------------------------------------------------------
flashlight.color.setHex(0xfff1cf);
flashlight.distance = 32;
flashlight.angle = Math.PI / 6.8;
flashlight.penumbra = .72;
flashlight.decay = 1.55;
flashlight.castShadow = false;

var referenceBeamMaterial = new THREE.MeshBasicMaterial({
  color: 0xffedbf,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  depthTest: true,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  fog: true,
});
var referenceBeamGeometry = new THREE.CylinderGeometry(.045, 1.55, 6.4, 18, 1, true);
var referenceBeam = new THREE.Mesh(referenceBeamGeometry, referenceBeamMaterial);
referenceBeam.rotation.x = Math.PI / 2;
referenceBeam.position.set(.10, -.09, -3.15);
referenceBeam.renderOrder = 1;
camera.add(referenceBeam);

// Small warm fill near the camera softens the harsh center of the SpotLight.
var referenceFlashFill = new THREE.PointLight(0xffe6b8, 0, 4.6, 2.0);
referenceFlashFill.position.set(.08, -.08, -.45);
referenceFlashFill.castShadow = false;
camera.add(referenceFlashFill);

var referenceBaseUpdateCameraOverlay = updateCameraOverlay;
updateCameraOverlay = function() {
  referenceBaseUpdateCameraOverlay();
  var battery = typeof survivalState !== 'undefined' ? survivalState.battery / 100 : 1;
  var enabled = flashlightOn && battery > .001;
  var quality = qualityMode === 'low' ? .55 : qualityMode === 'high' ? 1 : .82;
  referenceBeamMaterial.opacity = THREE.MathUtils.lerp(referenceBeamMaterial.opacity, enabled ? .026 * quality * (.55 + battery * .45) : 0, .18);
  referenceFlashFill.intensity = THREE.MathUtils.lerp(referenceFlashFill.intensity, enabled ? 4.5 * quality * (.45 + battery * .55) : 0, .18);

  // Make the core light feel photographic rather than a hard game-engine cone.
  if (enabled) {
    var flicker = battery < .13 ? (Math.sin(elapsed * 41) > .72 ? .48 : 1) : 1;
    flashlight.intensity = (qualityMode === 'low' ? 21 : qualityMode === 'high' ? 39 : 31) * (.48 + battery * .52) * flicker;
  }
};

// Fluorescent panels get a slightly creamier glow, while ACES tone mapping and
// the existing lens layer provide highlight rolloff/bloom-like bleed.
materials.fixture.color.setHex(0xfff7d5);
materials.fixture.emissive.setHex(0xffe7a0);
materials.fixture.emissiveIntensity = Math.max(2.85, materials.fixture.emissiveIntensity);

var referenceHint = document.createElement('div');
referenceHint.style.cssText = 'margin-top:6px;opacity:.58;font:600 9px ui-monospace,monospace';
referenceHint.textContent = 'H: HUD詳細/シンプル切替 · 視点追従ON時は現在の端末角度を正面として補正';
menu.appendChild(referenceHint);
