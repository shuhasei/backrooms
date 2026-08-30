// Adjustable look sensitivity
// Raises the default camera sensitivity and exposes a 60%-300% slider for both
// mouse pointer-lock and touch drag look. Value is persisted per browser.

var LOOK_SENSITIVITY_DEFAULT = 1.50;
var LOOK_SENSITIVITY_MIN = .60;
var LOOK_SENSITIVITY_MAX = 3.00;
var lookSensitivity = LOOK_SENSITIVITY_DEFAULT;

try {
  var storedLookSensitivity = Number(localStorage.getItem('backrooms-look-sensitivity'));
  if (Number.isFinite(storedLookSensitivity)) {
    lookSensitivity = THREE.MathUtils.clamp(storedLookSensitivity, LOOK_SENSITIVITY_MIN, LOOK_SENSITIVITY_MAX);
  }
} catch (_) {}

function applyLookSensitivity(value, persist) {
  lookSensitivity = THREE.MathUtils.clamp(Number(value) || LOOK_SENSITIVITY_DEFAULT, LOOK_SENSITIVITY_MIN, LOOK_SENSITIVITY_MAX);

  // PointerLockControls' original base value was .68. Default is now 150%, so
  // the initial mouse sensitivity is noticeably faster while remaining usable.
  controls.pointerSpeed = .68 * lookSensitivity;

  if (persist) {
    try { localStorage.setItem('backrooms-look-sensitivity', String(lookSensitivity)); } catch (_) {}
  }

  var slider = document.querySelector('#lookSensitivity');
  var output = document.querySelector('#lookSensitivityValue');
  if (slider) slider.value = String(Math.round(lookSensitivity * 100));
  if (output) output.textContent = `${Math.round(lookSensitivity * 100)}%`;
}

// -----------------------------------------------------------------------------
// Menu control
// -----------------------------------------------------------------------------
var lookSensitivityBox = document.createElement('div');
lookSensitivityBox.id = 'lookSensitivityBox';
lookSensitivityBox.innerHTML = `
  <label class="look-sensitivity-label" for="lookSensitivity">
    <span>視点感度</span>
    <b id="lookSensitivityValue">150%</b>
  </label>
  <input id="lookSensitivity" type="range" min="60" max="300" step="5" value="150" />
  <div class="look-sensitivity-note">マウス / タッチ視点に反映</div>
`;

var menuGrid = menu.querySelector('.menuGrid');
if (menuGrid) menuGrid.insertAdjacentElement('afterend', lookSensitivityBox);
else menu.appendChild(lookSensitivityBox);

var lookSensitivityStyle = document.createElement('style');
lookSensitivityStyle.textContent = `
  #lookSensitivityBox{
    margin:10px 0 6px;padding:9px 10px;border:1px solid #ffffff1f;
    background:#090b09a8;border-radius:6px
  }
  .look-sensitivity-label{display:flex;justify-content:space-between;align-items:center;
    gap:12px;font:700 11px ui-monospace,Consolas,monospace;letter-spacing:.05em}
  #lookSensitivity{width:100%;margin:7px 0 3px;accent-color:#d8c66d}
  .look-sensitivity-note{font:600 9px ui-monospace,Consolas,monospace;opacity:.58}
`;
document.head.appendChild(lookSensitivityStyle);

var lookSensitivitySlider = lookSensitivityBox.querySelector('#lookSensitivity');
lookSensitivitySlider.addEventListener('input', function() {
  applyLookSensitivity(Number(this.value) / 100, true);
});

// -----------------------------------------------------------------------------
// Touch look override
// setupRuntime installs its own fixed-speed touch pointermove listener later.
// A capture-phase listener runs first and stops only touch pointermove events, so
// we can use the adjustable sensitivity without changing the base runtime file.
// -----------------------------------------------------------------------------
var lookTouchId = null;
var lookTouchX = 0;
var lookTouchY = 0;

renderer.domElement.addEventListener('pointerdown', function(e) {
  if (e.pointerType !== 'touch') return;
  lookTouchId = e.pointerId;
  lookTouchX = e.clientX;
  lookTouchY = e.clientY;
}, true);

renderer.domElement.addEventListener('pointermove', function(e) {
  if (e.pointerType !== 'touch' || e.pointerId !== lookTouchId || gyro.enabled) return;

  var dx = e.clientX - lookTouchX;
  var dy = e.clientY - lookTouchY;
  lookTouchX = e.clientX;
  lookTouchY = e.clientY;

  camera.rotation.y -= dx * .0045 * lookSensitivity;
  camera.rotation.x = THREE.MathUtils.clamp(
    camera.rotation.x - dy * .0042 * lookSensitivity,
    -1.36,
    1.36
  );

  // Prevent the later fixed-speed base touch listener from applying a second turn.
  e.stopImmediatePropagation();
}, true);

function lookSensitivityRelease(e) {
  if (e.pointerId === lookTouchId) lookTouchId = null;
}
renderer.domElement.addEventListener('pointerup', lookSensitivityRelease, true);
renderer.domElement.addEventListener('pointercancel', lookSensitivityRelease, true);

applyLookSensitivity(lookSensitivity, false);
