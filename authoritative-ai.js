// Host-authoritative enemy simulation for co-op.
// Host/solo: runs AI + path finding. Client: only interpolates host snapshots.

var AI_SYNC_HZ = 12;
var AI_NAV_STEP = 1.0;
var AI_MAX_PATH_NODES = 1200;
var aiLastEnemySync = 0;
var aiNextEntityId = 1;
var aiClientSnapshot = { pressure: 0, dwell: 0, noise: 0, lastAt: -999 };

var aiBaseUpdateEncounter = updateEncounter;
var aiBaseSpawnEntities = spawnEntities;
var aiBaseUpdateNetworking = updateNetworking;
var aiBaseHandleNetworkData = handleNetworkData;
var aiBaseUpdateRemoteState = updateRemoteState;

function aiIsAuthority() {
  return net.mode !== 'client';
}

function aiPlayers() {
  var out = [{
    id: net.id || 'local',
    local: true,
    pos: camera.position,
    yaw: camera.rotation.y,
    mic: mic.level || 0,
    light: flashlightOn,
    running: sprinting,
  }];
  if (net.mode === 'host') {
    for (var entry of remotePlayers) {
      var id = entry[0], rp = entry[1];
      out.push({
        id: id,
        local: false,
        pos: rp.target || rp.group.position,
        yaw: Number.isFinite(rp.targetYaw) ? rp.targetYaw : rp.group.rotation.y,
        mic: rp.mic || 0,
        light: !!rp.light,
        running: !!rp.running,
      });
    }
  }
  return out;
}

function aiPlayerById(id, players) {
  for (var i = 0; i < players.length; i++) if (players[i].id === id) return players[i];
  return null;
}

function aiNearestPlayer(pos, players) {
  var best = players[0], bestD = Infinity;
  for (var i = 0; i < players.length; i++) {
    var d = distanceXZ(pos, players[i].pos);
    if (d < bestD) { bestD = d; best = players[i]; }
  }
  return { player: best, distance: bestD };
}

function aiPlayerSeesEntity(player, enemy, threshold) {
  var dx = enemy.group.position.x - player.pos.x;
  var dz = enemy.group.position.z - player.pos.z;
  var d = Math.hypot(dx, dz);
  if (d < .001 || d > 30) return false;
  dx /= d; dz /= d;
  var fx = -Math.sin(player.yaw || 0);
  var fz = -Math.cos(player.yaw || 0);
  if (fx * dx + fz * dz < (threshold || .72)) return false;
  return !lineOccluded(player.pos.x, player.pos.z, enemy.group.position.x, enemy.group.position.z);
}

function aiEnsureEnemyMeta(e) {
  if (!e.netId) e.netId = `e${currentLevelIndex}-${aiNextEntityId++}`;
  if (!e.aiState) e.aiState = 'PATROL';
  if (!e.path) e.path = [];
  if (!e.hitCooldowns) e.hitCooldowns = Object.create(null);
  if (!Number.isFinite(e.nextPathAt)) e.nextPathAt = 0;
  if (!e.patrolPoint) e.patrolPoint = new THREE.Vector3(e.group.position.x, 0, e.group.position.z);
  return e;
}

