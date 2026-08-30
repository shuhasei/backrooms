// Full specification integration layer
// Enforces the requested end-state without replacing the original room generator.
// Existing modules already provide survival/inventory/sanity, host loot ownership,
// A* AI, spatial voice/audio, VHS/PBR, ambush logic and death/spectator systems.
// This final layer closes the remaining gaps: 20 Hz player state sync with dead
// reckoning, a lightweight bone-rigged 3D wire entity, explicit authoritative
// state metadata, and a low-cost atmospheric lighting/audio consistency pass.

var FULLSPEC_STATE_HZ = 20;
var FULLSPEC_MAX_PREDICTION = .16;
var fullSpecLastStateAt = -999;
var fullSpecLastLocalX = camera.position.x;
var fullSpecLastLocalZ = camera.position.z;
var fullSpecLastLocalAt = elapsed;
var fullSpecWireShared = null;

// Keep enemy synchronization at the requested ~20 Hz. gameplay-v2 also sets this,
// but doing it here makes the final contract explicit after every previous layer.
try { AI_SYNC_HZ = 20; } catch (_) {}

// -----------------------------------------------------------------------------
// 1) 20 Hz player synchronization + dead reckoning
// -----------------------------------------------------------------------------
function fullSpecPlayerPacket() {
  var now = elapsed;
  var dt = Math.max(.001, now - fullSpecLastLocalAt);
  var vx = (camera.position.x - fullSpecLastLocalX) / dt;
  var vz = (camera.position.z - fullSpecLastLocalZ) / dt;
  fullSpecLastLocalX = camera.position.x;
  fullSpecLastLocalZ = camera.position.z;
  fullSpecLastLocalAt = now;

  return {
    type: 'state',
    id: net.id,
    p: [round2(camera.position.x), round2(EYE_HEIGHT), round2(camera.position.z)],
    r: [round2(camera.rotation.y), round2(camera.rotation.x)],
    v: [round2(vx), round2(vz)],
    level: currentLevelIndex,
    mic: round2(mic.level),
    light: !!flashlightOn,
    run: !!sprinting,
    alive: typeof survivalState !== 'undefined' ? !!survivalState.alive : true,
    emote: typeof survivalState !== 'undefined' ? (survivalState.emote || '') : '',
    t: Math.round(now * 1000),
  };
}

var fullSpecBaseUpdateNetworking = updateNetworking;
updateNetworking = function() {
  // Send movement first and update net.lastSend so the older 10 Hz sender inside
  // network-v2 remains suppressed. Ping, AI, gaze and player-status wrappers use
  // their own timers and still execute when the base chain runs below.
  if (net.peer && elapsed - fullSpecLastStateAt >= 1 / FULLSPEC_STATE_HZ) {
    fullSpecLastStateAt = elapsed;
    net.lastSend = elapsed;
    var packet = fullSpecPlayerPacket();
    if (net.mode === 'host') {
      broadcast(packet);
    } else if (net.mode === 'client' && net.hostConn?.open && (net.hostConn.bufferSize || 0) < 112) {
      try { net.hostConn.send(packet); } catch (_) {}
    }
  }
  fullSpecBaseUpdateNetworking();
};

var fullSpecBaseUpdateRemoteState = updateRemoteState;
updateRemoteState = function(id, data) {
  fullSpecBaseUpdateRemoteState(id, data);
  var rp = remotePlayers.get(id);
  if (!rp || !Array.isArray(data?.p)) return;

  if (!rp.netAuthoritativeTarget) rp.netAuthoritativeTarget = new THREE.Vector3();
  if (!rp.netVelocity) rp.netVelocity = new THREE.Vector3();

  // If an older packet has no velocity, estimate it from authoritative samples.
  var now = elapsed;
  if (Array.isArray(data.v) && data.v.length >= 2) {
    rp.netVelocity.set(Number(data.v[0]) || 0, 0, Number(data.v[1]) || 0);
  } else if (rp.netSampleAt) {
    var sampleDt = Math.max(.001, now - rp.netSampleAt);
    rp.netVelocity.set(
      ((Number(data.p[0]) || 0) - rp.netAuthoritativeTarget.x) / sampleDt,
      0,
      ((Number(data.p[2]) || 0) - rp.netAuthoritativeTarget.z) / sampleDt
    );
  }

  rp.netAuthoritativeTarget.set(Number(data.p[0]) || 0, 0, Number(data.p[2]) || 0);
  rp.netSampleAt = now;
  rp.running = typeof data.run === 'boolean' ? data.run : rp.running;
  if (typeof data.alive === 'boolean') rp.alive = data.alive;
  if (typeof data.emote === 'string') rp.emote = data.emote;
};

