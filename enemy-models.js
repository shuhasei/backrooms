import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const A = new THREE.Vector3();
const B = new THREE.Vector3();

export function enemyStats(kind) {
  return {
    balloon:   { speed: 2.45, hearing: 31, sight: 8, radius: .43 },
    wire:      { speed: 3.55, hearing: 27, sight: 13, radius: .34 },
    splitface: { speed: 3.05, hearing: 24, sight: 12, radius: .48 },
    eye:       { speed: 3.25, hearing: 19, sight: 18, radius: .38 },
    floorhead: { speed: 1.72, hearing: 34, sight: 6, radius: .58 },
    winged:    { speed: 3.65, hearing: 29, sight: 10, radius: .50 },
  }[kind] || { speed: 2.8, hearing: 24, sight: 10, radius: .42 };
}

export function createEnemy(kind, M, G) {
  if (kind === 'balloon') return balloonEntity(M, G);
  if (kind === 'wire') return wireEntity(M, G);
  if (kind === 'splitface') return splitFaceEntity(M, G);
  if (kind === 'eye') return eyeEntity(M, G);
  if (kind === 'floorhead') return floorHeadEntity(M, G);
  return wingedEntity(M, G);
}

function balloonEntity(M, G) {
  const g = new THREE.Group();
  const pelvis = mesh(G.sphere, M.sinewDark, [0, .82, 0], [.38, .30, .26]);
  const torso = mesh(G.icosa, M.sinew, [0, 1.42, 0], [.58, .86, .34]);
  torso.rotation.z = -.04;
  const neck = mesh(G.cylinder, M.sinewDark, [0, 1.93, 0], [.16, .36, .16]);
  const head = mesh(G.sphere, M.sinew, [0, 2.23, -.02], [.34, .48, .25]);

  for (let i = 0; i < 5; i++) {
    const rib = owned(new THREE.Mesh(new THREE.TorusGeometry(.5, .025, 5, 14, Math.PI * 1.55), M.sinewDark));
    rib.position.set(0, 1.64 - i * .16, -.05);
    rib.rotation.set(Math.PI / 2, 0, .22);
    rib.scale.set(1 - i * .06, .58, .66);
    g.add(rib);
  }

  const armL = bent(M.sinew, [-.46, 1.62, 0], [[-.18, -.45, .02], [-.22, -.92, -.03]], .09, G);
  const armR = bent(M.sinew, [.48, 1.66, 0], [[.16, .34, -.01], [.20, .74, -.03]], .095, G);
  const fist = mesh(G.sphere, M.sinewDark, [.83, 2.40, -.03], [.12, .16, .10]);
  const legL = bent(M.sinew, [-.19, .78, 0], [[-.07, -.42, .04], [-.12, -.82, -.03]], .105, G);
  const legR = bent(M.sinew, [.19, .78, 0], [[.06, -.42, -.02], [.10, -.82, .05]], .105, G);

  const balloon = mesh(G.sphere, M.red, [.86, 3.48, 0], [.52, .72, .43]);
  const tip = mesh(G.cone, M.red, [.86, 2.83, 0], [.11, .21, .11]);
  tip.rotation.z = Math.PI;
  segment(g, new THREE.Vector3(.83, 2.43, 0), new THREE.Vector3(.86, 2.82, 0), .012, M.ink);

  g.add(pelvis, torso, neck, head, armL, armR, fist, legL, legR, balloon, tip);
  g.scale.setScalar(.95);
  return { group: g, kind: 'balloon', parts: { head, armL, armR, legL, legR, balloon } };
}

