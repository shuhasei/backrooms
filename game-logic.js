function updateMovement(dt) {
  let xAxis = 0, zAxis = 0;
  if (pressed.has('KeyW') || pressed.has('ArrowUp')) zAxis += 1;
  if (pressed.has('KeyS') || pressed.has('ArrowDown')) zAxis -= 1;
  if (pressed.has('KeyD') || pressed.has('ArrowRight')) xAxis += 1;
  if (pressed.has('KeyA') || pressed.has('ArrowLeft')) xAxis -= 1;
  moving = xAxis !== 0 || zAxis !== 0;
  sprinting = moving && (pressed.has('ShiftLeft') || pressed.has('ShiftRight'));
  if (gyro.enabled) applyGyroOrientation();
  if (!moving) {
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, EYE_HEIGHT, Math.min(1, dt * 8));
    stepTimer = Math.max(0, stepTimer - dt);
    camera.fov = THREE.MathUtils.lerp(camera.fov, 72, Math.min(1, dt * 5));
    camera.updateProjectionMatrix();
    return;
  }
  camera.getWorldDirection(tmpForward);
  tmpForward.y = 0;
  if (tmpForward.lengthSq() < .0001) tmpForward.set(0, 0, -1);
  tmpForward.normalize();
  tmpRight.crossVectors(tmpForward, worldUp).normalize();
  tmpMove.set(0, 0, 0).addScaledVector(tmpForward, zAxis).addScaledVector(tmpRight, xAxis);
  if (tmpMove.lengthSq() > 1) tmpMove.normalize();
  tmpMove.multiplyScalar((sprinting ? RUN_SPEED : WALK_SPEED) * dt);
  const colliders = getNearbyColliders(camera.position.x, camera.position.z);
  const nx = camera.position.x + tmpMove.x;
  if (!hitsAny(nx, camera.position.z, colliders, PLAYER_RADIUS)) camera.position.x = nx;
  const nz = camera.position.z + tmpMove.z;
  if (!hitsAny(camera.position.x, nz, colliders, PLAYER_RADIUS)) camera.position.z = nz;
  camera.position.y = EYE_HEIGHT + Math.sin(elapsed * (sprinting ? 12.5 : 9.2)) * (sprinting ? .046 : .028);
  camera.fov = THREE.MathUtils.lerp(camera.fov, sprinting ? 77 : 72, Math.min(1, dt * 5));
  camera.updateProjectionMatrix();
  stepTimer -= dt;
  if (stepTimer <= 0) {
    playFootstep();
    emitNoise(sprinting ? .42 : .13, sprinting ? 'running' : 'footstep');
    stepTimer = sprinting ? .31 : .46;
  }
}

function createObjectives() {
  clearObjectiveRoot();
  const theme = LEVELS[currentLevelIndex];
  objectiveState = { solved: 0, total: theme.count, expected: 0, items: [] };
  const rng = mulberry32(hash3(0x51f15e, currentLevelIndex, 7));
  for (let i = 0; i < theme.count; i++) {
    const p = findWalkablePoint(7 + i * 1.7, 19 + i * 1.4, rng);
    const item = buildObjective(theme.puzzle, i);
    item.group.position.set(p.x, 0, p.z);
    objectiveRoot.add(item.group);
    objectiveState.items.push(item);
  }
  updateObjectiveHud();
}

function buildObjective(type, index) {
  const group = new THREE.Group();
  let core;
  if (type === 'collect') {
    core = new THREE.Mesh(geo.box, materials.objective);
    core.scale.set(.34, .55, .22); core.position.y = .42;
    const handle = new THREE.Mesh(geo.torus, materials.dark);
    handle.scale.set(.28, .28, .11); handle.position.y = .78;
    group.add(core, handle);
  } else if (type === 'terminals') {
    core = new THREE.Mesh(geo.box, materials.dark);
    core.scale.set(.55, 1.05, .28); core.position.y = .58;
    const screen = new THREE.Mesh(geo.box, materials.objective);
    screen.scale.set(.38, .24, .04); screen.position.set(0, .74, -.165);
    group.add(core, screen, makeLabelSprite(String(index + 1)));
  } else {
    core = new THREE.Mesh(geo.cylinder, materials.dark);
    core.scale.set(.42, .56, .42); core.position.y = .45;
    const ring = new THREE.Mesh(geo.torus, materials.objective);
    ring.rotation.x = Math.PI / 2; ring.position.y = .82; ring.scale.set(.52, .52, .16);
    group.add(core, ring, makeLabelSprite(String(index + 1)));
  }
  return { group, core, index, solved: false, type };
}

