// Core game-loop guarantee
// Makes the four essential gameplay pillars explicit and always available:
// 1) a real host-authoritative enemy encounter, 2) microphone -> enemy hearing,
// 3) physical loot + camera-ray E interaction, 4) a visible locked exit that
// transitions the synchronized party to the next level.

var CORE_GAME_ENEMY_GRACE = 14;
var CORE_GAME_MIC_THRESHOLD = .085;
var CORE_GAME_MIC_INTERVAL = .16;
var coreGameLastMicNoiseAt = -999;
var coreGameGoal = null;
var coreGameRaycaster = new THREE.Raycaster();
var coreGameRayDir = new THREE.Vector3();
var coreGameGoalDir = new THREE.Vector3();
var coreGameGoalMaterial = null;
var coreGameLockMaterial = null;

function coreGameIsAuthority() {
  return net.mode !== 'client';
}

function coreGameIsSafeFloor() {
  return encounter.profile?.mode === 'safe';
}

// -----------------------------------------------------------------------------
// 1) ENEMY: guarantee an actual encounter instead of leaving THREAT as UI only.
// AI movement/pathfinding/collision remain in authoritative-ai.js.
// -----------------------------------------------------------------------------
function coreGameEnsureEnemy() {
  if (!coreGameIsAuthority() || coreGameIsSafeFloor()) return;
  if (entities.length) return;
  if (typeof survivalState !== 'undefined' && !survivalState.alive) return;

  var age = elapsed - (encounter.levelStartedAt || 0);
  var pressureReady = encounter.pressure >= Math.max(.40, (encounter.profile?.spawnAt || .65) * .72);
  if (encounter.profile?.mode === 'forced' || age >= CORE_GAME_ENEMY_GRACE || pressureReady) {
    spawnOneEntity(encounter.profile?.mode === 'forced');
    encounter.spawnCooldown = Math.max(encounter.spawnCooldown || 0, 8);
  }
}

var coreGameBaseUpdateEncounter = updateEncounter;
updateEncounter = function(dt) {
  coreGameBaseUpdateEncounter(dt);
  coreGameEnsureEnemy();

  if (entities.length && encounter.profile?.mode !== 'safe') {
    var chasing = false;
    for (var e of entities) {
      if (e.aiState === 'CHASE' || (e.chaseUntil || 0) > elapsed) { chasing = true; break; }
    }
    if (chasing) {
      threatStateEl.textContent = 'DANGER';
      threatMeter.style.transform = 'scaleX(1)';
    } else if (encounter.pressure < .28) {
      // The player should know something is actually present even before chase.
      threatStateEl.textContent = 'WATCHED';
      threatMeter.style.transform = `scaleX(${Math.max(.24, encounter.pressure)})`;
    }
  }
};

// -----------------------------------------------------------------------------
// 2) MICROPHONE: use real RMS level as a world-space hearing event.
// This replaces the immersive helper itself so its existing updateMic wrapper
// calls this guaranteed implementation exactly once rather than double-sending.
// -----------------------------------------------------------------------------
if (typeof immersiveSendVoiceNoise === 'function') {
  immersiveSendVoiceNoise = function() {
    if (!mic.enabled || mic.level < CORE_GAME_MIC_THRESHOLD) return;
    if (elapsed - coreGameLastMicNoiseAt < CORE_GAME_MIC_INTERVAL) return;
    coreGameLastMicNoiseAt = elapsed;

    var strength = THREE.MathUtils.clamp((mic.level - .045) * 2.05, .10, 1);
    if (net.mode === 'client' && net.hostConn?.open) {
      try {
        net.hostConn.send({
          type: 'voice_noise',
          strength: round2(strength),
          x: round2(camera.position.x),
          z: round2(camera.position.z),
        });
      } catch (_) {}
    } else {
      emitNoiseAt(strength, camera.position.x, camera.position.z, 'voice');
    }
  };
}

// Intercept the final network chain so a guest's voice is always converted into
// an authoritative sound coordinate on the host. The client-provided coordinates
// are ignored; the host's last known player position is used instead.
var coreGameBaseHandleNetworkData = handleNetworkData;
handleNetworkData = function(data, conn) {
  if (data?.type === 'voice_noise' && net.mode === 'host') {
    var rp = remotePlayers.get(conn.peer);
    if (rp) {
      var strength = THREE.MathUtils.clamp(Number(data.strength) || 0, 0, 1);
      emitNoiseAt(strength, rp.target.x, rp.target.z, 'remote-voice');
    }
    return;
  }
  coreGameBaseHandleNetworkData(data, conn);
};

