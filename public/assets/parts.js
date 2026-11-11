import * as THREE from '/vendor/three.module.js';
import { buildBlade } from './blade-model.js';
import { buildRatchet, buildBit } from './drive-model.js';
import { makeCrest } from './crest.js';
import { partDefinition, assemblyOffsets } from './part-catalog.js';

export function metalEnvironment(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [stop, color] of [[0, '#b8c9df'], [.45, '#637589'], [.55, '#182538'], [1, '#405169']]) {
    sky.addColorStop(stop, color);
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);
  for (const [x,y,w,h] of [[80,90,190,110], [460,60,100,220], [760,120,180,65]]) {
    const glow = ctx.createLinearGradient(x, 0, x + w, 0);
    for (const [stop, color] of [[0,'#61758b'], [.3,'#ffffff'], [.7,'#ffffff'], [1,'#61758b']]) {
      glow.addColorStop(stop, color);
    }
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, w, h);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(texture);
  texture.dispose();
  pmrem.dispose();
  return target;
}

// Zinc castings have a fine stipple in the highlights beneath the polished edges.
const grainSize = 128;
const grainPixels = new Uint8Array(grainSize * grainSize * 4);
let seed = 37;
for (let i = 0; i < grainPixels.length; i += 4) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const grain = seed >>> 24;
  grainPixels.set([grain, 174 + (grain >>> 2), 255, 255], i);
}
const grainMap = new THREE.DataTexture(grainPixels, grainSize, grainSize);
grainMap.wrapS = grainMap.wrapT = THREE.RepeatWrapping;
grainMap.magFilter = THREE.LinearFilter;
grainMap.minFilter = THREE.LinearMipmapLinearFilter;
grainMap.generateMipmaps = true;
grainMap.needsUpdate = true;

function finishes(paint) {
  const color = new THREE.Color(paint);
  const hsl = color.getHSL({}, THREE.SRGBColorSpace);
  // Dye a jewel-tone base from the player's hue and retain the lighter team color on the print.
  const dye = new THREE.Color().setHSL(hsl.h, Math.min(1,hsl.s * 1.08), Math.min(.44,hsl.l), THREE.SRGBColorSpace);
  const polymer = (color, roughness, extra = {}) => new THREE.MeshPhysicalMaterial({
    color, roughness, clearcoat: .72, clearcoatRoughness: .17, ...extra
  });
  return {
    color,
    steel: new THREE.MeshStandardMaterial({ color: 0xdfdfe0, metalness: .93, roughness: .39,
      roughnessMap: grainMap, bumpMap: grainMap, bumpScale: .00042, envMapIntensity: 1.45 }),
    gunmetal: new THREE.MeshStandardMaterial({ color: 0x73737b, metalness: .87, roughness: .36,
      roughnessMap: grainMap, bumpMap: grainMap, bumpScale: .00042, envMapIntensity: 1.3 }),
    resin: polymer(dye, .16, { transparent: true, opacity: .76, depthWrite: false }),
    enamel: polymer(dye, .24, { metalness: .12 }),
    light: polymer(0xe3e5e4, .28, { metalness: .2 }),
    clear: polymer(0xcbd9de, .12, { transparent: true, opacity: .47, depthWrite: false, envMapIntensity: 1.45 }),
    ink: polymer(0x232730, .36, { clearcoat: .27 })
  };
}

export function makePart(kind, index = 0, color = '#ff486a') {
  index = Number.isInteger(index) && index >= 0 && index < 3 ? index : 0;
  const spec = partDefinition(kind, index);
  const palette = finishes(color);
  const identify = part => { part.name=spec.id; part.userData={kind,index,partId:spec.id}; return part; };
  if (kind === 'blade') {
    const blade = buildBlade(index, palette);
    const crest = makeCrest(index, palette.color);
    crest.position.y = .120;
    blade.add(crest);
    return identify(blade);
  }
  return identify(kind === 'ratchet' ? buildRatchet(index, palette, spec) : buildBit(index, palette, spec));
}

export function dispose(group) {
  const materials = new Set();
  group.traverse(object => {
    object.geometry?.dispose();
    if (object.material) materials.add(object.material);
  });
  for (const material of materials) {
    material.map?.dispose();
    material.dispose();
  }
}

export class PartPreview {
  constructor(container, kind) {
    this.container = container;
    this.kind = kind;
    try { this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { container.textContent = kind; return; }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.env = metalEnvironment(this.renderer);
    this.scene.environment = this.env.texture;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x45576c, .85));
    const key = new THREE.DirectionalLight(0xfff4e4, 2.5);
    key.position.set(-3, 4, 3);
    const rim = new THREE.DirectionalLight(0xe2efff, 1.45);
    rim.position.set(3, 2, -2);
    this.scene.add(key, rim);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 12);
    this.camera.position.set(0, 0, 4);
    new ResizeObserver(() => this.render()).observe(container);
  }

  set(index, color) {
    if (!this.renderer || (index === this.index && color === this.color)) return;
    if (!this.part || color !== this.color) {
      if (this.part) { this.scene.remove(this.part); dispose(this.part); }
      this.part = new THREE.Group();
      for (let choice = 0; choice < 3; choice++) {
        this.part.add(makePart(this.kind, choice, color));
      }
      this.scene.add(this.part);
    }
    this.index = index;
    this.color = color;
    const scale = { blade: 1, ratchet: 1.28, bit: 1.85 }[this.kind];
    for (const offset of [-1, 0, 1]) {
      const piece = this.part.children[(index + offset + 3) % 3];
      if (this.kind === 'bit') {
        piece.rotation.set(-.34, .26, -.36);
        piece.position.y = .055;
      } else {
        piece.rotation.set(this.kind === 'blade' ? 1.02 : .96, .12, -.15, 'ZXY');
      }
      piece.position.x = offset * .89;
      piece.scale.setScalar(scale * (offset ? .49 : 1));
      const dimmed = offset !== 0;
      if (Boolean(piece.userData.dimmed) !== dimmed) {
        const gain = dimmed ? .5 : 2;
        const materials = new Set();
        piece.traverse(object => { if (object.material) materials.add(object.material); });
        for (const material of materials) {
          material.color.multiplyScalar(gain);
          material.envMapIntensity *= gain;
        }
        piece.userData.dimmed = dimmed;
      }
    }
    this.render();
  }

  render() {
    if (!this.renderer) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    const aspect = w / h;
    const height = this.kind ? Math.max(1.06, 2.30 / aspect) : Math.max(1.18, 1.18 / aspect);
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.right = height * aspect / 2;
    this.camera.left = -this.camera.right;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.renderer.render(this.scene, this.camera);
  }
}

export class LauncherPreview extends PartPreview {
  constructor(container) {
    super(container, '');
    if (this.camera) {
      this.camera.position.set(.3, 3.25, 2.1);
      this.camera.lookAt(0, .43, 0);
    }
  }

  set(parts, color) {
    if (!this.renderer) return;
    if (this.part) { this.scene.remove(this.part); dispose(this.part); }
    this.part = new THREE.Group();
    for (const [kind, y] of Object.entries(assemblyOffsets(parts))) {
      const piece = makePart(kind, parts[kind] ?? 0, color);
      piece.position.y = y;
      this.part.add(piece);
    }
    this.scene.add(this.part);
    this.render();
  }
}
