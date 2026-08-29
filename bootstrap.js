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

try {
  const sources = await Promise.all(parts.map(async (src) => {
    const response = await fetch(src, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to load ${src}: ${response.status}`);
    return `\n// ---- ${src} ----\n${await response.text()}`;
  }));

  const script = document.createElement('script');
  script.textContent = sources.join('\n');
  document.body.appendChild(script);
} catch (error) {
  console.error(error);
  const status = document.querySelector('#status');
  if (status) status.textContent = 'runtime load error';
}
