// Classic bright look
// Restores the earlier bright yellow-room presentation while keeping all current
// gameplay, networking, AI, audio and safety systems. Clean mode is intentionally
// simple and readable; VHS/Bodycam remain selectable from the menu.

var CLASSIC_DARK_LEVELS = new Set(['Level 6', 'Level !']);
var classicAmbient = new THREE.AmbientLight(0xffe7a8, .62);
scene.add(classicAmbient);

function classicIsDark() {
  return CLASSIC_DARK_LEVELS.has(LEVELS[currentLevelIndex]?.name);
}

function classicApplyBrightness() {
  if (classicIsDark()) {
    classicAmbient.intensity = .08;
    return;
  }

  // The first version relied on broad ambient illumination rather than strong
  // local light pools. Bring that easy-to-read yellow-room balance back.
  classicAmbient.intensity = .72;
  hemi.intensity = Math.max(hemi.intensity, 2.45);
  fillLight.intensity = Math.max(fillLight.intensity, .92);

  if (scene.fog?.isFogExp2) scene.fog.density = Math.min(scene.fog.density, .0115);

  materials.fixture.color.set(0xfff2bf);
  materials.fixture.emissive.set(0xffd979);
  materials.fixture.emissiveIntensity = Math.max(materials.fixture.emissiveIntensity, 2.35);

  // Keep the level's original colours; only soften the material response so wall
  // and carpet detail remains visible instead of disappearing into black patches.
  if (materials.wall) {
    materials.wall.roughness = Math.max(.82, Math.min(.91, materials.wall.roughness));
    materials.wall.metalness = 0;
  }
  if (materials.floor) {
    materials.floor.roughness = Math.max(.86, Math.min(.95, materials.floor.roughness));
    materials.floor.metalness = 0;
  }
}

var classicBaseApplyTheme = applyTheme;
applyTheme = function(theme) {
  classicBaseApplyTheme(theme);
  classicApplyBrightness();
};

// The newer local light proxies can create dramatic bright/dark islands. Keep a
// small amount for depth, but cap them so the room reads like the original build.
var classicBaseUpdateCameraOverlay = updateCameraOverlay;
updateCameraOverlay = function() {
  classicBaseUpdateCameraOverlay();
  classicApplyBrightness();

  try {
    if (typeof realLightAreaLights !== 'undefined') {
      for (var area of realLightAreaLights) area.intensity = Math.min(area.intensity, classicIsDark() ? .4 : 4.2);
    }
  } catch (_) {}
  try {
    if (typeof precisionProxyLights !== 'undefined') {
      for (var proxy of precisionProxyLights) proxy.intensity = Math.min(proxy.intensity, classicIsDark() ? .15 : .75);
    }
  } catch (_) {}

  // Keep the flashlight clean: no dust/speckles or visible polygon beam.
  try {
    if (typeof precisionDust !== 'undefined' && precisionDust) precisionDust.visible = false;
    if (typeof referenceBeam !== 'undefined' && referenceBeam) referenceBeam.visible = false;
  } catch (_) {}
};

// Clean mode should look close to the initial prototype: direct Three.js rendering
// with ACES tone mapping and bright room lighting, not the heavier VHS shader.
var classicRenderBase = renderer.render.bind(renderer);
renderer.render = function(renderScene, renderCamera) {
  if (renderScene !== scene || renderCamera !== camera) return classicRenderBase(renderScene, renderCamera);

  var dark = classicIsDark();
  var clean = (document.body.dataset.filter || 'clean') === 'clean';
  var oldExposure = renderer.toneMappingExposure;
  var oldFixture = materials.fixture.emissiveIntensity;
  var savedComposer;
  var composerTemporarilyDisabled = false;

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  if (!dark) {
    renderer.toneMappingExposure = Math.max(oldExposure, clean ? 1.48 : 1.33);
    materials.fixture.emissiveIntensity = Math.max(oldFixture, clean ? 2.42 : 2.30);
  }

  // Bypass only the expensive post-processing pass in Clean mode. The selectable
  // VHS/Bodycam modes still use their effects exactly as before.
  try {
    if (clean && typeof immersiveComposer !== 'undefined' && immersiveComposer) {
      savedComposer = immersiveComposer;
      immersiveComposer = null;
      composerTemporarilyDisabled = true;
    }
  } catch (_) {}

  var result;
  try {
    result = classicRenderBase(renderScene, renderCamera);
  } finally {
    if (composerTemporarilyDisabled) immersiveComposer = savedComposer;
    renderer.toneMappingExposure = oldExposure;
    materials.fixture.emissiveIntensity = oldFixture;
  }
  return result;
};

var classicStyle = document.createElement('style');
classicStyle.textContent = `
  body[data-filter="clean"] #vignette { opacity:.12 !important; }
  body[data-filter="clean"] #grain { opacity:.012 !important; }
  body[data-filter="clean"] #scanlines { opacity:.025 !important; }
  body[data-filter="clean"] canvas { filter:brightness(1.06) contrast(.99) saturate(.98) !important; }
  body.mobile-safe-render[data-filter="clean"] canvas { filter:brightness(1.16) contrast(.98) saturate(.98) !important; }
  body[data-filter="bodycam"] #vignette { opacity:.28 !important; }
  body[data-filter="vhs"] #vignette { opacity:.34 !important; }
`;
document.head.appendChild(classicStyle);

// Initial paint before setupRuntime selects Level 0.
document.body.dataset.filter = document.body.dataset.filter || 'clean';
classicApplyBrightness();
