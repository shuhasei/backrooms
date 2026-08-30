// Survival/gameplay expansion
// Stamina, sanity, inventory, batteries, emotes, player collision, spectator mode,
// procedural session seed, decals, security monitor, settings and run statistics.

var SURVIVAL_INVENTORY_MAX = 3;
var SURVIVAL_PLAYER_COLLISION_RADIUS = .68;
var SURVIVAL_SESSION_SEED = (() => {
  try { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] >>> 0; }
  catch (_) { return (Math.random() * 0xffffffff) >>> 0; }
})();

var survivalState = {
  hp: 100,
  stamina: 100,
  sanity: 100,
  battery: 100,
  alive: true,
  exhausted: false,
  spectator: false,
  spectatorIndex: 0,
  selected: 0,
  inventory: [],
  emote: '',
  emoteUntil: 0,
  deadPosition: new THREE.Vector3(),
  lastBreathAt: -999,
  lastHallucinationAt: -999,
  lastStatusAt: 0,
  stats: {
    startedAt: performance.now(),
    distance: 0,
    screams: 0,
    maxMic: 0,
    pickups: 0,
    levels: 0,
    deaths: 0,
    minSanity: 100,
  },
};

var survivalLootRoot = new THREE.Group();
var survivalDecalRoot = new THREE.Group();
var survivalSecurityRoot = new THREE.Group();
var survivalAnomalyRoot = new THREE.Group();
scene.add(survivalLootRoot, survivalDecalRoot, survivalSecurityRoot, survivalAnomalyRoot);

var survivalLoot = new Map();
var survivalAnomaly = null;
var survivalSecurityCamera = null;
var survivalSecurityTarget = null;
var survivalSecurityScreen = null;
var survivalSecurityLastRender = -999;
var survivalSecurityFrameVisible = true;
var survivalResultVisible = false;
var survivalBaseHash3 = hash3;

// Session-specific procedural world. Multiplayer-advanced synchronizes this seed
// before the host's welcome packet is processed by a joining client.
hash3 = function seededHash3(a, b, c) {
  return survivalBaseHash3(((a | 0) ^ SURVIVAL_SESSION_SEED) | 0, b, c);
};

function survivalApplySessionSeed(seed, rebuild) {
  seed = Number(seed) >>> 0;
  if (!seed || seed === SURVIVAL_SESSION_SEED) return;
  SURVIVAL_SESSION_SEED = seed;
  if (rebuild) switchLevel(currentLevelIndex, true);
}

// -----------------------------------------------------------------------------
// UI
// -----------------------------------------------------------------------------
var survivalStyle = document.createElement('style');
survivalStyle.textContent = `
#survivalHud{position:fixed;z-index:22;left:18px;bottom:18px;width:min(390px,calc(100vw - 36px));font:600 11px/1.25 ui-monospace,Consolas,monospace;color:#eee8c8;pointer-events:none;text-shadow:0 1px 2px #000}
.sv-row{display:grid;grid-template-columns:58px 1fr 38px;align-items:center;gap:7px;margin:4px 0}.sv-bar{height:7px;background:#111b;border:1px solid #d7c98255;overflow:hidden}.sv-bar>i{display:block;height:100%;transform-origin:left center;background:#e6d071}.sv-inv{display:flex;gap:6px;margin-top:9px}.sv-slot{min-width:88px;max-width:122px;height:35px;padding:4px 7px;border:1px solid #d7c98255;background:#090b09bb;display:flex;align-items:center;gap:6px}.sv-slot.sel{border-color:#f2df86;box-shadow:0 0 8px #f0d66733}.sv-slot b{font-size:13px}.sv-slot small{opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sv-emote{margin-top:5px;letter-spacing:.08em;color:#ffdb7d}
#survivalResult{position:fixed;z-index:80;inset:0;display:none;place-items:center;background:#040504e8;color:#f4eccb;font:600 14px ui-monospace,monospace}#survivalResult.show{display:grid}.sv-result-card{width:min(620px,90vw);padding:24px;border:1px solid #dfca6f55;background:#111511}.sv-result-card h2{margin:0 0 16px;font-size:26px}.sv-stat{display:grid;grid-template-columns:140px 1fr 70px;gap:10px;align-items:center;margin:10px 0}.sv-stat i{height:7px;background:#d3bb5d}.sv-result-card button{margin-top:16px;padding:10px 16px}
#survivalSettings{margin-top:10px;padding-top:8px;border-top:1px solid #ffffff22}.sv-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sv-settings-grid label{display:flex;flex-direction:column;gap:4px}.sv-settings-grid input[type=range]{width:100%}
`;
document.head.appendChild(survivalStyle);

