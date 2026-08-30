// Precision systems: camera inertia, material footsteps/reverb, smart entity tactics,
// distraction throws, network interest management, death-radio horror, nearby
// light proxies and lightweight flashlight dust.

var PRECISION_AOI_PLAYER = 44;
var PRECISION_AOI_ENEMY = 52;
var PRECISION_AOI_EVENT = 42;
var precisionFrameDt = 1 / 60;
var precisionLastFrameAt = 0;
var precisionVisualQuat = camera.quaternion.clone();
var precisionTargetQuat = new THREE.Quaternion();
var precisionRollQuat = new THREE.Quaternion();
var precisionSavedQuat = new THREE.Quaternion();
var precisionVisualRight = new THREE.Vector3();
var precisionCamOffset = new THREE.Vector3();
var precisionBobPhase = 0;
var precisionBodyRoll = 0;
var precisionLastYaw = camera.rotation.y;
var precisionAudioCtx = null;
var precisionReverb = null;
var precisionReverbWet = null;
var precisionFootstepBuffers = new Map();
var precisionImpulseBuffers = new Map();
var precisionImportantNoise = null;
var precisionProjectiles = [];
var precisionProjectileRoot = new THREE.Group();
var precisionLastProxyUpdate = -999;
var precisionLightCandidates = [];
var precisionTmpMatrix = new THREE.Matrix4();
var precisionTmpVec = new THREE.Vector3();
var precisionTmpVec2 = new THREE.Vector3();
scene.add(precisionProjectileRoot);

// -----------------------------------------------------------------------------
// 1) Bodycam inertia + asymmetrical head/body bob
// -----------------------------------------------------------------------------
var precisionBaseUpdateMovement = updateMovement;
updateMovement = function(dt) {
  precisionBaseUpdateMovement(dt);
  var staminaFactor = typeof survivalState !== 'undefined' ? 1 - survivalState.stamina / 100 : 0;
  var rate = sprinting ? 11.8 : moving ? 7.4 : 2.6;
  precisionBobPhase += dt * rate;
  var amp = sprinting ? (.026 + staminaFactor * .025) : moving ? .012 : .003;
  // Deliberately asymmetric so it feels like a chest/shoulder-mounted camera,
  // not a perfectly sinusoidal floating eye.
  var s = Math.sin(precisionBobPhase);
  var s2 = Math.sin(precisionBobPhase * 2 + .7);
  precisionCamOffset.set(s2 * amp * .42, Math.max(0, s) * amp - Math.max(0, -s) * amp * .42, 0);
};

var precisionBaseUpdateCameraOverlay = updateCameraOverlay;
updateCameraOverlay = function() {
  precisionBaseUpdateCameraOverlay();
  var now = elapsed;
  precisionFrameDt = THREE.MathUtils.clamp(now - precisionLastFrameAt, 1 / 240, .055);
  precisionLastFrameAt = now;

  precisionTargetQuat.copy(camera.quaternion);
  var filter = document.body.dataset.filter || 'bodycam';
  var bodycam = filter === 'bodycam' || filter === 'vhs';
  var response = bodycam ? (sprinting ? 7.4 : 9.6) : 18.0;
  precisionVisualQuat.slerp(precisionTargetQuat, 1 - Math.exp(-precisionFrameDt * response));

  var yaw = camera.rotation.y;
  var dyaw = Math.atan2(Math.sin(yaw - precisionLastYaw), Math.cos(yaw - precisionLastYaw));
  precisionLastYaw = yaw;
  var desiredRoll = bodycam ? THREE.MathUtils.clamp(-dyaw / Math.max(.004, precisionFrameDt) * .0065, -.075, .075) : 0;
  desiredRoll += moving ? Math.sin(precisionBobPhase) * (sprinting ? .018 : .009) : 0;
  precisionBodyRoll = THREE.MathUtils.lerp(precisionBodyRoll, desiredRoll, 1 - Math.exp(-precisionFrameDt * 7));

  precisionUpdateProxyLights();
  precisionUpdateDust();
};

