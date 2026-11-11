import * as THREE from '/vendor/three.module.js';

// Each station gives the turn within one sector, the inner and outer edge radii,
// and the height of the crown. The two independently curved edges form the die.
const blades = [
  {
    count: 3, face: 'gunmetal', bevel: 'steel', bridge: 'enamel', stripe: 'enamel',
    rim: [
      [-.07, .405, .438, .013], [.03, .344, .489, .042], [.21, .299, .526, .060],
      [.41, .337, .533, .040], [.62, .375, .507, .026], [.78, .388, .490, .033],
      [.91, .435, .519, .064], [1.015, .500, .525, .078]
    ],
    spoke: [
      [-.14, .167, .207, .079], [-.03, .171, .275, .061], [.11, .214, .319, .026],
      [.23, .283, .353, .020], [.30, .325, .342, .033]
    ],
    ridge: .57
  },
  {
    count: 6, face: 'steel', bevel: 'steel', bridge: 'steel', stripe: 'enamel',
    rim: [
      [-.07, .384, .426, .020], [.06, .331, .504, .056], [.15, .311, .531, .068],
      [.41, .328, .532, .066], [.62, .363, .512, .037], [.71, .407, .484, .013],
      [.88, .401, .469, .025], [1.02, .410, .438, .045]
    ],
    spoke: [
      [-.27, .168, .214, .079], [-.14, .181, .275, .079], [-.04, .211, .333, .046],
      [.11, .271, .375, .022], [.21, .340, .367, .031]
    ],
    ridge: .66
  },
  {
    count: 3, face: 'enamel', bevel: 'steel', bridge: 'gunmetal', stripe: 'light',
    rim: [
      [-.14, .388, .404, .030], [-.04, .325, .422, .059], [.12, .298, .480, .050],
      [.35, .314, .518, .044], [.57, .349, .531, .039], [.68, .372, .507, .044],
      [.65, .424, .493, .059], [.85, .447, .521, .072], [1.055, .491, .505, .080]
    ],
    spoke: [
      [-.12, .168, .204, .086], [.01, .171, .260, .063], [.17, .205, .298, .036],
      [.32, .253, .349, .026], [.44, .307, .346, .039]
    ],
    ridge: .51
  }
];

function rails(stations, rotation, sector) {
  const edge = column => new THREE.CatmullRomCurve3(stations.map(station => {
    const angle = rotation + sector * station[0];
    return new THREE.Vector3(Math.cos(angle) * station[column], station[3], -Math.sin(angle) * station[column]);
  }));
  return [edge(1), edge(2)];
}

function across(edges, t, u, height) {
  const point = edges[0].getPoint(t).lerp(edges[1].getPoint(t), u);
  // The die thins out at each runout, so a hooked tip ends in a bevel.
  point.y += height * (.32 + .68 * Math.min(1, 8 * Math.min(t, 1 - t)));
  return point;
}

// A strip shares its vertices along the curve, while a cast ridge keeps a crisp
// change of normal across it. All strips using one finish go into one draw call.
function strip(batch, samples, row) {
  let start = batch.positions.length / 3;
  for (let i = 0; i <= samples; i++) {
    for (const p of row(i / samples)) batch.positions.push(p.x, p.y, p.z);
    if (i === samples) break;
    batch.indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
    start += 2;
  }
}

function loft(batches, edges, profile, steps) {
  for (let n = 0; n < profile.length; n++) {
    const [u, y, finish] = profile[n];
    const [v, z] = profile[(n + 1) % profile.length];
    strip(batches[finish], steps, t => [across(edges, t, u, y), across(edges, t, v, z)]);
  }
  const cap = batches[profile[profile.length - 1][2]];
  for (const t of [0, 1]) {
    const start = cap.positions.length / 3;
    for (const [u, y] of profile) {
      const p = across(edges, t, u, y);
      cap.positions.push(p.x, p.y, p.z);
    }
    for (let i = 1; i + 1 < profile.length; i++) {
      cap.indices.push(start, start + i + (1 - t), start + i + t);
    }
  }
}

function crownProfile(ridge, face, bevel, underside) {
  return [
    [0, -.038, underside], [.012, -.026, face], [.050, -.016, face],
    [ridge-.10, .022, face], [ridge-.04, .026, face], [ridge+.02, .027, face],
    [ridge+.09, .023, face], [.85, .007, bevel], [.976, -.010, bevel],
    [1, -.019, bevel], [.985, -.040, underside], [.87, -.052, underside], [.07, -.056, underside]
  ];
}

function crownHeight(t, u, ridge) {
  const peak = ridge + .07 * Math.sin(2 * Math.PI * (t - .12));
  const flank = u < peak ? u / peak : (1 - u) / (1 - peak);
  const camber = -.018 + .053 * Math.sin(flank * Math.PI / 2);
  // A tapered die groove changes width and bends back towards the tip.
  const depth = .010 * Math.sin(Math.PI * THREE.MathUtils.smoothstep(t, .08, .86));
  const distance = (u - (.74 + .064 * Math.sin(2 * Math.PI * t))) / .054;
  const edge = .009 * Math.exp(-36 * u) + .007 * Math.exp(-37 * (1 - u));
  return camber - depth * Math.exp(-distance * distance) - edge;
}

