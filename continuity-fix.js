// Continuous-view safety layer
// Prevents intentional full-screen blink cuts, reduces mobile GPU pressure and
// provides same-frame/direct-render fallback plus WebGL context recovery.

var CONTINUITY_MOBILE = false;
try {
  CONTINUITY_MOBILE = !!MOBILE_SAFE_RENDER || !!isTouchDevice() || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
} catch (_) {
  CONTINUITY_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

// -----------------------------------------------------------------------------
// 1) Never deliberately cut the whole picture to black.
// The old automatic blink state was useful for one enemy gimmick, but on mobile
// it looks exactly like the renderer has failed. Keep the view continuous.
// -----------------------------------------------------------------------------
if (typeof immersiveBlinkState === 'function') {
  immersiveBlinkState = function() { return false; };
}
if (typeof immersiveUpdateBlinkVisual === 'function') {
  immersiveUpdateBlinkVisual = function() {
    immersiveLastBlink = false;
    if (immersiveBlinkEl) {
      immersiveBlinkEl.style.opacity = '0';
      immersiveBlinkEl.style.display = 'none';
    }
  };
}

var continuityStyle = document.createElement('style');
continuityStyle.textContent = `
  #blinkFx{display:none!important;opacity:0!important}
  body.continuity-recovering #app{background:#4b421f}
  body.continuity-recovering canvas{background:#4b421f}
`;
document.head.appendChild(continuityStyle);

// -----------------------------------------------------------------------------
// 2) Mobile GPU budget: keep the main scene, disable secondary camera rendering.
// Security-monitor render targets are nice on desktop but are unnecessary extra
// off-screen rendering on phones and can contribute to WebGL context loss.
// -----------------------------------------------------------------------------
if (CONTINUITY_MOBILE) {
  if (typeof survivalDisposeSecurity === 'function') {
    try { survivalDisposeSecurity(); } catch (_) {}
  }
  if (typeof survivalBuildSecurity === 'function') {
    survivalBuildSecurity = function() {
      try { survivalDisposeSecurity(); } catch (_) {}
    };
  }
  if (typeof survivalUpdateSecurity === 'function') {
    survivalUpdateSecurity = function() {};
  }

  var continuityBaseUpdateRendererScale = updateRendererScale;
  updateRendererScale = function() {
    // 0.92 is still sharp on a phone display, while substantially lowering the
    // pixel workload and reducing the chance of the canvas disappearing later.
    var ceiling = qualityMode === 'high' ? 1.0 : .92;
    renderScale = Math.min(renderScale, ceiling);
    continuityBaseUpdateRendererScale();
  };
}

// -----------------------------------------------------------------------------
// 3) Render-chain guard. If one optional visual wrapper throws for a frame, retry
// immediately with Three.js' original WebGL render function instead of leaving a
// black frame on screen.
// -----------------------------------------------------------------------------
var continuityRenderBase = renderer.render.bind(renderer);
var continuityLastRenderErrorAt = -999;

function continuityResetRenderGuards() {
  try { if (typeof immersiveRenderGuard !== 'undefined') immersiveRenderGuard = false; } catch (_) {}
  try { if (typeof survivalRenderGuard !== 'undefined') survivalRenderGuard = false; } catch (_) {}
  try { if (typeof precisionRenderGuard !== 'undefined') precisionRenderGuard = false; } catch (_) {}
}

renderer.render = function(renderScene, renderCamera) {
  try {
    return continuityRenderBase(renderScene, renderCamera);
  } catch (err) {
    continuityResetRenderGuards();
    if (elapsed - continuityLastRenderErrorAt > 2) {
      continuityLastRenderErrorAt = elapsed;
      console.warn('[continuity] visual layer failed; using direct frame', err);
    }
    try {
      renderer.setRenderTarget(null);
      if (typeof immersiveOriginalRendererRender === 'function') {
        return immersiveOriginalRendererRender(renderScene, renderCamera);
      }
    } catch (fallbackErr) {
      console.warn('[continuity] direct frame failed', fallbackErr);
    }
    return undefined;
  }
};

// -----------------------------------------------------------------------------
// 4) WebGL context recovery. preventDefault() tells the browser the app is ready
// to restore the context. Once restored, mark GPU-backed resources dirty so the
// room returns without requiring a page reload.
// -----------------------------------------------------------------------------
function continuityRefreshGpuResources() {
  try {
    renderer.setRenderTarget(null);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    for (var key in materials) if (materials[key]) materials[key].needsUpdate = true;
    for (var texKey in textures) if (textures[texKey]) textures[texKey].needsUpdate = true;
    if (typeof lensNormalMaps === 'object') for (var n in lensNormalMaps) if (lensNormalMaps[n]) lensNormalMaps[n].needsUpdate = true;
    if (typeof lensRoughnessMaps === 'object') for (var r in lensRoughnessMaps) if (lensRoughnessMaps[r]) lensRoughnessMaps[r].needsUpdate = true;
    onResize();
    lastChunkX = Number.NaN;
    lastChunkZ = Number.NaN;
    updateChunks(true);
    continuityResetRenderGuards();
  } catch (err) {
    console.warn('[continuity] GPU refresh', err);
  }
}

renderer.domElement.addEventListener('webglcontextlost', function(event) {
  event.preventDefault();
  document.body.classList.add('continuity-recovering');
  continuityResetRenderGuards();
  console.warn('[continuity] WebGL context lost; requesting restore');
  setTimeout(function() {
    try { renderer.forceContextRestore?.(); } catch (_) {}
  }, 120);
}, false);

renderer.domElement.addEventListener('webglcontextrestored', function() {
  document.body.classList.remove('continuity-recovering');
  continuityRefreshGpuResources();
  showToast('画面を自動復旧しました');
}, false);

// Mobile browser chrome, app switching and screen rotation can temporarily resize
// or suspend the canvas. Revalidate the camera/chunks immediately on return.
function continuityResumeView() {
  if (document.hidden) return;
  requestAnimationFrame(function() {
    try {
      continuityResetRenderGuards();
      onResize();
      if (typeof cameraStabilitySanitize === 'function') cameraStabilitySanitize();
      lastChunkX = Number.NaN;
      lastChunkZ = Number.NaN;
      updateChunks(true);
    } catch (err) {
      console.warn('[continuity] resume', err);
    }
  });
}

document.addEventListener('visibilitychange', continuityResumeView, false);
window.addEventListener('pageshow', continuityResumeView, false);
window.addEventListener('orientationchange', function() { setTimeout(continuityResumeView, 180); }, false);

// -----------------------------------------------------------------------------
// 5) Keep the animation loop alive even if a non-render optional effect throws.
// Base animate schedules the next RAF before doing frame work, so catching here
// prevents a transient feature error from surfacing as a visible interruption.
// -----------------------------------------------------------------------------
var continuityBaseAnimate = animate;
animate = function() {
  try {
    continuityBaseAnimate();
  } catch (err) {
    console.warn('[continuity] frame recovered', err);
    continuityResetRenderGuards();
  }
};