// Wrap the complete renderer chain. During rendering only, the real gameplay
// camera is temporarily given the inertial pose, then restored immediately.
var precisionRendererBase = renderer.render.bind(renderer);
renderer.render = function(renderScene, renderCamera) {
  if (renderScene !== scene || renderCamera !== camera) return precisionRendererBase(renderScene, renderCamera);
  precisionSavedQuat.copy(camera.quaternion);
  var oldX = camera.position.x, oldY = camera.position.y, oldZ = camera.position.z;

  camera.quaternion.copy(precisionVisualQuat);
  precisionRollQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), precisionBodyRoll);
  camera.quaternion.multiply(precisionRollQuat);
  precisionVisualRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  camera.position.addScaledVector(precisionVisualRight, precisionCamOffset.x);
  camera.position.y += precisionCamOffset.y;

  var out;
  try { out = precisionRendererBase(renderScene, renderCamera); }
  finally {
    camera.quaternion.copy(precisionSavedQuat);
    camera.position.set(oldX, oldY, oldZ);
  }
  return out;
};

// -----------------------------------------------------------------------------
// 2) Material-aware footsteps + convolution reverb + breathing
// -----------------------------------------------------------------------------
function precisionAudioEnsure() {
  ensureAudio();
  if (!audioState?.ctx) return false;
  if (precisionAudioCtx === audioState.ctx && precisionReverb) return true;
  precisionAudioCtx = audioState.ctx;
  precisionReverb = precisionAudioCtx.createConvolver();
  precisionReverbWet = precisionAudioCtx.createGain();
  precisionReverbWet.gain.value = .12;
  precisionReverb.connect(precisionReverbWet);
  precisionReverbWet.connect(audioState.master);
  return true;
}

function precisionImpulse(kind) {
  if (!precisionAudioEnsure()) return null;
  var key = `${kind}:${precisionAudioCtx.sampleRate}`;
  if (precisionImpulseBuffers.has(key)) return precisionImpulseBuffers.get(key);
  var seconds = kind === 'pool' ? 1.55 : kind === 'office' ? .72 : kind === 'concrete' ? .48 : kind === 'wood' ? .36 : .22;
  var length = Math.floor(precisionAudioCtx.sampleRate * seconds);
  var buffer = precisionAudioCtx.createBuffer(2, length, precisionAudioCtx.sampleRate);
  for (var ch = 0; ch < 2; ch++) {
    var d = buffer.getChannelData(ch);
    for (var i = 0; i < length; i++) {
      var t = i / length;
      var decay = Math.pow(1 - t, kind === 'pool' ? 2.0 : 3.4);
      d[i] = (Math.random() * 2 - 1) * decay * (ch ? .88 : 1);
    }
  }
  precisionImpulseBuffers.set(key, buffer);
  return buffer;
}

function precisionStepNoiseBuffer(kind) {
  if (!precisionAudioEnsure()) return null;
  var key = `${kind}:${precisionAudioCtx.sampleRate}`;
  if (precisionFootstepBuffers.has(key)) return precisionFootstepBuffers.get(key);
  var dur = kind === 'pool' ? .105 : kind === 'concrete' || kind === 'office' ? .075 : .055;
  var length = Math.floor(precisionAudioCtx.sampleRate * dur);
  var b = precisionAudioCtx.createBuffer(1, length, precisionAudioCtx.sampleRate);
  var d = b.getChannelData(0);
  for (var i = 0; i < length; i++) {
    var t = i / length;
    var envelope = Math.pow(1 - t, kind === 'carpet' ? 5 : 2.4);
    var n = Math.random() * 2 - 1;
    d[i] = n * envelope;
  }
  precisionFootstepBuffers.set(key, b);
  return b;
}