function makeLabelSprite(text) {
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(18,16,10,.78)'; ctx.fillRect(18, 18, 60, 60);
  ctx.strokeStyle = '#e8d98e'; ctx.lineWidth = 3; ctx.strokeRect(20, 20, 56, 56);
  ctx.font = 'bold 42px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff1a9'; ctx.fillText(text, 48, 50);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat); sprite.position.set(0, 1.35, 0); sprite.scale.set(.62, .62, .62);
  sprite.userData.dispose = () => { tex.dispose(); mat.dispose(); };
  return sprite;
}

function clearObjectiveRoot() {
  for (const child of [...objectiveRoot.children]) {
    child.traverse(o => o.userData.dispose?.());
    objectiveRoot.remove(child);
  }
  if (exitPortal) { scene.remove(exitPortal); exitPortal = null; }
}

function interact() {
  if (!currentInteract) return;
  if (currentInteract.kind === 'objective') solveObjective(currentInteract.item);
  else if (currentInteract.kind === 'exit') nextLevel();
}

function solveObjective(item) {
  if (!item || item.solved || !objectiveState) return;
  const theme = LEVELS[currentLevelIndex];
  if (theme.puzzle === 'sequence' && item.index !== objectiveState.expected) {
    objectiveState.expected = 0; objectiveState.solved = 0;
    for (const it of objectiveState.items) { it.solved = false; setObjectiveSolvedVisual(it, false); }
    playErrorTone(); emitNoise(.48, 'error'); showToast('順番が違う。シーケンスがリセットされた'); updateObjectiveHud();
    return;
  }
  item.solved = true; objectiveState.solved++;
  if (theme.puzzle === 'sequence') objectiveState.expected++;
  setObjectiveSolvedVisual(item, true); playConfirmTone(); emitNoise(.34, 'puzzle');
  if (theme.puzzle === 'collect') item.group.visible = false;
  if (objectiveState.solved >= objectiveState.total) { showToast('出口信号を検出'); spawnExitPortal(); }
  else showToast(`${objectiveState.solved}/${objectiveState.total} 完了`);
  updateObjectiveHud();
}

function setObjectiveSolvedVisual(item, solved) {
  item.group.traverse(o => { if (o.isMesh && (o.material === materials.objective || o.material === materials.objectiveDone)) o.material = solved ? materials.objectiveDone : materials.objective; });
  item.group.visible = true;
}

function spawnExitPortal() {
  if (exitPortal) return;
  const p = findWalkablePoint(8, 13, mulberry32(hash3(currentLevelIndex, 0xfeed, 9)));
  const g = new THREE.Group(); g.position.set(p.x, 0, p.z);
  const top = new THREE.Mesh(geo.box, materials.portal); top.scale.set(2, .13, .14); top.position.y = 2.05;
  const left = new THREE.Mesh(geo.box, materials.portal); left.scale.set(.13, 2.05, .14); left.position.set(-.94, 1.02, 0);
  const right = left.clone(); right.position.x = .94;
  const veil = new THREE.Mesh(geo.plane, materials.portal); veil.scale.set(1.74, 1.82, 1); veil.position.y = 1.03;
  g.add(top, left, right, veil); g.userData.veil = veil; scene.add(g); exitPortal = g;
}

function updateInteraction() {
  let best = null, bestDist = INTERACT_DISTANCE;
  if (objectiveState) for (const item of objectiveState.items) {
    if (item.solved || !item.group.visible) continue;
    const d = distanceXZ(camera.position, item.group.position);
    if (d < bestDist) { bestDist = d; best = { kind: 'objective', item }; }
  }
  if (exitPortal && distanceXZ(camera.position, exitPortal.position) < bestDist + .5) best = { kind: 'exit' };
  currentInteract = best;
  interactionEl.textContent = !best ? '' : best.kind === 'exit' ? '[E] 次のレベルへ' : LEVELS[currentLevelIndex].puzzle === 'collect' ? '[E] 取得' : '[E] 起動';
}

