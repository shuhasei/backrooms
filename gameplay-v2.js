// Gameplay v2: lightweight billboard entities, explicit raycast sight/interactions,
// escape-code objectives, 20 Hz host enemy sync, synchronized wipe/lobby flow and
// positional fluorescent hum. Loaded after all previous patch layers.

AI_SYNC_HZ = 20;

var GAMEPLAY_RAYCAST_INTERVAL = .10;
var GAMEPLAY_LIGHT_HUM_SOURCES = 4;
var gameplayEnemyRaycaster = new THREE.Raycaster();
var gameplayItemRaycaster = new THREE.Raycaster();
var gameplayRayOrigin = new THREE.Vector3();
var gameplayRayTarget = new THREE.Vector3();
var gameplayRayDir = new THREE.Vector3();
var gameplayEnemySpriteTextures = new Map();
var gameplayEnemySpriteMaterials = new Map();
var gameplayLightHum = [];
var gameplayLightHumCtx = null;
var gameplayLastHumPositionAt = -999;
var gameplayTeamHasCode = false;
var gameplayEscapeCode = '';
var gameplayWipePending = false;
var gameplayReturnTimer = null;

// -----------------------------------------------------------------------------
// HUD overlays
// -----------------------------------------------------------------------------
var gameplayStyle = document.createElement('style');
gameplayStyle.textContent = `
#gameplayLevelClear,#gameplaySignalLost{position:fixed;z-index:96;inset:0;display:grid;place-items:center;pointer-events:none;opacity:0;transition:opacity .16s ease;background:#020302d9;font:900 clamp(30px,7vw,88px)/1 ui-monospace,Consolas,monospace;letter-spacing:.12em;text-shadow:0 0 18px #000}
#gameplayLevelClear.show,#gameplaySignalLost.show{opacity:1}
#gameplayLevelClear{color:#e9e3bc}#gameplaySignalLost{color:#e8e6d5;background:#020202ed}
#gameplayCodeHud{position:fixed;z-index:24;right:18px;bottom:18px;padding:7px 10px;border:1px solid #d8c86a44;background:#080a08c9;color:#f0e5a8;font:700 11px ui-monospace,monospace;letter-spacing:.09em;display:none}
`;
document.head.appendChild(gameplayStyle);

var gameplayLevelClearEl = document.createElement('div');
gameplayLevelClearEl.id = 'gameplayLevelClear';
gameplayLevelClearEl.textContent = 'LEVEL CLEAR';
document.body.appendChild(gameplayLevelClearEl);
var gameplaySignalLostEl = document.createElement('div');
gameplaySignalLostEl.id = 'gameplaySignalLost';
gameplaySignalLostEl.textContent = 'SIGNAL LOST';
document.body.appendChild(gameplaySignalLostEl);
var gameplayCodeHud = document.createElement('div');
gameplayCodeHud.id = 'gameplayCodeHud';
document.body.appendChild(gameplayCodeHud);

function gameplayShowLevelClear() {
  gameplayLevelClearEl.classList.add('show');
  setTimeout(function(){ gameplayLevelClearEl.classList.remove('show'); }, 720);
}
function gameplayShowSignalLost() {
  gameplaySignalLostEl.classList.add('show');
  setTimeout(function(){ gameplaySignalLostEl.classList.remove('show'); }, 1150);
}
function gameplayUpdateCodeHud() {
  gameplayCodeHud.style.display = gameplayTeamHasCode ? 'block' : 'none';
  gameplayCodeHud.textContent = gameplayTeamHasCode ? `EXIT CODE · ${gameplayEscapeCode}` : '';
}
function gameplayLevelCode() {
  var seed = ((SURVIVAL_SESSION_SEED >>> 0) ^ Math.imul(currentLevelIndex + 11, 0x45d9f3b)) >>> 0;
  return String(100 + (seed % 900));
}