playFootstep = function() {
  if (!precisionAudioEnsure()) return;
  var ctx = precisionAudioCtx;
  var mode = LEVELS[currentLevelIndex].floorMode || 'carpet';
  var source = ctx.createBufferSource();
  source.buffer = precisionStepNoiseBuffer(mode);
  var filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  var gain = ctx.createGain();
  var osc = ctx.createOscillator();
  var oscGain = ctx.createGain();

  var cfg = {
    carpet: [145, .020, 62, .014, .02],
    concrete: [520, .028, 93, .020, .14],
    office: [680, .024, 112, .017, .19],
    pool: [980, .030, 128, .021, .42],
    wood: [760, .026, 148, .022, .12],
  }[mode] || [260, .022, 78, .016, .08];
  filter.frequency.value = cfg[0]; filter.Q.value = .72;
  var fatigue = typeof survivalState !== 'undefined' ? 1 - survivalState.stamina / 100 : 0;
  var volume = cfg[1] * (sprinting ? 1.48 : 1) * (1 + fatigue * .12);
  gain.gain.value = volume;
  osc.type = mode === 'pool' ? 'sine' : 'triangle';
  osc.frequency.value = cfg[2] * (.92 + Math.random() * .14);
  oscGain.gain.setValueAtTime(cfg[3] * (sprinting ? 1.35 : 1), ctx.currentTime);
  oscGain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .10);

  source.connect(filter); filter.connect(gain); gain.connect(audioState.master);
  precisionReverb.buffer = precisionImpulse(mode);
  precisionReverbWet.gain.setTargetAtTime(cfg[4], ctx.currentTime, .04);
  gain.connect(precisionReverb);
  osc.connect(oscGain); oscGain.connect(audioState.master); oscGain.connect(precisionReverb);
  source.start(); osc.start(); osc.stop(ctx.currentTime + .11);
};

if (typeof survivalBreath === 'function') {
  survivalBreath = function() {
    if (!precisionAudioEnsure()) return;
    var ctx = precisionAudioCtx;
    var source = ctx.createBufferSource();
    var len = Math.floor(ctx.sampleRate * .46);
    var b = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < len; i++) {
      var t = i / len;
      var env = Math.sin(Math.PI * t) * Math.pow(1 - t * .35, 2);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    source.buffer = b;
    var filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 310; filter.Q.value = .55;
    var gain = ctx.createGain();
    var fatigue = 1 - survivalState.stamina / 100;
    gain.gain.value = .018 + fatigue * .028;
    source.connect(filter); filter.connect(gain); gain.connect(audioState.master);
    source.start();
    survivalEmitNoise(.22 + fatigue * .24, 'breathing');
  };
}

// -----------------------------------------------------------------------------
// 3) Throwable distraction objects and noise priority
// -----------------------------------------------------------------------------
survivalLootCatalog.can = { name: 'Empty Can', color: 0x8b9187 };
var precisionBaseLootVisual = survivalLootVisual;
survivalLootVisual = function(type) {
  if (type !== 'can') return precisionBaseLootVisual(type);
  var g = new THREE.Group();
  var mat = new THREE.MeshStandardMaterial({ color: 0x81877e, roughness: .42, metalness: .72 });
  var body = new THREE.Mesh(geo.cylinder, mat); body.scale.set(.13, .30, .13); body.position.y = .19;
  var ring = new THREE.Mesh(geo.torus, materials.dark); ring.scale.set(.14, .14, .035); ring.position.y = .35; ring.rotation.x = Math.PI / 2;
  var halo = new THREE.Mesh(geo.torus, mat); halo.scale.set(.44, .44, .028); halo.rotation.x = Math.PI / 2; halo.position.y = .03;
  g.add(body, ring, halo); return g;
};

var precisionBaseBuildHostLoot = survivalBuildHostLoot;
survivalBuildHostLoot = function() {
  precisionBaseBuildHostLoot();
  var rng = mulberry32(hash3(0xcab005, currentLevelIndex + 1, SURVIVAL_SESSION_SEED & 0xffff));
  for (var i = 0; i < 2; i++) {
    var p = findWalkablePoint(5 + i * 3, 14 + i * 3, rng);
    survivalSpawnLootItem(`C${currentLevelIndex}-${i}`, 'can', p.x, p.z, false);
  }
};

