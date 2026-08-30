// Immersive horror systems
// - 3D enemy audio + wall occlusion
// - P2P proximity voice chat with enemy eavesdropping
// - Ray-based gaze / blink behaviour and light-sensitive frenzy
// - Single-pass VHS post processing
// - Enemy dead reckoning for smoother P2P sync

var IMMERSIVE_VOICE_MAX_DISTANCE = 24;
var IMMERSIVE_VOICE_REF_DISTANCE = 1.5;
var IMMERSIVE_ENEMY_AUDIO_MAX_DISTANCE = 34;
var IMMERSIVE_VOICE_NOISE_THRESHOLD = .115;
var IMMERSIVE_VOICE_NOISE_INTERVAL = .18;
var IMMERSIVE_GAZE_SEND_HZ = 8;

var immersiveVoiceCalls = new Map();
var immersiveVoiceNodes = new Map();
var immersiveVoiceRoster = new Set();
var immersiveEnemyAudio = new Map();
var immersiveEnemyBuffers = new Map();
var immersiveLastVoiceNoiseAt = -999;
var immersiveLastGazeSendAt = -999;
var immersiveLastBlink = false;
var immersiveRaycaster = new THREE.Raycaster();
var immersiveRayOrigin = new THREE.Vector3();
var immersiveRayDir = new THREE.Vector3();
var immersiveForward = new THREE.Vector3();
var immersiveUp = new THREE.Vector3(0, 1, 0);
var immersiveQuat = new THREE.Quaternion();
var immersiveEuler = new THREE.Euler(0, 0, 0, 'YXZ');

// -----------------------------------------------------------------------------
// HUD
// -----------------------------------------------------------------------------
var immersiveVoiceStateEl = document.createElement('div');
immersiveVoiceStateEl.id = 'voiceState';
immersiveVoiceStateEl.textContent = 'VOICE · SOLO';
immersiveVoiceStateEl.style.marginTop = '4px';
immersiveVoiceStateEl.style.opacity = '.72';
document.querySelector('#hud')?.appendChild(immersiveVoiceStateEl);

var immersiveBlinkEl = document.createElement('div');
immersiveBlinkEl.id = 'blinkFx';
Object.assign(immersiveBlinkEl.style, {
  position: 'fixed',
  zIndex: '34',
  inset: '0',
  pointerEvents: 'none',
  background: '#000',
  opacity: '0',
  transition: 'opacity 28ms linear',
});
document.body.appendChild(immersiveBlinkEl);

function immersiveUpdateVoiceHud() {
  if (net.mode === 'solo') {
    immersiveVoiceStateEl.textContent = 'VOICE · SOLO';
    return;
  }
  var rx = immersiveVoiceNodes.size;
  immersiveVoiceStateEl.textContent = `VOICE · RX ${rx} · TX ${mic.enabled ? 'ON' : 'MUTED'}`;
}

// -----------------------------------------------------------------------------
// Web Audio helpers
// -----------------------------------------------------------------------------
function immersiveSetAudioPosition(node, x, y, z, ctx) {
  if (!node) return;
  var t = ctx?.currentTime || 0;
  if (node.positionX) {
    node.positionX.setTargetAtTime(x, t, .025);
    node.positionY.setTargetAtTime(y, t, .025);
    node.positionZ.setTargetAtTime(z, t, .025);
  } else if (node.setPosition) node.setPosition(x, y, z);
}

function immersiveUpdateListener() {
  if (!audioState?.ctx) return;
  var ctx = audioState.ctx;
  var listener = ctx.listener;
  camera.getWorldDirection(immersiveForward).normalize();
  var q = camera.getWorldQuaternion(immersiveQuat);
  var up = immersiveUp.clone().applyQuaternion(q).normalize();
  var t = ctx.currentTime;
  if (listener.positionX) {
    listener.positionX.setTargetAtTime(camera.position.x, t, .02);
    listener.positionY.setTargetAtTime(camera.position.y, t, .02);
    listener.positionZ.setTargetAtTime(camera.position.z, t, .02);
    listener.forwardX.setTargetAtTime(immersiveForward.x, t, .02);
    listener.forwardY.setTargetAtTime(immersiveForward.y, t, .02);
    listener.forwardZ.setTargetAtTime(immersiveForward.z, t, .02);
    listener.upX.setTargetAtTime(up.x, t, .02);
    listener.upY.setTargetAtTime(up.y, t, .02);
    listener.upZ.setTargetAtTime(up.z, t, .02);
  } else {
    listener.setPosition?.(camera.position.x, camera.position.y, camera.position.z);
    listener.setOrientation?.(immersiveForward.x, immersiveForward.y, immersiveForward.z, up.x, up.y, up.z);
  }
}

