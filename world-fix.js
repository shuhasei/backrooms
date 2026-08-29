// Ensures the initial camera always starts inside a recognisable room instead of
// occasionally facing an unusually open procedural patch.
const _generateChunkBase = generateChunk;
generateChunk = function patchedGenerateChunk(cx, cz) {
  const chunk = _generateChunkBase(cx, cz);
  if (cx !== 0 || cz !== 0) return chunk;

  const theme = LEVELS[currentLevelIndex];
  const height = roomHeight(theme);
  const addWall = (x, z, sx, sz) => {
    const wall = new THREE.Mesh(geo.box, materials.wall);
    wall.position.set(x, height / 2, z);
    wall.scale.set(sx, height, sz);
    chunk.group.add(wall);

    const trim = new THREE.Mesh(geo.box, materials.trim);
    trim.position.set(x, .045, z);
    trim.scale.set(sx + .04, .09, sz + .04);
    chunk.group.add(trim);
    chunk.colliders.push(makeCollider(cx, cz, x, z, sx, sz));
  };

  // Front partition: two wide wallpaper panels with a clear doorway in the middle.
  addWall(-3.65, -8.0, 5.2, .16);
  addWall( 3.65, -8.0, 5.2, .16);

  // Offset side partitions create the characteristic Backrooms layered depth.
  addWall(-7.4, -2.7, .16, 5.0);
  addWall( 7.2,  3.2, .16, 5.4);
  addWall(-4.7,  7.1, 4.8, .16);

  // Two chunky columns visible from spawn.
  const addColumn = (x, z) => {
    const c = new THREE.Mesh(geo.box, materials.wall);
    c.position.set(x, height / 2, z);
    c.scale.set(.92, height, .92);
    chunk.group.add(c);
    chunk.colliders.push(makeCollider(cx, cz, x, z, .92, .92));
  };
  addColumn(-4.8, -3.8);
  addColumn( 4.9,  4.0);

  return chunk;
};
