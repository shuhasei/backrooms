// Lens + realism layer
// Adds barrel distortion/fisheye, vignette, motion-reactive chromatic aberration,
// lo-fi pixelation, procedural PBR detail maps, emissive bloom approximation and
// panic audio/heartbeat while preserving the existing lightweight architecture.

var lensLastYaw = camera.rotation.y;
var lensLastPitch = camera.rotation.x;
var lensTurnEnergy = 0;
var lensPanic = 0;
var lensHeartbeatAt = -999;
var lensPbrPrepared = false;
var lensNormalMaps = {};
var lensRoughnessMaps = {};

function lensMakeNormalTexture(kind) {
  var size = 128, c = document.createElement('canvas'); c.width = c.height = size;
  var ctx = c.getContext('2d'), img = ctx.createImageData(size,size);
  var rng = mulberry32(kind === 'wall' ? 0x9131 : kind === 'carpet' ? 0x7221 : 0x5512);
  for (var y=0;y<size;y++) for (var x=0;x<size;x++) {
    var i=(y*size+x)*4;
    var n=(rng()-.5);
    var grain = kind==='carpet' ? Math.sin(x*.65+y*.17)*.23+n*.55 : kind==='wall' ? Math.sin(y*.34)*.15+n*.24 : n*.18;
    img.data[i]=128+grain*38;
    img.data[i+1]=128+grain*28;
    img.data[i+2]=220+Math.abs(grain)*25;
    img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  var tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.colorSpace=THREE.NoColorSpace;
  return tex;
}

function lensMakeRoughnessTexture(kind) {
  var size=128,c=document.createElement('canvas');c.width=c.height=size;var ctx=c.getContext('2d'),img=ctx.createImageData(size,size);
  var rng=mulberry32(kind==='carpet'?0x8811:0x4411);
  for(var i=0;i<img.data.length;i+=4){var v=kind==='carpet'?205+rng()*35:210+rng()*26;img.data[i]=img.data[i+1]=img.data[i+2]=v;img.data[i+3]=255;}
  ctx.putImageData(img,0,0);var tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.NoColorSpace;return tex;
}

function lensPreparePBR() {
  if(lensPbrPrepared)return;lensPbrPrepared=true;
  lensNormalMaps.wall=lensMakeNormalTexture('wall');
  lensNormalMaps.carpet=lensMakeNormalTexture('carpet');
  lensNormalMaps.tile=lensMakeNormalTexture('tile');
  lensRoughnessMaps.wall=lensMakeRoughnessTexture('wall');
  lensRoughnessMaps.floor=lensMakeRoughnessTexture('carpet');
  lensNormalMaps.wall.repeat.copy(textures.wallpaper.repeat);
  lensNormalMaps.carpet.repeat.copy(textures.carpet.repeat);
  lensNormalMaps.tile.repeat.copy(textures.tile.repeat);
  lensRoughnessMaps.wall.repeat.copy(textures.wallpaper.repeat);
  lensRoughnessMaps.floor.repeat.copy(textures.carpet.repeat);

  materials.wall.normalMap=lensNormalMaps.wall;materials.wall.normalScale.set(.18,.18);materials.wall.roughnessMap=lensRoughnessMaps.wall;materials.wall.roughness=.86;materials.wall.needsUpdate=true;
  materials.floor.normalMap=lensNormalMaps.carpet;materials.floor.normalScale.set(.30,.30);materials.floor.roughnessMap=lensRoughnessMaps.floor;materials.floor.roughness=.90;materials.floor.needsUpdate=true;
  materials.fixture.emissiveIntensity=Math.max(materials.fixture.emissiveIntensity,2.6);
}

var lensBaseApplyTheme = applyTheme;
applyTheme = function(theme) {
  lensBaseApplyTheme(theme);
  lensPreparePBR();
  if(theme.floorMode==='pool'||theme.floorMode==='office'){
    materials.floor.normalMap=lensNormalMaps.tile;materials.floor.normalScale.set(.16,.16);materials.floor.roughness=.72;materials.floor.metalness=.02;
  }else if(theme.floorMode==='carpet'){
    materials.floor.normalMap=lensNormalMaps.carpet;materials.floor.normalScale.set(.30,.30);materials.floor.roughness=.88;materials.floor.metalness=0;
  }else{
    materials.floor.normalMap=lensNormalMaps.tile;materials.floor.normalScale.set(.10,.10);materials.floor.roughness=.84;materials.floor.metalness=.01;
  }
  materials.floor.needsUpdate=true;
};

// Enhance the existing single-pass post process instead of stacking multiple
// expensive composers. The shader includes barrel distortion, vignette, low-res
// sampling, chromatic aberration and a tiny bloom approximation around highlights.
if (typeof immersivePostPass !== 'undefined' && immersivePostPass) {
  immersivePostPass.material.fragmentShader = `
    precision mediump float;
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float mode;
    uniform float strength;
    uniform vec2 resolution;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
    vec2 barrel(vec2 uv,float k){vec2 p=uv-.5;float r2=dot(p,p);return .5+p*(1.0+k*r2+k*.58*r2*r2);}
    vec3 sampleCA(vec2 uv,float ca){
      float r=texture2D(tDiffuse,uv+vec2(ca,0.)).r;
      float g=texture2D(tDiffuse,uv).g;
      float b=texture2D(tDiffuse,uv-vec2(ca,0.)).b;
      return vec3(r,g,b);
    }
    void main(){
      vec2 uv=vUv;vec2 c=uv-.5;float edge=dot(c,c);
      float isVhs=step(.5,mode)*step(mode,1.5);float isBody=step(1.5,mode)*step(mode,2.5);float isNight=step(2.5,mode);
      float barrelK=(.105*isVhs+.072*isBody+.035*isNight)*strength;
      uv=barrel(uv,barrelK);
      if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.){gl_FragColor=vec4(0.,0.,0.,1.);return;}
      float pixelMix=(isVhs*.75+isBody*.22+isNight*.45)*strength;
      vec2 lowRes=mix(resolution,max(vec2(320.,180.),resolution*.55),pixelMix);
      uv=(floor(uv*lowRes)+.5)/lowRes;
      float jitter=(hash(vec2(floor(time*18.0),floor(uv.y*120.0)))-.5)*.0032*isVhs*strength;uv.x+=jitter;
      float turn=clamp(abs(sin(time*19.7))*0.35+abs(sin(time*7.9))*0.15,0.,1.);
      float ca=(.00055+.0019*edge)*(isVhs+isBody*.72+isNight*.32)*strength*(1.0+turn*.7);
      vec3 col=sampleCA(uv,ca);
      vec2 px=1.0/resolution;vec3 bloom=vec3(0.);
      bloom+=texture2D(tDiffuse,uv+vec2(px.x*2.,0.)).rgb;
      bloom+=texture2D(tDiffuse,uv-vec2(px.x*2.,0.)).rgb;
      bloom+=texture2D(tDiffuse,uv+vec2(0.,px.y*2.)).rgb;
      bloom+=texture2D(tDiffuse,uv-vec2(0.,px.y*2.)).rgb;
      bloom*=.25;float lum=max(max(bloom.r,bloom.g),bloom.b);col+=bloom*max(0.,lum-.72)*(.19+.10*isVhs)*strength;
      float grain=(hash(gl_FragCoord.xy+vec2(time*173.0,time*91.0))-.5);col+=grain*(.018+.040*isVhs+.023*isBody+.055*isNight)*strength;
      float scan=sin((uv.y*resolution.y+time*8.0)*3.14159)*.5+.5;col*=1.0-(.025+.045*isVhs+.020*isBody)*scan*strength;
      if(isNight>.5){col=floor(col*18.0)/18.0;float l=dot(col,vec3(.24,.67,.09));col=mix(col,vec3(l*.30,l*.78,l*.34),.34);}
      float vig=smoothstep(.27,.73,length(c));col*=1.0-vig*(.15+.14*isBody+.12*isVhs)*strength;
      col*=smoothstep(.02,.055,uv.x)*smoothstep(.02,.055,1.-uv.x)*smoothstep(.02,.055,uv.y)*smoothstep(.02,.055,1.-uv.y);
      gl_FragColor=vec4(col,1.0);
    }`;
  immersivePostPass.material.needsUpdate=true;
}

// Lo-fi internal resolution is strongest in VHS mode, but automatic quality still
// remains the upper performance authority.
var lensBaseSetFilter=setFilter;
setFilter=function(name){lensBaseSetFilter(name);if(name==='vhs'&&qualityMode==='high')renderScale=Math.min(renderScale,1.0);};

// -----------------------------------------------------------------------------
// Panic audio: low-frequency ambience + heartbeat under fatigue/chase.
// -----------------------------------------------------------------------------
function lensHeartbeat(strength){
  ensureAudio();if(!audioState?.ctx)return;var ctx=audioState.ctx;
  for(var beat=0;beat<2;beat++){
    (function(delay,vol){var osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();osc.type='sine';osc.frequency.setValueAtTime(62,ctx.currentTime+delay);osc.frequency.exponentialRampToValueAtTime(42,ctx.currentTime+delay+.09);filter.type='lowpass';filter.frequency.value=130;gain.gain.setValueAtTime(.0001,ctx.currentTime+delay);gain.gain.exponentialRampToValueAtTime(vol,ctx.currentTime+delay+.012);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+delay+.13);osc.connect(filter);filter.connect(gain);gain.connect(audioState.master);osc.start(ctx.currentTime+delay);osc.stop(ctx.currentTime+delay+.15);})(beat*.19,(.012+.027*strength)*(beat? .62:1));
  }
}