function immersiveCreatePanner(ctx, maxDistance, refDistance, rolloff) {
  var panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = refDistance;
  panner.maxDistance = maxDistance;
  panner.rolloffFactor = rolloff;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 360;
  return panner;
}

// -----------------------------------------------------------------------------
// Enemy 3D audio
// -----------------------------------------------------------------------------
function immersiveEnemyAudioBuffer(kind, ctx) {
  var key = `${kind}:${ctx.sampleRate}`;
  if (immersiveEnemyBuffers.has(key)) return immersiveEnemyBuffers.get(key);
  var seconds = 2.4;
  var length = Math.floor(ctx.sampleRate * seconds);
  var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  var data = buffer.getChannelData(0);
  var seed = aiHashString?.(kind || 'entity') || 12345;
  var rand = function() {
    seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 3266489917) >>> 0;
    return (seed / 4294967296) * 2 - 1;
  };
  var cadence = kind === 'wire' ? .32 : kind === 'floorhead' ? .72 : .48;
  for (var i = 0; i < length; i++) {
    var time = i / ctx.sampleRate;
    var phase = (time % cadence) / cadence;
    var thump = Math.exp(-phase * 22) * Math.sin(time * Math.PI * 2 * (kind === 'wire' ? 72 : 46));
    var scrape = rand() * .20 * (1 - Math.min(1, phase * 2.2));
    var drone = Math.sin(time * Math.PI * 2 * (kind === 'eye' ? 53 : 39)) * .065;
    data[i] = THREE.MathUtils.clamp(thump * .52 + scrape + drone, -1, 1);
  }
  immersiveEnemyBuffers.set(key, buffer);
  return buffer;
}

function immersiveEnsureEnemyAudio(enemy) {
  if (!enemy || immersiveEnemyAudio.has(enemy) || !audioState?.ctx) return;
  var ctx = audioState.ctx;
  var source = ctx.createBufferSource();
  source.buffer = immersiveEnemyAudioBuffer(enemy.kind, ctx);
  source.loop = true;
  source.loopStart = 0;
  source.loopEnd = source.buffer.duration;
  var filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 6800;
  filter.Q.value = .32;
  var gain = ctx.createGain();
  gain.gain.value = .055;
  var panner = immersiveCreatePanner(ctx, IMMERSIVE_ENEMY_AUDIO_MAX_DISTANCE, 1.4, 1.55);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(audioState.master);
  source.start();
  immersiveEnemyAudio.set(enemy, { source, filter, gain, panner });
}

function immersiveDisposeEnemyAudio(enemy) {
  var a = immersiveEnemyAudio.get(enemy);
  if (!a) return;
  try { a.source.stop(); } catch (_) {}
  try { a.source.disconnect(); a.filter.disconnect(); a.gain.disconnect(); a.panner.disconnect(); } catch (_) {}
  immersiveEnemyAudio.delete(enemy);
}

function immersiveUpdateEnemyAudio() {
  if (!audioState?.ctx) return;
  immersiveUpdateListener();
  var alive = new Set(entities);
  for (var i = 0; i < entities.length; i++) {
    var e = entities[i];
    immersiveEnsureEnemyAudio(e);
    var a = immersiveEnemyAudio.get(e);
    if (!a) continue;
    immersiveSetAudioPosition(a.panner, e.group.position.x, 1.15, e.group.position.z, audioState.ctx);
    var blocked = lineOccluded(camera.position.x, camera.position.z, e.group.position.x, e.group.position.z);
    var chase = e.aiState === 'CHASE' || (e.chaseUntil || 0) > elapsed;
    var targetFreq = blocked ? 780 : 6200;
    var targetGain = blocked ? (chase ? .105 : .038) : (chase ? .17 : .072);
    a.filter.frequency.setTargetAtTime(targetFreq, audioState.ctx.currentTime, .07);
    a.gain.gain.setTargetAtTime(targetGain, audioState.ctx.currentTime, .07);
    a.source.playbackRate.setTargetAtTime(chase ? 1.28 : e.aiState === 'ALERT' ? 1.08 : .88, audioState.ctx.currentTime, .08);
  }
  for (var entry of immersiveEnemyAudio) if (!alive.has(entry[0])) immersiveDisposeEnemyAudio(entry[0]);
}