var survivalHud = document.createElement('div');
survivalHud.id = 'survivalHud';
survivalHud.innerHTML = `
  <div class="sv-row"><span>HP</span><span class="sv-bar"><i id="svHp"></i></span><b id="svHpN">100</b></div>
  <div class="sv-row"><span>STAMINA</span><span class="sv-bar"><i id="svStamina"></i></span><b id="svStaminaN">100</b></div>
  <div class="sv-row"><span>SANITY</span><span class="sv-bar"><i id="svSanity"></i></span><b id="svSanityN">100</b></div>
  <div class="sv-row"><span>BATTERY</span><span class="sv-bar"><i id="svBattery"></i></span><b id="svBatteryN">100</b></div>
  <div id="svInventory" class="sv-inv"></div>
  <div id="svEmote" class="sv-emote"></div>
`;
document.body.appendChild(survivalHud);

var svHp = survivalHud.querySelector('#svHp');
var svHpN = survivalHud.querySelector('#svHpN');
var svStamina = survivalHud.querySelector('#svStamina');
var svStaminaN = survivalHud.querySelector('#svStaminaN');
var svSanity = survivalHud.querySelector('#svSanity');
var svSanityN = survivalHud.querySelector('#svSanityN');
var svBattery = survivalHud.querySelector('#svBattery');
var svBatteryN = survivalHud.querySelector('#svBatteryN');
var svInventory = survivalHud.querySelector('#svInventory');
var svEmote = survivalHud.querySelector('#svEmote');

var survivalResult = document.createElement('div');
survivalResult.id = 'survivalResult';
survivalResult.innerHTML = '<div class="sv-result-card"><h2 id="svResultTitle">RUN ENDED</h2><div id="svResultStats"></div><button id="svResultClose">観戦 / 続行</button></div>';
document.body.appendChild(survivalResult);
survivalResult.querySelector('#svResultClose').addEventListener('click', () => survivalResult.classList.remove('show'));

function survivalMeter(el, value) { el.style.transform = `scaleX(${THREE.MathUtils.clamp(value, 0, 100) / 100})`; }
function survivalUpdateHud() {
  survivalMeter(svHp, survivalState.hp); svHpN.textContent = Math.round(survivalState.hp);
  survivalMeter(svStamina, survivalState.stamina); svStaminaN.textContent = Math.round(survivalState.stamina);
  survivalMeter(svSanity, survivalState.sanity); svSanityN.textContent = Math.round(survivalState.sanity);
  survivalMeter(svBattery, survivalState.battery); svBatteryN.textContent = Math.round(survivalState.battery);
  var labels = { battery:'BATTERY', almond:'ALMOND', medkit:'MEDKIT', key:'KEY' };
  svInventory.innerHTML = '';
  for (var i = 0; i < SURVIVAL_INVENTORY_MAX; i++) {
    var div = document.createElement('div');
    div.className = 'sv-slot' + (i === survivalState.selected ? ' sel' : '');
    var item = survivalState.inventory[i];
    div.innerHTML = `<b>${i + 1}</b><small>${item ? labels[item] || item.toUpperCase() : 'EMPTY'}</small>`;
    svInventory.appendChild(div);
  }
  svEmote.textContent = survivalState.spectator ? 'SPECTATOR · TAB: next player' : survivalState.emote ? `EMOTE · ${survivalState.emote.toUpperCase()}` : '';
}

function survivalAddSettings() {
  if (document.querySelector('#survivalSettings')) return;
  var box = document.createElement('div');
  box.id = 'survivalSettings';
  box.innerHTML = `
    <div class="sv-settings-grid">
      <label>MASTER VOLUME <input id="svVolume" type="range" min="0" max="100" value="58"></label>
      <label>MIC SENSITIVITY <input id="svMicSensitivity" type="range" min="4" max="25" value="12"></label>
      <label><span>PLAYER COLLISION</span><input id="svCollision" type="checkbox" checked></label>
      <label><span>FULLSCREEN</span><button id="svFullscreen" type="button">全画面にする</button></label>
    </div>`;
  menu.appendChild(box);
  box.querySelector('#svVolume').addEventListener('input', function() {
    ensureAudio(); if (audioState?.master) audioState.master.gain.value = Number(this.value) / 100;
  });
  box.querySelector('#svMicSensitivity').addEventListener('input', function() {
    if (typeof IMMERSIVE_VOICE_NOISE_THRESHOLD !== 'undefined') IMMERSIVE_VOICE_NOISE_THRESHOLD = Number(this.value) / 100;
  });
  box.querySelector('#svCollision').addEventListener('change', function() { survivalPlayerCollisionEnabled = this.checked; });
  box.querySelector('#svFullscreen').addEventListener('click', async function() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) { showToast('このブラウザでは全画面を開始できませんでした'); }
  });
}
var survivalPlayerCollisionEnabled = true;
survivalAddSettings();