var precisionBaseUseSelected = survivalUseSelected;
survivalUseSelected = function() {
  if (survivalState.inventory[survivalState.selected] === 'can') {
    showToast('EMPTY CAN · Gキーで投げる');
    return;
  }
  precisionBaseUseSelected();
};

function precisionRemoveInventoryIndex(index) {
  if (index < 0 || index >= survivalState.inventory.length) return false;
  survivalState.inventory.splice(index, 1);
  survivalState.selected = Math.min(survivalState.selected, Math.max(0, survivalState.inventory.length - 1));
  survivalUpdateHud(); return true;
}

function precisionThrowCan() {
  if (!survivalState.alive) return;
  var index = survivalState.inventory.indexOf('can');
  if (index < 0) { showToast('投げられる缶を持っていない'); return; }
  precisionRemoveInventoryIndex(index);
  var mat = new THREE.MeshStandardMaterial({ color: 0x7c8179, roughness: .48, metalness: .68 });
  var mesh = new THREE.Mesh(geo.cylinder, mat);
  mesh.scale.set(.12, .27, .12); mesh.rotation.z = Math.PI / 2;
  mesh.position.copy(camera.position); mesh.position.y -= .18;
  camera.getWorldDirection(precisionTmpVec); precisionTmpVec.normalize();
  var velocity = precisionTmpVec.clone().multiplyScalar(8.8); velocity.y += 1.45;
  precisionProjectileRoot.add(mesh);
  precisionProjectiles.push({ mesh:mesh, velocity:velocity, age:0, spin:3 + Math.random()*5 });
  survivalEmitNoise(.10, 'throw');
}

function precisionImpactSound(x, z, strength) {
  if (!precisionAudioEnsure()) return;
  var ctx = precisionAudioCtx;
  var osc = ctx.createOscillator(), gain = ctx.createGain(), panner = immersiveCreatePanner ? immersiveCreatePanner(ctx, 34, 1.2, 1.4) : ctx.createPanner();
  var noise = ctx.createBufferSource(); noise.buffer = precisionStepNoiseBuffer('concrete');
  osc.type='triangle'; osc.frequency.value=215+Math.random()*80;
  gain.gain.setValueAtTime(.035 * (strength || 1),ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.17);
  osc.connect(gain); noise.connect(gain); gain.connect(panner); panner.connect(audioState.master);
  immersiveSetAudioPosition?.(panner,x,.35,z,ctx);
  osc.start(); noise.start(); osc.stop(ctx.currentTime+.18);
}

function precisionRegisterDistraction(x, z, strength) {
  strength = THREE.MathUtils.clamp(Number(strength)||.9,.1,1);
  precisionImportantNoise = { x:x, z:z, strength:strength, until:elapsed+2.8 };
  emitNoiseAt(strength,x,z,'distraction');
}

function precisionProjectileImpact(p) {
  var x=p.mesh.position.x,z=p.mesh.position.z;
  precisionProjectileRoot.remove(p.mesh); p.mesh.geometry?.dispose?.(); p.mesh.material?.dispose?.();
  precisionImpactSound(x,z,.95);
  if (net.mode === 'client' && net.hostConn?.open) {
    net.hostConn.send({type:'distraction_noise',x:round2(x),z:round2(z),strength:.94});
  } else {
    precisionRegisterDistraction(x,z,.94);
    if (net.mode === 'host') broadcast({type:'decoy_impact',x:round2(x),z:round2(z),strength:.94,id:net.id});
  }
}

function precisionUpdateProjectiles(dt) {
  for (var i=precisionProjectiles.length-1;i>=0;i--) {
    var p=precisionProjectiles[i]; p.age+=dt; p.velocity.y-=7.4*dt;
    var nx=p.mesh.position.x+p.velocity.x*dt, ny=p.mesh.position.y+p.velocity.y*dt, nz=p.mesh.position.z+p.velocity.z*dt;
    var colliders=getNearbyColliders(p.mesh.position.x,p.mesh.position.z);
    var hit=hitsAny(nx,nz,colliders,.12)||ny<=.12||p.age>2.2;
    if(hit){precisionProjectiles.splice(i,1);precisionProjectileImpact(p);continue;}
    p.mesh.position.set(nx,ny,nz);p.mesh.rotation.x+=p.spin*dt;p.mesh.rotation.z+=p.spin*.72*dt;
  }
}

