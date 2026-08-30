// Light restore layer
// Removes the visible flashlight dust/speckles and restores the bright, readable
// fluorescent-room look requested for normal levels. Intentionally dark levels
// (Level 6 and Level !) keep their horror lighting.

var LIGHT_RESTORE_DARK_LEVELS = new Set(['Level 6', 'Level !']);
var lightRestoreColor = new THREE.Color();

function lightRestoreIsDarkLevel() {
  return LIGHT_RESTORE_DARK_LEVELS.has(LEVELS[currentLevelIndex]?.name);
}

// -----------------------------------------------------------------------------
// 1) Remove the white speckles in the centre of the flashlight beam.
// precision-systems creates these as a Points cloud attached to the camera.
// -----------------------------------------------------------------------------
function lightRestoreDisableParticles() {
  try {
    if (typeof precisionDust !== 'undefined' && precisionDust) {
      precisionDust.visible = false;
      precisionDust.frustumCulled = true;
    }
    if (typeof precisionDustMaterial !== 'undefined' && precisionDustMaterial) {
      precisionDustMaterial.opacity = 0;
      precisionDustMaterial.visible = false;
    }
  } catch (_) {}
}

lightRestoreDisableParticles();

if (typeof precisionUpdateDust === 'function') {
  precisionUpdateDust = function() {
    lightRestoreDisableParticles();
  };
}

// Also hide only camera-attached Points objects. This catches any cached/older
// build of the same flashlight dust effect without touching world meshes/items.
for (var lightRestoreChild of camera.children) {
  if (lightRestoreChild?.isPoints) lightRestoreChild.visible = false;
}

// -----------------------------------------------------------------------------
// 2) Restore the bright Backrooms fluorescent ambience.
// No geometry or room-generation logic is changed here.
// -----------------------------------------------------------------------------
var lightRestoreBaseApplyTheme = applyTheme;
applyTheme = function(theme) {
  lightRestoreBaseApplyTheme(theme);
  var dark = LIGHT_RESTORE_DARK_LEVELS.has(theme?.name);

  if (!dark) {
    hemi.intensity = Math.max(hemi.intensity, 1.72);
    fillLight.intensity = Math.max(fillLight.intensity, .54);

    if (scene.fog?.isFogExp2) {
      scene.fog.density = Math.min(scene.fog.density, .0205);
    }

    // Fluorescent fixtures remain warm/yellow instead of becoming white-hot.
    materials.fixture.color.set(0xfff2c8);
    materials.fixture.emissive.set(0xffdfa0);
    materials.fixture.emissiveIntensity = Math.max(materials.fixture.emissiveIntensity, 2.55);

    // Slightly lift the material response rather than recolouring every level.
    materials.wall.roughness = Math.min(materials.wall.roughness, .88);
    materials.floor.roughness = Math.min(materials.floor.roughness, .92);
  }
};

// -----------------------------------------------------------------------------
// 3) Final render-boundary exposure correction.
// game-runtime intentionally modulates exposure every frame; this final wrapper
// keeps normal levels visibly lit while preserving Level 6 / Level ! darkness.
// -----------------------------------------------------------------------------
var lightRestoreRenderBase = renderer.render.bind(renderer);
renderer.render = function(renderScene, renderCamera) {
  if (renderScene !== scene || renderCamera !== camera || lightRestoreIsDarkLevel()) {
    return lightRestoreRenderBase(renderScene, renderCamera);
  }

  var oldExposure = renderer.toneMappingExposure;
  var oldFixtureIntensity = materials.fixture.emissiveIntensity;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMappingExposure = Math.max(oldExposure, 1.10);
  materials.fixture.emissiveIntensity = Math.max(oldFixtureIntensity, 2.55);

  var result;
  try {
    result = lightRestoreRenderBase(renderScene, renderCamera);
  } finally {
    renderer.toneMappingExposure = oldExposure;
    materials.fixture.emissiveIntensity = oldFixtureIntensity;
  }
  return result;
};

// -----------------------------------------------------------------------------
// 4) Keep the photographic overlays subtle so the room remains readable.
// -----------------------------------------------------------------------------
var lightRestoreStyle = document.createElement('style');
lightRestoreStyle.textContent = `
  body:not([data-filter="night"]) #vignette { opacity:.40 !important; }
  body[data-filter="bodycam"] #grain { opacity:.035 !important; }
  body[data-filter="vhs"] #grain { opacity:.065 !important; }
  body.mobile-safe-render:not([data-filter="night"]) canvas {
    filter: contrast(1.025) saturate(.97) brightness(1.08) !important;
  }
`;
document.head.appendChild(lightRestoreStyle);

// Ensure the first setupRuntime -> switchLevel call receives the restored values.
lightRestoreDisableParticles();