// -----------------------------------------------------------------------------
// 1) Lightweight THREE.Sprite entity visuals
// -----------------------------------------------------------------------------
function gameplayEnemyCanvas(kind) {
  var c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  var ctx = c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  ctx.save();
  ctx.translate(128, 272);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // Soft black aura makes the silhouette read through noisy VHS filtering.
  ctx.shadowColor = 'rgba(0,0,0,.88)'; ctx.shadowBlur = 18;
  ctx.strokeStyle = 'rgba(2,3,2,.98)'; ctx.fillStyle = 'rgba(3,4,3,.98)';

  if (kind === 'wire') {
    ctx.lineWidth = 13;
    ctx.beginPath(); ctx.moveTo(0,-132); ctx.bezierCurveTo(-18,-70,18,-12,-2,74); ctx.stroke();
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(-3,-82); ctx.lineTo(-75,-30); ctx.lineTo(-96,44); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2,-73); ctx.lineTo(72,-20); ctx.lineTo(96,58); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2,68); ctx.lineTo(-55,150); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3,68); ctx.lineTo(52,152); ctx.stroke();
    ctx.lineWidth = 8;
    for (var i=0;i<5;i++) { ctx.beginPath(); ctx.ellipse((i-2)*4,-142+i*3,32+i*4,18+i*3,i*.62,0,Math.PI*2); ctx.stroke(); }
  } else if (kind === 'eye') {
    ctx.beginPath(); ctx.ellipse(0,-50,73,54,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(225,223,194,.88)'; ctx.beginPath(); ctx.ellipse(0,-54,47,33,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#080808'; ctx.beginPath(); ctx.arc(0,-54,17,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#050505'; ctx.lineWidth=18;
    ctx.beginPath(); ctx.moveTo(-34,2); ctx.lineTo(-70,126); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(36,1); ctx.lineTo(72,126); ctx.stroke();
  } else if (kind === 'floorhead') {
    ctx.beginPath(); ctx.ellipse(0,102,91,25,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0,24,48,58,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#111'; ctx.beginPath();ctx.ellipse(0,22,18,29,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#050505';ctx.lineWidth=14;
    ctx.beginPath();ctx.moveTo(-34,62);ctx.lineTo(-105,120);ctx.stroke();
    ctx.beginPath();ctx.moveTo(34,62);ctx.lineTo(107,120);ctx.stroke();
  } else if (kind === 'balloon') {
    ctx.strokeStyle='#080808';ctx.lineWidth=18;
    ctx.beginPath();ctx.moveTo(0,-80);ctx.lineTo(0,62);ctx.stroke();
    ctx.lineWidth=12;
    ctx.beginPath();ctx.moveTo(-2,-44);ctx.lineTo(-62,32);ctx.stroke();
    ctx.beginPath();ctx.moveTo(3,-43);ctx.lineTo(58,22);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-4,60);ctx.lineTo(-44,148);ctx.stroke();
    ctx.beginPath();ctx.moveTo(4,60);ctx.lineTo(45,148);ctx.stroke();
    ctx.fillStyle='#070707';ctx.beginPath();ctx.ellipse(0,-108,30,38,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#25100f';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(61,19);ctx.lineTo(72,-133);ctx.stroke();
    ctx.fillStyle='rgba(116,12,12,.96)';ctx.beginPath();ctx.ellipse(75,-171,42,55,-.08,0,Math.PI*2);ctx.fill();
  } else {
    // Split-face / winged: broad, human-adjacent shadow with an impossible mouth.
    ctx.fillStyle='#080908';ctx.beginPath();ctx.ellipse(0,-62,54,72,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(0,24,62,91,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#070807';ctx.lineWidth=21;
    ctx.beginPath();ctx.moveTo(-45,-4);ctx.lineTo(-93,91);ctx.stroke();
    ctx.beginPath();ctx.moveTo(45,-4);ctx.lineTo(93,91);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-25,90);ctx.lineTo(-50,158);ctx.stroke();
    ctx.beginPath();ctx.moveTo(25,90);ctx.lineTo(52,158);ctx.stroke();
    ctx.strokeStyle='rgba(156,150,125,.82)';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(0,-95);ctx.lineTo(0,-25);ctx.stroke();
    if(kind==='winged'){
      ctx.strokeStyle='#050505';ctx.lineWidth=10;
      for(var w=0;w<4;w++){var sy=-30+w*27;ctx.beginPath();ctx.moveTo(-25,sy);ctx.lineTo(-105-w*5,sy-50+w*8);ctx.stroke();ctx.beginPath();ctx.moveTo(25,sy);ctx.lineTo(105+w*5,sy-47+w*7);ctx.stroke();}
    }
  }

  // Grimy breakup/noise inside the sprite so it feels like a bad recording,
  // not a clean vector drawing.
  ctx.globalCompositeOperation='destination-out';
  for(var n=0;n<90;n++){ctx.globalAlpha=.04+Math.random()*.10;ctx.fillRect(-115+Math.random()*230,-220+Math.random()*410,1+Math.random()*5,2+Math.random()*8);}
  ctx.restore();
  return c;
}

function gameplaySpriteMaterial(kind) {
  if (gameplayEnemySpriteMaterials.has(kind)) return gameplayEnemySpriteMaterials.get(kind);
  var tex = new THREE.CanvasTexture(gameplayEnemyCanvas(kind));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  gameplayEnemySpriteTextures.set(kind, tex);
  var mat = new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, depthTest:true, alphaTest:.025, fog:true, toneMapped:true });
  gameplayEnemySpriteMaterials.set(kind, mat);
  return mat;
}

function gameplayEnsureEnemySprite(e) {
  if (!e || e.billboardSprite) return;
  for (var ch of e.group.children) ch.visible = false;
  var sprite = new THREE.Sprite(gameplaySpriteMaterial(e.kind));
  var scales = { wire:[1.9,3.65],balloon:[2.5,4.2],splitface:[2.55,3.6],eye:[2.4,3.0],floorhead:[3.0,2.25],winged:[3.4,3.7] };
  var sc = scales[e.kind] || [2.3,3.3];
  sprite.scale.set(sc[0],sc[1],1);
  sprite.position.y = sc[1]*.49;
  sprite.renderOrder = 2;
  e.group.add(sprite); e.billboardSprite=sprite; e.billboardBaseScale=sc.slice();
}

function gameplayAnimateSprite(e) {
  gameplayEnsureEnemySprite(e);
  var s=e.billboardSprite;if(!s)return;
  var chase=e.aiState==='CHASE'||(e.chaseUntil||0)>elapsed;
  var pulse=1+Math.sin(elapsed*(chase?10.5:3.8)+(e.phase||0))*(chase?.028:.012);
  s.scale.set(e.billboardBaseScale[0]*pulse,e.billboardBaseScale[1]*(2-pulse),1);
  s.position.y=e.billboardBaseScale[1]*.49+Math.sin(elapsed*2.2+(e.phase||0))*.025;
}

var gameplayBaseCreateEnemy = createEnemy;
createEnemy = function(kind,M,G) { var e=gameplayBaseCreateEnemy(kind,M,G); gameplayEnsureEnemySprite(e); return e; };

// -----------------------------------------------------------------------------
// 2) Raycast vision: enemies explicitly test whether wall geometry blocks view.
// -----------------------------------------------------------------------------
function gameplayNearbyWallMeshes(x,z,range) {
  var out=[];var r=Math.ceil((range||24)/CHUNK_SIZE)+1;var cx=chunkCoord(x),cz=chunkCoord(z);
  for(var dx=-r;dx<=r;dx++)for(var dz=-r;dz<=r;dz++){
    var chunk=chunks.get(`${cx+dx},${cz+dz}`);if(!chunk)continue;
    for(var child of chunk.group.children){
      if((child.isMesh||child.isInstancedMesh)&&child.material===materials.wall)out.push(child);
    }
  }
  return out;
}

function gameplayRayVisibleEnemyToPlayer(e,p) {
  if(!e||!p)return false;
  var cacheKey=p.id||'local';e._gameplayLos=e._gameplayLos||Object.create(null);
  var cached=e._gameplayLos[cacheKey];if(cached&&elapsed-cached.at<GAMEPLAY_RAYCAST_INTERVAL)return cached.value;
  gameplayRayOrigin.set(e.group.position.x,1.22,e.group.position.z);
  gameplayRayTarget.set(p.pos.x,EYE_HEIGHT,p.pos.z);
  gameplayRayDir.copy(gameplayRayTarget).sub(gameplayRayOrigin);
  var distance=gameplayRayDir.length();
  if(distance<.08){e._gameplayLos[cacheKey]={at:elapsed,value:true};return true;}
  gameplayRayDir.normalize();gameplayEnemyRaycaster.set(gameplayRayOrigin,gameplayRayDir);gameplayEnemyRaycaster.near=.03;gameplayEnemyRaycaster.far=distance-.10;
  var blockers=gameplayNearbyWallMeshes(e.group.position.x,e.group.position.z,distance);
  var hit=blockers.length?gameplayEnemyRaycaster.intersectObjects(blockers,false)[0]:null;
  var visible=!hit;
  e._gameplayLos[cacheKey]={at:elapsed,value:visible};return visible;
}

function gameplayPreEntityVision() {
  if(net.mode==='client')return;
  var players=aiPlayers();
  for(var e of entities){
    gameplayEnsureEnemySprite(e);
    for(var p of players){
      var d=distanceXZ(e.group.position,p.pos);if(d>Math.max(6,e.sight*1.15))continue;
      if(gameplayRayVisibleEnemyToPlayer(e,p)){
        e.targetPlayerId=p.id;e.chaseUntil=Math.max(e.chaseUntil||0,elapsed+3.2);
        break;
      }
    }
  }
}

var gameplayBaseUpdateEntities=updateEntities;
updateEntities=function(dt){
  gameplayPreEntityVision();
  gameplayBaseUpdateEntities(dt);
  for(var e of entities)gameplayAnimateSprite(e);
  gameplayUpdateLightHum();
};

// -----------------------------------------------------------------------------
// 3) Camera-ray item interaction + escape-code loot
// -----------------------------------------------------------------------------
survivalLootCatalog.code={name:'Escape Code',color:0xd9cfaa};
var gameplayBaseLootVisual=survivalLootVisual;
survivalLootVisual=function(type){
  if(type!=='code')return gameplayBaseLootVisual(type);
  var g=new THREE.Group();var mat=new THREE.MeshStandardMaterial({color:0xd8d0ae,roughness:.78});var card=new THREE.Mesh(geo.box,mat);card.scale.set(.48,.32,.045);card.position.y=.28;
  var markMat=new THREE.MeshBasicMaterial({color:0x1c1b16});var mark=new THREE.Mesh(geo.box,markMat);mark.scale.set(.30,.035,.012);mark.position.set(0,.29,-.052);g.add(card,mark);return g;
};

var gameplayBaseSpawnLootItem=survivalSpawnLootItem;
survivalSpawnLootItem=function(id,type,x,z,claimed){
  var item=gameplayBaseSpawnLootItem(id,type,x,z,claimed);
  if(item?.group){
    item.group.userData.survivalLootId=id;
    item.group.traverse(function(o){o.userData.survivalLootId=id;});
    var hitMat=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false});
    var hit=new THREE.Mesh(geo.box,hitMat);hit.scale.set(.85,.95,.85);hit.position.y=.42;hit.userData.survivalLootId=id;item.group.add(hit);
  }
  return item;
};