function spawnEntities() {
  clearEntities(); resetEncounter();
  if (encounter.profile.mode === 'forced') spawnOneEntity(true);
}

function resetEncounter() {
  encounter.profile = encounterProfileFor(currentLevelIndex);
  encounter.pressure = encounter.profile.mode === 'forced' ? 1 : 0;
  encounter.dwell = encounter.noiseHeat = encounter.lightHeat = 0;
  encounter.spawnCooldown = encounter.profile.mode === 'forced' ? 0 : 4.5;
  encounter.areaAnchor.copy(camera.position); encounter.lastNoisePos.copy(camera.position);
  encounter.lastNoiseAt = -999; encounter.lastNoiseStrength = 0; encounter.levelStartedAt = elapsed;
}

function updateEncounter(dt) {
  const p = encounter.profile || encounterProfileFor(currentLevelIndex); encounter.profile = p;
  encounter.spawnCooldown = Math.max(0, encounter.spawnCooldown - dt);
  if (p.mode === 'safe') {
    encounter.pressure = encounter.dwell = encounter.noiseHeat = 0;
    if (entities.length) clearEntities();
    entityStatusEl.textContent = 'DANGER 0% · SAFE FLOOR'; threatMeter.style.transform = 'scaleX(0)'; threatStateEl.textContent = 'SAFE'; return;
  }
  if (p.mode === 'forced') {
    encounter.pressure = 1; if (!entities.length && encounter.spawnCooldown <= 0) spawnOneEntity(true);
    entityStatusEl.textContent = 'DANGER 100% · LEVEL ! · RUN'; threatMeter.style.transform = 'scaleX(1)'; threatStateEl.textContent = 'RUN'; return;
  }
  if (distanceXZ(encounter.areaAnchor, camera.position) > 10.5) {
    encounter.areaAnchor.copy(camera.position); encounter.dwell *= .28; encounter.noiseHeat *= .74;
  } else encounter.dwell += dt * (moving ? .58 : 1);
  encounter.noiseHeat *= Math.exp(-dt * .48); encounter.lightHeat *= Math.exp(-dt * .72);
  if (sprinting) encounter.noiseHeat = Math.min(1, encounter.noiseHeat + dt * .075);
  if (mic.enabled && mic.level > .028) {
    const voice = THREE.MathUtils.clamp((mic.level - .028) * 2.6, 0, 1);
    encounter.noiseHeat = Math.min(1, encounter.noiseHeat + voice * dt * 1.8);
    if (voice > .08) { encounter.lastNoisePos.copy(camera.position); encounter.lastNoiseAt = elapsed; encounter.lastNoiseStrength = Math.max(encounter.lastNoiseStrength * .96, voice); }
  }
  if (flashlightOn) encounter.lightHeat = Math.min(1, encounter.lightHeat + dt * .075);
  const dwellTerm = Math.max(0, encounter.dwell - p.grace) * p.timeRate;
  const puzzleTerm = objectiveState ? objectiveState.solved / Math.max(1, objectiveState.total) * .045 : 0;
  encounter.pressure = THREE.MathUtils.clamp(p.base + dwellTerm + encounter.noiseHeat * .54 * p.soundGain + encounter.lightHeat * .34 * p.lightGain + puzzleTerm, 0, p.max);
  threatMeter.style.transform = `scaleX(${encounter.pressure})`;
  threatStateEl.textContent = encounter.pressure >= p.spawnAt ? 'DANGER' : encounter.pressure > p.spawnAt * .62 ? 'RISING' : 'CALM';
  if (!entities.length && encounter.spawnCooldown <= 0 && encounter.pressure >= p.spawnAt) {
    spawnOneEntity(false); encounter.spawnCooldown = 14; encounter.noiseHeat *= .45;
  }
}

