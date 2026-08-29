function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .045);
  elapsed += dt;
  scareCooldown = Math.max(0, scareCooldown - dt);
  toastTimer = Math.max(0, toastTimer - dt);

  if (controls.isLocked || isTouchDevice()) updateMovement(dt);
  updateChunks();
  updateMic();
  updateEncounter(dt);
  updateEntities(dt);
  updateInteraction();
  animateObjectives();
  updateRemotePlayers(dt);
  updateNetworking();
  updatePerformance(dt);
  updateCameraOverlay();

  materials.fixture.emissiveIntensity = 2.15 + Math.sin(elapsed * 7.3) * .035 + (Math.sin(elapsed * 26.7) > .995 ? -.8 : 0);
  renderer.toneMappingExposure = .935 + Math.sin(elapsed * .19) * .008;
  renderer.render(scene, camera);
}

function updatePerformance(dt) {
  fpsAccum += 1 / Math.max(.0001, dt); fpsFrames++; fpsWindow += dt;
  if (fpsWindow < 1) return;
  fpsAverage = fpsAccum / fpsFrames; fpsEl.textContent = `${Math.round(fpsAverage)} FPS`;
  fpsAccum = 0; fpsFrames = 0; fpsWindow = 0;
  if (qualityMode === 'auto') {
    const old = renderScale;
    if (fpsAverage < 43) renderScale = Math.max(.62, renderScale - .08);
    else if (fpsAverage > 57) renderScale = Math.min(1.12, renderScale + .04);
    if (Math.abs(old - renderScale) > .001) updateRendererScale();
  }
  updateWorldStatus();
}

function applyQuality(force = false) {
  if (qualityMode === 'low') { renderScale = .70; loadRadius = 1; }
  else if (qualityMode === 'balanced') { renderScale = .92; loadRadius = 1; }
  else if (qualityMode === 'high') { renderScale = Math.min(1.25, devicePixelRatio || 1); loadRadius = 2; }
  else { renderScale = Math.min(1, devicePixelRatio || 1); loadRadius = 1; }
  updateRendererScale();
  if (force) { lastChunkX = Number.NaN; lastChunkZ = Number.NaN; updateChunks(true); }
}

function updateRendererScale() {
  const base = Math.min(devicePixelRatio || 1, 1.5);
  const dpr = qualityMode === 'high' ? renderScale : Math.min(base, renderScale);
  renderer.setPixelRatio(Math.max(.55, dpr)); renderer.setSize(innerWidth, innerHeight, false);
}

function updateWorldStatus() {
  statusEl.textContent = `${chunks.size} chunks · q:${qualityMode} ${Math.round(renderer.getPixelRatio() * 100)}% · stage ${currentLevelIndex + 1}/${LEVELS.length}`;
}

async function toggleMic() {
  if (mic.enabled) { stopMic(); return; }
  if (!navigator.mediaDevices?.getUserMedia) { showToast('このブラウザはマイク入力に対応していません'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false });
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx(), source = ctx.createMediaStreamSource(stream), analyser = ctx.createAnalyser();
    analyser.fftSize = 1024; analyser.smoothingTimeConstant = .42; source.connect(analyser);
    Object.assign(mic, { enabled: true, denied: false, stream, ctx, analyser, data: new Uint8Array(analyser.fftSize) });
    micButton.textContent = 'マイク感知を停止'; micStateEl.textContent = 'LISTENING';
    showToast('声の大きさを怪物AIが感知します。録音・送信はしません');
  } catch (err) { mic.denied = true; micStateEl.textContent = 'DENIED'; showToast('マイク許可がありません'); }
}

function stopMic() {
  mic.stream?.getTracks().forEach(t => t.stop()); mic.ctx?.close?.();
  Object.assign(mic, { enabled: false, level: 0, stream: null, ctx: null, analyser: null, data: null });
  micMeter.style.transform = 'scaleX(0)'; micStateEl.textContent = 'OFF'; micButton.textContent = 'マイク感知を有効化';
}

function updateMic() {
  if (!mic.enabled || !mic.analyser || !mic.data) return;
  mic.analyser.getByteTimeDomainData(mic.data);
  let sum = 0;
  for (let i = 0; i < mic.data.length; i += 4) { const v = (mic.data[i] - 128) / 128; sum += v * v; }
  const rms = Math.sqrt(sum / (mic.data.length / 4)), previous = mic.level;
  mic.level = THREE.MathUtils.lerp(mic.level, Math.min(1, rms * 5.4), .18);
  micMeter.style.transform = `scaleX(${Math.min(1, mic.level)})`; micStateEl.textContent = mic.level > .055 ? 'NOISE!' : 'LISTENING';
  if (mic.level > .16 && previous <= .16) emitNoise(Math.min(1, mic.level * 1.45), 'voice');
}