function castRim(batches, edges, design) {
  const steps = 40, ridge = design.ridge;
  // A shared lattice carries smooth normals over the pillowed crown and down
  // into the die groove. Keep a material break at the machined outer land.
  for (const [start, end, columns, finish] of [[0,.885,22,design.face], [.885,1,4,design.bevel]]) {
    const batch = batches[finish];
    const first = batch.positions.length / 3;
    for (let row = 0; row <= steps; row++) {
      const t = row / steps;
      for (let column = 0; column <= columns; column++) {
        const u = THREE.MathUtils.lerp(start, end, column / columns);
        const p = across(edges, t, u, crownHeight(t, u, ridge));
        batch.positions.push(p.x, p.y, p.z);
        if (row === steps || column === columns) continue;
        const a = first + row * (columns + 1) + column, b = a + columns + 1;
        batch.indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  // At the heel the cast wall reaches into the shoe. Near the hooked tip it
  // rolls in, exposing the tinted carrier and the undercut.
  const walls = Array.from({length: steps+1}, (_, row) => {
    const t = row/steps;
    const heel = THREE.MathUtils.smoothstep(t,.04,.22) * (1 - THREE.MathUtils.smoothstep(t,.50,.76));
    return [
      [1, crownHeight(t, 1, ridge)], [1.002,-.033], [.983,-.042 - .028*heel],
      [.93,-.052 - .031*heel], [.68,-.061 - .027*heel], [.07,-.062 - .026*heel],
      [0,-.050], [0,crownHeight(t, 0, ridge)]
    ];
  });
  const side = (t,j) => across(edges, t, ...walls[Math.round(t*steps)][j]);
  const finishes = [design.bevel, design.bevel, 'gunmetal', 'gunmetal', 'gunmetal', 'gunmetal', design.face];
  finishes.forEach((finish, j) => strip(batches[finish], steps, t => [side(t, j), side(t, j+1)]));
  const cap = batches[design.face];
  for (const t of [0,1]) {
    const start = cap.positions.length / 3;
    const outline = Array.from({length: 17}, (_, j) => [j/16,crownHeight(t,j/16,ridge)])
      .concat(walls[t*steps].slice(1,-1));
    for (const [u,h] of outline) {
      const p = across(edges,t,u,h);
      cap.positions.push(p.x,p.y,p.z);
    }
    for (const [a,b,c] of THREE.ShapeUtils.triangulateShape(outline.map(([u,h]) => new THREE.Vector2(u,h)), [])) {
      cap.indices.push(start+a, start+(t ? c : b), start+(t ? b : c));
    }
  }
}

// Inlays follow the sloping crown. Each entry is [t along rail, inner u, outer u].
function inlay(batch, edges, ridge, stations) {
  for (let i = 1; i < stations.length; i++) {
    const [t0, left0, right0] = stations[i - 1], [t1, left1, right1] = stations[i];
    // Subdivide even the widest end so the enamel conforms to the curved die.
    for (let k = 0; k < 3; k++) {
      strip(batch, Math.max(2, Math.ceil((t1 - t0) * 36)), fraction => {
        const t = THREE.MathUtils.lerp(t0, t1, fraction);
        const left = THREE.MathUtils.lerp(left0, left1, fraction);
        const right = THREE.MathUtils.lerp(right0, right1, fraction);
        return [k/3, (k+1)/3].map(f => {
          const u = THREE.MathUtils.lerp(left, right, f);
          return across(edges, t, u, crownHeight(t,u,ridge) + .001);
        });
      });
    }
  }
}

export function buildBlade(index, palette) {
  const design = blades[index] || blades[0];
  const group = new THREE.Group();
  const batches = Object.fromEntries(['steel', 'gunmetal', 'resin', 'enamel', 'light', 'ink']
    .map(key => [key, { positions: [], indices: [] }]));
  const sector = Math.PI * 2 / design.count;

  for (let i = 0; i < design.count; i++) {
    const turn = sector * i;
    // The translucent lower rail crosses each gap below the metal casting.
    const carrier = rails([
      [-.24, .227, .267, -.037], [-.03, .248, .393, -.020],
      [.23, .308, .478, -.012], [.55, .350, .471, -.031],
      [.72, .358, .459, -.043], [.94, .315, .410, -.040], [1.08, .302, .345, -.038]
    ], turn, sector);
    loft(batches, carrier, [
      [0, -.013, 'resin'], [.07, .006, 'resin'], [.69, .014, 'resin'],
      [.95, .002, 'resin'], [1, -.016, 'resin'], [.93, -.031, 'resin'], [.08, -.034, 'resin']
    ], 18);

    const lock = rails([
      [-.22, .171, .236, .048], [-.08, .178, .281, .055],
      [.10, .180, .293, .037], [.33, .186, .262, .023],
      [.60, .184, .253, .021], [.76, .172, .228, .040]
    ], turn, sector);
    loft(batches, lock, crownProfile(.34, 'enamel', 'resin', 'ink'), 18);

    const spoke = rails(design.spoke, turn, sector);
    loft(batches, spoke, crownProfile(.48, design.bridge, 'gunmetal', 'ink'), 16);
    const rim = rails(design.rim, turn, sector);
    castRim(batches, rim, design);

    // A raised inner tine sweeps out of each contact shoe. Its pointed end
    // leaves a curved vent between the inner casting and the core.
    const tine = rails([
      [.23, .285, .293, .010], [.40, .275, .319, .026], [.57, .294, .360, .041],
      [.72, .324, .408, .044], [.85, .368, .460, .042], [.94, .419, .475, .048]
    ], turn + (index === 1 ? -.12 : 0), sector);
    const tineFace = index === 2 ? 'steel' : design.face;
    loft(batches, tine, crownProfile(.53, tineFace, design.bevel, 'gunmetal'), 20);

    // The underside casting carries a separate, exposed impact shoe at each heel.
    const shoe = rails([
      [.03, .382, .463, -.022], [.18, .347, .502, -.004], [.34, .365, .530, -.008],
      [.52, .415, .528, -.016], [.65, .431, .505, -.024], [.76, .453, .476, -.029]
    ], turn + (index === 2 ? .10 : 0), sector);
    loft(batches, shoe, [
      [0, -.020, 'gunmetal'], [.30, .016, 'steel'], [.86, .020, 'steel'],
      [1, .002, 'steel'], [.98, -.017, 'gunmetal'], [.86, -.032, 'gunmetal']
    ], 18);

    const r = design.ridge;
    if (index === 1) {
      inlay(batches.enamel, rim, r, [[.12,.17,.17], [.23,.14,.42], [.40,.13,.42], [.64,.45,.45]]);
      for (const t of [.43,.49,.55]) {
        inlay(batches.gunmetal, rim, r, [[t,.09,.11], [t+.035,.32,.34]]);
      }
    } else {
      inlay(batches[design.stripe], rim, r, [
        [.11,.16,.16], [.30,.12,.39], [.49,.20,.43], [.70,.36,.36]
      ]);
      inlay(batches[index === 2 ? 'steel' : 'enamel'], rim, r, [
        [.62,.13,.13], [.71,.15,.27], [.90,.35,.35]
      ]);
    }
  }

  for (const [finish, batch] of Object.entries(batches)) {
    if (!batch.positions.length) continue;
    // Preserve the endurance ring silhouette while reusing the detailed inner casting.
    if (index === 2) for (let v=0;v<batch.positions.length;v+=3) {
      const r=Math.hypot(batch.positions[v],batch.positions[v+2]);
      if(r>.36){batch.positions[v]*=.36/r;batch.positions[v+2]*=.36/r;}
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
    const uvs = [];
    for (let v = 0; v < batch.positions.length; v += 3) {
      const x = batch.positions[v], y = batch.positions[v+1], z = batch.positions[v+2];
      uvs.push(x*2.4 + y*.6, z*2.4 + y*1.3);
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(batch.indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, palette[finish]);
    mesh.castShadow = true;
    group.add(mesh);
  }

  const socket = new THREE.LatheGeometry([
    [0,-.033], [.082,-.033], [.084,-.114], [.089,-.122], [.107,-.122],
    [.116,-.112], [.118,-.059], [.141,-.046], [.167,-.042], [.198,-.023], [.212,.035], [.210,.045],
    [.198,.049], [.195,.066], [.195,.074], [.204,.080], [.205,.086],
    [.192,.105], [.179,.119], [0,.119]
  ].map(([r, y]) => new THREE.Vector2(r, y)), 72);
  const seat = socket.attributes.position;
  for (let j = 0; j < seat.count; j++) {
    const x = seat.getX(j), y = seat.getY(j), z = seat.getZ(j), radius = Math.hypot(x,z);
    if (!radius) continue;
    const shoulder = THREE.MathUtils.smoothstep(y,.025,.068) * (1 - THREE.MathUtils.smoothstep(y,.091,.119));
    const lobe = THREE.MathUtils.smoothstep(Math.cos(design.count*Math.atan2(z,x)-.6),.30,.93);
    const scale = 1 + shoulder * (.033*lobe - .006) / radius;
    seat.setXYZ(j,x*scale,y,z*scale);
  }
  socket.computeVertexNormals();
  const hub = new THREE.Mesh(socket, palette.enamel);
  hub.castShadow = true;
  group.add(hub);
  if(index===2){
    const profile=[[.350,-.045],[.485,-.045],[.515,-.025],[.523,.008],[.518,.043],[.496,.066],[.374,.066],[.350,.042],[.350,-.045]];
    const ring=new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),128),palette.steel);
    ring.name='endurance-ring';ring.castShadow=true;group.add(ring);
  }
  return group;
}
