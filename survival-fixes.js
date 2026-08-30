// Small integration fixes loaded after the survival + multiplayer wrappers.

var integrationBaseHandleNetworkData = handleNetworkData;
var integrationBaseUpdateNetworking = updateNetworking;
var integrationBaseToggleFlashlight = toggleFlashlight;
var integrationLastWipeCheck = 0;
var integrationLastFlickerSound = -999;

// Lobby/roster summary inside the existing multiplayer details panel.
var integrationLobby = document.createElement('div');
integrationLobby.id = 'liveLobby';
integrationLobby.style.cssText = 'margin-top:8px;padding:7px 9px;border:1px solid #ffffff1f;background:#07090788;font:600 11px ui-monospace,monospace;line-height:1.45';
integrationLobby.textContent = 'LOBBY · SOLO';
(document.querySelector('.network')?.parentElement || menu).appendChild(integrationLobby);

function integrationUpdateLobby() {
  if (net.mode === 'solo') { integrationLobby.textContent = 'LOBBY · SOLO'; return; }
  var ids = typeof advancedRosterArray === 'function' ? advancedRosterArray() : [net.id, ...net.conns.keys()].filter(Boolean);
  var lines = [`LOBBY · ${net.mode.toUpperCase()} · ${ids.length}/${MAX_PLAYERS}`];
  for (var id of ids) {
    var local = id === net.id;
    var st = local ? { alive: survivalState.alive, hp: survivalState.hp, spectator: survivalState.spectator } : advancedStatus.get(id);
    var state = st?.spectator ? 'SPECTATE' : st?.alive === false ? 'DEAD' : 'ALIVE';
    var hp = Number.isFinite(Number(st?.hp)) ? ` ${Math.round(Number(st.hp))}HP` : '';
    lines.push(`${local ? '●' : '○'} ${String(id).replace(/^brx3-/,'').slice(-8).toUpperCase()} · ${state}${hp}`);
  }
  integrationLobby.textContent = lines.join('\n');
  integrationLobby.style.whiteSpace = 'pre-line';
}

handleNetworkData = function(data, conn) {
  if (data?.type === 'session_seed') {
    var before = SURVIVAL_SESSION_SEED >>> 0;
    var incoming = Number(data.seed) >>> 0;
    if (incoming && incoming !== before) survivalApplySessionSeed(incoming, net.mode === 'client');
    return;
  }
  if (data?.type === 'run_end') {
    survivalShowResult(data.title || 'TEAM WIPED');
    return;
  }
  integrationBaseHandleNetworkData(data, conn);
  integrationUpdateLobby();
};

toggleFlashlight = function() {
  if (!flashlightOn && survivalState.battery <= .2) {
    showToast('電池が空です。BATTERYを使用してください');
    return;
  }
  integrationBaseToggleFlashlight();
};

function integrationFlickerAudio() {
  if (!audioState || elapsed - integrationLastFlickerSound < .18) return;
  var nearest = survivalNearestEnemyDistance();
  if (!Number.isFinite(nearest) || nearest > 8.5) return;
  var risk = THREE.MathUtils.clamp((8.5-nearest)/8.5,0,1);
  if (Math.random() > risk * .10) return;
  integrationLastFlickerSound = elapsed;
  var ctx=audioState.ctx, osc=ctx.createOscillator(), gain=ctx.createGain(), filter=ctx.createBiquadFilter();
  osc.type='square'; osc.frequency.value=92+Math.random()*110; filter.type='bandpass'; filter.frequency.value=420+Math.random()*240; filter.Q.value=1.2;
  gain.gain.setValueAtTime(.0001,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.012+risk*.018,ctx.currentTime+.005); gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.045);
  osc.connect(filter);filter.connect(gain);gain.connect(audioState.master);osc.start();osc.stop(ctx.currentTime+.05);
}

function integrationHostWipeCheck() {
  if (net.mode !== 'host' || elapsed - integrationLastWipeCheck < .65) return;
  integrationLastWipeCheck = elapsed;
  var ids = [net.id, ...net.conns.keys()];
  if (!ids.length) return;
  var allDead = true;
  for (var id of ids) {
    if (id === net.id) { if (survivalState.alive) { allDead=false; break; } }
    else {
      var st=advancedStatus.get(id);
      if (!st || st.alive !== false) { allDead=false; break; }
    }
  }
  if (allDead && !survivalResult.classList.contains('show')) {
    broadcast({type:'run_end',title:'TEAM WIPED'});
    survivalShowResult('TEAM WIPED');
  }
}

updateNetworking = function() {
  integrationBaseUpdateNetworking();
  integrationHostWipeCheck();
  integrationUpdateLobby();
  integrationFlickerAudio();
};

integrationUpdateLobby();
