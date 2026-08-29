// Co-op teammate avatar: orange hazmat suit inspired by the supplied reference.
// Loaded after authoritative-ai.js. It replaces the old cylinder/sphere avatar
// while preserving the existing P2P state and host-authoritative AI wrappers.

var avatarBaseUpdateRemoteState = updateRemoteState;
var HAZMAT_ORANGE = 0xe45b18;
var HAZMAT_ORANGE_DARK = 0xa93b10;
var HAZMAT_BLACK = 0x111512;
var HAZMAT_RUBBER = 0x1b211d;
var HAZMAT_METAL = 0x4a514b;
var HAZMAT_VISOR = 0x090d0d;

function avatarMat(color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({
    color: color,
    roughness: roughness == null ? .82 : roughness,
    metalness: metalness == null ? 0 : metalness,
  });
}

var avatarShared = {
  suit: avatarMat(HAZMAT_ORANGE, .88, 0),
  suitDark: avatarMat(HAZMAT_ORANGE_DARK, .92, 0),
  rubber: avatarMat(HAZMAT_RUBBER, .96, 0),
  black: avatarMat(HAZMAT_BLACK, .86, .02),
  metal: avatarMat(HAZMAT_METAL, .48, .48),
  visor: new THREE.MeshStandardMaterial({
    color: HAZMAT_VISOR,
    roughness: .10,
    metalness: .42,
    emissive: new THREE.Color(0x071111),
    emissiveIntensity: .38,
  }),
  hose: avatarMat(0x1e2420, .86, .12),
};

function avatarMesh(geometry, material, x, y, z, sx, sy, sz) {
  var m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

function avatarSegment(parent, ax, ay, az, bx, by, bz, radius, material) {
  var a = new THREE.Vector3(ax, ay, az);
  var b = new THREE.Vector3(bx, by, bz);
  var d = b.clone().sub(a);
  var length = Math.max(.001, d.length());
  var geometry = new THREE.CylinderGeometry(radius * .88, radius, length, 7, 1);
  var mesh = new THREE.Mesh(geometry, material);
  mesh.userData.avatarOwnedGeometry = true;
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  parent.add(mesh);
  return mesh;
}

function avatarArm(side) {
  var root = new THREE.Group();
  root.position.set(side * .41, 1.40, 0);
  root.rotation.z = side * -.09;

  var upper = avatarMesh(geo.cylinder, avatarShared.suit, 0, -.205, 0, .15, .41, .15);
  var elbow = avatarMesh(geo.sphere, avatarShared.suitDark, 0, -.415, 0, .13, .13, .13);
  var foreRoot = new THREE.Group();
  foreRoot.position.set(0, -.40, 0);
  foreRoot.rotation.x = -.08;
  var fore = avatarMesh(geo.cylinder, avatarShared.suit, 0, -.19, -.015, .135, .38, .135);
  var glove = avatarMesh(geo.sphere, avatarShared.rubber, 0, -.405, -.055, .14, .16, .13);
  foreRoot.add(fore, glove);
  root.add(upper, elbow, foreRoot);
  root.userData.fore = foreRoot;
  return root;
}

function avatarLeg(side) {
  var root = new THREE.Group();
  root.position.set(side * .18, .76, 0);

  var thigh = avatarMesh(geo.cylinder, avatarShared.suit, 0, -.22, 0, .18, .44, .18);
  var knee = avatarMesh(geo.sphere, avatarShared.suitDark, 0, -.45, 0, .15, .14, .15);
  var shinRoot = new THREE.Group();
  shinRoot.position.set(0, -.43, 0);
  var shin = avatarMesh(geo.cylinder, avatarShared.suit, 0, -.20, 0, .15, .40, .15);
  var boot = avatarMesh(geo.box, avatarShared.rubber, 0, -.43, -.07, .27, .16, .42);
  boot.rotation.x = -.04;
  shinRoot.add(shin, boot);
  root.add(thigh, knee, shinRoot);
  root.userData.shin = shinRoot;
  return root;
}

function avatarTank(parent, x) {
  var tank = avatarMesh(geo.cylinder, avatarShared.metal, x, 1.27, .39, .13, .55, .13);
  tank.rotation.z = 0;
  parent.add(tank);
  var cap = avatarMesh(geo.sphere, avatarShared.black, x, 1.56, .39, .10, .08, .10);
  parent.add(cap);
}

function avatarMakeNameplate(id) {
  var canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = 'rgba(6,8,6,.62)';
  ctx.fillRect(20, 8, 216, 46);
  ctx.strokeStyle = 'rgba(234,190,93,.52)';
  ctx.lineWidth = 2;
  ctx.strokeRect(21, 9, 214, 44);
  ctx.font = '700 23px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f4e2a3';
  var short = String(id || 'PLAYER').replace(/^brx3-/, '').slice(-8).toUpperCase();
  ctx.fillText('PLAYER ' + short, 128, 31);
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: .78 });
  var sprite = new THREE.Sprite(mat);
  sprite.position.set(0, 2.25, 0);
  sprite.scale.set(1.55, .39, 1);
  sprite.userData.avatarDispose = function() { tex.dispose(); mat.dispose(); };
  return sprite;
}

