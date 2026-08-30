// Opening visibility layer
// Keeps Level 0 readable without forcing the flashlight on. Later dark levels,
// especially Level 6, keep their intended darkness.

var starterLight = new THREE.PointLight(0xffe7a6, 0, 18, 1.65);
starterLight.position.set(0, 2.45, 0);
starterLight.castShadow = false;
scene.add(starterLight);

var starterLightTarget = 0;
var starterBaseApplyTheme = applyTheme;
applyTheme = function(theme) {
  starterBaseApplyTheme(theme);
  var opening = theme?.name === 'Level 0';
  document.body.classList.toggle('opening-visible', opening);

  if (opening) {
    // Bright enough to understand the room immediately, while keeping the
    // yellow fluorescent Backrooms mood and leaving the flashlight optional.
    hemi.intensity = Math.max(hemi.intensity, 1.62);
    fillLight.intensity = Math.max(fillLight.intensity, .48);
    starterLightTarget = 5.8;
  } else {
    starterLightTarget = 0;
  }
};

var starterStyle = document.createElement('style');
starterStyle.textContent = `
  body.opening-visible #vignette {
    opacity: .62;
  }
  body.opening-visible[data-filter="bodycam"] #vignette {
    background: radial-gradient(ellipse at 50% 48%, transparent 40%, rgba(0,0,0,.08) 74%, rgba(0,0,0,.31) 100%), linear-gradient(90deg, rgba(0,0,0,.05), transparent 8% 92%, rgba(0,0,0,.05));
  }
  body.opening-visible[data-filter="vhs"] #vignette {
    opacity: .68;
  }
`;
document.head.appendChild(starterStyle);

var starterBaseUpdateCameraOverlay = updateCameraOverlay;
updateCameraOverlay = function() {
  starterBaseUpdateCameraOverlay();
  var opening = currentLevelIndex === 0;
  var introBoost = opening ? THREE.MathUtils.clamp(1 - elapsed / 22, 0, 1) : 0;
  var desired = opening ? (3.8 + introBoost * 2.0) : 0;
  starterLightTarget = desired;
  starterLight.intensity = THREE.MathUtils.lerp(starterLight.intensity, starterLightTarget, .08);

  if (opening) {
    hemi.intensity = THREE.MathUtils.lerp(hemi.intensity, 1.52, .035);
    fillLight.intensity = THREE.MathUtils.lerp(fillLight.intensity, .44, .035);
  }
};

// Exposure is normally reset inside the base animation loop immediately before
// rendering, so apply the opening boost at the final renderer boundary.
var starterRendererBase = renderer.render.bind(renderer);
renderer.render = function(renderScene, renderCamera) {
  if (renderScene !== scene || renderCamera !== camera || currentLevelIndex !== 0) {
    return starterRendererBase(renderScene, renderCamera);
  }

  var oldExposure = renderer.toneMappingExposure;
  var oldFixture = materials.fixture.emissiveIntensity;
  var intro = THREE.MathUtils.clamp(1 - elapsed / 20, 0, 1);
  renderer.toneMappingExposure = Math.max(oldExposure, 1.02 + intro * .10);
  materials.fixture.emissiveIntensity = Math.max(oldFixture, 2.55 + intro * .30);

  var result;
  try {
    result = starterRendererBase(renderScene, renderCamera);
  } finally {
    renderer.toneMappingExposure = oldExposure;
    materials.fixture.emissiveIntensity = oldFixture;
  }
  return result;
};

// The initial level has already been selected by setupRuntime only after all
// patch layers load, so this class is also set here for the first painted frame.
document.body.classList.add('opening-visible');
