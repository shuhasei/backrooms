// Co-op networking v2
// Loaded after game-runtime.js so these function declarations replace the older
// networking helpers before setupRuntime() installs its button handlers.

var COOP_PEER_PREFIX = 'brx3-';
var COOP_CONNECT_TIMEOUT = 16000;
var COOP_RETRY_LIMIT = 3;
var coopPeerCtorPromise = null;

function coopIceServers() {
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ];
}

function coopPeerOptions() {
  return {
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
    key: 'peerjs',
    pingInterval: 5000,
    debug: 1,
    config: {
      iceServers: coopIceServers(),
      iceCandidatePoolSize: 6,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      sdpSemantics: 'unified-plan',
    },
  };
}

function coopLoadScript(src, integrity) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    if (integrity) script.integrity = integrity;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error(`PeerJS CDN failed: ${src}`));
    };
    document.head.appendChild(script);
  });
}

async function getPeerCtor() {
  if (globalThis.Peer) return globalThis.Peer;
  if (coopPeerCtorPromise) return coopPeerCtorPromise;

  coopPeerCtorPromise = (async () => {
    try {
      await coopLoadScript(
        'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js',
        'sha512-XEKeWX+mI3Ov+tg2evDlVQFzVOIp4T8J3cNcCEPaEUGpxJV3eZaN8rHuvnFPvQpGJBHPmrozJDMpm2xcDvtmyQ=='
      );
    } catch (primaryError) {
      await coopLoadScript('https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js');
    }
    if (!globalThis.Peer) throw new Error('PeerJS loaded but Peer constructor was not found');
    return globalThis.Peer;
  })();

  try {
    return await coopPeerCtorPromise;
  } catch (error) {
    coopPeerCtorPromise = null;
    throw error;
  }
}

function coopShortCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[(Math.random() * chars.length) | 0];
  return out;
}