var precisionBaseEmitNoiseAt = emitNoiseAt;
emitNoiseAt = function(strength,x,z,source) {
  var s=THREE.MathUtils.clamp(Number(strength)||0,0,1);
  if(source==='distraction') precisionImportantNoise={x:x,z:z,strength:s,until:elapsed+2.8};
  var keep=precisionImportantNoise&&precisionImportantNoise.until>elapsed&&source!=='distraction'&&s<precisionImportantNoise.strength*.92;
  precisionBaseEmitNoiseAt(s,x,z,source);
  if(keep){
    encounter.lastNoisePos.set(precisionImportantNoise.x,EYE_HEIGHT,precisionImportantNoise.z);
    encounter.lastNoiseAt=elapsed;encounter.lastNoiseStrength=precisionImportantNoise.strength;
  }
};

// -----------------------------------------------------------------------------
// 4) Entity ambush, cover and gaze-avoidance tactics
// -----------------------------------------------------------------------------
function precisionFindCoverPoint(target, enemy) {
  var colliders=getNearbyColliders(target.x,target.z), best=null, bestScore=Infinity;
  for(var b of colliders){
    var pts=[[b.minX-.72,b.minZ-.72],[b.maxX+.72,b.minZ-.72],[b.minX-.72,b.maxZ+.72],[b.maxX+.72,b.maxZ+.72]];
    for(var p of pts){
      var x=p[0],z=p[1],dt=Math.hypot(x-target.x,z-target.z); if(dt<2.2||dt>8.8)continue;
      if(hitsAny(x,z,colliders,.48))continue;
      if(!lineOccluded(target.x,target.z,x,z))continue;
      var de=Math.hypot(x-enemy.group.position.x,z-enemy.group.position.z);var score=de+Math.abs(dt-4.6)*1.8;
      if(score<bestScore){bestScore=score;best=new THREE.Vector3(x,0,z);}
    }
  }
  return best;
}

var precisionBaseAiNavigationDirection = aiNavigationDirection;
aiNavigationDirection = function(e,target,repathInterval) {
  if(!e||!target)return precisionBaseAiNavigationDirection(e,target,repathInterval);
  var dist=Math.hypot(e.group.position.x-target.x,e.group.position.z-target.z);
  var watched=false;
  if(e.kind!=='wire'&&e.aiState!=='CHASE'){
    var players=aiPlayers();
    for(var p of players){if(aiPlayerSeesEntity(p,e,.76)){watched=true;break;}}
    if(watched&&dist>4.2){e.precisionPeek=true;e.precisionLastWatched=elapsed;e.group.rotation.z=Math.sin(elapsed*2.2+(e.phase||0))*.035;return{x:0,z:0};}
  }
  if(e.precisionPeek&&!watched&&elapsed-(e.precisionLastWatched||0)<1.2&&!e.precisionAmbushTarget){e.precisionAmbushTarget=precisionFindCoverPoint(target,e);}

  var hidden=lineOccluded(e.group.position.x,e.group.position.z,target.x,target.z);
  var ambushEligible=(e.aiState==='ALERT'||(e.aiState==='CHASE'&&hidden))&&dist>5.0&&encounter.profile?.mode!=='forced';
  if(ambushEligible&&!e.precisionAmbushTarget&&elapsed>(e.precisionAmbushCooldown||0)){
    var roll=Math.abs(Math.sin((e.phase||1)*17.1+Math.floor(elapsed/4.0)*2.7));
    if(roll>.68)e.precisionAmbushTarget=precisionFindCoverPoint(target,e);
    e.precisionAmbushCooldown=elapsed+6.5;
  }

  if(e.precisionAmbushTarget){
    var ad=Math.hypot(e.group.position.x-e.precisionAmbushTarget.x,e.group.position.z-e.precisionAmbushTarget.z);
    if(ad<.72){
      if(!e.precisionWaitUntil)e.precisionWaitUntil=elapsed+2.1+((e.phase||0)%1.4);
      if(elapsed<e.precisionWaitUntil&&dist>3.8){e.aiState='AMBUSH';return{x:0,z:0};}
      e.precisionAmbushTarget=null;e.precisionWaitUntil=0;e.precisionPeek=false;
    }else{
      e.aiState='AMBUSH';return precisionBaseAiNavigationDirection(e,e.precisionAmbushTarget,.72);
    }
  }
  e.group.rotation.z=THREE.MathUtils.lerp(e.group.rotation.z,0,.18);
  return precisionBaseAiNavigationDirection(e,target,repathInterval);
};