function emitNoise(strength, source = 'noise') { emitNoiseAt(strength, camera.position.x, camera.position.z, source); }
function emitNoiseAt(strength, x, z, source = 'noise') {
  if (!encounter.profile || encounter.profile.mode === 'safe') return;
  const s = THREE.MathUtils.clamp(strength, 0, 1);
  encounter.noiseHeat = Math.min(1, encounter.noiseHeat + s * .68);
  encounter.lastNoisePos.set(x, EYE_HEIGHT, z); encounter.lastNoiseAt = elapsed; encounter.lastNoiseStrength = s;
  if (source !== 'remote-voice' && s > .55) showToast(source === 'voice' ? '声を聞かれた' : '大きな音が響いた');
}

function spawnOneEntity(forceChase = false) {
  if (entities.length >= 2) return;
  const theme = LEVELS[currentLevelIndex], rng = mulberry32(hash3(currentLevelIndex + 77, Math.floor(elapsed * 10), entities.length + 1));
  const p = findEntitySpawnPoint(forceChase, rng), e = createEnemy(theme.entity, materials, geo), st = enemyStats(theme.entity);
  e.group.position.set(p.x, 0, p.z); e.phase = rng() * Math.PI * 2; e.wander = rng() * Math.PI * 2;
  e.chaseUntil = forceChase ? elapsed + 9999 : 0; e.investigateUntil = 0; e.spawnedAt = elapsed;
  e.speed = st.speed * (1 + currentLevelIndex * .006); e.hearing = st.hearing + currentLevelIndex * .28; e.sight = st.sight + currentLevelIndex * .10;
  entityRoot.add(e.group); entities.push(e); showToast(forceChase ? 'RUN' : '遠くで何かが動いた');
}

function findEntitySpawnPoint(forceChase, rng) {
  const colliders = getNearbyColliders(camera.position.x, camera.position.z);
  camera.getWorldDirection(tmpViewForward); tmpViewForward.y = 0; tmpViewForward.normalize();
  for (let i = 0; i < 48; i++) {
    const r = forceChase ? 7.5 + rng() * 3.5 : 13 + rng() * 9;
    const a = forceChase ? Math.atan2(tmpViewForward.z, tmpViewForward.x) + Math.PI + (rng() - .5) * .5 : rng() * Math.PI * 2;
    const x = camera.position.x + Math.cos(a) * r, z = camera.position.z + Math.sin(a) * r;
    if (hitsAny(x, z, colliders, .72)) continue;
    tmpToEntity.set(x - camera.position.x, 0, z - camera.position.z).normalize();
    if (!forceChase && tmpViewForward.dot(tmpToEntity) > .58 && !lineOccluded(camera.position.x, camera.position.z, x, z) && i < 34) continue;
    return { x, z };
  }
  return { x: camera.position.x - tmpViewForward.x * 12, z: camera.position.z - tmpViewForward.z * 12 };
}

function mesh(geometry, material, p, s) { const m = new THREE.Mesh(geometry, material); m.position.set(...p); m.scale.set(...s); return m; }