var fullSpecBaseUpdateRemotePlayers = updateRemotePlayers;
updateRemotePlayers = function(dt) {
  // Predict only a short interval. The existing avatar interpolation then eases
  // toward this prediction, avoiding both visible warps and runaway extrapolation.
  for (var rp of remotePlayers.values()) {
    if (!rp.netAuthoritativeTarget || !rp.netVelocity) continue;
    var age = THREE.MathUtils.clamp(elapsed - (rp.netSampleAt || elapsed), 0, FULLSPEC_MAX_PREDICTION);
    rp.target.set(
      rp.netAuthoritativeTarget.x + rp.netVelocity.x * age,
      0,
      rp.netAuthoritativeTarget.z + rp.netVelocity.z * age
    );
  }
  fullSpecBaseUpdateRemotePlayers(dt);
};

// -----------------------------------------------------------------------------
// 2) Bone-rigged 3D wire/Bacteria-style entity
// Other entity kinds keep the low-cost Sprite billboard path from gameplay-v2.
// -----------------------------------------------------------------------------
function fullSpecWireResources() {
  if (fullSpecWireShared) return fullSpecWireShared;

  var bodyGeo = new THREE.CylinderGeometry(.13, .19, 2.72, 6, 12, true);
  var pos = bodyGeo.attributes.position;
  var skinIndices = [];
  var skinWeights = [];
  var boneCount = 7;
  for (var i = 0; i < pos.count; i++) {
    var y = pos.getY(i);
    var u = THREE.MathUtils.clamp((y + 1.36) / 2.72, 0, 1) * (boneCount - 1);
    var a = Math.floor(u);
    var b = Math.min(boneCount - 1, a + 1);
    var t = u - a;
    skinIndices.push(a, b, 0, 0);
    skinWeights.push(1 - t, t, 0, 0);
  }
  bodyGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  bodyGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  var wireMat = new THREE.MeshStandardMaterial({
    color: 0x060706,
    roughness: .96,
    metalness: .02,
    emissive: 0x010201,
    emissiveIntensity: .08,
    side: THREE.DoubleSide,
  });
  var tendonMat = new THREE.MeshStandardMaterial({ color: 0x090a08, roughness: .98 });
  var jointGeo = new THREE.IcosahedronGeometry(.18, 0);
  var limbGeo = new THREE.CylinderGeometry(.035, .055, 1, 5, 1);

  fullSpecWireShared = { bodyGeo, wireMat, tendonMat, jointGeo, limbGeo, boneCount };
  return fullSpecWireShared;
}