// -----------------------------------------------------------------------------
// 5) Interest management + stronger P2P voice occlusion
// -----------------------------------------------------------------------------
function precisionRecipientPosition(id) {
  if(id===net.id)return camera.position;
  var rp=remotePlayers.get(id);return rp?.target||rp?.group?.position||null;
}
function precisionDistancePacketToRecipient(data,recipientId) {
  var rp=precisionRecipientPosition(recipientId);if(!rp)return 0;
  if(Array.isArray(data?.p))return Math.hypot(Number(data.p[0])-rp.x,Number(data.p[2])-rp.z);
  if(Number.isFinite(data?.x)&&Number.isFinite(data?.z))return Math.hypot(data.x-rp.x,data.z-rp.z);
  return 0;
}

var precisionBaseBroadcast = broadcast;
broadcast = function(data,exceptId) {
  if(net.mode!=='host'||!data||typeof data!=='object')return precisionBaseBroadcast(data,exceptId||'');
  if(!['state','enemy_sync','decoy_impact'].includes(data.type))return precisionBaseBroadcast(data,exceptId||'');
  for(var entry of net.conns){
    var id=entry[0],conn=entry[1];if(id===(exceptId||'')||!conn.open||(conn.bufferSize||0)>160)continue;
    var packet=data;
    if(data.type==='state'&&precisionDistancePacketToRecipient(data,id)>PRECISION_AOI_PLAYER)continue;
    if(data.type==='decoy_impact'&&precisionDistancePacketToRecipient(data,id)>PRECISION_AOI_EVENT)continue;
    if(data.type==='enemy_sync'&&Array.isArray(data.entities)){
      var pos=precisionRecipientPosition(id);
      if(pos){
        var filtered=data.entities.filter(function(e){return Math.hypot((Number(e.x)||0)-pos.x,(Number(e.z)||0)-pos.z)<=PRECISION_AOI_ENEMY;});
        packet={...data,entities:filtered};
      }
    }
    try{conn.send(packet);}catch(_){}
  }
};

if(typeof immersiveUpdateVoiceSpatial==='function'){
  var precisionBaseVoiceSpatial=immersiveUpdateVoiceSpatial;
  immersiveUpdateVoiceSpatial=function(){
    precisionBaseVoiceSpatial();if(!audioState?.ctx)return;
    for(var entry of immersiveVoiceNodes){
      var id=entry[0],n=entry[1],rp=remotePlayers.get(id);if(!rp)continue;
      var p=rp.group?.position||rp.target;var colliders=getNearbyColliders((camera.position.x+p.x)*.5,(camera.position.z+p.z)*.5),walls=0;
      for(var b of colliders){if(segmentIntersectsBox(camera.position.x,camera.position.z,p.x,p.z,b)&&++walls>=3)break;}
      var distance=Math.hypot(camera.position.x-p.x,camera.position.z-p.z);
      var wallGain=walls===0?1:walls===1?.48:walls===2?.27:.15;var rangeGain=distance>28?0:1;
      n.gain.gain.setTargetAtTime(.90*wallGain*rangeGain,audioState.ctx.currentTime,.07);
      n.filter.frequency.setTargetAtTime(walls===0?7600:walls===1?1250:walls===2?720:460,audioState.ctx.currentTime,.07);
    }
  };
}