// -----------------------------------------------------------------------------
// 3) ITEMS: guarantee host-created physical loot and true camera-ray E pickup.
// Existing survival-gameplay owns the Mesh/inventory implementation and
// multiplayer-advanced owns authoritative pickup validation.
// -----------------------------------------------------------------------------
function coreGameEnsureLoot() {
  if (!coreGameIsAuthority()) return;
  var available = 0;
  for (var item of survivalLoot.values()) if (!item.claimed) available++;
  if (available > 0) return;

  // The wrapped builder creates Battery, Almond Water, Medkit, Key, cans and the
  // Escape Code, and records their ownership in survivalLoot.
  survivalBuildHostLoot();
  if (net.mode === 'host') setTimeout(function(){ broadcast(survivalLootStatePacket()); }, 80);
}

function coreGameRaycastLoot() {
  if (!survivalState.alive) return null;
  camera.getWorldDirection(coreGameRayDir);
  coreGameRaycaster.set(camera.position, coreGameRayDir);
  coreGameRaycaster.near = .04;
  coreGameRaycaster.far = INTERACT_DISTANCE + .65;

  var roots = [];
  for (var item of survivalLoot.values()) {
    if (!item.claimed && item.group?.visible !== false) roots.push(item.group);
  }
  if (!roots.length) return null;

  var hits = coreGameRaycaster.intersectObjects(roots, true);
  for (var hit of hits) {
    var o = hit.object;
    var id = o?.userData?.survivalLootId;
    while (!id && o?.parent) {
      o = o.parent;
      id = o?.userData?.survivalLootId;
    }
    if (!id) continue;
    var item = survivalLoot.get(id);
    if (item && !item.claimed) return item;
  }
  return null;
}

// -----------------------------------------------------------------------------
// 4) GOAL: put a visible exit in every level from the beginning.
// It is locked until the level objective is complete OR the team has an escape
// code / player uses a Key. It reuses exitPortal so existing host validation and
// synchronized nextLevel() logic remain compatible.
// -----------------------------------------------------------------------------
function coreGameGoalUnlocked() {
  var puzzleDone = !!objectiveState && objectiveState.total > 0 && objectiveState.solved >= objectiveState.total;
  var hasKey = !!survivalState?.inventory?.includes('key');
  var hasCode = typeof gameplayTeamHasCode !== 'undefined' && !!gameplayTeamHasCode;
  return puzzleDone || hasKey || hasCode;
}

function coreGameMakeGoal() {
  if (exitPortal?.userData?.coreGameGoal) {
    coreGameGoal = exitPortal;
    return;
  }

  // If a legacy exit was already spawned after a completed puzzle, keep it.
  if (exitPortal && !exitPortal.userData?.coreGameGoal) return;

  var rng = mulberry32(hash3(0x3e71, currentLevelIndex + 1, 0x7719));
  var p = findWalkablePoint(14, 22, rng);
  var g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  g.userData.coreGameGoal = true;

  coreGameGoalMaterial = coreGameGoalMaterial || new THREE.MeshStandardMaterial({
    color: 0x171612,
    roughness: .72,
    metalness: .18,
    emissive: 0x151206,
    emissiveIntensity: .22,
  });
  coreGameLockMaterial = coreGameLockMaterial || new THREE.MeshStandardMaterial({
    color: 0x8f251b,
    roughness: .58,
    emissive: 0x4a0905,
    emissiveIntensity: .55,
  });

  var door = new THREE.Mesh(geo.box, coreGameGoalMaterial);
  door.scale.set(1.18, 1.95, .16);
  door.position.y = .98;

  var frameTop = new THREE.Mesh(geo.box, materials.portal);
  frameTop.scale.set(1.48, .10, .22);
  frameTop.position.y = 2.02;
  var frameL = new THREE.Mesh(geo.box, materials.portal);
  frameL.scale.set(.10, 2.02, .22);
  frameL.position.set(-1.26, 1.0, 0);
  var frameR = frameL.clone();
  frameR.position.x = 1.26;

  var lock = new THREE.Mesh(geo.box, coreGameLockMaterial);
  lock.scale.set(.18, .25, .09);
  lock.position.set(.52, 1.02, -.19);
  lock.userData.coreLock = true;

  var lamp = new THREE.PointLight(0xffb45d, 1.4, 4.5, 2.0);
  lamp.position.set(0, 1.95, -.28);
  lamp.castShadow = false;

  g.add(door, frameTop, frameL, frameR, lock, lamp);
  g.userData.door = door;
  g.userData.lock = lock;
  g.userData.lamp = lamp;
  scene.add(g);
  exitPortal = g;
  coreGameGoal = g;
}

