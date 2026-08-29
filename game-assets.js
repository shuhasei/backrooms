function updateNetworking() {
  if (!net.peer || elapsed - net.lastSend < 1 / NET_HZ) return;
  net.lastSend = elapsed;
  const packet = { type: 'state', id: net.id, p: [round2(camera.position.x), round2(EYE_HEIGHT), round2(camera.position.z)], r: [round2(camera.rotation.y), round2(camera.rotation.x)], level: currentLevelIndex, mic: round2(mic.level) };
  if (net.mode === 'host') broadcast(packet);
  else if (net.mode === 'client' && net.hostConn?.open) net.hostConn.send(packet);
}
function broadcast(data, exceptId=''){for(const[id,conn]of net.conns){if(id!==exceptId&&conn.open)conn.send(data);}}
function broadcastLevel(levelIndex){if(net.mode==='host')broadcast({type:'level',level:levelIndex});}
function broadcastRoster(){if(net.mode!=='host')return;const count=1+net.conns.size;broadcast({type:'roster',count});updateNetHud(count);}

function updateRemoteState(id,data){
  if(!Array.isArray(data.p)||data.p.length<3)return;
  let rp=remotePlayers.get(id);
  if(!rp){rp=createRemotePlayer(id);remotePlayers.set(id,rp);remoteRoot.add(rp.group);}
  rp.target.set(data.p[0],0,data.p[2]);rp.targetYaw=Array.isArray(data.r)?data.r[0]:0;rp.lastSeen=elapsed;rp.mic=Number(data.mic)||0;
  if(rp.mic>.12)emitNoiseAt(Math.min(1,rp.mic*1.25),rp.target.x,rp.target.z,'remote-voice');
}
function createRemotePlayer(id){const g=new THREE.Group(),body=mesh(geo.cylinder,materials.remote,[0,.78,0],[.30,.75,.30]),head=mesh(geo.sphere,materials.remote,[0,1.56,0],[.30,.32,.30]),lamp=mesh(geo.sphere,materials.fixture,[0,1.52,-.28],[.07,.07,.06]);g.add(body,head,lamp);return{id,group:g,target:new THREE.Vector3(),targetYaw:0,lastSeen:elapsed};}
function updateRemotePlayers(dt){for(const[id,rp]of remotePlayers){rp.group.position.lerp(rp.target,Math.min(1,dt*9));rp.group.rotation.y=lerpAngle(rp.group.rotation.y,rp.targetYaw,Math.min(1,dt*8));rp.group.position.y=Math.sin(elapsed*7+id.length)*.018;if(elapsed-rp.lastSeen>8)removeRemotePlayer(id);}}
function removeRemotePlayer(id){const rp=remotePlayers.get(id);if(!rp)return;remoteRoot.remove(rp.group);remotePlayers.delete(id);}
function disconnectNetwork(){for(const conn of net.conns.values())conn.close?.();net.hostConn?.close?.();net.peer?.destroy?.();net.peer=null;net.hostConn=null;net.conns.clear();net.mode='solo';net.id='';for(const id of[...remotePlayers.keys()])removeRemotePlayer(id);updateNetHud();}
function updateNetHud(count){if(net.mode==='solo'){netStateEl.textContent=`SOLO · LIGHT ${flashlightOn?'ON':'OFF'}`;return;}if(net.mode==='host'){const n=Number.isInteger(count)?count:1+net.conns.size;netStateEl.textContent=`HOST · ${n}/${MAX_PLAYERS}`;}else netStateEl.textContent=`CLIENT · ${net.hostConn?.open?'connected':'connecting'}`;}
function randomCode(n){const chars='abcdefghjkmnpqrstuvwxyz23456789';let out='';for(let i=0;i<n;i++)out+=chars[(Math.random()*chars.length)|0];return out;}
function showToast(text){toastEl.textContent=text;toastEl.classList.add('show');clearTimeout(showToast._timer);showToast._timer=setTimeout(()=>toastEl.classList.remove('show'),2300);}
function onResize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();updateRendererScale();}
function isTouchDevice(){return matchMedia('(pointer: coarse)').matches||'ontouchstart'in window;}
function distanceXZ(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
function round2(v){return Math.round(v*100)/100;}
function lerpAngle(a,b,t){const d=Math.atan2(Math.sin(b-a),Math.cos(b-a));return a+d*t;}
function hash3(a,b,c){let h=Math.imul((a|0)^0x9e3779b9,0x85ebca6b);h^=Math.imul((b|0)^0xc2b2ae35,0x27d4eb2d);h^=Math.imul((c|0)^0x165667b1,0x7feb352d);h^=h>>>16;h=Math.imul(h,0x846ca68b);h^=h>>>13;return h>>>0;}
function mulberry32(seed){return function(){seed|=0;seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}

function wallpaperTexture(){
  const size=256,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false}),img=ctx.createImageData(size,size),rng=mulberry32(0x3f9a1012);
  for(let i=0;i<img.data.length;i+=4){const n=(rng()-.5)*18;img.data[i]=194+n;img.data[i+1]=190+n;img.data[i+2]=157+n*.7;img.data[i+3]=255;}ctx.putImageData(img,0,0);
  ctx.globalAlpha=.11;for(let x=0;x<size;x+=4){ctx.fillStyle=x%8?'#e7dfb8':'#706a4d';ctx.fillRect(x,0,1,size);}
  ctx.globalAlpha=.26;ctx.strokeStyle='#70694d';ctx.fillStyle='#696246';ctx.lineWidth=1;
  for(let y=-12;y<size+22;y+=30)for(let x=-12;x<size+22;x+=22){const off=((y/30)&1)?11:0,px=x+off;ctx.beginPath();ctx.moveTo(px,y+2);ctx.quadraticCurveTo(px+5,y+7,px,y+13);ctx.quadraticCurveTo(px-5,y+7,px,y+2);ctx.stroke();ctx.beginPath();ctx.moveTo(px-4,y+20);ctx.lineTo(px,y+25);ctx.lineTo(px+4,y+20);ctx.stroke();ctx.fillRect(px-1,y+16,2,2);}
  ctx.globalAlpha=.055;ctx.fillStyle='#443f2b';for(let i=0;i<18;i++){ctx.beginPath();ctx.ellipse(rng()*size,rng()*size,3+rng()*16,6+rng()*24,rng()*Math.PI,0,Math.PI*2);ctx.fill();}
  return new THREE.CanvasTexture(c);
}
function carpetTexture(){return fiberTexture(256,145,128,87,0x2a7011);}
function concreteTexture(){return fiberTexture(256,150,149,138,0xc0ffee);}
function fiberTexture(size,r,g,b,seed){const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false}),img=ctx.createImageData(size,size),rng=mulberry32(seed);for(let i=0;i<img.data.length;i+=4){const n=(rng()-.5)*32;img.data[i]=r+n;img.data[i+1]=g+n*.9;img.data[i+2]=b+n*.72;img.data[i+3]=255;}ctx.putImageData(img,0,0);ctx.globalAlpha=.11;ctx.strokeStyle='#f2edc9';for(let i=0;i<650;i++){const x=rng()*size,y=rng()*size;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(rng()-.5)*3,y+rng()*2.2);ctx.stroke();}return new THREE.CanvasTexture(c);}
function tileTexture(){const size=256,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false}),rng=mulberry32(0x71ae9);ctx.fillStyle='#d7d7c9';ctx.fillRect(0,0,size,size);ctx.strokeStyle='#7d8077';ctx.lineWidth=2;for(let x=0;x<=size;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,size);ctx.stroke();}for(let y=0;y<=size;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(size,y);ctx.stroke();}ctx.globalAlpha=.12;ctx.fillStyle='#6f716b';for(let i=0;i<90;i++)ctx.fillRect(rng()*size,rng()*size,1,1);return new THREE.CanvasTexture(c);}
function woodTexture(){const size=256,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false}),rng=mulberry32(0x7700aa);ctx.fillStyle='#a58a66';ctx.fillRect(0,0,size,size);for(let y=0;y<size;y+=20){ctx.fillStyle=y%40?'#8a7254':'#b69a73';ctx.fillRect(0,y,size,2);for(let x=0;x<size;x+=70){ctx.fillStyle='rgba(45,34,25,.18)';ctx.fillRect(x+rng()*20,y+2,1,18);}}return new THREE.CanvasTexture(c);}
function ceilingTexture(){const size=256,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false}),rng=mulberry32(0x445566);ctx.fillStyle='#d2cfb5';ctx.fillRect(0,0,size,size);ctx.globalAlpha=.16;ctx.fillStyle='#696650';for(let i=0;i<1100;i++)ctx.fillRect(rng()*size,rng()*size,1,1);ctx.globalAlpha=.42;ctx.strokeStyle='#77735c';ctx.lineWidth=2;ctx.strokeRect(1,1,size-2,size-2);return new THREE.CanvasTexture(c);}

