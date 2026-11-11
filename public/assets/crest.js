import * as THREE from '/vendor/three.module.js';

const ink = '#0c1622';
const bone = '#fff3dc';

// Each layer is a separate ink plate on the little printed insert.
const falcon = [
  [bone, 'M15 94 Q32 82 36 67 L16 77 Q29 58 44 49 L23 53 Q37 36 58 31 L40 28 Q64 18 84 29 Q104 26 112 37 L105 44 Q125 52 114 76 Q106 68 98 71 Q81 78 79 93 L84 101 Q65 104 50 117 L53 98 Q37 98 22 108 L33 91 Z'],
  [ink, 'M22 91 Q40 78 42 64 L24 71 Q39 53 53 47 L34 49 Q51 35 71 31 L52 28 Q70 23 84 33 Q101 30 108 38 L99 45 Q121 50 113 69 Q107 62 95 69 Q75 78 74 93 L78 100 Q62 106 54 111 L59 94 Q45 96 31 102 L41 86 Z'],
  ['#c33a28', 'M33 87 Q50 72 52 57 L38 62 Q50 48 69 41 L53 42 Q68 30 84 35 L98 36 Q86 42 82 48 Q70 53 66 64 Q54 79 33 87 Z'],
  ['#ff9b40', 'M43 60 Q55 48 75 41 Q71 46 67 48 Z M46 70 Q58 59 67 54 L61 64 Z M81 37 Q89 35 96 37 L78 44 Z'],
  [bone, 'M60 79 Q63 61 78 50 L73 51 Q84 43 98 41 L88 48 Q92 52 103 51 Q100 57 92 60 L95 64 Q82 65 76 75 L69 91 L61 97 L66 80 L55 90 Z'],
  ['#677991', 'M69 68 Q74 55 82 52 L91 54 L85 57 Q77 57 69 68 Z M62 89 Q72 75 77 73 L69 88 Z'],
  ['#ffc54f', 'M95 48 Q116 47 114 63 Q110 58 104 58 L96 62 L102 54 Z'],
  [ink, 'M79 49 L98 44 L93 51 Q88 57 80 54 Z'],
  ['#ffe46d', 'M82 51 L93 47 Q89 54 84 53 Z'],
  [ink, 'M88 49 L90 48 L88 52 L86 52 Z'],
  [bone, 'M78 48 Q88 42 101 40 L95 44 Z M102 50 Q108 50 111 53 L105 52 Z'],
];

const wolf = [
  [bone, 'M15 67 L30 51 L45 47 L45 32 L58 40 L74 18 L80 33 L98 21 L94 43 L113 42 L101 56 L118 59 L103 69 L116 78 L95 84 L102 97 L82 94 L82 108 L64 102 L58 114 L49 96 Q37 95 30 85 L17 80 L21 75 Z'],
  [ink, 'M19 67 L33 54 L48 50 L48 37 L59 45 L73 24 L79 39 L93 28 L89 47 L105 46 L96 58 L110 60 L98 69 L107 77 L89 81 L95 91 L77 87 L79 101 L61 96 L58 105 L52 92 Q39 91 33 81 L20 78 L24 74 Z'],
  ['#447995', 'M54 59 L60 46 L72 28 L73 48 L88 34 L83 56 L99 51 L87 63 L100 64 L84 73 L91 79 L75 78 L78 90 L64 83 L63 96 L54 84 Z'],
  ['#92e1ef', 'M60 50 L71 32 L70 43 Z M76 51 L87 36 L81 52 Z M83 62 L96 54 L86 64 Z M77 71 L89 66 L83 72 Z'],
  [bone, 'M21 66 L35 55 L50 52 L56 44 L63 48 L57 55 L69 53 L63 60 L72 59 L62 68 L68 67 L56 80 L62 78 L55 88 L48 81 L40 78 L33 70 Z'],
  ['#84a1ac', 'M24 65 L37 57 L51 53 L46 59 Z M41 68 L53 65 L61 60 L55 68 L46 72 Z'],
  [ink, 'M18 67 L27 62 L37 64 L33 69 L25 72 Z M41 60 L60 53 L54 61 L45 64 Z M27 72 Q39 78 48 72 L56 68 Q50 78 40 83 L31 79 Z'],
  ['#ffab42', 'M46 60 L55 56 L52 61 L47 62 Z'],
  [bone, 'M35 76 L40 77 L38 81 Z M43 75 L47 73 L45 78 Z M26 65 L30 65 L26 67 Z'],
  ['#95dcdf', 'M64 77 L77 66 L72 76 L64 85 Z M70 88 L78 82 L74 87 Z'],
];

