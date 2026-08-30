// Advanced multiplayer layer
// Host-authoritative loot ownership, synchronized level transitions, player state,
// host migration and spectator/emote synchronization.

var advancedRoster = new Set();
var advancedStatus = new Map();
var advancedLastStatusAt = -999;
var advancedMigrationTimer = null;
var advancedTransitioning = false;
var advancedBaseHandleNetworkData = handleNetworkData;
var advancedBaseUpdateNetworking = updateNetworking;
var advancedBaseUpdateRemotePlayers = updateRemotePlayers;
var advancedBaseCoopAttachPeerLifecycle = coopAttachPeerLifecycle;
var advancedBaseCoopScheduleClientRetry = coopScheduleClientRetry;
var advancedBaseDisconnectNetwork = disconnectNetwork;
var advancedBaseSwitchLevel = switchLevel;
var advancedBaseNextLevel = nextLevel;

function advancedLocalId() { return net.id || 'local'; }

function advancedRosterArray() {
  var ids = [...advancedRoster].filter(Boolean);
  if (net.id && !ids.includes(net.id)) ids.push(net.id);
  return ids.sort();
}

function advancedBindClientMigrationListener(peer) {
  if (!peer || peer.__migrationListenerBound || net.mode !== 'client') return;
  peer.__migrationListenerBound = true;
  peer.on('connection', function(conn) {
    // A client can become the new host without changing its PeerID. The listener
    // is installed while it is still a client and becomes active after promotion.
    if (net.mode !== 'host' || net.manualClose) {
      try { conn.close(); } catch (_) {}
      return;
    }
    if (net.conns.has(conn.peer)) return;
    attachConnection(conn, true, false);
  });
}

coopAttachPeerLifecycle = function(peer) {
  advancedBaseCoopAttachPeerLifecycle(peer);
  advancedBindClientMigrationListener(peer);
};

function advancedPromoteToHost() {
  if (!net.peer || net.peer.destroyed) return;
  clearTimeout(net.retryTimer); net.retryTimer = null;
  net.mode = 'host';
  net.hostConn = null;
  net.targetRoom = net.id;
  net.manualClose = false;
  net.conns.clear();
  advancedMigrationTimer = null;

  // Client-side enemies become authoritative. Restore AI stats that are omitted
  // from compact network snapshots.
  for (var e of entities) {
    if (!e.remoteControlled) continue;
    e.remoteControlled = false;
    var st = enemyStats(e.kind);
    e.speed = st.speed * (1 + currentLevelIndex * .006);
    e.hearing = st.hearing + currentLevelIndex * .28;
    e.sight = st.sight + currentLevelIndex * .10;
    e.spawnedAt = elapsed;
    e.chaseUntil = Math.max(e.chaseUntil || 0, elapsed + .5);
  }
  encounter.profile = encounterProfileFor(currentLevelIndex);
  roomCode.textContent = `HOST MIGRATED · ${String(net.id).slice(-8).toUpperCase()}`;
  netStateEl.textContent = 'HOST · MIGRATED · reconnecting peers';
  showToast('ホストを引き継ぎました');
  setTimeout(function(){ broadcastRoster(); advancedBroadcastWorldState(); }, 900);
}

function advancedElectHost() {
  if (net.manualClose || net.mode !== 'client' || net.hostConn?.open) return;
  var candidates = advancedRosterArray().filter(id => id !== net.targetRoom);
  if (!candidates.length) {
    advancedBaseCoopScheduleClientRetry();
    return;
  }
  var elected = candidates[0];
  if (elected === net.id) {
    advancedPromoteToHost();
    return;
  }
  net.targetRoom = elected;
  net.shortCode = String(elected).replace(/^brx3-/, '');
  netStateEl.textContent = `CLIENT · HOST MIGRATION → ${String(elected).slice(-6)}`;
  showToast('新しいホストへ再接続しています');
  coopConnectClient();
}

coopScheduleClientRetry = function() {
  if (net.manualClose || net.mode !== 'client') return;
  if (advancedMigrationTimer) return;
  advancedMigrationTimer = setTimeout(function() {
    advancedMigrationTimer = null;
    advancedElectHost();
  }, 1300);
};

disconnectNetwork = function(silent) {
  clearTimeout(advancedMigrationTimer); advancedMigrationTimer = null;
  advancedRoster.clear(); advancedStatus.clear();
  advancedBaseDisconnectNetwork(silent);
};