// -----------------------------------------------------------------------------
// 6) Death-radio glitch: static burst, then proximity voice cuts out
// -----------------------------------------------------------------------------
function precisionPlayDeathGlitchAt(id,x,z) {
  if(!precisionAudioEnsure())return;var ctx=precisionAudioCtx;
  var panner=immersiveCreatePanner?immersiveCreatePanner(ctx,30,1.2,1.3):ctx.createPanner();immersiveSetAudioPosition?.(panner,x||0,1.5,z||0,ctx);
  var gain=ctx.createGain();gain.gain.setValueAtTime(.001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.075,ctx.currentTime+.015);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.31);
  var len=Math.floor(ctx.sampleRate*.34),b=ctx.createBuffer(1,len,ctx.sampleRate),d=b.getChannelData(0);for(var i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
  var src=ctx.createBufferSource();src.buffer=b;var filter=ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=1450;filter.Q.value=.65;src.connect(filter);filter.connect(gain);gain.connect(panner);panner.connect(audioState.master);src.start();
  var node=immersiveVoiceNodes?.get(id);if(node){node.gain.gain.setTargetAtTime(.0001,ctx.currentTime,.035);setTimeout(()=>immersiveDisposeRemoteVoice?.(id),380);}
}
function precisionSendDeathSignal() {
  var packet={type:'death_signal',id:net.id||'local',x:round2(camera.position.x),z:round2(camera.position.z)};
  if(net.mode==='client'&&net.hostConn?.open)net.hostConn.send(packet);else if(net.mode==='host')broadcast(packet);
}
var precisionBaseSurvivalDie=survivalDie;
survivalDie=function(reason){
  if(!survivalState.alive)return;precisionSendDeathSignal();precisionPlayDeathGlitchAt(net.id||'local',camera.position.x,camera.position.z);precisionBaseSurvivalDie(reason);
  setTimeout(function(){try{stopMic();}catch(_){}try{immersiveCloseAllVoiceCalls?.();}catch(_){}},320);
};

// -----------------------------------------------------------------------------
// 7) Network event integration for distraction/death
// -----------------------------------------------------------------------------
var precisionBaseHandleNetworkData=handleNetworkData;
handleNetworkData=function(data,conn){
  if(data?.type==='distraction_noise'){
    if(net.mode==='host'){
      var rp=remotePlayers.get(conn.peer);if(!rp)return;
      var x=Number(data.x)||rp.target.x,z=Number(data.z)||rp.target.z;
      if(Math.hypot(x-rp.target.x,z-rp.target.z)>20.5){x=rp.target.x;z=rp.target.z;}
      precisionRegisterDistraction(x,z,THREE.MathUtils.clamp(Number(data.strength)||.9,.1,1));
      broadcast({type:'decoy_impact',x:round2(x),z:round2(z),strength:Number(data.strength)||.9,id:conn.peer},conn.peer);
    }return;
  }
  if(data?.type==='decoy_impact'){precisionImpactSound(Number(data.x)||0,Number(data.z)||0,Number(data.strength)||.9);return;}
  if(data?.type==='death_signal'){
    var id=data.id||conn.peer,x=Number(data.x)||0,z=Number(data.z)||0;
    if(net.mode==='host'&&conn?.peer){id=conn.peer;var rp=remotePlayers.get(id);if(rp){x=rp.target.x;z=rp.target.z;}broadcast({type:'death_signal',id:id,x:round2(x),z:round2(z)},id);}
    precisionPlayDeathGlitchAt(id,x,z);return;
  }
  precisionBaseHandleNetworkData(data,conn);
};

// -----------------------------------------------------------------------------
// 8) Nearby light proxies + flashlight dust particles
// -----------------------------------------------------------------------------
var precisionProxyLights=[];
for(var pli=0;pli<3;pli++){
  var light=new THREE.PointLight(0xffe8b0,0,7.8,2.0);light.castShadow=false;scene.add(light);precisionProxyLights.push(light);
}