// -----------------------------------------------------------------------------
// Proximity voice chat (full mesh media calls, data remains host-star topology)
// -----------------------------------------------------------------------------
function immersiveEmptyStream() {
  try { return new MediaStream(); } catch (_) { return null; }
}

function immersiveOutgoingStream() {
  return mic.enabled && mic.stream ? mic.stream : immersiveEmptyStream();
}

function immersiveVoiceAllowed(peerId) {
  if (!peerId || peerId === net.id) return false;
  if (immersiveVoiceRoster.has(peerId)) return true;
  if (net.mode === 'host' && net.conns.has(peerId)) return true;
  if (net.mode === 'client' && peerId === net.targetRoom) return true;
  return false;
}

function immersiveAttachRemoteVoice(peerId, stream) {
  if (!stream || immersiveVoiceNodes.has(peerId)) return;
  ensureAudio();
  if (!audioState?.ctx) return;
  var ctx = audioState.ctx;
  var source;
  try { source = ctx.createMediaStreamSource(stream); } catch (_) { return; }
  var filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 7200;
  filter.Q.value = .3;
  var gain = ctx.createGain();
  gain.gain.value = .82;
  var panner = immersiveCreatePanner(ctx, IMMERSIVE_VOICE_MAX_DISTANCE, IMMERSIVE_VOICE_REF_DISTANCE, 1.05);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(audioState.master);
  immersiveVoiceNodes.set(peerId, { stream, source, filter, gain, panner });
  immersiveUpdateVoiceHud();
}

function immersiveDisposeRemoteVoice(peerId) {
  var n = immersiveVoiceNodes.get(peerId);
  if (!n) return;
  try { n.source.disconnect(); n.filter.disconnect(); n.gain.disconnect(); n.panner.disconnect(); } catch (_) {}
  immersiveVoiceNodes.delete(peerId);
  immersiveUpdateVoiceHud();
}

function immersiveAttachVoiceCall(call) {
  if (!call) return;
  var peerId = call.peer;
  var existing = immersiveVoiceCalls.get(peerId);
  if (existing && existing !== call) {
    try { existing.close(); } catch (_) {}
  }
  immersiveVoiceCalls.set(peerId, call);
  call.on('stream', function(stream) { immersiveAttachRemoteVoice(peerId, stream); });
  call.on('close', function() {
    if (immersiveVoiceCalls.get(peerId) === call) immersiveVoiceCalls.delete(peerId);
    immersiveDisposeRemoteVoice(peerId);
  });
  call.on('error', function(err) { console.warn('[voice] media connection', err); });
}

function immersiveBindVoicePeer(peer) {
  if (!peer || peer.__backroomsVoiceBound) return;
  peer.__backroomsVoiceBound = true;
  peer.on('call', function(call) {
    if (!immersiveVoiceAllowed(call.peer)) {
      try { call.close(); } catch (_) {}
      return;
    }
    immersiveAttachVoiceCall(call);
    try { call.answer(immersiveOutgoingStream()); } catch (err) { console.warn('[voice] answer', err); }
  });
}

function immersiveStartVoiceCall(peerId) {
  if (!net.peer || net.peer.destroyed || !immersiveVoiceAllowed(peerId)) return;
  if (immersiveVoiceCalls.get(peerId)?.open) return;
  // Deterministic caller avoids duplicate two-way media connections.
  if (String(net.id) > String(peerId)) return;
  try {
    var call = net.peer.call(peerId, immersiveOutgoingStream(), { metadata: { game: 'infinite-backrooms', voice: 1 } });
    if (call) immersiveAttachVoiceCall(call);
  } catch (err) { console.warn('[voice] call', err); }
}