async function enableGyro() {
  try {
    if (typeof DeviceOrientationEvent === 'undefined') { showToast('端末の向きセンサーが利用できません'); return; }
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const result = await DeviceOrientationEvent.requestPermission(); if (result !== 'granted') throw new Error('permission denied');
    }
    gyro.enabled = !gyro.enabled; gyroButton.textContent = gyro.enabled ? '視点追従 ON' : '端末の向きで視点追従';
    showToast(gyro.enabled ? '端末を向けた方向へ視点が追従します' : '視点追従 OFF');
  } catch (err) { showToast('端末の向きセンサーを有効にできませんでした'); }
}

function onDeviceOrientation(e) {
  if (!gyro.enabled) return;
  gyro.alpha = e.alpha || 0; gyro.beta = e.beta || 0; gyro.gamma = e.gamma || 0; gyro.orient = screen.orientation?.angle || window.orientation || 0;
}

function applyGyroOrientation() {
  const alpha = THREE.MathUtils.degToRad(gyro.alpha), beta = THREE.MathUtils.degToRad(gyro.beta), gamma = THREE.MathUtils.degToRad(gyro.gamma), orient = THREE.MathUtils.degToRad(gyro.orient || 0);
  tmpEuler.set(beta, alpha, -gamma, 'YXZ'); gyro.quaternion.setFromEuler(tmpEuler);
  gyro.quaternion.multiply(new THREE.Quaternion(-Math.sqrt(.5), 0, 0, Math.sqrt(.5)));
  gyro.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -orient));
  camera.quaternion.slerp(gyro.quaternion, .22);
}

function toggleFlashlight() {
  flashlightOn = !flashlightOn; flashlight.intensity = flashlightOn ? (qualityMode === 'low' ? 24 : 34) : 0;
  showToast(flashlightOn ? 'FLASHLIGHT ON — 光を感知する敵に注意' : 'FLASHLIGHT OFF');
  if (net.mode === 'solo') netStateEl.textContent = `SOLO · LIGHT ${flashlightOn ? 'ON' : 'OFF'}`;
}

function setFilter(name) {
  const allowed = ['clean', 'vhs', 'bodycam', 'night'], filter = allowed.includes(name) ? name : 'bodycam';
  document.body.dataset.filter = filter; filterSelect.value = filter;
}
function cycleFilter() { const list = ['clean','vhs','bodycam','night']; const next = list[(list.indexOf(document.body.dataset.filter)+1)%list.length]; setFilter(next); showToast(`FILTER: ${next.toUpperCase()}`); }
function updateCameraOverlay() { const total=Math.floor(elapsed),h=String(Math.floor(total/3600)).padStart(2,'0'),m=String(Math.floor((total%3600)/60)).padStart(2,'0'),s=String(total%60).padStart(2,'0'); cameraTimeEl.textContent=`${h}:${m}:${s}`; }