function precisionUpdateProxyLights(){
  if(elapsed-precisionLastProxyUpdate<.18)return;precisionLastProxyUpdate=elapsed;
  var active=qualityMode==='low'?0:qualityMode==='high'?3:2;precisionLightCandidates.length=0;
  if(active){
    for(var chunk of chunks.values()){
      for(var child of chunk.group.children){
        if(!child.isInstancedMesh||child.material!==materials.fixture)continue;
        for(var i=0;i<child.count;i++){
          child.getMatrixAt(i,precisionTmpMatrix);precisionTmpVec.setFromMatrixPosition(precisionTmpMatrix);precisionTmpVec.add(chunk.group.position);
          var d2=(precisionTmpVec.x-camera.position.x)**2+(precisionTmpVec.z-camera.position.z)**2;
          if(d2<125)precisionLightCandidates.push({x:precisionTmpVec.x,y:precisionTmpVec.y-.18,z:precisionTmpVec.z,d2:d2});
        }
      }
    }
    precisionLightCandidates.sort((a,b)=>a.d2-b.d2);
  }
  for(var j=0;j<precisionProxyLights.length;j++){
    var l=precisionProxyLights[j],c=j<active?precisionLightCandidates[j]:null;
    if(c){l.position.set(c.x,c.y,c.z);l.intensity=qualityMode==='high'?5.2:3.6;}else l.intensity=0;
  }
}

var precisionDustGeometry=new THREE.BufferGeometry();var precisionDustCount=120;var precisionDustPositions=new Float32Array(precisionDustCount*3);var precisionDustSeed=new Float32Array(precisionDustCount);
for(var di=0;di<precisionDustCount;di++){
  var z=-(.7+Math.random()*7.4),rad=(-z)*.105*Math.sqrt(Math.random()),a=Math.random()*Math.PI*2;
  precisionDustPositions[di*3]=Math.cos(a)*rad;precisionDustPositions[di*3+1]=Math.sin(a)*rad;precisionDustPositions[di*3+2]=z;precisionDustSeed[di]=Math.random()*6.28;
}
precisionDustGeometry.setAttribute('position',new THREE.BufferAttribute(precisionDustPositions,3));
var precisionDustMaterial=new THREE.PointsMaterial({color:0xe9dfc5,size:.027,transparent:true,opacity:.28,depthWrite:false,sizeAttenuation:true});
var precisionDust=new THREE.Points(precisionDustGeometry,precisionDustMaterial);precisionDust.frustumCulled=false;camera.add(precisionDust);
function precisionUpdateDust(){
  precisionDust.visible=flashlightOn&&qualityMode!=='low';if(!precisionDust.visible)return;
  var attr=precisionDustGeometry.attributes.position;
  if(Math.floor(elapsed*12)%2!==0)return;
  for(var i=0;i<precisionDustCount;i++){attr.array[i*3+1]+=Math.sin(elapsed*.7+precisionDustSeed[i])*.0007;}
  attr.needsUpdate=true;precisionDustMaterial.opacity=survivalState?.battery<18?.17:.27;
}

// -----------------------------------------------------------------------------
// 9) Main-frame wrappers and controls
// -----------------------------------------------------------------------------
var precisionBaseUpdateRemotePlayers=updateRemotePlayers;
updateRemotePlayers=function(dt){precisionBaseUpdateRemotePlayers(dt);precisionUpdateProjectiles(dt);};

var precisionBaseOnKeyDown=onKeyDown;
onKeyDown=function(event){
  if(event.code==='KeyG'&&!event.repeat){precisionThrowCan();return;}
  precisionBaseOnKeyDown(event);
};

// Small menu hint. setupRuntime is intentionally called only after this file is loaded.
var precisionHint=document.createElement('div');precisionHint.style.cssText='margin-top:8px;opacity:.68;font:600 10px ui-monospace,monospace';precisionHint.textContent='G: 缶を投げて敵を誘導 · Z/X/C: エモート · 1-3: inventory · Q: use';menu.appendChild(precisionHint);
