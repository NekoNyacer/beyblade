import * as THREE from '/vendor/three.module.js';

const turn = Math.PI * 2;

function mesh(group, geometry, material) {
  const piece = new THREE.Mesh(geometry, material);
  piece.castShadow = true;
  group.add(piece);
}

// Each profile closes around its bore. The third column puts molded relief on selected walls.
function shell(group, material, profile, segments, relief) {
  const positions = [], indices = [];
  const rows = profile.length;
  for (let i = 0; i < segments; i++) {
    const angle = turn * i / segments;
    for (let j = 0; j < rows; j++) {
      const [radius, height, depth = 0] = profile[j];
      const r = radius + (depth ? depth * relief(angle, height) : 0);
      positions.push(r * Math.sin(angle), height, r * Math.cos(angle));
      const nextI = (i + 1) % segments, nextJ = (j + 1) % rows;
      const a = i * rows + j, b = nextI * rows + j;
      const c = nextI * rows + nextJ, d = i * rows + nextJ;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  mesh(group, geometry, material);
}

// The curved ribs remain visible through the molded cover and from its underside.
function ratchetRibs(group, material, count) {
  const shapes = [];
  for (let i = 0; i < count; i++) {
    const a = turn * (i + .12) / count, shape = new THREE.Shape();
    const point = (r, t) => [r * Math.cos(a) - t * Math.sin(a), r * Math.sin(a) + t * Math.cos(a)];
    const width = i % 2 ? .014 : .028;
    shape.moveTo(...point(.164, -width));
    shape.bezierCurveTo(...point(.207, -width), ...point(.247, .007), ...point(.289, .031));
    shape.lineTo(...point(.288, .058));
    shape.bezierCurveTo(...point(.245, .043), ...point(.202, width), ...point(.164, width));
    shape.closePath();
    shapes.push(shape);
  }
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: .053, bevelThickness: .006, bevelSize: .004, bevelSegments: 2, curveSegments: 5,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -.031, 0);
  mesh(group, geometry, material);
}

function socketDeck(group, material, lobes) {
  const deck = new THREE.Shape();
  deck.absarc(0, 0, .276, 0, turn, false);
  const bore = new THREE.Path();
  bore.absarc(0, 0, .150, 0, turn, true);
  deck.holes.push(bore);

  // Slender rounded vents and cored screw bosses interrupt the shallow conical cover.
  const bosses = [];
  for (let i = 0; i < lobes * 2; i++) {
    const angle = i * Math.PI / lobes;
    const width = (i % 2 ? .25 : .35) * Math.PI / lobes;
    const a = angle + .07, b = a + width, slot = new THREE.Path();
    const point = (r, t) => [r * Math.cos(t), r * Math.sin(t)];
    slot.moveTo(...point(.244, b));
    slot.absarc(0, 0, .244, b, a, true);
    slot.quadraticCurveTo(...point(.231, a-.069), ...point(.220, a));
    slot.absarc(0, 0, .220, a, b, false);
    slot.quadraticCurveTo(...point(.233, b+.061), ...point(.244, b));
    deck.holes.push(slot);
    if (i % 2 === 0) {
      const [x,z] = point(.209, angle-.22);
      const boss = new THREE.Shape(), hole = new THREE.Path();
      boss.absarc(x, z, .024, 0, turn, false);
      hole.absarc(x, z, .010, 0, turn, true);
      boss.holes.push(hole);
      bosses.push(boss);
    }
  }
  for (const [shapes, depth, elevation] of [[deck,.011,.012], [bosses,.025,.040]]) {
    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth, bevelThickness:.0025, bevelSize:.002, bevelSegments:1, curveSegments:8,
    });
    geometry.rotateX(-Math.PI / 2);
    const vertices = geometry.attributes.position;
    for (let i=0; i<vertices.count; i++) {
      const radius = Math.hypot(vertices.getX(i), vertices.getZ(i));
      vertices.setY(i, vertices.getY(i) + elevation + (radius - .15) * .20);
    }
    geometry.computeVertexNormals();
    mesh(group, geometry, material);
  }
}