var gameplayBaseBuildHostLoot=survivalBuildHostLoot;
survivalBuildHostLoot=function(){
  gameplayBaseBuildHostLoot();
  var rng=mulberry32(hash3(0xc0de44,currentLevelIndex+3,SURVIVAL_SESSION_SEED&0xffff));
  var p=findWalkablePoint(8.2,18.5,rng);
  survivalSpawnLootItem(`CODE-${currentLevelIndex}`,'code',p.x,p.z,false);
};

var gameplayBaseApplyLootClaim=survivalApplyLootClaim;
survivalApplyLootClaim=function(id,ownerId){
  var item=survivalLoot.get(id);var isCode=item?.type==='code';
  if(isCode){
    if(item.claimed)return;item.claimed=true;if(item.group)survivalLootRoot.remove(item.group);item.group=null;
    gameplayTeamHasCode=true;gameplayEscapeCode=gameplayLevelCode();gameplayUpdateCodeHud();showToast(`EXIT CODE ${gameplayEscapeCode}`);return;
  }
  gameplayBaseApplyLootClaim(id,ownerId);
};

function gameplayRaycastLoot(){
  camera.getWorldDirection(gameplayRayDir);gameplayItemRaycaster.set(camera.position,gameplayRayDir);gameplayItemRaycaster.near=.05;gameplayItemRaycaster.far=INTERACT_DISTANCE+.55;
  var roots=[];for(var item of survivalLoot.values())if(!item.claimed&&item.group)roots.push(item.group);
  if(!roots.length)return null;var hits=gameplayItemRaycaster.intersectObjects(roots,true);
  for(var hit of hits){var id=hit.object?.userData?.survivalLootId;if(id){var item=survivalLoot.get(id);if(item&&!item.claimed)return item;}}
  return null;
}