function setupRuntime(){
  startButton.addEventListener('click',enterGame);
  renderer.domElement.addEventListener('click',()=>{if(!controls.isLocked&&!isTouchDevice())controls.lock();});
  controls.addEventListener('lock',()=>{menu.classList.add('hidden');ensureAudio();});
  controls.addEventListener('unlock',()=>{if(!isTouchDevice())menu.classList.remove('hidden');});
  qualitySelect.addEventListener('change',()=>{qualityMode=qualitySelect.value;applyQuality(true);});filterSelect.addEventListener('change',()=>setFilter(filterSelect.value));micButton.addEventListener('click',toggleMic);gyroButton.addEventListener('click',enableGyro);hostButton.addEventListener('click',hostRoom);joinButton.addEventListener('click',joinRoom);
  addEventListener('keydown',onKeyDown);addEventListener('keyup',e=>pressed.delete(e.code));addEventListener('blur',()=>pressed.clear());addEventListener('resize',onResize);addEventListener('orientationchange',()=>gyro.orient=screen.orientation?.angle||window.orientation||0);addEventListener('deviceorientation',onDeviceOrientation,true);
  let touchId=null,touchX=0,touchY=0;
  renderer.domElement.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;touchId=e.pointerId;touchX=e.clientX;touchY=e.clientY;renderer.domElement.setPointerCapture?.(e.pointerId);menu.classList.add('hidden');ensureAudio();});
  renderer.domElement.addEventListener('pointermove',e=>{if(e.pointerId!==touchId||gyro.enabled)return;const dx=e.clientX-touchX,dy=e.clientY-touchY;touchX=e.clientX;touchY=e.clientY;camera.rotation.y-=dx*.0045;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-dy*.0042,-1.42,1.42);});
  renderer.domElement.addEventListener('pointerup',e=>{if(e.pointerId===touchId)touchId=null;});
  setFilter('bodycam');applyQuality(true);switchLevel(0,true);animate();
}
setupRuntime();