export function buildRatchet(index, palette, spec) {
  const group = new THREE.Group();
  const lobes = spec.lobes, segments = lobes * 16;
  const length = [.069, .043, .053][index];
  const shoulder = (a, y) => {
    const angle = a * lobes + (y + .02) * 1.1;
    const lug = THREE.MathUtils.smoothstep(Math.cos(angle), .18, .85);
    const inset = THREE.MathUtils.smoothstep(Math.cos(angle-.46), .87, .99);
    return lug * (y > -.040 && y < .035 ? 1 - .15 * inset : 1);
  };
  const jacket = index === 1 ? palette.light : palette.resin;
  const insert = index === 1 ? palette.resin : palette.clear;
  // A low skirt and an inset parting line lead into a rolled shoulder at each locking lug.
  shell(group, jacket, [
    [.281,-.072], [.311,-.072,length*.65], [.326,-.062,length*.76],
    [.332,-.041,length*.78], [.329,-.034,length*.77], [.333,-.029,length*.80],
    [.338,.004,length], [.336,.039,length], [.326,.055,length*.93],
    [.314,.062,length*.75], [.303,.062,length*.56], [.295,.052,length*.28],
    [.270,.045], [.267,.037], [.267,-.048],
  ], segments, shoulder);

  // The thin liner backs the clear jacket and forms the lip visible on the underside.
  shell(group, index === 1 ? palette.enamel : palette.resin, [
    [.248,-.065], [.255,-.089], [.289,-.089], [.309,-.077], [.310,-.069],
    [.300,-.063], [.285,-.061], [.282,.045], [.291,.052], [.290,.062],
    [.280,.067], [.269,.063], [.261,.052], [.256,-.040],
  ], 48);
  ratchetRibs(group, index === 1 ? palette.enamel : palette.light, lobes * 2);
  socketDeck(group, insert, lobes);

  // A bayonet socket has rounded lead-ins, a stepped bore and three internal keyways.
  const keyway = a => THREE.MathUtils.smoothstep(Math.cos(a * 3), .54, .91);
  shell(group, insert, [
    [.107,-.073,.017], [.114,-.085,.017], [.147,-.085,.006], [.153,-.078,.007],
    [.157,-.052,.008], [.174,-.041,.009], [.176,-.029,.011], [.165,-.023,.010],
    [.163,.019,.012], [.181,.028,.010], [.180,.036,.011], [.166,.041,.009],
    [.165,.066,.009], [.155,.080,.009], [.135,.083,.014], [.121,.071,.020],
    [.118,.058,.018], [.108,.051,.021],
  ], 48, keyway);
  group.scale.y = spec.height / .172;
  return group;
}

const tips = [
  [[0,-.296],[.011,-.293],[.036,-.275],[.057,-.246],[.068,-.224],[.071,-.210],[.078,-.203],[.087,-.193],[.085,-.183],[0,-.183]],
  [[0,-.296],[.025,-.293],[.051,-.282],[.074,-.261],[.086,-.239],[.090,-.218],[.089,-.200],[.084,-.183],[0,-.183]],
  [[0,-.262],[.038,-.262],[.044,-.267],[.046,-.287],[.052,-.295],[.078,-.295],[.084,-.289],[.086,-.277],[.086,-.231],[.080,-.225],[.079,-.202],[.087,-.195],[.084,-.183],[0,-.183]],
];

export function buildBit(index, palette, spec) {
  const group = new THREE.Group();
  const teeth = spec.gearTeeth;
  const flute = (angle, height) => THREE.MathUtils.smoothstep(Math.cos(angle * teeth + (height + .14) * 2), -.68, .68);
  // The gear crests taper into the neck, widen under the flange, then die into its fillet.
  shell(group, palette.enamel, [
    [.077,-.199], [.090,-.199,.002], [.096,-.186,.009], [.103,-.161,.019],
    [.117,-.119,.028], [.128,-.082,.030], [.134,-.053,.030], [.144,-.041,.021],
    [.155,-.040,.011], [.162,-.049], [.180,-.050], [.198,-.046], [.203,-.040],
    [.203,-.027], [.198,-.019], [.186,-.015], [.126,-.015], [.114,-.010],
    [.108,.002], [.101,.006], [.092,.004], [.086,-.017],
  ], teeth * 8, flute);

  // A pair of locking flats run up the post and meet the hollow end under a rounded rim.
  const flat = (a, h) => h > .070 ? Math.max(0, (Math.abs(Math.cos(a)) - .76) / .24) : Math.cos(6*a)*.5+.5;
  shell(group, index === 0 ? palette.ink : palette.enamel, [
    [.072,-.014], [.092,-.014], [.101,-.004,.003], [.101,.019,.009],
    [.095,.030,.008], [.091,.048,.010], [.093,.059], [.096,.066],
    [.096,.085,-.009], [.090,.092,-.008], [.081,.096,-.009],
    [.081,.198,-.013], [.078,.209,-.012], [.071,.216,-.009], [.047,.216],
    [.042,.210], [.041,.172], [.045,.166], [.070,.166],
  ], 48, flat);
  const tip = new THREE.LatheGeometry(tips[[2,1,0][index]].map(([r,y]) => new THREE.Vector2(r,y)), 40);
  mesh(group, tip, palette.enamel);
  group.scale.y = Math.abs(spec.tipY) / .296;
  return group;
}