// -----------------------------------------------------------------------------
// Inventory and items
// -----------------------------------------------------------------------------
var survivalLootCatalog = {
  battery: { name:'Battery', color:0xe3d162 },
  almond: { name:'Almond Water', color:0xb9e1d2 },
  medkit: { name:'Medkit', color:0xd96a5f },
  key: { name:'Key', color:0xcaa95a },
};

function survivalInventoryHasSpace() { return survivalState.inventory.length < SURVIVAL_INVENTORY_MAX; }
function survivalGiveItem(type) {
  if (!survivalInventoryHasSpace()) return false;
  survivalState.inventory.push(type);
  survivalState.stats.pickups++;
  survivalUpdateHud();
  return true;
}
function survivalRemoveSelected() {
  if (!survivalState.inventory.length) return null;
  var index = THREE.MathUtils.clamp(survivalState.selected, 0, survivalState.inventory.length - 1);
  var item = survivalState.inventory.splice(index, 1)[0];
  survivalState.selected = Math.min(survivalState.selected, Math.max(0, survivalState.inventory.length - 1));
  survivalUpdateHud();
  return item;
}
function survivalConsumeType(type) {
  var i = survivalState.inventory.indexOf(type);
  if (i < 0) return false;
  survivalState.inventory.splice(i, 1);
  survivalState.selected = Math.min(survivalState.selected, Math.max(0, survivalState.inventory.length - 1));
  survivalUpdateHud();
  return true;
}
function survivalUseSelected() {
  var type = survivalState.inventory[survivalState.selected];
  if (!type) { showToast('スロットが空です'); return; }
  if (type === 'battery') {
    survivalState.battery = Math.min(100, survivalState.battery + 58); survivalRemoveSelected(); showToast('電池を交換した');
  } else if (type === 'almond') {
    survivalState.sanity = Math.min(100, survivalState.sanity + 42); survivalState.hp = Math.min(100, survivalState.hp + 8); survivalRemoveSelected(); showToast('アーモンドウォーターを飲んだ');
  } else if (type === 'medkit') {
    survivalState.hp = Math.min(100, survivalState.hp + 52); survivalRemoveSelected(); showToast('応急処置をした');
  } else if (type === 'key') {
    showToast('鍵は異常な出口やロックに使用できます');
  }
  survivalUpdateHud();
}

function survivalLootVisual(type) {
  var g = new THREE.Group();
  var info = survivalLootCatalog[type] || survivalLootCatalog.key;
  var mat = new THREE.MeshStandardMaterial({ color: info.color, emissive: info.color, emissiveIntensity: .18, roughness: .55, metalness: type === 'key' ? .45 : .05 });
  if (type === 'battery') {
    var b = new THREE.Mesh(geo.cylinder, mat); b.scale.set(.17,.42,.17); b.position.y=.24; g.add(b);
    var cap = new THREE.Mesh(geo.cylinder, materials.dark); cap.scale.set(.10,.05,.10); cap.position.y=.48; g.add(cap);
  } else if (type === 'almond') {
    var bottle = new THREE.Mesh(geo.cylinder, mat); bottle.scale.set(.17,.48,.17); bottle.position.y=.28; g.add(bottle);
    var lid = new THREE.Mesh(geo.cylinder, materials.dark); lid.scale.set(.11,.07,.11); lid.position.y=.57; g.add(lid);
  } else if (type === 'medkit') {
    var kit = new THREE.Mesh(geo.box, mat); kit.scale.set(.52,.34,.22); kit.position.y=.24; g.add(kit);
    var crossV = new THREE.Mesh(geo.box, materials.fixture); crossV.scale.set(.08,.23,.025); crossV.position.set(0,.24,-.235); g.add(crossV);
    var crossH = new THREE.Mesh(geo.box, materials.fixture); crossH.scale.set(.23,.08,.025); crossH.position.set(0,.24,-.235); g.add(crossH);
  } else {
    var ring = new THREE.Mesh(geo.torus, mat); ring.scale.set(.28,.28,.07); ring.position.y=.34; ring.rotation.x=Math.PI/2; g.add(ring);
    var stem = new THREE.Mesh(geo.box, mat); stem.scale.set(.08,.08,.45); stem.position.set(.28,.34,0); g.add(stem);
  }
  var halo = new THREE.Mesh(geo.torus, mat); halo.rotation.x=Math.PI/2; halo.scale.set(.52,.52,.035); halo.position.y=.04; g.add(halo);
  return g;
}