function wireEntity(M, G) {
  const g = new THREE.Group();
  const head = mesh(G.icosa, M.ink, [0, 2.34, 0], [.27, .20, .24]);
  head.rotation.set(.2, .4, -.1);
  g.add(head);

  const loops = [];
  for (let i = 0; i < 6; i++) {
    const ring = owned(new THREE.Mesh(new THREE.TorusGeometry(.25 + i * .035, .014, 4, 18), M.ink));
    ring.position.set((i - 2.5) * .018, 2.28 - i * .043, 0);
    ring.rotation.set(1.1 + i * .29, i * .61, .32 + i * .37);
    ring.scale.y = .52 + i * .08;
    loops.push(ring);
    g.add(ring);
  }

  const spine = bent(M.ink, [0, 2.08, 0], [[-.02, -.45, .02], [.06, -.92, -.02], [-.02, -1.25, 0]], .035, G);
  const armL = bent(M.ink, [-.08, 1.98, 0], [[-.56, -.17, .02], [-.82, -.73, -.02], [-1.02, -1.02, .04]], .028, G);
  const armR = bent(M.ink, [.08, 1.97, 0], [[.58, -.12, -.03], [.69, -.62, .02], [1.00, -.91, -.02]], .028, G);
  const legL = bent(M.ink, [-.03, .86, 0], [[-.32, -.55, .02], [-.46, -1.15, -.04]], .029, G);
  const legR = bent(M.ink, [.03, .86, 0], [[.24, -.55, -.02], [.56, -1.12, .05]], .029, G);
  const shoulderLoop = owned(new THREE.Mesh(new THREE.TorusGeometry(.44, .018, 4, 22), M.ink));
  shoulderLoop.position.y = 1.98;
  shoulderLoop.rotation.x = Math.PI / 2;
  shoulderLoop.scale.set(1.35, .55, 1);
  g.add(spine, armL, armR, legL, legR, shoulderLoop);
  return { group: g, kind: 'wire', parts: { head, loops, shoulderLoop, armL, armR, legL, legR } };
}

function splitFaceEntity(M, G) {
  const g = new THREE.Group();
  const pelvis = mesh(G.sphere, M.grayFlesh, [0, .88, 0], [.48, .38, .36]);
  const abdomen = mesh(G.cylinder, M.grayFlesh, [0, 1.25, 0], [.44, .74, .36]);
  const chest = mesh(G.sphere, M.grayFlesh, [0, 1.68, 0], [.73, .58, .43]);
  const shoulderL = mesh(G.sphere, M.grayFlesh, [-.63, 1.70, 0], [.31, .30, .31]);
  const shoulderR = mesh(G.sphere, M.grayFlesh, [.63, 1.70, 0], [.31, .30, .31]);
  const head = mesh(G.sphere, M.grayFlesh, [0, 2.20, 0], [.44, .52, .39]);
  const split = mesh(G.sphere, M.mouth, [0, 2.18, -.355], [.15, .43, .055]);
  const inner = mesh(G.sphere, M.blood, [0, 2.16, -.405], [.075, .34, .025]);

  const armL = bent(M.grayFlesh, [-.64, 1.62, 0], [[-.34, -.34, .02], [-.48, -.86, -.05]], .16, G);
  const armR = bent(M.grayFlesh, [.64, 1.62, 0], [[.34, -.30, -.02], [.52, -.78, .03]], .16, G);
  const legL = bent(M.grayFlesh, [-.27, .88, 0], [[-.10, -.48, .03], [-.18, -.98, -.08]], .18, G);
  const legR = bent(M.grayFlesh, [.27, .88, 0], [[.10, -.48, -.03], [.18, -.98, .07]], .18, G);

  for (let i = 0; i < 7; i++) {
    const y = 1.90 + i * .09;
    for (const side of [-1, 1]) {
      const tooth = owned(new THREE.Mesh(new THREE.ConeGeometry(.035, .11, 5), M.tooth));
      tooth.position.set(side * .085, y, -.445);
      tooth.rotation.z = side * Math.PI / 2;
      tooth.scale.set(1, .65, 1);
      g.add(tooth);
    }
  }
  g.add(pelvis, abdomen, chest, shoulderL, shoulderR, head, split, inner, armL, armR, legL, legR);
  return { group: g, kind: 'splitface', parts: { head, split, inner, armL, armR, legL, legR } };
}

function floorHeadEntity(M, G) {
  const g = new THREE.Group();
  const hole = mesh(G.plane, M.ink, [0, .012, 0], [2.10, 1.15, 1]);
  hole.rotation.x = -Math.PI / 2;
  const bust = mesh(G.icosa, M.rustDark, [0, .50, 0], [.64, .72, .46]);
  const neck = mesh(G.cylinder, M.rust, [0, .86, -.02], [.30, .48, .28]);
  const head = mesh(G.icosa, M.rust, [0, 1.24, -.05], [.49, .56, .40]);
  head.rotation.set(.08, -.12, .04);
  const voidFace = mesh(G.sphere, M.ink, [0, 1.24, -.39], [.20, .29, .05]);
  const armL = bent(M.rustDark, [-.52, .67, 0], [[-.55, -.34, -.04], [-1.02, -.52, -.16], [-1.45, -.42, -.04]], .07, G);
  const armR = bent(M.rustDark, [.52, .67, 0], [[.58, -.31, .02], [1.05, -.48, -.13], [1.48, -.36, .02]], .07, G);

  for (const side of [-1, 1]) {
    const baseX = side * 1.93;
    for (let i = 0; i < 4; i++) {
      segment(g,
        new THREE.Vector3(baseX, .24, -.04 + (i - 1.5) * .06),
        new THREE.Vector3(baseX + side * (.30 + i * .04), .06, -.12 + (i - 1.5) * .13),
        .025, M.rustDark);
    }
  }
  g.add(hole, bust, neck, head, voidFace, armL, armR);
  return { group: g, kind: 'floorhead', parts: { hole, head, voidFace, armL, armR } };
}