function immersiveEnsureVoiceMesh() {
  if (!net.peer || !net.id) return;
  for (var peerId of immersiveVoiceRoster) immersiveStartVoiceCall(peerId);
  immersiveUpdateVoiceHud();
}

function immersiveCloseAllVoiceCalls() {
  for (var call of immersiveVoiceCalls.values()) try { call.close(); } catch (_) {}
  immersiveVoiceCalls.clear();
  for (var id of [...immersiveVoiceNodes.keys()]) immersiveDisposeRemoteVoice(id);
}

function immersiveRestartVoiceMesh() {
  immersiveCloseAllVoiceCalls();
  setTimeout(immersiveEnsureVoiceMesh, 160);
}

function immersiveApplyVoiceRoster(ids) {
  var incoming = new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
  incoming.delete(net.id);
  immersiveVoiceRoster = incoming;
  for (var peerId of [...immersiveVoiceCalls.keys()]) {
    if (!incoming.has(peerId)) {
      try { immersiveVoiceCalls.get(peerId)?.close(); } catch (_) {}
      immersiveVoiceCalls.delete(peerId);
      immersiveDisposeRemoteVoice(peerId);
    }
  }
  immersiveEnsureVoiceMesh();
}

function immersiveUpdateVoiceSpatial() {
  if (!audioState?.ctx) return;
  immersiveUpdateListener();
  for (var entry of immersiveVoiceNodes) {
    var peerId = entry[0], n = entry[1];
    var rp = remotePlayers.get(peerId);
    if (!rp) {
      n.gain.gain.setTargetAtTime(0, audioState.ctx.currentTime, .08);
      continue;
    }
    var p = rp.group?.position || rp.target;
    immersiveSetAudioPosition(n.panner, p.x, 1.55, p.z, audioState.ctx);
    var blocked = lineOccluded(camera.position.x, camera.position.z, p.x, p.z);
    n.filter.frequency.setTargetAtTime(blocked ? 1050 : 7600, audioState.ctx.currentTime, .08);
    n.gain.gain.setTargetAtTime(blocked ? .52 : .90, audioState.ctx.currentTime, .08);
  }
}

// -----------------------------------------------------------------------------
// Voice -> enemy noise events
// -----------------------------------------------------------------------------
function immersiveSendVoiceNoise() {
  if (!mic.enabled || mic.level < IMMERSIVE_VOICE_NOISE_THRESHOLD) return;
  if (elapsed - immersiveLastVoiceNoiseAt < IMMERSIVE_VOICE_NOISE_INTERVAL) return;
  immersiveLastVoiceNoiseAt = elapsed;
  var strength = THREE.MathUtils.clamp((mic.level - .055) * 1.75, .08, 1);
  if (net.mode === 'client' && net.hostConn?.open) {
    net.hostConn.send({ type: 'voice_noise', strength: round2(strength), x: round2(camera.position.x), z: round2(camera.position.z) });
  } else if (net.mode !== 'client') {
    emitNoiseAt(strength, camera.position.x, camera.position.z, 'voice');
  }
}

function immersiveHandleVoiceNoise(data, conn) {
  if (net.mode !== 'host') return;
  var rp = remotePlayers.get(conn.peer);
  if (!rp) return;
  var strength = THREE.MathUtils.clamp(Number(data.strength) || 0, 0, 1);
  // Use the host's last authoritative remote-player position, not arbitrary client coordinates.
  emitNoiseAt(strength, rp.target.x, rp.target.z, 'remote-voice');
}

// -----------------------------------------------------------------------------
// Ray-based gaze + blinking
// -----------------------------------------------------------------------------
function immersiveBlinkState(id, time) {
  var h = aiHashString?.(String(id || 'local')) || 1;
  var cycle = 5.1 + (h % 170) / 100;
  var offset = ((h >>> 8) % 1000) / 213;
  var phase = (time + offset) % cycle;
  return phase > cycle - .115;
}

