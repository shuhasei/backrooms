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
// network-v2 must load after game-runtime (it replaces the older PeerJS helpers)
// and before game-assets (setupRuntime installs the final button handlers there).
const parts = [
  './prelude.js',
  './game-core.js',
  './world-fix.js',
  './game-logic.js',
  './game-runtime.js',
  './network-v2.js',
  './game-assets.js',
];

for (const src of parts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${src}?v=20260830d`;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}