function survivalClearLoot() {
  for (var child of [...survivalLootRoot.children]) survivalLootRoot.remove(child);
  survivalLoot.clear();
}

function survivalSpawnLootItem(id, type, x, z, claimed) {
  var item = { id, type, x:Number(x)||0, z:Number(z)||0, claimed:!!claimed, group:null };
  if (!item.claimed) {
    item.group = survivalLootVisual(type);
    item.group.position.set(item.x, 0, item.z);
    survivalLootRoot.add(item.group);
  }
  survivalLoot.set(id, item);
  return item;
}

function survivalBuildHostLoot() {
  survivalClearLoot();
  var rng = mulberry32(hash3(0x51aa20, currentLevelIndex + 1, SURVIVAL_SESSION_SEED & 0xffff));
  var types = ['battery','almond','medkit','key','battery','almond'];
  for (var i=0;i<types.length;i++) {
    var p = findWalkablePoint(5.5 + i*.7, 17 + i*.8, rng);
    survivalSpawnLootItem(`L${currentLevelIndex}-${i}`, types[(i + currentLevelIndex) % types.length], p.x, p.z, false);
  }
}

function survivalLootStatePacket() {
  return { type:'loot_state', level:currentLevelIndex, items:[...survivalLoot.values()].map(it => ({ id:it.id,type:it.type,x:round2(it.x),z:round2(it.z),claimed:!!it.claimed })) };
}
function survivalApplyLootState(items) {
  if (!Array.isArray(items)) return;
  survivalClearLoot();
  for (var it of items) if (it?.id && it?.type) survivalSpawnLootItem(it.id, it.type, it.x, it.z, it.claimed);
}
function survivalApplyLootClaim(id, ownerId) {
  var item = survivalLoot.get(id);
  if (!item || item.claimed) return;
  item.claimed = true;
  if (item.group) survivalLootRoot.remove(item.group);
  item.group = null;
  var localId = net.id || 'local';
  if (ownerId === localId || (net.mode === 'solo' && ownerId === 'local')) {
    if (!survivalGiveItem(item.type)) showToast('インベントリがいっぱいです');
    else showToast(`${survivalLootCatalog[item.type]?.name || item.type} を拾った`);
  }
}

// multiplayer-advanced replaces this with host-authoritative ownership.
function survivalPickupRequest(id) {
  var item = survivalLoot.get(id);
  if (!item || item.claimed) return;
  if (!survivalInventoryHasSpace()) { showToast('インベントリがいっぱいです'); return; }
  survivalApplyLootClaim(id, 'local');
}

// -----------------------------------------------------------------------------
// Anomaly / level transition gimmick
// -----------------------------------------------------------------------------
function survivalBuildAnomaly() {
  survivalAnomalyRoot.clear();
  survivalAnomaly = null;
  var rng = mulberry32(hash3(0x99102, currentLevelIndex, 4));
  var p = findWalkablePoint(7, 12, rng);
  var g = new THREE.Group();
  g.position.set(p.x, .9, p.z);
  var mat = new THREE.MeshStandardMaterial({ color:0x272415, emissive:0x77713a, emissiveIntensity:.16, transparent:true, opacity:.72, side:THREE.DoubleSide, roughness:.98 });
  var plane = new THREE.Mesh(geo.plane, mat); plane.scale.set(1.25,1.72,1); g.add(plane);
  var edge = new THREE.Mesh(geo.torus, materials.dark); edge.scale.set(1.02,1.36,.06); edge.position.z=.02; g.add(edge);
  survivalAnomalyRoot.add(g);
  survivalAnomaly = g;
}
function survivalRequestAnomaly() {
  if (!survivalConsumeType('key')) { showToast('この異常面には鍵が必要だ'); return; }
  if (typeof advancedRequestAnomalyTransition === 'function') advancedRequestAnomalyTransition();
  else nextLevel();
}

// -----------------------------------------------------------------------------
// Interaction wrappers
// -----------------------------------------------------------------------------
var survivalBaseUpdateInteraction = updateInteraction;
updateInteraction = function() {
  survivalBaseUpdateInteraction();
  if (!survivalState.alive) { currentInteract = null; interactionEl.textContent = 'TAB · 観戦対象を切替'; return; }
  var best = currentInteract;
  var bestDist = best ? INTERACT_DISTANCE : 2.25;
  for (var it of survivalLoot.values()) {
    if (it.claimed || !it.group) continue;
    var d = distanceXZ(camera.position, it.group.position);
    if (d < bestDist) { bestDist=d; best={kind:'survival-loot', item:it}; }
  }
  if (survivalAnomaly) {
    var da = distanceXZ(camera.position, survivalAnomaly.position);
    if (da < Math.max(bestDist, 1.85)) { bestDist=da; best={kind:'survival-anomaly'}; }
  }
  currentInteract = best;
  if (best?.kind === 'survival-loot') interactionEl.textContent = `[E] ${survivalLootCatalog[best.item.type]?.name || 'ITEM'} を拾う`;
  else if (best?.kind === 'survival-anomaly') interactionEl.textContent = '[E] 異常な壁をノークリップする（KEY）';
};