function ensureAudio() {
  if (audioState) { if (audioState.ctx.state === 'suspended') audioState.ctx.resume(); return; }
  const AudioCtx = window.AudioContext || window.webkitAudioContext; if (!AudioCtx) return;
  const ctx = new AudioCtx(), master = ctx.createGain(); master.gain.value = .58; master.connect(ctx.destination);
  const humGain = ctx.createGain(); humGain.gain.value = humEnabled ? .028 : 0; humGain.connect(master);
  const humFilter = ctx.createBiquadFilter(); humFilter.type='lowpass'; humFilter.frequency.value=420; humFilter.Q.value=.55; humFilter.connect(humGain);
  const humA=ctx.createOscillator(),humB=ctx.createOscillator(),humBGain=ctx.createGain(); humA.type='sine';humB.type='triangle';humA.frequency.value=60;humB.frequency.value=120;humBGain.gain.value=.18;humA.connect(humFilter);humB.connect(humBGain);humBGain.connect(humFilter);humA.start();humB.start();
  const threatOsc=ctx.createOscillator(),threatGain=ctx.createGain();threatOsc.type='sine';threatOsc.frequency.value=44;threatGain.gain.value=0;threatOsc.connect(threatGain);threatGain.connect(master);threatOsc.start();
  audioState={ctx,master,humGain,humA,humB,threatOsc,threatGain};
}
function updateHumGain(){if(audioState)audioState.humGain.gain.setTargetAtTime(humEnabled?.028:0,audioState.ctx.currentTime,.08);}
function updateThreatAudio(distance){if(!audioState)return;const a=Number.isFinite(distance)?THREE.MathUtils.clamp((8-distance)/8,0,1):0;audioState.threatGain.gain.setTargetAtTime(a*.045,audioState.ctx.currentTime,.08);audioState.threatOsc.frequency.setTargetAtTime(42+a*18,audioState.ctx.currentTime,.08);}
function playFootstep(){if(!audioState)return;const{ctx,master}=audioState,osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=LEVELS[currentLevelIndex].floorMode==='pool'?420:190;osc.type='triangle';osc.frequency.value=LEVELS[currentLevelIndex].floorMode==='pool'?115:72+Math.random()*18;gain.gain.setValueAtTime(.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.025,ctx.currentTime+.008);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.07);osc.connect(filter);filter.connect(gain);gain.connect(master);osc.start();osc.stop(ctx.currentTime+.075);}
function playConfirmTone(){tone(330,520,.08,.025);} function playErrorTone(){tone(130,86,.18,.034);} function playScareTone(){tone(72,31,.38,.09,'sawtooth');}
function tone(from,to,duration,volume,type='sine'){ensureAudio();if(!audioState)return;const{ctx,master}=audioState,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(from,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(1,to),ctx.currentTime+duration);gain.gain.setValueAtTime(volume,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);osc.connect(gain);gain.connect(master);osc.start();osc.stop(ctx.currentTime+duration);}

async function getPeerCtor(){const mod=await import('https://cdn.jsdelivr.net/npm/peerjs@1.5.5/+esm');return mod.Peer||mod.default;}
async function hostRoom(){if(net.peer)disconnectNetwork();roomCode.textContent='接続サービスを読み込み中...';try{const Peer=await getPeerCtor(),code=`backrooms-${randomCode(8)}`,peer=new Peer(code);net.peer=peer;net.mode='host';net.id=code;peer.on('open',id=>{net.id=id;roomCode.textContent=`ROOM: ${id}`;netStateEl.textContent=`HOST · 1/${MAX_PLAYERS}`;showToast('ルームを作成しました');});peer.on('connection',conn=>{if(net.conns.size>=MAX_PLAYERS-1){conn.on('open',()=>{conn.send({type:'full'});conn.close();});return;}attachConnection(conn,true);});peer.on('error',()=>roomCode.textContent='オンライン接続に失敗しました。ソロプレイは継続できます。');}catch(err){roomCode.textContent='PeerJS を読み込めませんでした。ネットワーク環境を確認してください。';}}
async function joinRoom(){const code=roomInput.value.trim();if(!code){showToast('ルームコードを入力してください');return;}if(net.peer)disconnectNetwork();roomCode.textContent='接続中...';try{const Peer=await getPeerCtor(),peer=new Peer();net.peer=peer;net.mode='client';peer.on('open',id=>{net.id=id;const conn=peer.connect(code,{reliable:false,serialization:'json'});net.hostConn=conn;attachConnection(conn,false);});peer.on('error',()=>roomCode.textContent='参加できませんでした。コードと通信環境を確認してください。');}catch(err){roomCode.textContent='PeerJS を読み込めませんでした。';}}
function attachConnection(conn,hostSide){conn.on('open',()=>{if(hostSide){net.conns.set(conn.peer,conn);conn.send({type:'welcome',level:currentLevelIndex,host:net.id});broadcastRoster();}else{roomCode.textContent=`JOINED: ${conn.peer}`;netStateEl.textContent='CLIENT · connected';conn.send({type:'hello'});}});conn.on('data',data=>handleNetworkData(data,conn));conn.on('close',()=>{net.conns.delete(conn.peer);removeRemotePlayer(conn.peer);broadcastRoster();updateNetHud();});conn.on('error',()=>updateNetHud());}
function handleNetworkData(data,conn){if(!data||typeof data!=='object')return;if(data.type==='full'){roomCode.textContent='このルームは満員です（最大4人）';conn.close();return;}if(data.type==='welcome'&&net.mode==='client'){if(Number.isInteger(data.level))switchLevel(data.level,true);updateNetHud();return;}if(data.type==='level'&&net.mode==='client'){if(Number.isInteger(data.level)&&data.level!==currentLevelIndex)switchLevel(data.level,true);return;}if(data.type==='state'){const id=data.id||conn.peer;if(id===net.id)return;updateRemoteState(id,data);if(net.mode==='host')broadcast({...data,id},id);return;}if(data.type==='roster')updateNetHud(data.count);}
