// Realistic lighting final layer
// - removes the visible polygon/cone flashlight beam
// - uses softer photographic flashlight falloff
// - adds a few broad RectAreaLight proxies under nearby fluorescent fixtures
// - restores bright yellow-room ambience without changing room geometry

var REAL_LIGHT_DARK_LEVELS = new Set(['Level 6', 'Level !']);
var realLightAreaLights = [];
var realLightTmpTarget = new THREE.Vector3();
var realLightLastAreaUpdate = -999;

function realLightIsDark() {
  return REAL_LIGHT_DARK_LEVELS.has(LEVELS[currentLevelIndex]?.name);
}

// -----------------------------------------------------------------------------
// 1) Remove the old visible beam geometry. A solid translucent cone reads as a
// game-engine volume, especially against a wall. Keep the actual SpotLight only.
// -----------------------------------------------------------------------------
try {
  if (typeof referenceBeam !== 'undefined' && referenceBeam) referenceBeam.visible = false;
  if (typeof referenceBeamMaterial !== 'undefined' && referenceBeamMaterial) referenceBeamMaterial.opacity = 0;
} catch (_) {}

// Dust/speckles remain disabled as requested previously.
try {
  if (typeof precisionDust !== 'undefined' && precisionDust) precisionDust.visible = false;
  if (typeof precisionDustMaterial !== 'undefined' && precisionDustMaterial) precisionDustMaterial.opacity = 0;
} catch (_) {}

// -----------------------------------------------------------------------------
// 2) Photographic flashlight. A broad penumbra and inverse-like falloff produce
// a soft center instead of a hard triangular patch on the wall.
// -----------------------------------------------------------------------------
flashlight.color.set(0xfff0cf);
flashlight.distance = 30;
flashlight.angle = Math.PI / 6.25;
flashlight.penumbra = .84;
flashlight.decay = 1.72;
flashlight.castShadow = false;
flashlight.position.set(.08, -.07, -.02);
flashlightTarget.position.set(0, -.055, -7.5);

// Existing near-camera fill is useful, but reduce it so it does not flatten walls.
try {
  if (typeof referenceFlashFill !== 'undefined' && referenceFlashFill) {
    referenceFlashFill.color.set(0xffe6bd);
    referenceFlashFill.distance = 3.5;
    referenceFlashFill.decay = 2.0;
  }
} catch (_) {}

// -----------------------------------------------------------------------------
// 3) Broad fluorescent proxies. Instanced ceiling panels are cheap to draw but
// emissive materials do not illuminate walls. RectAreaLights emulate the broad,
// shadowless spill of fluorescent fixtures using only the nearest few lamps.
// -----------------------------------------------------------------------------
function realLightEnsureAreaLights() {
  if (realLightAreaLights.length) return;
  var count = qualityMode === 'low' ? 2 : qualityMode === 'high' ? 5 : 4;
  for (var i = 0; i < count; i++) {
    var light = new THREE.RectAreaLight(0xffe8aa, 0, 2.7, .62);
    light.visible = false;
    scene.add(light);
    realLightAreaLights.push(light);
  }
}

function realLightUpdateAreaLights() {
  realLightEnsureAreaLights();
  if (elapsed - realLightLastAreaUpdate < .12) return;
  realLightLastAreaUpdate = elapsed;

  var dark = realLightIsDark();
  var candidates = (typeof precisionLightCandidates !== 'undefined' && Array.isArray(precisionLightCandidates))
    ? precisionLightCandidates
    : [];

  for (var i = 0; i < realLightAreaLights.length; i++) {
    var light = realLightAreaLights[i];
    var c = candidates[i];
    if (dark || !c) {
      light.intensity = THREE.MathUtils.lerp(light.intensity, 0, .35);
      light.visible = light.intensity > .02;
      continue;
    }

    light.visible = true;
    light.position.set(c.x, c.y - .10, c.z);
    realLightTmpTarget.set(c.x, c.y - 2.0, c.z);
    light.lookAt(realLightTmpTarget);

    var distance = Math.sqrt(Math.max(0, c.d2 || 0));
    var targetIntensity = distance < 6 ? 17 : distance < 11 ? 13 : 9;
    if (qualityMode === 'high') targetIntensity *= 1.12;
    if (qualityMode === 'low') targetIntensity *= .78;
    light.intensity = THREE.MathUtils.lerp(light.intensity, targetIntensity, .28);
  }

  // Old point-light proxies are intentionally subdued. They remain as a tiny fill
  // but no longer create obvious circular pools beneath each fixture.
  try {
    if (typeof precisionProxyLights !== 'undefined') {
      for (var p of precisionProxyLights) p.intensity *= .18;
    }
  } catch (_) {}
}