var survivalBaseInteract = interact;
interact = function() {
  if (currentInteract?.kind === 'survival-loot') { survivalPickupRequest(currentInteract.item.id); return; }
  if (currentInteract?.kind === 'survival-anomaly') { survivalRequestAnomaly(); return; }
  survivalBaseInteract();
};

// -----------------------------------------------------------------------------
// Stamina, movement, player collision and stats
// -----------------------------------------------------------------------------
function survivalEmitNoise(strength, source) {
  strength = THREE.MathUtils.clamp(strength,0,1);
  if (net.mode === 'client' && net.hostConn?.open) net.hostConn.send({type:'player_noise',strength:round2(strength),source:source||'noise'});
  else emitNoise(strength, source || 'noise');
}
function survivalBreath() {
  ensureAudio();
  if (audioState) {
    var ctx=audioState.ctx, osc=ctx.createOscillator(), gain=ctx.createGain(), filter=ctx.createBiquadFilter();
    osc.type='sawtooth'; osc.frequency.value=82; filter.type='lowpass'; filter.frequency.value=210;
    gain.gain.setValueAtTime(.0001,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.026,ctx.currentTime+.02); gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.31);
    osc.connect(filter); filter.connect(gain); gain.connect(audioState.master); osc.start(); osc.stop(ctx.currentTime+.34);
  }
  survivalEmitNoise(.24,'breathing');
}

var survivalBaseUpdateMovement = updateMovement;
updateMovement = function(dt) {
  if (!survivalState.alive) { survivalUpdateSpectator(dt); return; }
  var px=camera.position.x, pz=camera.position.z;
  var hadL=pressed.has('ShiftLeft'), hadR=pressed.has('ShiftRight');
  var allowSprint = survivalState.stamina > 1 && !survivalState.exhausted;
  if (!allowSprint) { pressed.delete('ShiftLeft'); pressed.delete('ShiftRight'); }
  survivalBaseUpdateMovement(dt);
  if (hadL) pressed.add('ShiftLeft'); if (hadR) pressed.add('ShiftRight');

  if (sprinting) {
    survivalState.stamina = Math.max(0, survivalState.stamina - dt * 24);
    if (survivalState.stamina <= .2) { survivalState.exhausted=true; showToast('息が切れた'); }
  } else {
    survivalState.stamina = Math.min(100, survivalState.stamina + dt * (moving ? 10 : 16));
    if (survivalState.exhausted && survivalState.stamina > 34) survivalState.exhausted=false;
  }
  if ((survivalState.stamina < 24 || survivalState.exhausted) && elapsed - survivalState.lastBreathAt > (survivalState.exhausted ? .85 : 1.35)) {
    survivalState.lastBreathAt=elapsed; survivalBreath();
  }

  if (survivalPlayerCollisionEnabled && net.mode !== 'solo') {
    for (var rp of remotePlayers.values()) {
      if (rp.alive === false) continue;
      var pp=rp.group?.position || rp.target;
      if (!pp) continue;
      if (Math.hypot(camera.position.x-pp.x,camera.position.z-pp.z) < SURVIVAL_PLAYER_COLLISION_RADIUS) {
        camera.position.x=px; camera.position.z=pz; break;
      }
    }
  }
  survivalState.stats.distance += Math.hypot(camera.position.x-px,camera.position.z-pz);
  survivalUpdateHud();
};

