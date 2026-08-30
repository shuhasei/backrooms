import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { createEnemy, enemyStats, animateEnemy, disposeEnemy } from './enemy-models.js';

Object.assign(globalThis, {
  THREE,
  PointerLockControls,
  EffectComposer,
  RenderPass,
  ShaderPass,
  DecalGeometry,
  createEnemy,
  enemyStats,
  animateEnemy,
  disposeEnemy,
});

// Base definitions first. We intentionally keep the original room generator from
// game-core.js; geometry-changing world-fix/room-stability patches are not loaded.
const parts = [
  './prelude.js',
  './game-core.js',
  './game-logic.js',
  './game-runtime.js',
  './game-assets.js',
  './camera-stability-lite.js',
  './network-v2.js',
  './authoritative-ai.js',
  './player-avatar.js',
  './immersive-horror.js',
  './survival-gameplay.js',
  './multiplayer-advanced.js',
  './survival-fixes.js',
  './precision-systems.js',
  './gameplay-v2.js',
  './lens-realism.js',
  './reference-polish.js',
  './starter-lighting.js',
];

for (const src of parts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${src}?v=20260830r`;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

setupRuntime();