// -----------------------------------------------------------------------------
// 4) Bright Backrooms ambience. Normal levels should read like fluorescent-lit
// interior space even before the flashlight is turned on.
// -----------------------------------------------------------------------------
var realLightBaseApplyTheme = applyTheme;
applyTheme = function(theme) {
  realLightBaseApplyTheme(theme);
  if (REAL_LIGHT_DARK_LEVELS.has(theme?.name)) return;

  hemi.intensity = Math.max(hemi.intensity, 2.02);
  fillLight.intensity = Math.max(fillLight.intensity, .70);
  if (scene.fog?.isFogExp2) scene.fog.density = Math.min(scene.fog.density, .0165);

  materials.fixture.color.set(0xfff4d2);
  materials.fixture.emissive.set(0xffdf93);
  materials.fixture.emissiveIntensity = Math.max(materials.fixture.emissiveIntensity, 2.95);

  materials.wall.roughness = .90;
  materials.floor.roughness = .94;
};

// Runtime rewrites exposure and fixture emissive intensity just before rendering,
// so the final wrapper supplies the photographic value only for the submitted frame.
var realLightRenderBase = renderer.render.bind(renderer);
renderer.render = function(renderScene, renderCamera) {
  if (renderScene !== scene || renderCamera !== camera || realLightIsDark()) {
    return realLightRenderBase(renderScene, renderCamera);
  }

  var oldExposure = renderer.toneMappingExposure;
  var oldFixture = materials.fixture.emissiveIntensity;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = Math.max(oldExposure, 1.23);
  materials.fixture.emissiveIntensity = Math.max(oldFixture, 2.95);

  var result;
  try {
    result = realLightRenderBase(renderScene, renderCamera);
  } finally {
    renderer.toneMappingExposure = oldExposure;
    materials.fixture.emissiveIntensity = oldFixture;
  }
  return result;
};

var realLightBaseUpdateCameraOverlay = updateCameraOverlay;
updateCameraOverlay = function() {
  realLightBaseUpdateCameraOverlay();

  // Keep prior solid beam/dust layers off even if an earlier wrapper updates them.
  try {
    if (typeof referenceBeam !== 'undefined' && referenceBeam) referenceBeam.visible = false;
    if (typeof referenceBeamMaterial !== 'undefined' && referenceBeamMaterial) referenceBeamMaterial.opacity = 0;
    if (typeof precisionDust !== 'undefined' && precisionDust) precisionDust.visible = false;
  } catch (_) {}

  realLightUpdateAreaLights();

  var battery = typeof survivalState !== 'undefined' ? THREE.MathUtils.clamp(survivalState.battery / 100, 0, 1) : 1;
  if (flashlightOn && battery > .001) {
    var lowBatteryFlicker = battery < .10 && Math.sin(elapsed * 38) > .76 ? .58 : 1;
    var base = qualityMode === 'low' ? 27 : qualityMode === 'high' ? 43 : 36;
    flashlight.intensity = base * (.58 + battery * .42) * lowBatteryFlicker;
    try {
      if (typeof referenceFlashFill !== 'undefined' && referenceFlashFill) {
        referenceFlashFill.intensity = (qualityMode === 'low' ? 1.1 : 1.8) * (.55 + battery * .45);
      }
    } catch (_) {}
  } else {
    flashlight.intensity = 0;
    try { if (typeof referenceFlashFill !== 'undefined' && referenceFlashFill) referenceFlashFill.intensity = 0; } catch (_) {}
  }
};

// Mobile still uses the stable direct WebGL path; lift only the photographic
// brightness there, without re-enabling the expensive post-processing composer.
var realLightStyle = document.createElement('style');
realLightStyle.textContent = `
  body.mobile-safe-render:not([data-filter="night"]) canvas {
    filter: contrast(1.02) saturate(.98) brightness(1.13) !important;
  }
  body:not([data-filter="night"]) #vignette { opacity:.34 !important; }
`;
document.head.appendChild(realLightStyle);