function aiUpdateAuthorityEntities(dt) {
  var nearest = Infinity;
  var chasing = 0;
  var players = aiPlayers();
  var remove = [];

  for (var ei = 0; ei < entities.length; ei++) {
    var e = aiEnsureEnemyMeta(entities[ei]);
    var pos = e.group.position;
    var nearestInfo = aiNearestPlayer(pos, players);
    nearest = Math.min(nearest, nearestInfo.distance);

    var noiseAge = elapsed - encounter.lastNoiseAt;
    var heard = noiseAge < 5.2 && distanceXZ(pos, encounter.lastNoisePos) < e.hearing * (.46 + encounter.lastNoiseStrength * 1.30);
    var visibleTarget = null;
    var visibleDistance = Infinity;
    var lightTarget = null;
    var lightDistance = Infinity;

    for (var pi = 0; pi < players.length; pi++) {
      var p = players[pi];
      var d = distanceXZ(pos, p.pos);
      var occluded = lineOccluded(pos.x, pos.z, p.pos.x, p.pos.z);
      if (d < e.sight && !occluded && e.kind !== 'floorhead' && d < visibleDistance) {
        visibleTarget = p; visibleDistance = d;
      }
      if (p.light && ['splitface','eye','winged'].includes(e.kind) && d < e.sight * 2.2 && !occluded && d < lightDistance) {
        lightTarget = p; lightDistance = d;
      }
    }

    if (visibleTarget) {
      e.targetPlayerId = visibleTarget.id;
      e.chaseUntil = Math.max(e.chaseUntil || 0, elapsed + 3.4);
    } else if (lightTarget) {
      e.targetPlayerId = lightTarget.id;
      e.chaseUntil = Math.max(e.chaseUntil || 0, elapsed + 4.8);
    }

    if (heard) {
      e.investigateUntil = Math.max(e.investigateUntil || 0, elapsed + 5.5 + encounter.lastNoiseStrength * 4);
      if (encounter.lastNoiseStrength > .34 || nearestInfo.distance < e.hearing * .48) {
        e.chaseUntil = Math.max(e.chaseUntil || 0, elapsed + 4.2);
        if (!e.targetPlayerId) e.targetPlayerId = nearestInfo.player.id;
      }
    }

    if (encounter.profile?.mode === 'forced') {
      e.chaseUntil = elapsed + 9999;
      e.targetPlayerId = nearestInfo.player.id;
    }

    var gazeLocked = false;
    if (e.kind === 'wire') {
      for (var gi = 0; gi < players.length; gi++) {
        if (aiPlayerSeesEntity(players[gi], e, .70)) { gazeLocked = true; break; }
      }
    }

    var chase = (e.chaseUntil || 0) > elapsed;
    var investigate = !chase && (e.investigateUntil || 0) > elapsed;
    if (chase) chasing++;

    var target = new THREE.Vector3();
    if (chase) {
      var targetPlayer = aiPlayerById(e.targetPlayerId, players) || nearestInfo.player;
      target.copy(targetPlayer.pos);
      e.targetPlayerId = targetPlayer.id;
      e.aiState = 'CHASE';
    } else if (investigate) {
      target.copy(encounter.lastNoisePos);
      e.aiState = 'ALERT';
    } else {
      e.aiState = 'PATROL';
      if (!e.patrolPoint || distanceXZ(pos, e.patrolPoint) < 1.1 || elapsed > (e.nextPatrolAt || 0)) {
        var a = (e.wander || 0) + Math.sin(elapsed * .41 + (e.phase || 0)) * 1.5;
        e.patrolPoint = new THREE.Vector3(pos.x + Math.sin(a) * 6.5, 0, pos.z + Math.cos(a) * 6.5);
        e.nextPatrolAt = elapsed + 3.5 + ((e.phase || 0) % 2.4);
      }
      target.copy(e.patrolPoint);
    }

    var dir = aiNavigationDirection(e, target, chase ? .48 : investigate ? .82 : 1.35);
    var dx = dir.x, dz = dir.z;
    var mult = chase ? 1.24 : investigate ? .76 : .36;
    if (e.kind === 'wire') mult = gazeLocked ? .012 : (chase || nearestInfo.distance < 18 ? 1.72 : .48);
    if (e.kind === 'floorhead') mult *= .55;
    var step = e.speed * mult * dt;
    var colliders = getNearbyColliders(pos.x, pos.z);
    var radius = e.kind === 'floorhead' ? .58 : .42;
    var nx = pos.x + dx * step;
    var nz = pos.z + dz * step;
    if (!gazeLocked) {
      if (!hitsAny(nx, pos.z, colliders, radius)) pos.x = nx;
      else { e.path = []; e.nextPathAt = 0; e.wander = (e.wander || 0) + 1.1; }
      if (!hitsAny(pos.x, nz, colliders, radius)) pos.z = nz;
      else { e.path = []; e.nextPathAt = 0; e.wander = (e.wander || 0) - .9; }
    }

    if (Math.abs(dx) + Math.abs(dz) > .001) e.group.rotation.y = Math.atan2(dx, dz) + Math.PI;
    animateEnemy(e, elapsed, chase, gazeLocked);

    for (var ci = 0; ci < players.length; ci++) {
      var victim = players[ci];
      var hitDistance = e.kind === 'wire' ? .92 : 1.1;
      if (distanceXZ(pos, victim.pos) >= hitDistance) continue;
      if (victim.local) {
        if (scareCooldown <= 0) triggerScare(e);
      } else if ((e.hitCooldowns[victim.id] || 0) <= elapsed) {
        e.hitCooldowns[victim.id] = elapsed + 3.0;
        aiSendHit(victim.id, e);
      }
    }

    if (elapsed - e.spawnedAt > 24 && !chase && !investigate && nearestInfo.distance > 33 && encounter.pressure < encounter.profile.spawnAt * .70) remove.push(e);
  }

  for (var ri = 0; ri < remove.length; ri++) despawnEntity(remove[ri]);
  if (encounter.profile?.mode === 'normal') {
    entityStatusEl.textContent = `DANGER ${Math.round(encounter.pressure * 100)}% · ${chasing ? `CHASE ×${chasing}` : entities.length ? 'ENTITY ACTIVE' : 'clear'} · HOST AI`;
  }
  updateThreatAudio(nearest);
}