function immersiveUpdateBlinkVisual() {
  var blink = immersiveBlinkState(net.id || 'local', elapsed);
  immersiveLastBlink = blink;
  immersiveBlinkEl.style.opacity = blink ? '.94' : '0';
}

var immersiveBaseAiPlayers = aiPlayers;
aiPlayers = function() {
  var out = [{
    id: net.id || 'local', local: true, pos: camera.position,
    yaw: camera.rotation.y, pitch: camera.rotation.x,
    mic: mic.level || 0, light: flashlightOn, running: sprinting,
    blink: immersiveBlinkState(net.id || 'local', elapsed),
  }];
  if (net.mode === 'host') {
    for (var entry of remotePlayers) {
      var id = entry[0], rp = entry[1];
      out.push({
        id: id, local: false, pos: rp.target || rp.group.position,
        yaw: Number.isFinite(rp.targetYaw) ? rp.targetYaw : rp.group.rotation.y,
        pitch: Number.isFinite(rp.targetPitch) ? rp.targetPitch : 0,
        mic: rp.mic || 0, light: !!rp.light, running: !!rp.running,
        blink: !!rp.blink,
      });
    }
  }
  return out;
};

aiPlayerSeesEntity = function(player, enemy, threshold) {
  if (!player || !enemy || player.blink) return false;
  var ex = enemy.group.position.x;
  var ez = enemy.group.position.z;
  var ox = player.pos.x;
  var oz = player.pos.z;
  var dx = ex - ox, dz = ez - oz;
  var horizontal = Math.hypot(dx, dz);
  if (horizontal < .001 || horizontal > 30) return false;

  immersiveEuler.set(Number(player.pitch) || 0, Number(player.yaw) || 0, 0, 'YXZ');
  immersiveForward.set(0, 0, -1).applyEuler(immersiveEuler).normalize();
  immersiveRayOrigin.set(ox, EYE_HEIGHT, oz);
  immersiveRayDir.set(dx, 1.18 - EYE_HEIGHT, dz).normalize();
  var dot = immersiveForward.dot(immersiveRayDir);
  if (dot < (threshold || .72)) return false;
  if (lineOccluded(ox, oz, ex, ez)) return false;

  immersiveRaycaster.set(immersiveRayOrigin, immersiveRayDir);
  immersiveRaycaster.near = .05;
  immersiveRaycaster.far = Math.min(32, horizontal + 2.5);
  var hits = immersiveRaycaster.intersectObject(enemy.group, true);
  // Very thin wire geometry can miss a single mathematical ray; in that case the
  // angular + wall test above remains a robust visibility fallback.
  return hits.length > 0 || dot > .82;
};

function immersivePlayerLightHitsEnemy(player, enemy) {
  if (!player.light || player.blink) return false;
  var dx = enemy.group.position.x - player.pos.x;
  var dz = enemy.group.position.z - player.pos.z;
  var dist = Math.hypot(dx, dz);
  if (dist > 27 || dist < .1) return false;
  immersiveEuler.set(Number(player.pitch) || 0, Number(player.yaw) || 0, 0, 'YXZ');
  immersiveForward.set(0, 0, -1).applyEuler(immersiveEuler).normalize();
  immersiveRayDir.set(dx, 1.15 - EYE_HEIGHT, dz).normalize();
  return immersiveForward.dot(immersiveRayDir) > .94 && !lineOccluded(player.pos.x, player.pos.z, enemy.group.position.x, enemy.group.position.z);
}

function immersiveApplyLightFrenzy() {
  if (net.mode === 'client') return;
  var players = aiPlayers();
  for (var i = 0; i < entities.length; i++) {
    var e = entities[i];
    if (!Number.isFinite(e._immersiveBaseSpeed)) e._immersiveBaseSpeed = e.speed;
    var reactive = ['splitface', 'eye', 'winged', 'floorhead'].includes(e.kind);
    var hit = false;
    if (reactive) {
      for (var p = 0; p < players.length; p++) if (immersivePlayerLightHitsEnemy(players[p], e)) { hit = true; break; }
    }
    if (hit) e._lightFrenzyUntil = elapsed + .28;
    e.speed = e._immersiveBaseSpeed * ((e._lightFrenzyUntil || 0) > elapsed ? 1.5 : 1);
  }
}