// -----------------------------------------------------------------------------
// Sanity + battery + hallucinations
// -----------------------------------------------------------------------------
function survivalNearestEnemyDistance() {
  var d=Infinity;
  for (var e of entities) d=Math.min(d,distanceXZ(camera.position,e.group.position));
  return d;
}
function survivalHallucination() {
  survivalState.lastHallucinationAt=elapsed;
  ensureAudio();
  if (audioState) {
    for (var i=0;i<2;i++) setTimeout(() => { playFootstep(); }, i*230);
  }
  var grain=document.querySelector('#grain'); if (grain) { grain.style.opacity='.28'; setTimeout(()=>grain.style.opacity='',420); }
}
function survivalUpdateStatus(dt) {
  if (!survivalState.alive) return;
  var nearest=survivalNearestEnemyDistance();
  var dark = !flashlightOn || LEVELS[currentLevelIndex].name === 'Level 6';
  var drain = dark ? .42 : -.12;
  if (nearest < 11) drain += (11-nearest) * .16;
  if (LEVELS[currentLevelIndex].name === 'Level !') drain += .75;
  survivalState.sanity = THREE.MathUtils.clamp(survivalState.sanity - drain*dt, 0, 100);
  survivalState.stats.minSanity=Math.min(survivalState.stats.minSanity,survivalState.sanity);
  survivalState.stats.maxMic=Math.max(survivalState.stats.maxMic,mic.level||0);
  if (mic.level > .34 && (survivalState._lastScreamAt||-99) < elapsed-.8) { survivalState._lastScreamAt=elapsed; survivalState.stats.screams++; }

  if (flashlightOn) {
    survivalState.battery=Math.max(0,survivalState.battery-dt*(LEVELS[currentLevelIndex].name==='Level 6' ? 1.15 : .72));
    if (survivalState.battery <= 0) { flashlightOn=false; flashlight.intensity=0; showToast('懐中電灯の電池が切れた'); }
  }
  if (survivalState.sanity < 38 && elapsed-survivalState.lastHallucinationAt > 4.5 + survivalState.sanity*.08 && Math.random() < dt*.55) survivalHallucination();
  var madness=(100-survivalState.sanity)/100;
  renderer.domElement.style.filter = madness > .22 ? `contrast(${1+madness*.11}) saturate(${1-madness*.22}) blur(${madness*.28}px)` : '';
  survivalUpdateHud();
}

var survivalBaseUpdateEntities = updateEntities;
updateEntities = function(dt) {
  survivalBaseUpdateEntities(dt);
  survivalUpdateStatus(dt);
};

// -----------------------------------------------------------------------------
// Damage, death, spectator
// -----------------------------------------------------------------------------
function survivalDamage(amount, reason) {
  if (!survivalState.alive) return;
  survivalState.hp=Math.max(0,survivalState.hp-amount);
  if (survivalState.hp<=0) survivalDie(reason||'ENTITY');
  survivalUpdateHud();
}
function survivalDie(reason) {
  if (!survivalState.alive) return;
  survivalState.alive=false; survivalState.spectator=net.mode!=='solo'; survivalState.stats.deaths++;
  survivalState.deadPosition.copy(camera.position);
  pressed.clear(); try{controls.unlock();}catch(_){}
  showToast(`YOU DIED · ${reason}`);
  if (net.mode==='solo') survivalShowResult('YOU DIED');
  else { survivalState.spectatorIndex=0; survivalUpdateSpectator(0); }
  survivalUpdateHud();
}
function survivalLivingRemotes() { return [...remotePlayers.values()].filter(r=>r.alive!==false); }
function survivalUpdateSpectator(dt) {
  if (!survivalState.spectator) return;
  var list=survivalLivingRemotes();
  if (!list.length) return;
  survivalState.spectatorIndex=((survivalState.spectatorIndex%list.length)+list.length)%list.length;
  var rp=list[survivalState.spectatorIndex], p=rp.group?.position||rp.target;
  camera.position.set(p.x, EYE_HEIGHT, p.z);
  camera.rotation.y=THREE.MathUtils.lerp(camera.rotation.y,rp.targetYaw||0,Math.min(1,dt*10));
  camera.rotation.x=THREE.MathUtils.lerp(camera.rotation.x,rp.targetPitch||0,Math.min(1,dt*10));
}
function survivalCycleSpectator() { var list=survivalLivingRemotes(); if(list.length){survivalState.spectatorIndex=(survivalState.spectatorIndex+1)%list.length; showToast(`SPECTATING ${list[survivalState.spectatorIndex].id?.slice(-6)||'PLAYER'}`);} }

var survivalBaseTriggerScare = triggerScare;
triggerScare = function(e) { if(!survivalState.alive)return; survivalBaseTriggerScare(e); survivalDamage(e?.kind==='wire'?48:34,e?.kind||'ENTITY'); };
if (typeof aiRemoteHit === 'function') {
  var survivalBaseAiRemoteHit=aiRemoteHit;
  aiRemoteHit=function(data){ if(!survivalState.alive)return; survivalBaseAiRemoteHit(data); survivalDamage(36,'ENTITY'); };
}