function coopNormalizeRoom(raw) {
  let value = String(raw || '').trim().toLowerCase();
  value = value.replace(/^https?:\/\/[^#]+#room=/, '');
  value = value.replace(/^#?room=/, '');
  value = value.replace(/^room\s*(code)?\s*[:：]\s*/i, '');
  value = value.replace(/\s+/g, '');
  if (value.startsWith(COOP_PEER_PREFIX)) {
    return { short: value.slice(COOP_PEER_PREFIX.length), peerId: value };
  }
  if (value.startsWith('backrooms-')) {
    return { short: value.replace(/^backrooms-/, ''), peerId: value };
  }
  const short = value.replace(/[^a-z0-9]/g, '').slice(0, 24);
  return { short, peerId: `${COOP_PEER_PREFIX}${short}` };
}

function coopInviteUrl(short) {
  return `${location.origin}${location.pathname}${location.search}#room=${encodeURIComponent(short.toUpperCase())}`;
}

function coopSetRoomDisplay(short, suffix = 'クリックで招待リンクをコピー') {
  const code = String(short || '').toUpperCase();
  roomCode.textContent = `ROOM CODE: ${code} · ${suffix}`;
  roomCode.style.cursor = 'pointer';
  roomCode.title = 'クリックで招待リンクをコピー';
  roomCode.onclick = async () => {
    const text = coopInviteUrl(short);
    try {
      await navigator.clipboard.writeText(text);
      showToast('招待リンクをコピーしました');
    } catch (_) {
      roomInput.value = code;
      showToast(`ROOM CODE: ${code}`);
    }
  };
}

function coopWaitPeerOpen(peer, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(Object.assign(new Error('PeerServer timeout'), { type: 'server-timeout' }));
    }, timeout);
    peer.on('open', (id) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(id);
    });
    peer.on('error', (err) => {
      if (done) return;
      if (err?.type === 'peer-unavailable') return;
      done = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

function coopErrorMessage(err) {
  const type = err?.type || '';
  if (type === 'peer-unavailable') return 'ルームが見つかりません。ホスト側で「ルームを作る」を押したままにしてください。';
  if (type === 'unavailable-id') return 'ルームコードが衝突しました。もう一度ルームを作ってください。';
  if (type === 'network' || type === 'socket-error' || type === 'server-error' || type === 'server-timeout') return 'PeerJSの接続サーバーへ到達できません。通信環境を変えて再試行してください。';
  if (type === 'webrtc') return 'WebRTC接続に失敗しました。別回線同士ではNAT/Firewallの影響を受ける場合があります。';
  return `接続に失敗しました${type ? ` (${type})` : ''}`;
}

function coopAttachPeerLifecycle(peer) {
  peer.on('disconnected', () => {
    if (net.manualClose || peer.destroyed) return;
    netStateEl.textContent = 'ONLINE · signaling reconnecting...';
    setTimeout(() => {
      try { if (!peer.destroyed && peer.disconnected) peer.reconnect(); } catch (_) {}
    }, 900);
  });
  peer.on('error', (err) => {
    console.warn('[coop] peer error', err);
    if (err?.type === 'peer-unavailable' && net.mode === 'client') {
      roomCode.textContent = coopErrorMessage(err);
      netStateEl.textContent = 'CLIENT · room not found';
      return;
    }
    if (!net.manualClose) roomCode.textContent = coopErrorMessage(err);
  });
}

async function hostRoom() {
  if (net.peer) disconnectNetwork(true);
  net.manualClose = false;
  net.retries = 0;
  roomCode.textContent = '通信エンジンを読み込み中...';
  netStateEl.textContent = 'HOST · starting...';

  try {
    const Peer = await getPeerCtor();
    const short = coopShortCode();
    const peerId = `${COOP_PEER_PREFIX}${short}`;
    const peer = new Peer(peerId, coopPeerOptions());
    net.peer = peer;
    net.mode = 'host';
    net.id = peerId;
    net.shortCode = short;
    net.manualClose = false;
    coopAttachPeerLifecycle(peer);

    peer.on('connection', (conn) => {
      if (net.conns.size >= MAX_PLAYERS - 1) {
        attachConnection(conn, true, true);
        return;
      }
      attachConnection(conn, true, false);
    });

    const id = await coopWaitPeerOpen(peer, 11000);
    net.id = id;
    coopSetRoomDisplay(short);
    netStateEl.textContent = `HOST · 1/${MAX_PLAYERS} · waiting`;
    history.replaceState(null, '', coopInviteUrl(short));
    showToast(`ルーム ${short.toUpperCase()} を作成しました`);
  } catch (err) {
    console.error('[coop] host failed', err);
    roomCode.textContent = coopErrorMessage(err);
    netStateEl.textContent = 'SOLO · host failed';
    disconnectNetwork(true);
  }
}

async function joinRoom() {
  const normalized = coopNormalizeRoom(roomInput.value || location.hash);
  if (!normalized.short) {
    showToast('6文字のルームコードを入力してください');
    return;
  }
  if (net.peer) disconnectNetwork(true);
  net.manualClose = false;
  net.retries = 0;
  net.targetRoom = normalized.peerId;
  net.shortCode = normalized.short;
  roomInput.value = normalized.short.toUpperCase();
  roomCode.textContent = `ROOM ${normalized.short.toUpperCase()} に接続しています...`;
  netStateEl.textContent = 'CLIENT · signaling...';

  try {
    const Peer = await getPeerCtor();
    const peer = new Peer(undefined, coopPeerOptions());
    net.peer = peer;
    net.mode = 'client';
    coopAttachPeerLifecycle(peer);
    net.id = await coopWaitPeerOpen(peer, 11000);
    coopConnectClient();
  } catch (err) {
    console.error('[coop] join failed', err);
    roomCode.textContent = coopErrorMessage(err);
    netStateEl.textContent = 'SOLO · join failed';
    disconnectNetwork(true);
  }
}

function coopConnectClient() {
  if (!net.peer || net.peer.destroyed || !net.targetRoom) return;
  if (net.hostConn) {
    try { net.hostConn.close(); } catch (_) {}
    net.hostConn = null;
  }
  const conn = net.peer.connect(net.targetRoom, {
    reliable: true,
    serialization: 'json',
    metadata: { game: 'infinite-backrooms', protocol: 3 },
  });
  net.hostConn = conn;
  netStateEl.textContent = `CLIENT · ICE ${net.retries ? `retry ${net.retries}/${COOP_RETRY_LIMIT}` : 'connecting'}`;
  attachConnection(conn, false, false);
}

function coopWatchConnection(conn) {
  let pc = conn.peerConnection;
  if (!pc) {
    setTimeout(() => coopWatchConnection(conn), 250);
    return;
  }
  if (pc.__backroomsWatched) return;
  pc.__backroomsWatched = true;

  const update = () => {
    const state = pc.connectionState || pc.iceConnectionState || 'connecting';
    if (conn.open) {
      coopUpdatePath(conn);
      return;
    }
    if (net.mode === 'client') netStateEl.textContent = `CLIENT · ${state}`;
  };
  pc.addEventListener?.('iceconnectionstatechange', update);
  pc.addEventListener?.('connectionstatechange', update);
}

async function coopUpdatePath(conn) {
  try {
    const pc = conn.peerConnection;
    if (!pc?.getStats) return;
    const stats = await pc.getStats();
    let pair = null;
    stats.forEach((r) => {
      if ((r.type === 'candidate-pair' || r.type === 'googCandidatePair') && (r.selected || r.nominated) && (r.state === 'succeeded' || r.googActiveConnection === 'true')) pair = r;
    });
    let path = 'direct';
    if (pair) {
      const local = stats.get?.(pair.localCandidateId);
      const remote = stats.get?.(pair.remoteCandidateId);
      if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') path = 'relay';
      else if (local?.candidateType === 'srflx' || remote?.candidateType === 'srflx') path = 'internet';
      else if (local?.candidateType === 'host') path = 'LAN/direct';
    }
    net.path = path;
    updateNetHud();
  } catch (_) {}
}

function attachConnection(conn, hostSide, rejectAsFull = false) {
  let opened = false;
  const timeout = setTimeout(() => {
    if (opened || conn.open) return;
    try { conn.close(); } catch (_) {}
    if (!hostSide) {
      roomCode.textContent = '接続タイムアウト。自動で再接続します...';
      coopScheduleClientRetry();
    }
  }, COOP_CONNECT_TIMEOUT);

  coopWatchConnection(conn);

  conn.on('open', () => {
    opened = true;
    clearTimeout(timeout);
    if (rejectAsFull) {
      try { conn.send({ type: 'full' }); } catch (_) {}
      setTimeout(() => conn.close(), 120);
      return;
    }

    if (hostSide) {
      net.conns.set(conn.peer, conn);
      conn.send({ type: 'welcome', level: currentLevelIndex, host: net.id, protocol: 3 });
      broadcastRoster();
      showToast(`プレイヤー参加 · ${1 + net.conns.size}/${MAX_PLAYERS}`);
    } else {
      net.retries = 0;
      net.hostConn = conn;
      coopSetRoomDisplay(net.shortCode, '接続済み');
      netStateEl.textContent = 'CLIENT · connected';
      conn.send({ type: 'hello', id: net.id, protocol: 3 });
      showToast('協力プレイに接続しました');
    }
    coopUpdatePath(conn);
  });

  conn.on('data', (data) => handleNetworkData(data, conn));
  conn.on('close', () => {
    clearTimeout(timeout);
    net.conns.delete(conn.peer);
    removeRemotePlayer(conn.peer);
    if (hostSide) {
      broadcastRoster();
      updateNetHud();
    } else if (!net.manualClose && net.mode === 'client' && net.peer && !net.peer.destroyed) {
      net.hostConn = null;
      coopScheduleClientRetry();
    }
  });
  conn.on('error', (err) => {
    console.warn('[coop] data error', err);
    if (!hostSide) {
      roomCode.textContent = 'P2P接続エラー。再接続を試します...';
      coopScheduleClientRetry();
    }
  });
}

function coopScheduleClientRetry() {
  if (net.manualClose || net.mode !== 'client' || !net.peer || net.peer.destroyed) return;
  if (net.retryTimer) return;
  if ((net.retries || 0) >= COOP_RETRY_LIMIT) {
    roomCode.textContent = '接続できませんでした。ホストと参加者の両方で再読み込みして、もう一度ルームを作成してください。';
    netStateEl.textContent = 'CLIENT · connection failed';
    return;
  }
  net.retries = (net.retries || 0) + 1;
  netStateEl.textContent = `CLIENT · retry ${net.retries}/${COOP_RETRY_LIMIT}`;
  net.retryTimer = setTimeout(() => {
    net.retryTimer = null;
    coopConnectClient();
  }, 1100 + net.retries * 700);
}

function handleNetworkData(data, conn) {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'full') {
    roomCode.textContent = 'このルームは満員です（最大4人）';
    net.manualClose = true;
    conn.close();
    return;
  }
  if (data.type === 'hello' && net.mode === 'host') {
    conn.send({ type: 'welcome', level: currentLevelIndex, host: net.id, protocol: 3 });
    return;
  }
  if (data.type === 'welcome' && net.mode === 'client') {
    if (Number.isInteger(data.level)) switchLevel(data.level, true);
    updateNetHud();
    return;
  }
  if (data.type === 'level' && net.mode === 'client') {
    if (Number.isInteger(data.level) && data.level !== currentLevelIndex) switchLevel(data.level, true);
    return;
  }
  if (data.type === 'state') {
    const id = data.id || conn.peer;
    if (id === net.id) return;
    updateRemoteState(id, data);
    if (net.mode === 'host') broadcast({ ...data, id }, id);
    return;
  }
  if (data.type === 'roster') {
    updateNetHud(data.count);
    return;
  }
  if (data.type === 'ping') {
    if (conn.open) conn.send({ type: 'pong', at: data.at });
    return;
  }
  if (data.type === 'pong') {
    if (Number.isFinite(data.at)) net.latency = Math.max(0, performance.now() - data.at);
    updateNetHud();
  }
}

function updateNetworking() {
  if (!net.peer) return;

  if (elapsed - (net.lastPingAt || 0) > 3.5) {
    net.lastPingAt = elapsed;
    const ping = { type: 'ping', at: performance.now() };
    if (net.mode === 'host') broadcast(ping);
    else if (net.mode === 'client' && net.hostConn?.open) net.hostConn.send(ping);
  }

  if (elapsed - net.lastSend < 1 / NET_HZ) return;
  net.lastSend = elapsed;
  const packet = {
    type: 'state',
    id: net.id,
    p: [round2(camera.position.x), round2(EYE_HEIGHT), round2(camera.position.z)],
    r: [round2(camera.rotation.y), round2(camera.rotation.x)],
    level: currentLevelIndex,
    mic: round2(mic.level),
    light: !!flashlightOn,
  };
  if (net.mode === 'host') broadcast(packet);
  else if (net.mode === 'client' && net.hostConn?.open && (net.hostConn.bufferSize || 0) < 128) net.hostConn.send(packet);
}

function broadcast(data, exceptId = '') {
  for (const [id, conn] of net.conns) {
    if (id === exceptId || !conn.open || (conn.bufferSize || 0) > 128) continue;
    try { conn.send(data); } catch (_) {}
  }
}

function broadcastLevel(levelIndex) {
  if (net.mode === 'host') broadcast({ type: 'level', level: levelIndex });
}

function broadcastRoster() {
  if (net.mode !== 'host') return;
  const count = 1 + net.conns.size;
  broadcast({ type: 'roster', count });
  updateNetHud(count);
}

function disconnectNetwork(silent = false) {
  net.manualClose = true;
  clearTimeout(net.retryTimer);
  net.retryTimer = null;
  for (const conn of net.conns.values()) {
    try { conn.close?.(); } catch (_) {}
  }
  try { net.hostConn?.close?.(); } catch (_) {}
  try { net.peer?.destroy?.(); } catch (_) {}
  net.peer = null;
  net.hostConn = null;
  net.conns.clear();
  net.mode = 'solo';
  net.id = '';
  net.targetRoom = '';
  net.shortCode = '';
  net.retries = 0;
  net.path = '';
  net.latency = 0;
  for (const id of [...remotePlayers.keys()]) removeRemotePlayer(id);
  if (!silent) {
    roomCode.textContent = '';
    if (location.hash.startsWith('#room=')) history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  updateNetHud();
}

function updateNetHud(count) {
  if (net.mode === 'solo') {
    netStateEl.textContent = `SOLO · LIGHT ${flashlightOn ? 'ON' : 'OFF'}`;
    return;
  }
  const latency = Number.isFinite(net.latency) && net.latency > 0 ? ` · ${Math.round(net.latency)}ms` : '';
  const path = net.path ? ` · ${net.path}` : '';
  if (net.mode === 'host') {
    const n = Number.isInteger(count) ? count : 1 + net.conns.size;
    netStateEl.textContent = `HOST · ${n}/${MAX_PLAYERS}${path}${latency}`;
  } else {
    netStateEl.textContent = `CLIENT · ${net.hostConn?.open ? 'connected' : 'connecting'}${path}${latency}`;
  }
}

(function coopPrefillInvite() {
  const normalized = coopNormalizeRoom(location.hash);
  if (normalized.short) roomInput.value = normalized.short.toUpperCase();
})();