function coreGameUpdateGoalVisual() {
  if (!coreGameGoal || coreGameGoal.parent !== scene) return;
  var unlocked = coreGameGoalUnlocked();
  var lock = coreGameGoal.userData.lock;
  var lamp = coreGameGoal.userData.lamp;
  if (lock) {
    lock.visible = !unlocked;
    if (unlocked) lock.material = materials.objectiveDone || coreGameLockMaterial;
  }
  if (lamp) {
    lamp.color.set(unlocked ? 0x9fff87 : 0xffa24e);
    lamp.intensity = unlocked ? 2.2 : 1.25;
  }
}

function coreGameObjectiveText() {
  var theme = LEVELS[currentLevelIndex];
  var solved = objectiveState?.solved || 0;
  var total = objectiveState?.total || theme.count || 0;
  var label = theme.puzzle === 'collect' ? 'ヒューズ回収' : theme.puzzle === 'terminals' ? '端末起動' : 'シーケンス解除';
  if (coreGameGoalUnlocked()) return `${label} ${solved}/${total} · EXIT OPEN`;
  return `${label} ${solved}/${total} · EXIT LOCKED`;
}

var coreGameBaseSwitchLevel = switchLevel;
switchLevel = function(index, silent) {
  coreGameGoal = null;
  coreGameBaseSwitchLevel(index, silent);
  setTimeout(function() {
    try {
      coreGameEnsureLoot();
      coreGameMakeGoal();
      coreGameUpdateGoalVisual();
      objectiveEl.textContent = coreGameObjectiveText();
    } catch (err) {
      console.warn('[core-game] level setup', err);
    }
  }, 40);
};

var coreGameBaseUpdateInteraction = updateInteraction;
updateInteraction = function() {
  coreGameBaseUpdateInteraction();

  coreGameEnsureEnemy();
  coreGameUpdateGoalVisual();
  if (objectiveState) objectiveEl.textContent = coreGameObjectiveText();

  // Aimed loot always wins over proximity-based objective interaction.
  var loot = coreGameRaycastLoot();
  if (loot) {
    currentInteract = { kind:'survival-loot', item:loot };
    interactionEl.textContent = `[E] ${survivalLootCatalog[loot.type]?.name || loot.type} を拾う`;
    return;
  }

  if (!coreGameGoal || coreGameGoal.parent !== scene) return;
  var dist = distanceXZ(camera.position, coreGameGoal.position);
  if (dist > INTERACT_DISTANCE + .85) return;

  camera.getWorldDirection(coreGameRayDir);
  coreGameGoalDir.copy(coreGameGoal.position).sub(camera.position).setY(0);
  if (coreGameGoalDir.lengthSq() > .001) coreGameGoalDir.normalize();
  var flatView = coreGameRayDir.setY(0).normalize();
  if (flatView.dot(coreGameGoalDir) < .34) return;

  currentInteract = { kind:'core-goal' };
  interactionEl.textContent = coreGameGoalUnlocked() ? '[E] LEVEL CLEAR / 次のレベルへ' : '[E] EXIT LOCKED · 目的達成 / KEY / CODE';
};

var coreGameBaseInteract = interact;
interact = function() {
  if (currentInteract?.kind === 'core-goal') {
    if (!coreGameGoalUnlocked()) {
      playErrorTone();
      showToast('出口はロックされています。目的を達成するか、KEY / EXIT CODE を探してください');
      return;
    }

    // Consume a key only when it is the thing that unlocked this exit.
    var puzzleDone = !!objectiveState && objectiveState.solved >= objectiveState.total;
    var hasCode = typeof gameplayTeamHasCode !== 'undefined' && !!gameplayTeamHasCode;
    if (!puzzleDone && !hasCode && survivalState.inventory.includes('key')) survivalConsumeType('key');

    if (typeof gameplayShowLevelClear === 'function') gameplayShowLevelClear();
    showToast('LEVEL CLEAR');
    nextLevel();
    return;
  }
  coreGameBaseInteract();
};

// setupRuntime calls switchLevel after all layers load, so the first level receives
// the visible goal and loot automatically. This fallback also covers hot reloads.
setTimeout(function() {
  try {
    coreGameEnsureLoot();
    coreGameMakeGoal();
    coreGameUpdateGoalVisual();
  } catch (_) {}
}, 250);