// -----------------------------------------------------------------------------
// Key / emotes
// -----------------------------------------------------------------------------
function survivalSetEmote(name) { if(!survivalState.alive)return; survivalState.emote=name; survivalState.emoteUntil=elapsed+2.4; survivalUpdateHud(); }
var survivalBaseOnKeyDown=onKeyDown;
onKeyDown=function(event){
  if(event.code==='Digit1'||event.code==='Digit2'||event.code==='Digit3'){survivalState.selected=Number(event.code.slice(-1))-1;survivalUpdateHud();return;}
  if(event.code==='KeyQ'&&!event.repeat){survivalUseSelected();return;}
  if(event.code==='KeyZ'&&!event.repeat){survivalSetEmote('point');return;}
  if(event.code==='KeyX'&&!event.repeat){survivalSetEmote('beckon');return;}
  if(event.code==='KeyC'&&!event.repeat){survivalSetEmote('quiet');return;}
  if(event.code==='Tab'&&survivalState.spectator){event.preventDefault();survivalCycleSpectator();return;}
  survivalBaseOnKeyDown(event);
};

// -----------------------------------------------------------------------------
// Decals (actual DecalGeometry on the non-instanced starter walls)
// -----------------------------------------------------------------------------
function survivalGraffitiTexture(text, color) {
  var c=document.createElement('canvas'); c.width=512;c.height=128;var ctx=c.getContext('2d');ctx.clearRect(0,0,512,128);
  ctx.font='900 54px Impact,Arial Black,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color||'#37120f';ctx.globalAlpha=.86;ctx.fillText(text,256,64);
  for(var i=0;i<36;i++){ctx.globalAlpha=.12+Math.random()*.14;ctx.fillRect(Math.random()*512,70+Math.random()*45,2+Math.random()*4,8+Math.random()*42);}
  var tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function survivalClearDecals(){for(var ch of [...survivalDecalRoot.children]){ch.material?.map?.dispose?.();ch.material?.dispose?.();ch.geometry?.dispose?.();survivalDecalRoot.remove(ch);}}
function survivalPlaceDecals(){
  survivalClearDecals(); if(typeof DecalGeometry==='undefined')return;
  var chunk=chunks.get('0,0'); if(!chunk)return;
  var candidates=[];chunk.group.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh&&o.material===materials.wall&&o.geometry===geo.box&&(o.scale.x>2||o.scale.z>2))candidates.push(o);});
  var messages=["DON'T LOOK BACK",'← EXIT?'];
  for(var i=0;i<Math.min(2,candidates.length);i++){
    var target=candidates[i];target.updateMatrixWorld(true);var box=new THREE.Box3().setFromObject(target),center=new THREE.Vector3();box.getCenter(center);var size=new THREE.Vector3();box.getSize(size);
    var pos=center.clone(),ori=new THREE.Euler();
    if(size.x>=size.z){var sign=camera.position.z>=center.z?1:-1;pos.z=center.z+sign*size.z*.5;ori.y=sign>0?0:Math.PI;}
    else{var signX=camera.position.x>=center.x?1:-1;pos.x=center.x+signX*size.x*.5;ori.y=signX>0?-Math.PI/2:Math.PI/2;}
    var dg;try{dg=new DecalGeometry(target,pos,ori,new THREE.Vector3(i?2.0:3.2,.72,.22));}catch(_){continue;}
    var tex=survivalGraffitiTexture(messages[i],i?'#24170c':'#4a120d');var mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,side:THREE.DoubleSide});
    survivalDecalRoot.add(new THREE.Mesh(dg,mat));
  }
}

// -----------------------------------------------------------------------------
// Security monitor (low-res render target, throttled)
// -----------------------------------------------------------------------------
function survivalDisposeSecurity(){
  if(survivalSecurityTarget)survivalSecurityTarget.dispose();
  for(var c of [...survivalSecurityRoot.children])survivalSecurityRoot.remove(c);
  survivalSecurityTarget=null;survivalSecurityCamera=null;survivalSecurityScreen=null;
}
function survivalBuildSecurity(){
  survivalDisposeSecurity();
  var size=qualityMode==='low'?128:256;survivalSecurityTarget=new THREE.WebGLRenderTarget(size,Math.round(size*9/16),{depthBuffer:true});
  survivalSecurityCamera=new THREE.PerspectiveCamera(62,16/9,.08,55);survivalSecurityCamera.position.set(-7,1.75,-7);survivalSecurityCamera.lookAt(0,1.1,0);
  var g=new THREE.Group();g.position.set(7.02,1.35,2.3);g.rotation.y=-Math.PI/2;
  var frame=new THREE.Mesh(geo.box,materials.dark);frame.scale.set(1.68,1.02,.12);g.add(frame);
  var screenMat=new THREE.MeshBasicMaterial({map:survivalSecurityTarget.texture,toneMapped:false});var screen=new THREE.Mesh(geo.plane,screenMat);screen.position.z=-.071;screen.scale.set(1.45,.80,1);g.add(screen);survivalSecurityScreen=screen;
  survivalSecurityRoot.add(g);
}
function survivalUpdateSecurity(){
  if(!survivalSecurityTarget||!survivalSecurityCamera||elapsed-survivalSecurityLastRender<.18)return;
  if(qualityMode==='low'&&distanceXZ(camera.position,survivalSecurityRoot.children[0]?.position||camera.position)>10)return;
  survivalSecurityLastRender=elapsed;var prev=renderer.getRenderTarget();if(survivalSecurityScreen)survivalSecurityScreen.visible=false;
  renderer.setRenderTarget(survivalSecurityTarget);renderer.clear();
  try{if(typeof immersiveOriginalRendererRender==='function')immersiveOriginalRendererRender(scene,survivalSecurityCamera);else renderer.render(scene,survivalSecurityCamera);}catch(_){}
  renderer.setRenderTarget(prev);if(survivalSecurityScreen)survivalSecurityScreen.visible=true;
}
var survivalBaseUpdateRemotePlayers=updateRemotePlayers;
updateRemotePlayers=function(dt){survivalBaseUpdateRemotePlayers(dt);survivalUpdateSecurity();if(survivalState.emote&&elapsed>survivalState.emoteUntil){survivalState.emote='';survivalUpdateHud();}};