function advancedPlayerStatePacket() {
  return {
    type: 'player_status',
    id: advancedLocalId(),
    alive: !!survivalState.alive,
    spectator: !!survivalState.spectator,
    hp: Math.round(survivalState.hp),
    stamina: Math.round(survivalState.stamina),
    sanity: Math.round(survivalState.sanity),
    inv: survivalState.inventory.length,
    emote: survivalState.emote || '',
    seed: SURVIVAL_SESSION_SEED >>> 0,
  };
}

function advancedApplyRemoteStatus(id, data) {
  advancedStatus.set(id, data);
  var rp = remotePlayers.get(id);
  if (!rp) return;
  rp.alive = data.alive !== false;
  rp.spectator = !!data.spectator;
  rp.hp = Number(data.hp) || 0;
  rp.emote = data.emote || '';
  if (rp.visual) rp.visual.visible = rp.alive;
}

function advancedBroadcastWorldState(conn) {
  if (net.mode !== 'host') return;
  var send = function(packet) {
    if (conn?.open) conn.send(packet); else broadcast(packet);
  };
  send({ type:'session_seed', seed:SURVIVAL_SESSION_SEED >>> 0, level:currentLevelIndex });
  send(survivalLootStatePacket());
  send({ type:'host_snapshot', level:currentLevelIndex, statuses:[...advancedStatus.entries()].map(([id,s])=>({id,...s})), host:net.id });
}

function advancedHostClaimLoot(id, ownerId) {
  var item = survivalLoot.get(id);
  if (!item || item.claimed) return false;
  var pos;
  if (ownerId === net.id || (net.mode === 'solo' && ownerId === 'local')) pos = camera.position;
  else pos = remotePlayers.get(ownerId)?.target;
  if (!pos || Math.hypot(pos.x-item.x,pos.z-item.z) > 2.7) return false;
  var st = advancedStatus.get(ownerId);
  if (ownerId !== net.id && st && Number(st.inv) >= SURVIVAL_INVENTORY_MAX) return false;
  survivalApplyLootClaim(id, ownerId);
  if (net.mode === 'host') broadcast({ type:'loot_claim', id:id, owner:ownerId });
  return true;
}

survivalPickupRequest = function(id) {
  var item = survivalLoot.get(id);
  if (!item || item.claimed) return;
  if (!survivalInventoryHasSpace()) { showToast('インベントリがいっぱいです'); return; }
  if (net.mode === 'client') {
    if (net.hostConn?.open) net.hostConn.send({ type:'loot_pickup', id:id });
    return;
  }
  advancedHostClaimLoot(id, advancedLocalId());
};

function advancedBeginLevelTransition(index, source) {
  if (advancedTransitioning) return;
  index = THREE.MathUtils.clamp(index, 0, LEVELS.length - 1);
  advancedTransitioning = true;
  var packet = { type:'level_transition', index:index, source:source||'exit', delay:650, seed:SURVIVAL_SESSION_SEED >>> 0 };
  if (net.mode === 'host') broadcast(packet);
  showToast(source === 'anomaly' ? '空間が歪んでいる…' : '階層移動中…');
  setTimeout(function() {
    advancedTransitioning = false;
    advancedBaseSwitchLevel(index, false);
    if (net.mode === 'host') setTimeout(advancedBroadcastWorldState, 120);
  }, packet.delay);
}

nextLevel = function() {
  if (advancedTransitioning) return;
  if (currentLevelIndex >= LEVELS.length - 1) {
    advancedBaseNextLevel();
    return;
  }
  if (net.mode === 'client') {
    net.hostConn?.send({ type:'level_request', kind:'exit', level:currentLevelIndex });
    showToast('ホストへ階層移動を要求しました');
    return;
  }
  advancedBeginLevelTransition(currentLevelIndex + 1, 'exit');
};

function advancedRequestAnomalyTransition() {
  if (net.mode === 'client') {
    net.hostConn?.send({ type:'level_request', kind:'anomaly', level:currentLevelIndex });
    return;
  }
  advancedBeginLevelTransition(Math.min(LEVELS.length-1,currentLevelIndex+1), 'anomaly');
}

function advancedValidateLevelRequest(conn, data) {
  if (net.mode !== 'host' || advancedTransitioning || data.level !== currentLevelIndex) return;
  var rp = remotePlayers.get(conn.peer);
  if (!rp || rp.alive === false) return;
  if (data.kind === 'exit') {
    if (!exitPortal || distanceXZ(rp.target, exitPortal.position) > 3.6) return;
  } else if (data.kind === 'anomaly') {
    if (!survivalAnomaly || distanceXZ(rp.target, survivalAnomaly.position) > 3.1) return;
  } else return;
  advancedBeginLevelTransition(Math.min(LEVELS.length-1,currentLevelIndex+1), data.kind);
}