function wingedEntity(M, G) {
  const g = new THREE.Group();
  const pelvis = mesh(G.sphere, M.pants, [0, .88, 0], [.34, .32, .27]);
  const legL = bent(M.pants, [-.16, .82, 0], [[-.05, -.39, .02], [-.10, -.82, -.04]], .12, G);
  const legR = bent(M.pants, [.16, .82, 0], [[.05, -.39, -.02], [.12, -.82, .05]], .12, G);
  const footL = mesh(G.sphere, M.skin, [-.28, .04, -.13], [.22, .09, .34]);
  const footR = mesh(G.sphere, M.skin, [.30, .04, -.13], [.22, .09, .34]);
  const core = mesh(G.icosa, M.organic, [0, 1.55, 0], [.72, .78, .50]);
  core.rotation.z = .10;
  const wingL = mesh(G.icosa, M.organic, [-.64, 1.73, .03], [.86, .50, .22]);
  wingL.rotation.z = -.42;
  const wingR = mesh(G.icosa, M.organic, [.67, 1.72, .03], [.88, .48, .22]);
  wingR.rotation.z = .45;
  const mouth = mesh(G.sphere, M.blood, [0, 1.50, -.46], [.28, .42, .08]);
  const mouthVoid = mesh(G.sphere, M.ink, [0, 1.50, -.515], [.14, .28, .035]);

  const specs = [
    [[-.20, 1.82, .02], [[-.72, .38, -.05], [-1.28, .50, -.10]]],
    [[.18, 1.87, .02], [[.80, .42, -.05], [1.43, .65, -.06]]],
    [[-.28, 1.48, .02], [[-.92, -.08, -.02], [-1.46, -.18, .02]]],
    [[.30, 1.43, .02], [[.90, -.06, -.03], [1.52, -.25, .05]]],
    [[0, 1.25, .05], [[.10, -.62, .04], [.46, -1.02, -.02]]],
  ];
  const tendrils = specs.map(([o, points]) => bent(M.ink, o, points, .035, G));
  tendrils.forEach((t) => g.add(t));
  g.add(pelvis, legL, legR, footL, footR, core, wingL, wingR, mouth, mouthVoid);
  return { group: g, kind: 'winged', parts: { legL, legR, tendrils, core, wingL, wingR, mouth } };
}

function eyeEntity(M, G) {
  const g = new THREE.Group();
  const eyeBall = mesh(G.sphere, M.eyeWhite, [0, 1.78, 0], [.60, .53, .38]);
  const iris = mesh(G.sphere, M.iris, [0, 1.79, -.34], [.31, .31, .07]);
  const pupil = mesh(G.sphere, M.pupil, [0, 1.80, -.395], [.14, .14, .035]);
  const upper = owned(new THREE.Mesh(new THREE.TorusGeometry(.49, .065, 7, 22, Math.PI), M.ink));
  upper.position.set(0, 1.79, -.31);
  upper.rotation.z = Math.PI;
  upper.scale.y = .7;
  const armL = bent(M.ink, [-.43, 1.60, .03], [[-.46, -.46, 0], [-.74, -1.02, -.02]], .07, G);
  const armR = bent(M.ink, [.43, 1.58, .03], [[.40, -.43, 0], [.52, -.90, -.02]], .075, G);
  const hand = new THREE.Group();
  hand.position.set(.95, .67, -.02);
  hand.add(mesh(G.sphere, M.ink, [0, 0, 0], [.16, .22, .09]));
  for (let i = 0; i < 5; i++) {
    segment(hand,
      new THREE.Vector3((i - 2) * .055, -.05, 0),
      new THREE.Vector3((i - 2) * .07, -.32 - Math.abs(i - 2) * .025, -.015),
      .024, M.ink);
  }
  g.add(eyeBall, iris, pupil, upper, armL, armR, hand);
  return { group: g, kind: 'eye', parts: { eyeBall, iris, pupil, armL, armR, hand } };
}