var gameplayBaseUpdateInteraction=updateInteraction;
updateInteraction=function(){
  gameplayBaseUpdateInteraction();
  if(!survivalState.alive)return;
  var item=gameplayRaycastLoot();
  if(item){currentInteract={kind:'survival-loot',item:item};interactionEl.textContent=`[E] ${survivalLootCatalog[item.type]?.name||item.type} を拾う`;}
};

var gameplayBaseInteract=interact;
interact=function(){
  if(currentInteract?.kind==='exit'){
    var hasKey=survivalState.inventory.includes('key');
    if(!gameplayTeamHasCode&&!hasKey){showToast('出口はロックされている。KEY または EXIT CODE が必要');playErrorTone();return;}
    if(!gameplayTeamHasCode&&hasKey)survivalConsumeType('key');
    gameplayShowLevelClear();
  }
  gameplayBaseInteract();
};

// Reset code knowledge on each level. It can be rediscovered by any teammate.
var gameplayBaseSwitchLevel=switchLevel;
switchLevel=function(index,silent){gameplayTeamHasCode=false;gameplayEscapeCode='';gameplayUpdateCodeHud();gameplayBaseSwitchLevel(index,silent);};

// -----------------------------------------------------------------------------
// 4) SIGNAL LOST, team wipe and synchronized lobby return
// -----------------------------------------------------------------------------
var gameplayBaseSurvivalDie=survivalDie;
survivalDie=function(reason){
  if(!survivalState.alive)return;gameplayShowSignalLost();gameplayBaseSurvivalDie(reason);
};