function fullSpecMakeLimb(parent, x, y, z, length, radius, rx, rz, material) {
  var r = fullSpecWireResources();
  var m = new THREE.Mesh(r.limbGeo, material || r.tendonMat);
  m.position.set(x, y, z);
  m.scale.set(radius / .05, length, radius / .05);
  m.rotation.x = rx || 0;
  m.rotation.z = rz || 0;
  m.castShadow = false;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

function fullSpecBuildWireRig(e) {
  if (!e || e.kind !== 'wire' || e.fullSpecWireRig) return;
  var r = fullSpecWireResources();
  if (e.billboardSprite) e.billboardSprite.visible = false;

  var bones = [];
  var root = new THREE.Bone();
  root.position.y = -1.36;
  bones.push(root);
  var previous = root;
  for (var i = 1; i < r.boneCount; i++) {
    var bone = new THREE.Bone();
    bone.position.y = 2.72 / (r.boneCount - 1);
    previous.add(bone);
    bones.push(bone);
    previous = bone;
  }

  var skeleton = new THREE.Skeleton(bones);
  var skin = new THREE.SkinnedMesh(r.bodyGeo, r.wireMat);
  skin.add(root);
  skin.bind(skeleton);
  skin.position.y = 1.36;
  skin.scale.set(.78, 1, .78);
  skin.frustumCulled = false;
  skin.castShadow = false;
  skin.receiveShadow = false;

  // Human-adjacent head and long asymmetric tendrils are attached to bones so
  // they inherit the same procedural motion without requiring a heavy GLB model.
  var head = new THREE.Mesh(r.jointGeo, r.tendonMat);
  head.scale.set(.72, 1.22, .62);
  head.position.set(0, .13, 0);
  bones[bones.length - 1].add(head);

  var upper = bones[4];
  var mid = bones[3];
  var lower = bones[1];
  var tendrils = [];
  tendrils.push(fullSpecMakeLimb(upper, -.34, .02, 0, 1.15, .055, .15, -.58));
  tendrils.push(fullSpecMakeLimb(upper, .36, -.04, .02, 1.38, .045, -.12, .70));
  tendrils.push(fullSpecMakeLimb(mid, -.45, -.02, .02, 1.65, .048, .08, -.92));
  tendrils.push(fullSpecMakeLimb(mid, .43, .01, -.01, 1.42, .050, -.05, .88));
  tendrils.push(fullSpecMakeLimb(lower, -.22, -.14, .01, 1.36, .065, 0, -.28));
  tendrils.push(fullSpecMakeLimb(lower, .23, -.16, -.01, 1.55, .060, 0, .31));

  // Thin crown filaments make the silhouette recognizable at distance.
  var crown = bones[bones.length - 1];
  for (var c = 0; c < 5; c++) {
    var angle = (c / 5) * Math.PI * 2;
    tendrils.push(fullSpecMakeLimb(crown, Math.cos(angle)*.11, .28, Math.sin(angle)*.11, .72 + c*.08, .026, Math.sin(angle)*.28, Math.cos(angle)*.52));
  }

  e.group.add(skin);
  e.fullSpecWireRig = { skin, skeleton, bones, tendrils, head };
}

var fullSpecBaseCreateEnemy = createEnemy;
createEnemy = function(kind, M, G) {
  var e = fullSpecBaseCreateEnemy(kind, M, G);
  if (kind === 'wire') fullSpecBuildWireRig(e);
  return e;
};

function fullSpecAnimateWire(e) {
  if (!e?.fullSpecWireRig) return;
  var rig = e.fullSpecWireRig;
  var seen = false;
  try { seen = isEntityInView(e, .70); } catch (_) {}
  var chase = e.aiState === 'CHASE' || (e.chaseUntil || 0) > elapsed;
  var motion = seen ? .045 : chase ? 1.45 : .62;
  var speed = chase ? 4.7 : 2.1;
  for (var i = 1; i < rig.bones.length; i++) {
    rig.bones[i].rotation.z = Math.sin(elapsed * speed + i * .84 + (e.phase || 0)) * .14 * motion;
    rig.bones[i].rotation.x = Math.cos(elapsed * speed * .73 + i * .58) * .075 * motion;
  }
  rig.head.rotation.y = Math.sin(elapsed * (chase ? 5.2 : 2.0) + (e.phase || 0)) * .24 * motion;
  for (var j = 0; j < rig.tendrils.length; j++) {
    rig.tendrils[j].rotation.y = Math.sin(elapsed * (1.6 + (j % 4)*.25) + j) * .18 * motion;
  }
}

var fullSpecBaseUpdateEntities = updateEntities;
updateEntities = function(dt) {
  fullSpecBaseUpdateEntities(dt);
  for (var e of entities) {
    if (e.kind === 'wire') {
      fullSpecBuildWireRig(e);
      if (e.billboardSprite) e.billboardSprite.visible = false;
      fullSpecAnimateWire(e);
    }
  }
};

// -----------------------------------------------------------------------------
// 3) Host-authoritative contract hardening
// -----------------------------------------------------------------------------
// Loot pickup is already validated by advancedHostClaimLoot. This guard prevents
// a stale/dead guest from attempting pickup requests during spectator mode.
var fullSpecBasePickupRequest = survivalPickupRequest;
survivalPickupRequest = function(id) {
  if (typeof survivalState !== 'undefined' && !survivalState.alive) return;
  fullSpecBasePickupRequest(id);
};

// Clients must never run encounter spawning/AI. authoritative-ai already enforces
// this; keep that guarantee explicit even after later patches.
var fullSpecBaseSpawnEntities = spawnEntities;
spawnEntities = function() {
  if (net.mode === 'client') {
    clearEntities();
    resetEncounter();
    return;
  }
  fullSpecBaseSpawnEntities();
};

// -----------------------------------------------------------------------------
// 4) Rendering consistency: ACES/PBR/VHS remain enabled; volumetric atmosphere is
// represented by scene fog and smooth light spill, not visible dust particles.
// -----------------------------------------------------------------------------
var fullSpecBaseApplyTheme = applyTheme;
applyTheme = function(theme) {
  fullSpecBaseApplyTheme(theme);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  // Preserve intentionally dark levels, but maintain enough fog everywhere else
  // for flashlight/fluorescent light to feel suspended in the air without dots.
  if (!['Level 6','Level !'].includes(theme?.name) && scene.fog?.isFogExp2) {
    scene.fog.density = THREE.MathUtils.clamp(scene.fog.density, .012, .019);
  }
  if (materials.wall) materials.wall.roughness = Math.max(.82, materials.wall.roughness);
  if (materials.floor) materials.floor.roughness = Math.max(.86, materials.floor.roughness);
};

// -----------------------------------------------------------------------------
// 5) Audio consistency: keep strong wall occlusion and floor-dependent reverb.
// Existing immersive/precision nodes do the heavy lifting; this only tunes their
// ranges after all patches have loaded.
// -----------------------------------------------------------------------------
try {
  IMMERSIVE_ENEMY_AUDIO_MAX_DISTANCE = 36;
  IMMERSIVE_VOICE_MAX_DISTANCE = 26;
} catch (_) {}

// Keep voice high-frequency loss severe through multiple walls while avoiding a
// full hard mute, so players can still perceive distant presence.
if (typeof immersiveUpdateVoiceSpatial === 'function') {
  var fullSpecBaseVoiceSpatial = immersiveUpdateVoiceSpatial;
  immersiveUpdateVoiceSpatial = function() {
    fullSpecBaseVoiceSpatial();
    if (!audioState?.ctx) return;
    for (var entry of immersiveVoiceNodes) {
      var id = entry[0], node = entry[1];
      var rp = remotePlayers.get(id);
      if (!rp) continue;
      var p = rp.group?.position || rp.target;
      var blocked = lineOccluded(camera.position.x, camera.position.z, p.x, p.z);
      if (blocked) {
        node.filter.frequency.setTargetAtTime(Math.min(node.filter.frequency.value, 920), audioState.ctx.currentTime, .08);
      }
    }
  };
}

// -----------------------------------------------------------------------------
// Compact runtime hint. No additional permanent HUD text is added.
// -----------------------------------------------------------------------------
var fullSpecHint = document.createElement('div');
fullSpecHint.style.cssText = 'margin-top:5px;opacity:.48;font:600 9px ui-monospace,monospace';
fullSpecHint.textContent = 'CO-OP: host authoritative · 20Hz sync · A* AI · spatial audio';
menu.appendChild(fullSpecHint);