export function animateEnemy(e, t, chase, gazeLocked = false) {
  const p = e.parts;
  const swing = Math.sin(t * (chase ? 9 : 4.5) + e.phase) * (chase ? .95 : .48);
  e.group.position.y = e.kind === 'floorhead' ? 0 : Math.sin(t * 3.4 + e.phase) * .022;

  if (p.armL && e.kind !== 'floorhead') p.armL.rotation.x = swing * .55;
  if (p.armR && e.kind !== 'floorhead') p.armR.rotation.x = -swing * .55;
  if (p.legL) p.legL.rotation.x = -swing * .48;
  if (p.legR) p.legR.rotation.x = swing * .48;

  if (e.kind === 'balloon') {
    p.balloon.position.y = 3.48 + Math.sin(t * 1.7 + e.phase) * .12;
    p.balloon.rotation.z = Math.sin(t * .8) * .08;
  }
  if (e.kind === 'wire') {
    e.group.rotation.z = (Math.sin(t * 13.1 + e.phase) + Math.sin(t * 7.4)) * (gazeLocked ? .006 : .045);
    p.shoulderLoop.rotation.z += gazeLocked ? .001 : .018;
    p.loops.forEach((loop, i) => loop.rotation.y += (gazeLocked ? .002 : .012) * (i % 2 ? 1 : -1));
  }
  if (e.kind === 'splitface') {
    const pulse = 1 + Math.sin(t * (chase ? 9 : 3.5)) * .10;
    p.inner.scale.y = .34 * pulse;
    p.split.scale.x = .15 * (1 + (chase ? .16 : .04));
  }
  if (e.kind === 'floorhead') {
    p.armL.rotation.y = Math.sin(t * 1.7) * .12;
    p.armR.rotation.y = -Math.sin(t * 1.8) * .12;
    p.head.rotation.z = Math.sin(t * .85) * .055;
  }
  if (e.kind === 'winged') {
    p.wingL.rotation.y = Math.sin(t * 4.1) * .18;
    p.wingR.rotation.y = -Math.sin(t * 4.3) * .18;
    p.core.rotation.z = .10 + Math.sin(t * 2.2) * .06;
    p.tendrils.forEach((x, i) => {
      x.rotation.x = Math.sin(t * 2.7 + i * 1.3) * .20;
      x.rotation.z = Math.sin(t * 1.8 + i) * .12;
    });
  }
  if (e.kind === 'eye') {
    p.iris.position.x = Math.sin(t * 1.4 + e.phase) * .045;
    p.eyeBall.rotation.z = Math.sin(t * .7) * .08;
    p.hand.rotation.z = Math.sin(t * 2.1) * .12;
  }
}

export function disposeEnemy(enemy) {
  enemy.group.traverse((o) => {
    if (o.userData?.ownedGeometry) o.geometry?.dispose?.();
  });
}

function mesh(geometry, material, p, s) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...p);
  m.scale.set(...s);
  return m;
}

function bent(material, origin, points, radius, G) {
  const root = new THREE.Group();
  root.position.set(...origin);
  let previous = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < points.length; i++) {
    const next = new THREE.Vector3(...points[i]);
    segment(root, previous, next, radius * (1 - i * .12), material);
    const joint = mesh(G.sphere, material, [next.x, next.y, next.z], [radius * 1.45, radius * 1.45, radius * 1.45]);
    root.add(joint);
    previous = next;
  }
  return root;
}

function segment(parent, a, b, radius, material) {
  const delta = B.copy(b).sub(a);
  const length = Math.max(.001, delta.length());
  const geometry = new THREE.CylinderGeometry(radius * .82, radius, length, 6, 1);
  const m = owned(new THREE.Mesh(geometry, material));
  m.position.copy(A.copy(a).add(b).multiplyScalar(.5));
  m.quaternion.setFromUnitVectors(UP, delta.normalize());
  parent.add(m);
  return m;
}

function owned(mesh) {
  mesh.userData.ownedGeometry = true;
  return mesh;
}
