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

const parts = [
  './game-core.js',
  './game-logic.js',
  './game-runtime.js',
  './game-assets.js',
];

for (const src of parts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}
