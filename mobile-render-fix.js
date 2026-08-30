// Mobile rendering safety layer
// Some Android/WebView combinations render the EffectComposer shader chain as a
// black frame even though the HUD and game loop continue normally. On touch/mobile
// devices we keep all game systems and lighting wrappers, but disable only the
// off-screen post-processing composer. The original WebGL scene is still rendered
// with ACES tone mapping and the lightweight CSS Bodycam/VHS overlays.

var MOBILE_SAFE_RENDER = false;
try {
  MOBILE_SAFE_RENDER = !!isTouchDevice() || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
} catch (_) {
  MOBILE_SAFE_RENDER = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

if (MOBILE_SAFE_RENDER) {
  document.body.classList.add('mobile-safe-render');

  // immersive-horror's render wrapper already falls back to the original
  // WebGLRenderer whenever immersiveComposer is null. Nulling the composer here
  // therefore preserves all later camera/lighting wrappers while skipping only
  // the problematic off-screen post-processing pass.
  if (typeof immersiveComposer !== 'undefined' && immersiveComposer) {
    try {
      immersiveComposer.renderTarget1?.dispose?.();
      immersiveComposer.renderTarget2?.dispose?.();
    } catch (_) {}
    immersiveComposer = null;
  }
  if (typeof immersivePostPass !== 'undefined') immersivePostPass = null;

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  // Keep the opening yellow rooms clearly visible. This changes lighting only;
  // the original procedural room geometry remains untouched.
  var mobileBaseApplyTheme = applyTheme;
  applyTheme = function(theme) {
    mobileBaseApplyTheme(theme);
    if (theme?.name === 'Level 0') {
      hemi.intensity = Math.max(hemi.intensity, 1.58);
      fillLight.intensity = Math.max(fillLight.intensity, .48);
      if (scene.fog?.isFogExp2) scene.fog.density = Math.min(scene.fog.density, .027);
    }
  };

  // Mobile CSS substitutes for the expensive shader: gentle photographic
  // contrast only, never enough to crush the scene to black.
  var mobileStyle = document.createElement('style');
  mobileStyle.textContent = `
    body.mobile-safe-render[data-filter="bodycam"] canvas {
      filter: contrast(1.035) saturate(.94) brightness(1.04) !important;
      transform: scale(1.006) !important;
    }
    body.mobile-safe-render[data-filter="vhs"] canvas {
      filter: contrast(1.04) saturate(.86) sepia(.08) brightness(1.04) !important;
    }
    body.mobile-safe-render #vignette { opacity:.55; }
    body.mobile-safe-render #grain { opacity:.055; }
    body.mobile-safe-render[data-filter="vhs"] #grain { opacity:.095; }
  `;
  document.head.appendChild(mobileStyle);

  console.info('[render] mobile safe renderer enabled');
}