function createRemotePlayer(id) {
  var group = new THREE.Group();
  group.name = 'remote-hazmat-' + id;

  // Visual root is animated independently from the network position root.
  var visual = new THREE.Group();
  group.add(visual);

  // Torso / waist / pelvis: bulky enough to read like a protective suit.
  var pelvis = avatarMesh(geo.sphere, avatarShared.suitDark, 0, .78, .015, .32, .24, .28);
  var abdomen = avatarMesh(geo.cylinder, avatarShared.suit, 0, 1.02, 0, .62, .44, .52);
  var torso = avatarMesh(geo.cylinder, avatarShared.suit, 0, 1.31, 0, .76, .62, .58);
  var shoulder = avatarMesh(geo.sphere, avatarShared.suit, 0, 1.48, 0, .47, .24, .33);

  // Hood and dark respirator visor.
  var headPivot = new THREE.Group();
  headPivot.position.set(0, 1.72, 0);
  var hood = avatarMesh(geo.sphere, avatarShared.suit, 0, 0, 0, .34, .37, .32);
  var hoodRim = avatarMesh(geo.torus, avatarShared.suitDark, 0, .01, -.275, .25, .26, .07);
  hoodRim.rotation.x = Math.PI / 2;
  var visor = avatarMesh(geo.sphere, avatarShared.visor, 0, .045, -.285, .245, .165, .055);
  var respirator = avatarMesh(geo.cylinder, avatarShared.black, 0, -.125, -.325, .115, .115, .115);
  respirator.rotation.x = Math.PI / 2;
  var filterL = avatarMesh(geo.cylinder, avatarShared.metal, -.125, -.13, -.315, .07, .10, .07);
  var filterR = avatarMesh(geo.cylinder, avatarShared.metal, .125, -.13, -.315, .07, .10, .07);
  filterL.rotation.z = Math.PI / 2;
  filterR.rotation.z = Math.PI / 2;
  headPivot.add(hood, hoodRim, visor, respirator, filterL, filterR);

  // Harness and belt give the orange silhouette the same heavy gear feel.
  var strapL = avatarMesh(geo.box, avatarShared.black, -.20, 1.27, -.292, .075, .58, .035);
  var strapR = avatarMesh(geo.box, avatarShared.black, .20, 1.27, -.292, .075, .58, .035);
  var chestBelt = avatarMesh(geo.box, avatarShared.black, 0, 1.15, -.30, .56, .075, .045);
  var waistBelt = avatarMesh(geo.box, avatarShared.black, 0, .87, -.285, .60, .085, .045);
  var buckle = avatarMesh(geo.box, avatarShared.metal, 0, .87, -.335, .13, .11, .035);

  // Backpack + twin cylinders.
  var pack = avatarMesh(geo.box, avatarShared.black, 0, 1.27, .34, .49, .63, .23);
  var packTop = avatarMesh(geo.box, avatarShared.metal, 0, 1.59, .34, .39, .09, .20);
  avatarTank(visual, -.14);
  avatarTank(visual, .14);

  // Breathing hose from mask to chest/pack. Lightweight segmented tube.
  avatarSegment(visual, .11, 1.58, -.30, .25, 1.43, -.31, .026, avatarShared.hose);
  avatarSegment(visual, .25, 1.43, -.31, .30, 1.20, -.17, .026, avatarShared.hose);

  // Limbs.
  var armL = avatarArm(-1), armR = avatarArm(1);
  var legL = avatarLeg(-1), legR = avatarLeg(1);

  // Chest light is emissive only (no expensive dynamic light per remote player).
  var lampMat = new THREE.MeshStandardMaterial({
    color: 0x272f28,
    emissive: new THREE.Color(0xffe7a5),
    emissiveIntensity: .05,
    roughness: .24,
    metalness: .15,
  });
  var lamp = avatarMesh(geo.box, lampMat, .28, 1.42, -.326, .12, .085, .035);

  // Small shoulder patch and player marker improve readability in dark hallways.
  var patchMat = new THREE.MeshStandardMaterial({ color: 0x332d1a, emissive: 0x3b2d08, emissiveIntensity: .12, roughness: .75 });
  var patch = avatarMesh(geo.box, patchMat, -.405, 1.46, -.10, .055, .15, .12);
  var nameplate = avatarMakeNameplate(id);

  visual.add(
    pelvis, abdomen, torso, shoulder, headPivot,
    strapL, strapR, chestBelt, waistBelt, buckle,
    pack, packTop, armL, armR, legL, legR, lamp, patch, nameplate
  );

  visual.scale.setScalar(1.03);

  return {
    id: id,
    group: group,
    visual: visual,
    headPivot: headPivot,
    armL: armL,
    armR: armR,
    legL: legL,
    legR: legR,
    lamp: lamp,
    lampMat: lampMat,
    target: new THREE.Vector3(),
    targetYaw: 0,
    targetPitch: 0,
    lastSeen: elapsed,
    moving: false,
    running: false,
    light: false,
    animPhase: (String(id).length % 7) * .7,
    _lastWorldX: NaN,
    _lastWorldZ: NaN,
    _avatarLastAt: elapsed,
  };
}