function gameplayResetLocalForLobby(){
  survivalState.hp=100;survivalState.stamina=100;survivalState.sanity=100;survivalState.battery=100;survivalState.alive=true;survivalState.exhausted=false;survivalState.spectator=false;survivalState.inventory.length=0;survivalState.selected=0;survivalState.emote='';
  survivalState.stats.startedAt=performance.now();survivalState.stats.distance=0;survivalState.stats.screams=0;survivalState.stats.maxMic=0;survivalState.stats.pickups=0;survivalState.stats.levels=0;survivalState.stats.deaths=0;survivalState.stats.minSanity=100;
  survivalUpdateHud();survivalResult.classList.remove('show');gameplaySignalLostEl.classList.remove('show');
  gameplayTeamHasCode=false;gameplayEscapeCode='';gameplayUpdateCodeHud();
  try{switchLevel(0,true);}catch(_){}
  camera.position.set(0,EYE_HEIGHT,0);camera.rotation.set(0,0,0);pressed.clear();menu.classList.remove('hidden');try{controls.unlock();}catch(_){}
  gameplayWipePending=false;
}

function gameplayScheduleReturnToLobby(){
  clearTimeout(gameplayReturnTimer);gameplayReturnTimer=setTimeout(function(){gameplayResetLocalForLobby();},5200);
}

if(typeof integrationHostWipeCheck==='function'){
  integrationHostWipeCheck=function(){
    if(net.mode!=='host'||gameplayWipePending||elapsed-integrationLastWipeCheck<.55)return;
    integrationLastWipeCheck=elapsed;var ids=[net.id,...net.conns.keys()];if(!ids.length)return;var allDead=true;
    for(var id of ids){
      if(id===net.id){if(survivalState.alive){allDead=false;break;}}
      else{var st=advancedStatus.get(id);if(!st||st.alive!==false){allDead=false;break;}}
    }
    if(!allDead)return;
    gameplayWipePending=true;broadcast({type:'run_end',title:'TEAM WIPED'});broadcast({type:'return_lobby',delay:5200});survivalShowResult('TEAM WIPED');showToast('全滅 · ロビーへ戻ります');gameplayScheduleReturnToLobby();
  };
}