// -----------------------------------------------------------------------------
// Dead reckoning: host sends velocity, clients predict a short distance ahead.
// -----------------------------------------------------------------------------
AI_SYNC_HZ = 15;

aiSendEnemySnapshot = function() {
  if (net.mode !== 'host' || elapsed - aiLastEnemySync < 1 / AI_SYNC_HZ) return;
  aiLastEnemySync = elapsed;
  var list = [];
  for (var i = 0; i < entities.length; i++) {
    var e = aiEnsureEnemyMeta(entities[i]);
    var now = elapsed;
    var dt = Math.max(.001, now - (e._netVelAt || now));
    var vx = Number.isFinite(e._netPrevX) ? (e.group.position.x - e._netPrevX) / dt : 0;
    var vz = Number.isFinite(e._netPrevZ) ? (e.group.position.z - e._netPrevZ) / dt : 0;
    e._netVelX = THREE.MathUtils.lerp(e._netVelX || 0, vx, .48);
    e._netVelZ = THREE.MathUtils.lerp(e._netVelZ || 0, vz, .48);
    e._netPrevX = e.group.position.x;
    e._netPrevZ = e.group.position.z;
    e._netVelAt = now;
    list.push({
      id: e.netId, kind: e.kind,
      x: round2(e.group.position.x), z: round2(e.group.position.z),
      vx: round2(e._netVelX), vz: round2(e._netVelZ),
      r: round2(e.group.rotation.y), s: e.aiState || 'PATROL',
    });
  }
  broadcast({
    type: 'enemy_sync', level: currentLevelIndex,
    t: Math.round(elapsed * 1000), pressure: round2(encounter.pressure || 0),
    dwell: Math.round(encounter.dwell || 0), noise: round2(encounter.noiseHeat || 0),
    entities: list,
  });
};

var immersiveBaseAiApplyEnemySnapshot = aiApplyEnemySnapshot;
aiApplyEnemySnapshot = function(data) {
  immersiveBaseAiApplyEnemySnapshot(data);
  if (net.mode !== 'client' || !Array.isArray(data?.entities)) return;
  for (var i = 0; i < data.entities.length; i++) {
    var item = data.entities[i];
    for (var j = 0; j < entities.length; j++) {
      var e = entities[j];
      if (e.netId !== item.id) continue;
      e.remoteVelocity = e.remoteVelocity || new THREE.Vector3();
      e.remoteVelocity.set(Number(item.vx) || 0, 0, Number(item.vz) || 0);
      e.lastSyncAt = elapsed;
      break;
    }
  }
};

aiUpdateClientEntities = function(dt) {
  var nearest = Infinity;
  var correction = 1 - Math.exp(-dt * 17.5);
  for (var i = 0; i < entities.length; i++) {
    var e = entities[i];
    if (!e.remoteControlled || !e.targetPos) continue;
    var age = THREE.MathUtils.clamp(elapsed - (e.lastSyncAt || elapsed), 0, .24);
    var vx = e.remoteVelocity?.x || 0;
    var vz = e.remoteVelocity?.z || 0;
    var px = e.targetPos.x + vx * age;
    var pz = e.targetPos.z + vz * age;
    var err = Math.hypot(px - e.group.position.x, pz - e.group.position.z);
    if (err > 5.5) {
      e.group.position.x = px;
      e.group.position.z = pz;
    } else {
      e.group.position.x = THREE.MathUtils.lerp(e.group.position.x, px, correction);
      e.group.position.z = THREE.MathUtils.lerp(e.group.position.z, pz, correction);
    }
    e.group.rotation.y = lerpAngle(e.group.rotation.y, e.targetYaw || 0, Math.min(1, dt * 12));
    var d = distanceXZ(e.group.position, camera.position);
    nearest = Math.min(nearest, d);
    var gazeLocked = e.kind === 'wire' && isEntityInView(e, .70);
    animateEnemy(e, elapsed, e.aiState === 'CHASE', gazeLocked);
  }
  updateThreatAudio(nearest);
  var snapAge = elapsed - aiClientSnapshot.lastAt;
  entityStatusEl.textContent = snapAge > 3 ? 'HOST AI · SYNC WAIT...' : `HOST AI · ${entities.length ? `${entities.length} ENTITY` : 'clear'} · ${Math.round(aiClientSnapshot.pressure * 100)}%`;
};