updateRemoteState = function(id, data) {
  // Preserve authoritative-ai's remote voice/running/light bookkeeping.
  avatarBaseUpdateRemoteState(id, data);
  var rp = remotePlayers.get(id);
  if (!rp) return;
  if (Array.isArray(data.r)) {
    rp.targetYaw = Number(data.r[0]) || 0;
    rp.targetPitch = THREE.MathUtils.clamp(Number(data.r[1]) || 0, -1.25, 1.25);
  }
  if (typeof data.light === 'boolean') rp.light = data.light;
};

function updateRemotePlayers(dt) {
  var posAlpha = 1 - Math.exp(-dt * 10.5);
  var yawAlpha = Math.min(1, dt * 10);

  for (var entry of remotePlayers) {
    var id = entry[0], rp = entry[1];
    var beforeX = rp.group.position.x;
    var beforeZ = rp.group.position.z;

    rp.group.position.lerp(rp.target, posAlpha);
    rp.group.position.y = 0;
    rp.group.rotation.y = lerpAngle(rp.group.rotation.y, rp.targetYaw || 0, yawAlpha);

    var frameSpeed = Math.hypot(rp.group.position.x - beforeX, rp.group.position.z - beforeZ) / Math.max(.001, dt);
    var networkDelta = Math.hypot(rp.target.x - rp.group.position.x, rp.target.z - rp.group.position.z);
    var isMoving = frameSpeed > .10 || networkDelta > .035;
    var isRunning = !!rp.running || frameSpeed > 3.7;
    rp.moving = isMoving;

    if (isMoving) rp.animPhase += dt * (isRunning ? 10.5 : 6.2);
    else rp.animPhase += dt * 1.1;

    var swing = isMoving ? Math.sin(rp.animPhase) * (isRunning ? .72 : .43) : Math.sin(elapsed * 1.8 + rp.animPhase) * .035;
    var bob = isMoving ? Math.abs(Math.sin(rp.animPhase * 2)) * (isRunning ? .045 : .025) : Math.sin(elapsed * 1.5 + rp.animPhase) * .006;

    if (rp.visual) rp.visual.position.y = bob;
    if (rp.armL) rp.armL.rotation.x = swing;
    if (rp.armR) rp.armR.rotation.x = -swing;
    if (rp.legL) rp.legL.rotation.x = -swing * .92;
    if (rp.legR) rp.legR.rotation.x = swing * .92;

    // Slight elbow bend while moving, more pronounced while running.
    if (rp.armL?.userData.fore) rp.armL.userData.fore.rotation.x = -.12 - Math.max(0, -swing) * .25;
    if (rp.armR?.userData.fore) rp.armR.userData.fore.rotation.x = -.12 - Math.max(0, swing) * .25;

    // Other player's camera pitch subtly moves the hood/visor, not the whole torso.
    if (rp.headPivot) rp.headPivot.rotation.x = THREE.MathUtils.lerp(rp.headPivot.rotation.x, rp.targetPitch * .38, Math.min(1, dt * 8));

    if (rp.lampMat) {
      rp.lampMat.emissiveIntensity = THREE.MathUtils.lerp(rp.lampMat.emissiveIntensity, rp.light ? 3.1 : .05, Math.min(1, dt * 9));
      rp.lampMat.color.setHex(rp.light ? 0xffe7ac : 0x272f28);
    }

    // Keep the whole avatar planted and fade stale peers only after the normal timeout.
    rp.group.visible = elapsed - rp.lastSeen < 8;
    if (elapsed - rp.lastSeen > 8) removeRemotePlayer(id);
  }
}

var avatarBaseRemoveRemotePlayer = removeRemotePlayer;
removeRemotePlayer = function(id) {
  var rp = remotePlayers.get(id);
  if (rp) {
    rp.group.traverse(function(o) {
      if (o.userData?.avatarOwnedGeometry) o.geometry?.dispose?.();
      if (o.userData?.avatarDispose) o.userData.avatarDispose();
    });
    rp.lampMat?.dispose?.();
  }
  avatarBaseRemoveRemotePlayer(id);
};
