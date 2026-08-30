import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createEnemy, enemyStats, animateEnemy, disposeEnemy } from './enemy-models.js';

Object.assign(globalThis, {
  THREE,
  PointerLockControls,
  EffectComposer,
  RenderPass,
  ShaderPass,
  createEnemy,
  enemyStats,
  animateEnemy,
  disposeEnemy,
});

// Important: prelude must load before game-core because game-core creates
// procedural textures immediately while it is being evaluated.
// world-fix and room-stability patch streamed room generation.
// network-v2 replaces the older PeerJS helpers.
// authoritative-ai must load after network-v2 so host authority and enemy sync
// wrap the final networking functions.
// player-avatar replaces the minimal remote-player primitive with an animated
// orange hazmat teammate.
// immersive-horror adds spatial audio, proximity voice, gaze AI, VHS post FX and
// dead reckoning before setupRuntime installs the final handlers in game-assets.
const parts = [
  './prelude.js',
  './game-core.js',
  './world-fix.js',
  './room-stability.js',
  './game-logic.js',
  './game-runtime.js',
  './network-v2.js',
  './authoritative-ai.js',
  './player-avatar.js',
  './immersive-horror.js',
  './game-assets.js',
];

for (const src of parts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${src}?v=20260830h`;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}