handleNetworkData = function(data, conn) {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'voice_roster') {
    advancedRoster = new Set(Array.isArray(data.ids) ? data.ids.filter(Boolean) : []);
    advancedBaseHandleNetworkData(data, conn);
    return;
  }
  if (data.type === 'session_seed') {
    survivalApplySessionSeed(data.seed, false);
    return;
  }
  if (data.type === 'loot_state') {
    if (data.level === currentLevelIndex) survivalApplyLootState(data.items);
    return;
  }
  if (data.type === 'loot_pickup') {
    if (net.mode === 'host') advancedHostClaimLoot(data.id, conn.peer);
    return;
  }
  if (data.type === 'loot_claim') {
    survivalApplyLootClaim(data.id, data.owner);
    return;
  }
  if (data.type === 'player_status') {
    advancedApplyRemoteStatus(data.id || conn.peer, data);
    if (net.mode === 'host') broadcast(data, data.id || conn.peer);
    return;
  }
  if (data.type === 'level_request') {
    advancedValidateLevelRequest(conn, data);
    return;
  }
  if (data.type === 'level_transition') {
    if (net.mode === 'client' && !advancedTransitioning) {
      if (data.seed) survivalApplySessionSeed(data.seed, false);
      advancedTransitioning = true;
      showToast(data.source === 'anomaly' ? '空間が歪んでいる…' : '階層移動中…');
      setTimeout(function(){ advancedTransitioning=false; advancedBaseSwitchLevel(data.index,true); }, Number(data.delay)||650);
    }
    return;
  }
  if (data.type === 'host_snapshot') {
    if (Array.isArray(data.statuses)) for (var s of data.statuses) if (s?.id) advancedApplyRemoteStatus(s.id,s);
    return;
  }
  if (data.type === 'player_noise') {
    if (net.mode === 'host') {
      var rpNoise=remotePlayers.get(conn.peer);
      if (rpNoise) emitNoiseAt(THREE.MathUtils.clamp(Number(data.strength)||0,0,1),rpNoise.target.x,rpNoise.target.z,data.source||'remote-noise');
    }
    return;
  }
  advancedBaseHandleNetworkData(data, conn);

  // Once the normal hello/welcome path succeeds, push authoritative world state.
  if (net.mode === 'host' && (data.type === 'hello' || data.type === 'state')) {
    advancedRoster.add(net.id); advancedRoster.add(conn.peer);
    if (data.type === 'hello') setTimeout(() => advancedBroadcastWorldState(conn), 80);
  }
};

updateNetworking = function() {
  advancedBaseUpdateNetworking();
  if (!net.peer || elapsed - advancedLastStatusAt < .14) return;
  advancedLastStatusAt = elapsed;
  var packet = advancedPlayerStatePacket();
  advancedStatus.set(packet.id, packet);
  if (net.mode === 'host') broadcast(packet);
  else if (net.mode === 'client' && net.hostConn?.open) net.hostConn.send(packet);
};

updateRemotePlayers = function(dt) {
  advancedBaseUpdateRemotePlayers(dt);
  for (var rp of remotePlayers.values()) {
    if (!rp.visual) continue;
    rp.visual.visible = rp.alive !== false;
    var emote = rp.emote || '';
    if (emote === 'point' && rp.armR) {
      rp.armR.rotation.x = -1.45; rp.armR.rotation.z = -.15;
    } else if (emote === 'beckon' && rp.armR) {
      rp.armR.rotation.x = -.85 + Math.sin(elapsed*8)*.32;
    } else if (emote === 'quiet' && rp.armR) {
      rp.armR.rotation.x = -1.10; if (rp.armR.userData.fore) rp.armR.userData.fore.rotation.x = -1.18;
    }
  }
};

// If the host created loot before peers joined, make sure it is sent whenever a
// new host-side data connection opens.
var advancedBaseAttachConnection = attachConnection;
attachConnection = function(conn, hostSide, rejectAsFull) {
  advancedBaseAttachConnection(conn, hostSide, rejectAsFull);
  if (hostSide) {
    conn.on('open', function(){ setTimeout(() => advancedBroadcastWorldState(conn), 120); });
  }
};

// Keep roster useful for migration even before voice is enabled.
var advancedBaseBroadcastRoster = broadcastRoster;
broadcastRoster = function() {
  advancedBaseBroadcastRoster();
  if (net.mode !== 'host') return;
  advancedRoster = new Set([net.id, ...net.conns.keys()].filter(Boolean));
  broadcast({ type:'voice_roster', ids:[...advancedRoster] });
};