var gameplayBaseHandleNetworkData=handleNetworkData;
handleNetworkData=function(data,conn){
  if(data?.type==='return_lobby'){gameplayWipePending=true;showToast('全滅 · ロビーへ戻ります');gameplayScheduleReturnToLobby();return;}
  gameplayBaseHandleNetworkData(data,conn);
};

// -----------------------------------------------------------------------------
// 5) Positional fluorescent hum. The old global hum becomes a very faint room bed;
// the audible buzz comes from the nearest ceiling fixtures through HRTF panners.
// -----------------------------------------------------------------------------
function gameplayCreateHumEmitter(ctx,index){
  var gain=ctx.createGain();gain.gain.value=0;
  var panner=ctx.createPanner();panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=.7;panner.maxDistance=11;panner.rolloffFactor=1.65;
  var filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1250;filter.Q.value=.4;
  var a=ctx.createOscillator(),b=ctx.createOscillator(),bg=ctx.createGain();a.type='sine';b.type='triangle';a.frequency.value=59.7+index*.11;b.frequency.value=119.4+index*.17;bg.gain.value=.13;
  a.connect(filter);b.connect(bg);bg.connect(filter);filter.connect(gain);gain.connect(panner);panner.connect(audioState.master);a.start();b.start();
  return{gain:gain,panner:panner,a:a,b:b};
}
function gameplayEnsureLightHum(){
  ensureAudio();if(!audioState?.ctx)return false;if(gameplayLightHumCtx===audioState.ctx&&gameplayLightHum.length)return true;
  gameplayLightHumCtx=audioState.ctx;gameplayLightHum=[];for(var i=0;i<GAMEPLAY_LIGHT_HUM_SOURCES;i++)gameplayLightHum.push(gameplayCreateHumEmitter(gameplayLightHumCtx,i));
  if(audioState.humGain)audioState.humGain.gain.setTargetAtTime(humEnabled?.0035:0,audioState.ctx.currentTime,.08);return true;
}
function gameplaySetPannerPos(p,x,y,z){var t=gameplayLightHumCtx.currentTime;if(p.positionX){p.positionX.setTargetAtTime(x,t,.04);p.positionY.setTargetAtTime(y,t,.04);p.positionZ.setTargetAtTime(z,t,.04);}else p.setPosition?.(x,y,z);}
function gameplayUpdateLightHum(){
  if(!gameplayEnsureLightHum())return;if(elapsed-gameplayLastHumPositionAt<.28)return;gameplayLastHumPositionAt=elapsed;
  if(typeof precisionUpdateProxyLights==='function')precisionUpdateProxyLights();
  var candidates=typeof precisionLightCandidates!=='undefined'?precisionLightCandidates:[];
  var enemyDist=typeof survivalNearestEnemyDistance==='function'?survivalNearestEnemyDistance():Infinity;var danger=THREE.MathUtils.clamp((8-enemyDist)/8,0,1);
  for(var i=0;i<gameplayLightHum.length;i++){
    var h=gameplayLightHum[i],c=candidates[i];
    if(!humEnabled||!c){h.gain.gain.setTargetAtTime(0,gameplayLightHumCtx.currentTime,.06);continue;}
    gameplaySetPannerPos(h.panner,c.x,c.y,c.z);
    var flicker=danger>0?(.65+.35*Math.abs(Math.sin(elapsed*(19+i*4.1)))):1;
    h.gain.gain.setTargetAtTime((.0085+danger*.006)*flicker,gameplayLightHumCtx.currentTime,.045);
  }
}
var gameplayBaseUpdateHumGain=updateHumGain;
updateHumGain=function(){gameplayBaseUpdateHumGain();if(audioState?.humGain)audioState.humGain.gain.setTargetAtTime(humEnabled?.0035:0,audioState.ctx.currentTime,.08);for(var h of gameplayLightHum)if(!humEnabled)h.gain.gain.setTargetAtTime(0,gameplayLightHumCtx.currentTime,.04);};

// Keep the UI explicit about the now-functional threat system and new controls.
var gameplayHint=document.createElement('div');
gameplayHint.style.cssText='margin-top:7px;opacity:.70;font:600 10px ui-monospace,monospace';
gameplayHint.textContent='THREAT = 滞在時間＋声＋走行＋ライト · E:照準で拾う · G:缶を投げる · EXITはKEY/CODEで解除';
menu.appendChild(gameplayHint);