function aiNavigationDirection(e, target, repathInterval) {
  var pos = e.group.position;
  var needPath = elapsed >= (e.nextPathAt || 0) || !e.path?.length || !e.pathGoal || distanceXZ(e.pathGoal, target) > 1.8;
  if (needPath) {
    e.path = aiFindPath(pos, target, e.kind === 'floorhead' ? .62 : .46);
    e.pathGoal = target.clone();
    e.nextPathAt = elapsed + repathInterval;
  }

  while (e.path && e.path.length && distanceXZ(pos, e.path[0]) < .48) e.path.shift();
  var waypoint = e.path && e.path.length ? e.path[0] : target;
  var dx = waypoint.x - pos.x, dz = waypoint.z - pos.z;
  var len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

function aiFindPath(start, goal, radius) {
  if (!lineOccluded(start.x, start.z, goal.x, goal.z)) return [new THREE.Vector3(goal.x, 0, goal.z)];

  var step = AI_NAV_STEP;
  var sx = Math.round(start.x / step), sz = Math.round(start.z / step);
  var gx = Math.round(goal.x / step), gz = Math.round(goal.z / step);
  var midX = (start.x + goal.x) * .5, midZ = (start.z + goal.z) * .5;
  var colliders = getNearbyColliders(midX, midZ);
  var open = [];
  var openMap = new Map();
  var closed = new Set();
  var startNode = { x: sx, z: sz, g: 0, h: aiHeuristic(sx, sz, gx, gz), f: 0, parent: null };
  startNode.f = startNode.h;
  open.push(startNode); openMap.set(`${sx},${sz}`, startNode);
  var dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  var iterations = 0;

  while (open.length && iterations++ < AI_MAX_PATH_NODES) {
    var bestIndex = 0;
    for (var i = 1; i < open.length; i++) if (open[i].f < open[bestIndex].f) bestIndex = i;
    var current = open.splice(bestIndex, 1)[0];
    openMap.delete(`${current.x},${current.z}`);
    var ck = `${current.x},${current.z}`;
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (Math.abs(current.x - gx) <= 1 && Math.abs(current.z - gz) <= 1) return aiReconstructPath(current, step, goal);

    for (var di = 0; di < dirs.length; di++) {
      var ox = dirs[di][0], oz = dirs[di][1];
      var nx = current.x + ox, nz = current.z + oz;
      var key = `${nx},${nz}`;
      if (closed.has(key)) continue;
      var wx = nx * step, wz = nz * step;
      if (Math.hypot(wx - start.x, wz - start.z) > 34) continue;
      if (hitsAny(wx, wz, colliders, radius)) continue;
      if (ox && oz) {
        if (hitsAny((current.x + ox) * step, current.z * step, colliders, radius) || hitsAny(current.x * step, (current.z + oz) * step, colliders, radius)) continue;
      }
      var ng = current.g + (ox && oz ? 1.4142 : 1);
      var existing = openMap.get(key);
      if (existing && ng >= existing.g) continue;
      var node = existing || { x: nx, z: nz, g: ng, h: aiHeuristic(nx, nz, gx, gz), f: 0, parent: current };
      node.g = ng; node.parent = current; node.f = node.g + node.h;
      if (!existing) { open.push(node); openMap.set(key, node); }
    }
  }
  return [new THREE.Vector3(goal.x, 0, goal.z)];
}

function aiHeuristic(x, z, gx, gz) {
  var dx = Math.abs(gx - x), dz = Math.abs(gz - z);
  return Math.max(dx, dz) + .4142 * Math.min(dx, dz);
}

function aiReconstructPath(node, step, exactGoal) {
  var rev = [];
  var n = node;
  while (n && rev.length < 80) {
    rev.push(new THREE.Vector3(n.x * step, 0, n.z * step));
    n = n.parent;
  }
  rev.reverse();
  if (rev.length > 1) rev.shift();
  var simplified = [];
  for (var i = 0; i < rev.length; i += 2) simplified.push(rev[i]);
  simplified.push(new THREE.Vector3(exactGoal.x, 0, exactGoal.z));
  return simplified;
}

function aiSendHit(peerId, enemy) {
  if (net.mode !== 'host') return;
  var conn = net.conns.get(peerId);
  if (!conn?.open) return;
  try {
    conn.send({ type: 'enemy_hit', id: enemy.netId, x: round2(enemy.group.position.x), z: round2(enemy.group.position.z) });
  } catch (_) {}
}

function aiSendEnemySnapshot() {
  if (net.mode !== 'host' || elapsed - aiLastEnemySync < 1 / AI_SYNC_HZ) return;
  aiLastEnemySync = elapsed;
  var list = [];
  for (var i = 0; i < entities.length; i++) {
    var e = aiEnsureEnemyMeta(entities[i]);
    list.push({
      id: e.netId,
      kind: e.kind,
      x: round2(e.group.position.x),
      z: round2(e.group.position.z),
      r: round2(e.group.rotation.y),
      s: e.aiState || 'PATROL',
    });
  }
  broadcast({
    type: 'enemy_sync',
    level: currentLevelIndex,
    t: Math.round(elapsed * 1000),
    pressure: round2(encounter.pressure || 0),
    dwell: Math.round(encounter.dwell || 0),
    noise: round2(encounter.noiseHeat || 0),
    entities: list,
  });
}

function aiApplyEnemySnapshot(data) {
  if (net.mode !== 'client' || data.level !== currentLevelIndex || !Array.isArray(data.entities)) return;
  aiClientSnapshot.pressure = Number(data.pressure) || 0;
  aiClientSnapshot.dwell = Number(data.dwell) || 0;
  aiClientSnapshot.noise = Number(data.noise) || 0;
  aiClientSnapshot.lastAt = elapsed;

  var seen = new Set();
  for (var i = 0; i < data.entities.length; i++) {
    var item = data.entities[i];
    if (!item || !item.id || !item.kind) continue;
    seen.add(item.id);
    var e = null;
    for (var j = 0; j < entities.length; j++) if (entities[j].netId === item.id) { e = entities[j]; break; }
    if (!e) {
      e = createEnemy(item.kind, materials, geo);
      e.netId = item.id;
      e.remoteControlled = true;
      e.phase = (aiHashString(item.id) % 628) / 100;
      e.group.position.set(Number(item.x) || 0, 0, Number(item.z) || 0);
      e.targetPos = e.group.position.clone();
      e.targetYaw = Number(item.r) || 0;
      e.aiState = item.s || 'PATROL';
      entityRoot.add(e.group);
      entities.push(e);
    }
    if (!e.targetPos) e.targetPos = e.group.position.clone();
    e.targetPos.set(Number(item.x) || 0, 0, Number(item.z) || 0);
    e.targetYaw = Number(item.r) || 0;
    e.aiState = item.s || 'PATROL';
    e.lastSyncAt = elapsed;
  }

  for (var k = entities.length - 1; k >= 0; k--) {
    var old = entities[k];
    if (old.remoteControlled && !seen.has(old.netId)) despawnEntity(old);
  }
}

function aiUpdateClientEntities(dt) {
  var nearest = Infinity;
  var alpha = 1 - Math.exp(-dt * 13);
  for (var i = 0; i < entities.length; i++) {
    var e = entities[i];
    if (!e.remoteControlled || !e.targetPos) continue;
    e.group.position.lerp(e.targetPos, alpha);
    e.group.rotation.y = lerpAngle(e.group.rotation.y, e.targetYaw || 0, Math.min(1, dt * 11));
    var d = distanceXZ(e.group.position, camera.position);
    nearest = Math.min(nearest, d);
    var gazeLocked = e.kind === 'wire' && isEntityInView(e, .70);
    animateEnemy(e, elapsed, e.aiState === 'CHASE', gazeLocked);
  }
  updateThreatAudio(nearest);
  var age = elapsed - aiClientSnapshot.lastAt;
  entityStatusEl.textContent = age > 3 ? 'HOST AI · SYNC WAIT...' : `HOST AI · ${entities.length ? `${entities.length} ENTITY` : 'clear'} · ${Math.round(aiClientSnapshot.pressure * 100)}%`;
}

function aiClientEncounterHud() {
  var pressure = THREE.MathUtils.clamp(aiClientSnapshot.pressure || 0, 0, 1);
  encounter.pressure = pressure;
  threatMeter.style.transform = `scaleX(${pressure})`;
  threatStateEl.textContent = elapsed - aiClientSnapshot.lastAt > 3 ? 'SYNC' : pressure > .72 ? 'DANGER' : pressure > .42 ? 'RISING' : 'CALM';
}

function aiRemoteHit(data) {
  damageEl.classList.add('hit');
  setTimeout(() => damageEl.classList.remove('hit'), 520);
  playScareTone();
  var dx = camera.position.x - (Number(data.x) || camera.position.x - 1);
  var dz = camera.position.z - (Number(data.z) || camera.position.z - 1);
  var len = Math.hypot(dx, dz) || 1;
  camera.position.x += dx / len * 2.4;
  camera.position.z += dz / len * 2.4;
  camera.rotation.z = (Math.random() - .5) * .12;
  setTimeout(() => camera.rotation.z = 0, 600);
  showToast('ENTITY CONTACT');
}

function aiHashString(value) {
  var h = 2166136261 >>> 0;
  for (var i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---- wrappers ----

updateEncounter = function(dt) {
  if (net.mode === 'client') { aiClientEncounterHud(); return; }
  aiBaseUpdateEncounter(dt);
};

spawnEntities = function() {
  if (net.mode === 'client') {
    clearEntities();
    resetEncounter();
    aiClientSnapshot.pressure = 0;
    aiClientSnapshot.lastAt = -999;
    return;
  }
  aiBaseSpawnEntities();
};

updateEntities = function(dt) {
  if (net.mode === 'client') aiUpdateClientEntities(dt);
  else aiUpdateAuthorityEntities(dt);
};

updateRemoteState = function(id, data) {
  var before = remotePlayers.get(id);
  var px = before?.target?.x;
  var pz = before?.target?.z;
  var last = before?._aiStateAt || elapsed;
  aiBaseUpdateRemoteState(id, data);
  var rp = remotePlayers.get(id);
  if (!rp) return;
  rp.light = !!data.light;
  var dt = Math.max(.03, elapsed - last);
  if (Number.isFinite(px) && Number.isFinite(pz)) {
    var speed = Math.hypot(rp.target.x - px, rp.target.z - pz) / dt;
    rp.running = speed > 4.15;
    if (rp.running && elapsed - (rp._lastRunNoise || 0) > .34) {
      rp._lastRunNoise = elapsed;
      if (aiIsAuthority()) emitNoiseAt(.36, rp.target.x, rp.target.z, 'remote-running');
    }
  }
  rp._aiStateAt = elapsed;
};

handleNetworkData = function(data, conn) {
  if (data?.type === 'enemy_sync') { aiApplyEnemySnapshot(data); return; }
  if (data?.type === 'enemy_hit') { if (net.mode === 'client') aiRemoteHit(data); return; }
  aiBaseHandleNetworkData(data, conn);
};

updateNetworking = function() {
  aiBaseUpdateNetworking();
  aiSendEnemySnapshot();
};