function updateEntities(dt) {
  let nearest = Infinity, chasing = 0;
  const colliders = getNearbyColliders(camera.position.x, camera.position.z), remove = [];
  for (const e of entities) {
    const pos = e.group.position, d = distanceXZ(pos, camera.position); nearest = Math.min(nearest, d);
    const occluded = lineOccluded(pos.x, pos.z, camera.position.x, camera.position.z);
    const viewed = isEntityInView(e, .74), noiseAge = elapsed - encounter.lastNoiseAt;
    const heard = noiseAge < 4.8 && distanceXZ(pos, encounter.lastNoisePos) < e.hearing * (.48 + encounter.lastNoiseStrength * 1.25);
    if (heard) { e.investigateUntil = Math.max(e.investigateUntil, elapsed + 5.5 + encounter.lastNoiseStrength * 4); if (encounter.lastNoiseStrength > .28 || d < e.hearing * .55) e.chaseUntil = Math.max(e.chaseUntil, elapsed + 4.5); }
    if (d < e.sight && !occluded && e.kind !== 'floorhead') e.chaseUntil = Math.max(e.chaseUntil, elapsed + 3.1);
    if (flashlightOn && d < e.sight * 2.2 && !occluded && ['splitface','eye','winged'].includes(e.kind)) e.chaseUntil = Math.max(e.chaseUntil, elapsed + 4.8);
    if (encounter.profile?.mode === 'forced') e.chaseUntil = elapsed + 9999;
    const gazeLocked = e.kind === 'wire' && viewed && d < 22;
    const chase = e.chaseUntil > elapsed, investigate = !chase && e.investigateUntil > elapsed; if (chase) chasing++;
    let tx, tz;
    if (chase) { tx = camera.position.x; tz = camera.position.z; }
    else if (investigate) { tx = encounter.lastNoisePos.x; tz = encounter.lastNoisePos.z; }
    else { e.wander += Math.sin(elapsed * .29 + e.phase) * dt * .18; tx = pos.x + Math.sin(e.wander) * 3; tz = pos.z + Math.cos(e.wander) * 3; }
    let dx = tx - pos.x, dz = tz - pos.z; const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    let mult = chase ? 1.24 : investigate ? .76 : .36;
    if (e.kind === 'wire') mult = gazeLocked ? .015 : (chase || d < 18 ? 1.72 : .48);
    if (e.kind === 'floorhead') mult *= .55;
    const step = e.speed * mult * dt, nx = pos.x + dx * step, nz = pos.z + dz * step;
    if (!hitsAny(nx, pos.z, colliders, e.kind === 'floorhead' ? .58 : .42)) pos.x = nx; else e.wander += 1.1;
    if (!hitsAny(pos.x, nz, colliders, e.kind === 'floorhead' ? .58 : .42)) pos.z = nz; else e.wander -= .9;
    e.group.rotation.y = Math.atan2(dx, dz) + Math.PI; animateEnemy(e, elapsed, chase, gazeLocked);
    if (d < (e.kind === 'wire' ? .92 : 1.1) && scareCooldown <= 0) triggerScare(e);
    if (elapsed - e.spawnedAt > 22 && !chase && !investigate && d > 31 && encounter.pressure < encounter.profile.spawnAt * .72) remove.push(e);
  }
  for (const e of remove) despawnEntity(e);
  if (encounter.profile?.mode === 'normal') entityStatusEl.textContent = `DANGER ${Math.round(encounter.pressure * 100)}% · dwell ${Math.round(encounter.dwell)}s · sound ${Math.round(encounter.noiseHeat * 100)} · ${chasing ? `CHASE ×${chasing}` : entities.length ? 'ENTITY ACTIVE' : 'clear'}`;
  updateThreatAudio(nearest);
}

function isEntityInView(e, threshold = .72) {
  camera.getWorldDirection(tmpViewForward); tmpToEntity.copy(e.group.position).sub(camera.position); tmpToEntity.y += 1.2;
  const d = tmpToEntity.length(); if (d > 32 || d < .001) return false; tmpToEntity.normalize();
  return tmpViewForward.dot(tmpToEntity) >= threshold && !lineOccluded(camera.position.x, camera.position.z, e.group.position.x, e.group.position.z);
}

function lineOccluded(ax, az, bx, bz) {
  for (const box of getNearbyColliders((ax + bx) * .5, (az + bz) * .5)) if (segmentIntersectsBox(ax, az, bx, bz, box)) return true;
  return false;
}

function segmentIntersectsBox(ax, az, bx, bz, box) {
  const dx = bx - ax, dz = bz - az; let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, ax-box.minX],[dx, box.maxX-ax],[-dz, az-box.minZ],[dz, box.maxZ-az]]) {
    if (Math.abs(p) < 1e-8) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t1 > .03 && t0 < .97;
}

function triggerScare(e) {
  scareCooldown = 3.2; damageEl.classList.add('hit'); setTimeout(() => damageEl.classList.remove('hit'), 520); playScareTone(); emitNoise(.78, 'panic');
  const ax = camera.position.x - e.group.position.x, az = camera.position.z - e.group.position.z, len = Math.hypot(ax, az) || 1;
  camera.position.x += ax / len * 3; camera.position.z += az / len * 3; camera.rotation.z = (Math.random() - .5) * .12; setTimeout(() => camera.rotation.z = 0, 600);
  e.chaseUntil = elapsed + 1.8; encounter.dwell = Math.max(0, encounter.dwell - 8); encounter.spawnCooldown = Math.max(encounter.spawnCooldown, 6);
}

