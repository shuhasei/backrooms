import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createEnemy, enemyStats, animateEnemy, disposeEnemy } from './enemy-models.js';

Object.assign(globalThis, {
  THREE,
  PointerLockControls,
  createEnemy,
  enemyStats,
  animateEnemy,
  disposeEnemy,
});

// Important: prelude must load before game-core because game-core creates
// procedural textures immediately while it is being evaluated.
const parts = [
  './prelude.js',
  './game-core.js',
  './world-fix.js',
  './game-logic.js',
  './game-runtime.js',
  './game-assets.js',
];

for (const src of parts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${src}?v=20260830c`;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}
