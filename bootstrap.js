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
// network-v2 replaces the older PeerJS helpers.
// authoritative-ai must load after network-v2 so host authority and enemy sync
// wrap the final networking functions before setupRuntime installs handlers.
const parts = [
  './prelude.js',
  './game-core.js',
  './world-fix.js',
  './game-logic.js',
  './game-runtime.js',
  './network-v2.js',
  './authoritative-ai.js',
  './game-assets.js',
];

for (const src of parts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${src}?v=20260830e`;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}