const cobra = [
  [bone, 'M67 15 Q78 24 77 30 Q100 31 107 49 Q117 73 100 92 Q86 107 64 115 Q60 102 63 88 Q44 92 29 78 Q15 65 22 46 Q28 29 48 29 L46 20 L57 27 Z'],
  [ink, 'M66 19 L74 29 L72 33 Q94 31 104 49 Q114 70 98 89 Q82 105 67 110 Q64 98 68 84 Q46 90 32 76 Q19 64 26 48 Q33 32 52 33 L50 25 L58 31 Z'],
  ['#c68b28', 'M56 35 Q34 34 28 52 Q22 68 39 77 L48 80 Q33 65 42 50 Q48 41 57 41 Z M74 35 Q93 34 101 52 Q111 74 89 91 L72 103 L76 89 Q99 70 87 50 Q83 43 73 41 Z'],
  ['#ffdf83', 'M51 36 Q34 40 29 53 L29 58 Q36 48 48 46 Z M34 63 L42 57 L39 65 L34 71 Z M79 37 Q93 39 98 50 L82 45 Z M92 53 L99 56 L102 65 L94 62 Z M92 71 L101 70 L97 76 L87 81 Z'],
  ['#f3d27b', 'M45 50 L58 41 L60 35 L66 29 L71 37 L71 44 L83 49 L87 60 L79 76 L70 80 L67 89 L59 81 L52 79 L44 67 L40 57 Z'],
  ['#90804a', 'M43 54 L55 48 L57 52 L50 57 Z M74 48 L83 51 L83 57 L75 53 Z M54 63 L63 60 L72 61 L78 65 L70 71 L60 72 Z'],
  [ink, 'M42 53 L59 56 L61 61 L53 63 L44 60 Z M85 52 L81 62 L72 63 L68 59 L71 55 Z M53 66 L61 68 L66 65 L73 66 L77 65 L72 75 L64 81 L57 73 Z'],
  ['#ff642d', 'M46 56 L56 58 L57 60 L50 60 Z M73 58 L80 56 L78 60 L72 61 Z'],
  [bone, 'M53 66 L60 69 L59 76 Z M71 69 L77 65 L71 76 Z M59 51 L63 42 L66 36 L67 47 L64 54 Z'],
  ['#ed6136', 'M62 74 L66 73 L69 79 L66 86 L67 92 L64 88 L60 92 L63 84 Z'],
];

const designs = [falcon, wolf, cobra];
const spot = ['#ff7939', '#4eb8dd', '#f0bb47'];

export function makeCrest(index, color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 384;
  const ctx = canvas.getContext('2d');
  ctx.scale(3, 3);
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, 128, 128);

  // Printed perimeter markings follow the die-cut edge.
  function arc(radius, start, end, width, paint) {
    ctx.beginPath();
    ctx.arc(64, 64, radius, start, end);
    ctx.lineWidth = width;
    ctx.strokeStyle = paint;
    ctx.stroke();
  }
  arc(60, 0, 2 * Math.PI, 2, '#c3cbd0');
  for (let sector = 0; sector < 3; sector++) {
    const a = sector * Math.PI * 2 / 3 - .4;
    arc(56, a, a + .83, 5.3, spot[index]);
    for (let tick = 0; tick < 8; tick++) {
      const angle = a + 1 + tick * .11;
      arc(56, angle, angle + .042, tick % 3 === 0 ? 7 : 4, bone);
    }
  }
  arc(50.5, 0, Math.PI * 2, 1.3, bone);
  ctx.save();
  ctx.beginPath();
  ctx.arc(64, 64, 49.8, 0, Math.PI * 2);
  ctx.clip();
  const field = ctx.createLinearGradient(22, 92, 99, 29);
  field.addColorStop(0, ink);
  field.addColorStop(.65, color.getStyle());
  field.addColorStop(1, ink);
  ctx.fillStyle = field;
  ctx.fillRect(12, 12, 104, 104);
  ctx.fillStyle = spot[index];
  ctx.fill(new Path2D('M5 75 L52 22 L21 73 Z M74 107 L127 46 L95 99 Z'));
  for (const [paint, path] of designs[index]) {
    ctx.fillStyle = paint;
    ctx.fill(new Path2D(path));
  }
  ctx.restore();

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map, metalness: .08, roughness: .41 });
  const crest = new THREE.Mesh(new THREE.CircleGeometry(.165, 64), material);
  crest.rotation.x = -Math.PI / 2;
  return crest;
}