function despawnEntity(e) { const i = entities.indexOf(e); if (i >= 0) entities.splice(i, 1); entityRoot.remove(e.group); disposeEnemy(e); encounter.spawnCooldown = Math.max(encounter.spawnCooldown, 8); }
function clearEntities() { for (const e of [...entities]) { entityRoot.remove(e.group); disposeEnemy(e); } entities.length = 0; }

function switchLevel(index, silent = false) {
  currentLevelIndex = THREE.MathUtils.clamp(index, 0, LEVELS.length - 1); levelWon = false;
  clearChunks(); clearObjectiveRoot(); clearEntities(); camera.position.set(0, EYE_HEIGHT, 0); camera.rotation.set(0, 0, 0);
  applyTheme(LEVELS[currentLevelIndex]); updateChunks(true); createObjectives(); spawnEntities(); updateObjectiveHud();
  if (!silent) showToast(`${LEVELS[currentLevelIndex].name} — ${LEVELS[currentLevelIndex].subtitle}`);
}

function nextLevel() {
  if (!exitPortal) return;
  if (currentLevelIndex >= LEVELS.length - 1) { levelWon = true; showToast('ESCAPE SIGNAL FOUND'); objectiveEl.textContent = `ESCAPED · 全${LEVELS.length}ステージ完了`; return; }
  const next = currentLevelIndex + 1; switchLevel(next); broadcastLevel(next);
}

function updateObjectiveHud() {
  const t = LEVELS[currentLevelIndex]; levelNameEl.textContent = `${t.name.toUpperCase()} · ${t.subtitle}`;
  if (!objectiveState) return;
  const action = t.puzzle === 'collect' ? 'ヒューズ回収' : t.puzzle === 'sequence' ? `順番に起動 · 次 ${objectiveState.expected + 1}` : '端末起動';
  objectiveEl.textContent = `${action} ${objectiveState.solved}/${objectiveState.total}${exitPortal ? ' · EXIT OPEN' : ''}`;
}

function animateObjectives() {
  if (!objectiveState) return;
  objectiveState.items.forEach((item,i) => { if (item.group.visible) { item.group.rotation.y += .003; item.group.position.y = Math.sin(elapsed * 2.1 + i) * .035; } });
  if (exitPortal) { exitPortal.userData.veil.rotation.z += .006; const p = 1 + Math.sin(elapsed * 4.2) * .035; exitPortal.userData.veil.scale.set(1.74*p,1.82*p,1); }
}

function findWalkablePoint(minRadius, maxRadius, rng = Math.random) {
  const colliders = getNearbyColliders(camera.position.x, camera.position.z);
  for (let i=0;i<42;i++) { const a=rng()*Math.PI*2,r=minRadius+rng()*(maxRadius-minRadius),x=camera.position.x+Math.cos(a)*r,z=camera.position.z+Math.sin(a)*r; if(!hitsAny(x,z,colliders,.65)) return {x,z}; }
  return { x: camera.position.x + minRadius, z: camera.position.z };
}

function getNearbyColliders(x,z) {
  const cx=chunkCoord(x),cz=chunkCoord(z),out=[];
  for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++){const c=chunks.get(`${cx+dx},${cz+dz}`); if(c) out.push(...c.colliders);} return out;
}
function hitsAny(x,z,colliders,radius){for(const b of colliders){const nx=THREE.MathUtils.clamp(x,b.minX,b.maxX),nz=THREE.MathUtils.clamp(z,b.minZ,b.maxZ),dx=x-nx,dz=z-nz;if(dx*dx+dz*dz<radius*radius)return true;}return false;}
function makeCollider(cx,cz,x,z,w,d){const wx=cx*CHUNK_SIZE+x,wz=cz*CHUNK_SIZE+z;return{minX:wx-w/2,maxX:wx+w/2,minZ:wz-d/2,maxZ:wz+d/2};}
function isStartClear(cx,cz,x,z){return cx===0&&cz===0&&Math.hypot(x,z)<5.8;}
function chunkCoord(v){return Math.floor((v+CHUNK_SIZE/2)/CHUNK_SIZE);}
function roomHeight(t){return t.floorMode==='pool'?2.95:t.name==='Level 11'?3.15:2.68;}