var lensBaseUpdateNetworking=updateNetworking;
updateNetworking=function(){
  lensBaseUpdateNetworking();
  var staminaStress=typeof survivalState!=='undefined'?(1-survivalState.stamina/100):0;
  var nearest=typeof survivalNearestEnemyDistance==='function'?survivalNearestEnemyDistance():Infinity;
  var enemyStress=Number.isFinite(nearest)?THREE.MathUtils.clamp((9-nearest)/9,0,1):0;
  lensPanic=THREE.MathUtils.lerp(lensPanic,Math.max(staminaStress,enemyStress),.08);
  if(audioState?.humGain){
    var target=humEnabled?(.0035+lensPanic*.006):0;
    audioState.humGain.gain.setTargetAtTime(target,audioState.ctx.currentTime,.12);
  }
  if(lensPanic>.34&&elapsed-lensHeartbeatAt>THREE.MathUtils.lerp(1.15,.53,lensPanic)){
    lensHeartbeatAt=elapsed;lensHeartbeat(lensPanic);
  }
};

// Voice occlusion was already wall-count aware. Make the isolation more severe
// when two or more walls are between players, while keeping proximity intact.
if(typeof immersiveUpdateVoiceSpatial==='function'){
  var lensBaseVoiceSpatial=immersiveUpdateVoiceSpatial;
  immersiveUpdateVoiceSpatial=function(){
    lensBaseVoiceSpatial();if(!audioState?.ctx)return;
    for(var entry of immersiveVoiceNodes){
      var id=entry[0],n=entry[1],rp=remotePlayers.get(id);if(!rp)continue;var p=rp.group?.position||rp.target;
      var colliders=getNearbyColliders((camera.position.x+p.x)*.5,(camera.position.z+p.z)*.5),walls=0;
      for(var b of colliders){if(segmentIntersectsBox(camera.position.x,camera.position.z,p.x,p.z,b)&&++walls>=3)break;}
      var g=walls===0?.90:walls===1?.46:walls===2?.23:.11;
      var f=walls===0?7800:walls===1?1150:walls===2?620:390;
      n.gain.gain.setTargetAtTime(g,audioState.ctx.currentTime,.09);n.filter.frequency.setTargetAtTime(f,audioState.ctx.currentTime,.09);
    }
  };
}

lensPreparePBR();