// -----------------------------------------------------------------------------
// Lighting flicker + battery brightness. Loaded after immersive-horror renderer
// wrapper so this executes immediately before the final frame is submitted.
// -----------------------------------------------------------------------------
var survivalRenderBase=renderer.render.bind(renderer);var survivalRenderGuard=false;
renderer.render=function(s,c){
  if(survivalRenderGuard)return survivalRenderBase(s,c);
  survivalRenderGuard=true;
  var nearest=survivalNearestEnemyDistance();var risk=THREE.MathUtils.clamp((11-nearest)/11,0,1);var pulse=(Math.sin(elapsed*28)+Math.sin(elapsed*47.3))*.5;
  if(risk>.05)materials.fixture.emissiveIntensity*=THREE.MathUtils.clamp(1-risk*(.28+.40*Math.max(0,pulse)),.18,1);
  if(flashlightOn){var batteryScale=.42+.58*(survivalState.battery/100);var low=survivalState.battery<14?(Math.sin(elapsed*36)> .62?.28:1):1;flashlight.intensity=(qualityMode==='low'?24:34)*batteryScale*low;}
  var out=survivalRenderBase(s,c);survivalRenderGuard=false;return out;
};

// -----------------------------------------------------------------------------
// Level lifecycle / procedural gimmicks
// -----------------------------------------------------------------------------
function survivalClearLevelExtras(){survivalClearLoot();survivalClearDecals();survivalDisposeSecurity();survivalAnomalyRoot.clear();survivalAnomaly=null;}
function survivalSetupLevelExtras(){
  if(net.mode!=='client')survivalBuildHostLoot();
  survivalBuildAnomaly();survivalBuildSecurity();setTimeout(survivalPlaceDecals,50);
  survivalState.stats.levels=Math.max(survivalState.stats.levels,currentLevelIndex+1);
}
var survivalBaseSwitchLevel=switchLevel;
switchLevel=function(index,silent){survivalClearLevelExtras();survivalBaseSwitchLevel(index,silent);survivalSetupLevelExtras();};

// -----------------------------------------------------------------------------
// Result / statistics
// -----------------------------------------------------------------------------
function survivalShowResult(title){
  survivalResultVisible=true;var total=Math.max(1,(performance.now()-survivalState.stats.startedAt)/1000);var s=survivalState.stats;
  survivalResult.querySelector('#svResultTitle').textContent=title||'RUN RESULT';
  var rows=[['生存時間',Math.round(total)+'s',Math.min(100,total/9)],['移動距離',Math.round(s.distance)+'m',Math.min(100,s.distance/4)],['叫び検知',s.screams+'回',Math.min(100,s.screams*12)],['最大マイク',Math.round(s.maxMic*100)+'%',Math.min(100,s.maxMic*100)],['最低正気度',Math.round(s.minSanity)+'%',100-s.minSanity],['取得アイテム',s.pickups+'個',Math.min(100,s.pickups*12)]];
  survivalResult.querySelector('#svResultStats').innerHTML=rows.map(r=>`<div class="sv-stat"><span>${r[0]}</span><span class="sv-bar"><i style="display:block;width:${r[2]}%;height:100%;background:#d3bb5d"></i></span><b>${r[1]}</b></div>`).join('');
  survivalResult.classList.add('show');
}
var survivalBaseNextLevel=nextLevel;
nextLevel=function(){var last=currentLevelIndex>=LEVELS.length-1;survivalBaseNextLevel();if(last&&levelWon)survivalShowResult('ESCAPED');};

survivalUpdateHud();