// -----------------------------------------------------------------------------
// Networking wrappers: voice roster, noise events and blink state
// -----------------------------------------------------------------------------
var immersiveBaseCoopAttachPeerLifecycle = coopAttachPeerLifecycle;
coopAttachPeerLifecycle = function(peer) {
  immersiveBaseCoopAttachPeerLifecycle(peer);
  immersiveBindVoicePeer(peer);
};

var immersiveBaseBroadcastRoster = broadcastRoster;
broadcastRoster = function() {
  immersiveBaseBroadcastRoster();
  if (net.mode !== 'host') return;
  var ids = [net.id, ...net.conns.keys()].filter(Boolean);
  immersiveApplyVoiceRoster(ids);
  broadcast({ type: 'voice_roster', ids: ids });
};

var immersiveBaseHandleNetworkData = handleNetworkData;
handleNetworkData = function(data, conn) {
  if (data?.type === 'voice_roster') { immersiveApplyVoiceRoster(data.ids); return; }
  if (data?.type === 'voice_noise') { immersiveHandleVoiceNoise(data, conn); return; }
  if (data?.type === 'gaze_state') {
    if (net.mode === 'host') {
      var rp = remotePlayers.get(conn.peer);
      if (rp) rp.blink = !!data.blink;
    }
    return;
  }
  immersiveBaseHandleNetworkData(data, conn);
};

var immersiveBaseDisconnectNetwork = disconnectNetwork;
disconnectNetwork = function(silent) {
  immersiveCloseAllVoiceCalls();
  immersiveVoiceRoster.clear();
  immersiveBaseDisconnectNetwork(silent);
  immersiveUpdateVoiceHud();
};

var immersiveBaseToggleMic = toggleMic;
toggleMic = async function() {
  await immersiveBaseToggleMic();
  if (mic.enabled) micButton.textContent = 'マイク＋近接ボイスを停止';
  else micButton.textContent = 'マイク＋近接ボイスを有効化';
  if (net.peer) immersiveRestartVoiceMesh();
  immersiveUpdateVoiceHud();
};

var immersiveBaseUpdateMic = updateMic;
updateMic = function() {
  immersiveBaseUpdateMic();
  immersiveSendVoiceNoise();
};

var immersiveBaseUpdateNetworking = updateNetworking;
updateNetworking = function() {
  immersiveBaseUpdateNetworking();
  if (net.mode === 'client' && net.hostConn?.open && elapsed - immersiveLastGazeSendAt > 1 / IMMERSIVE_GAZE_SEND_HZ) {
    immersiveLastGazeSendAt = elapsed;
    net.hostConn.send({ type: 'gaze_state', blink: immersiveBlinkState(net.id || 'local', elapsed) });
  }
};

// Preserve pitch, light and voice position bookkeeping while adding blink state.
var immersiveBaseUpdateRemoteState = updateRemoteState;
updateRemoteState = function(id, data) {
  immersiveBaseUpdateRemoteState(id, data);
  var rp = remotePlayers.get(id);
  if (rp && typeof data.blink === 'boolean') rp.blink = data.blink;
};

// -----------------------------------------------------------------------------
// Frame wrappers
// -----------------------------------------------------------------------------
var immersiveBaseUpdateEntities = updateEntities;
updateEntities = function(dt) {
  immersiveUpdateBlinkVisual();
  immersiveApplyLightFrenzy();
  immersiveBaseUpdateEntities(dt);
  immersiveUpdateEnemyAudio();
};

var immersiveBaseUpdateRemotePlayers = updateRemotePlayers;
updateRemotePlayers = function(dt) {
  immersiveBaseUpdateRemotePlayers(dt);
  immersiveUpdateVoiceSpatial();
};

// -----------------------------------------------------------------------------
// VHS / bodycam post-processing: one shader pass to keep the cost modest.
// -----------------------------------------------------------------------------
var immersiveComposer = null;
var immersivePostPass = null;
var immersiveRenderGuard = false;
var immersiveOriginalRendererRender = renderer.render.bind(renderer);

function immersiveFilterMode() {
  var mode = document.body.dataset.filter || 'bodycam';
  return mode === 'vhs' ? 1 : mode === 'bodycam' ? 2 : mode === 'night' ? 3 : 0;
}

function immersiveInitPostFX() {
  if (!globalThis.EffectComposer || !globalThis.RenderPass || !globalThis.ShaderPass) return;
  var shader = {
    uniforms: {
      tDiffuse: { value: null },
      time: { value: 0 },
      mode: { value: 2 },
      strength: { value: 1 },
      resolution: { value: new THREE.Vector2(innerWidth, innerHeight) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
    `,
    fragmentShader: `
      precision mediump float;
      uniform sampler2D tDiffuse;
      uniform float time;
      uniform float mode;
      uniform float strength;
      uniform vec2 resolution;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
      void main(){
        vec2 uv=vUv;
        vec2 c=uv-.5;
        float edge=dot(c,c);
        float isVhs=step(.5,mode)*step(mode,1.5);
        float isBody=step(1.5,mode)*step(mode,2.5);
        float isNight=step(2.5,mode);
        float jitter=(hash(vec2(floor(time*18.0),floor(uv.y*120.0)))-.5)*.0032*isVhs*strength;
        uv.x+=jitter;
        float ca=(.00045+.00155*edge)*(isVhs+isBody*.62+isNight*.35)*strength;
        float r=texture2D(tDiffuse,uv+vec2(ca,0.0)).r;
        float g=texture2D(tDiffuse,uv).g;
        float b=texture2D(tDiffuse,uv-vec2(ca,0.0)).b;
        vec3 col=vec3(r,g,b);
        float grain=(hash(gl_FragCoord.xy+vec2(time*173.0,time*91.0))-.5);
        col+=grain*(.018+.035*isVhs+.022*isBody+.055*isNight)*strength;
        float scan=sin((uv.y*resolution.y+time*8.0)*3.14159)*.5+.5;
        col*=1.0-(.025+.045*isVhs+.018*isBody)*scan*strength;
        if(isNight>.5){
          col=floor(col*18.0)/18.0;
          float l=dot(col,vec3(.24,.67,.09));
          col=mix(col,vec3(l*.30,l*.78,l*.34),.34);
        }
        float vign=smoothstep(.34,.77,length(c));
        col*=1.0-vign*(.08+.10*isBody+.07*isVhs)*strength;
        gl_FragColor=vec4(col,1.0);
      }
    `,
  };
  immersiveComposer = new EffectComposer(renderer);
  immersiveComposer.addPass(new RenderPass(scene, camera));
  immersivePostPass = new ShaderPass(shader);
  immersiveComposer.addPass(immersivePostPass);
  immersiveComposer.setSize(innerWidth, innerHeight);
  immersiveComposer.setPixelRatio?.(renderer.getPixelRatio());

  renderer.render = function(renderScene, renderCamera) {
    var enabled = qualityMode !== 'low' && fpsAverage > 31;
    if (immersiveRenderGuard || !enabled || !immersiveComposer) return immersiveOriginalRendererRender(renderScene, renderCamera);
    immersiveRenderGuard = true;
    immersivePostPass.uniforms.time.value = elapsed;
    immersivePostPass.uniforms.mode.value = immersiveFilterMode();
    immersivePostPass.uniforms.strength.value = qualityMode === 'high' ? 1 : .78;
    immersivePostPass.uniforms.resolution.value.set(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
    immersiveComposer.render();
    immersiveRenderGuard = false;
  };
}

immersiveInitPostFX();

var immersiveBaseUpdateRendererScale = updateRendererScale;
updateRendererScale = function() {
  immersiveBaseUpdateRendererScale();
  if (immersiveComposer) {
    immersiveComposer.setPixelRatio?.(renderer.getPixelRatio());
    immersiveComposer.setSize(innerWidth, innerHeight);
  }
};

// Pre-label the microphone button before setupRuntime binds it.
micButton.textContent = 'マイク＋近接ボイスを有効化';
immersiveUpdateVoiceHud();
