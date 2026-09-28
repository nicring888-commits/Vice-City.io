import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { taxiSignTexture, beamTexture } from '../world/textures.js';

// ---------------------------------------------------------------------------
// Materialien (geteilt zwischen allen Autos)

const MATS = {};
let paintCache = new Map();
let usePhysical = true;

export function setPaintQuality(high) {
  usePhysical = high;
  paintCache = new Map();
}

export function carMaterials() {
  if (MATS.ready) return MATS;
  MATS.glass = new THREE.MeshPhysicalMaterial({ color: 0x0b0f14, metalness: 0.2, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02 });
  MATS.black = new THREE.MeshStandardMaterial({ color: 0x131313, roughness: 0.6, metalness: 0.1 });
  MATS.chrome = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.1, metalness: 1 });
  MATS.rubber = new THREE.MeshStandardMaterial({ color: 0x191919, roughness: 0.9 });
  MATS.rim = new THREE.MeshStandardMaterial({ color: 0xc9cdd2, roughness: 0.22, metalness: 1 });
  MATS.head = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, emissive: 0xfff0d6, emissiveIntensity: 0.15, roughness: 0.1, metalness: 0.3 });
  MATS.tail = new THREE.MeshStandardMaterial({ color: 0x5a0000, emissive: 0xff1010, emissiveIntensity: 0.35, roughness: 0.25 });
  MATS.brake = MATS.tail.clone();
  MATS.brake.emissiveIntensity = 5;
  MATS.indicator = new THREE.MeshStandardMaterial({ color: 0xff9a00, emissive: 0xff7a00, emissiveIntensity: 0.2 });
  MATS.interior = new THREE.MeshStandardMaterial({ color: 0x3b2c22, roughness: 0.85 });
  MATS.plate = new THREE.MeshStandardMaterial({ color: 0xf2f2e8, roughness: 0.5 });
  MATS.skin = new THREE.MeshStandardMaterial({ color: 0xc58c64, roughness: 0.7 });
  MATS.hair = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.8 });
  const ts = taxiSignTexture();
  MATS.taxiSign = new THREE.MeshStandardMaterial({ map: ts, emissive: 0xffffff, emissiveMap: ts, emissiveIntensity: 0.3 });
  MATS.beam = new THREE.MeshBasicMaterial({
    map: beamTexture(),
    color: 0xfff1d0,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  MATS.ready = true;
  return MATS;
}

export function paint(hex) {
  let m = paintCache.get(hex);
  if (!m) {
    m = usePhysical
      ? new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 })
      : new THREE.MeshStandardMaterial({ color: hex, metalness: 0.5, roughness: 0.28 });
    withEnv(m);
    paintCache.set(hex, m);
  }
  return m;
}

// Reflexionen: Umgebungs-Map direkt an Lack, Glas und Chrom hängen
let currentEnv = null;
let currentEnvI = 1;
export function setCarEnv(tex, intensity) {
  currentEnv = tex;
  currentEnvI = intensity;
  const m = carMaterials();
  for (const mat of [m.glass, m.chrome, m.rim, ...paintCache.values()]) {
    mat.envMap = tex;
    mat.envMapIntensity = intensity;
  }
}
function withEnv(mat) {
  if (currentEnv) {
    mat.envMap = currentEnv;
    mat.envMapIntensity = currentEnvI;
  }
  return mat;
}

export function setCarNight(n) {
  const m = carMaterials();
  m.head.emissiveIntensity = 0.15 + n * 4;
  m.tail.emissiveIntensity = 0.35 + n * 1.4;
  m.taxiSign.emissiveIntensity = 0.3 + n * 1.5;
  m.beam.opacity = n * 0.28;
}

// ---------------------------------------------------------------------------
// Geometrie-Helfer (Profilkoordinaten: x = Längsachse nach vorn, y = Höhe)

class Parts {
  constructor() {
    this.map = {};
  }
  add(mat, geo) {
    (this.map[mat] ||= []).push(geo.index ? geo.toNonIndexed() : geo);
  }
  box(mat, x, y, z, sx, sy, sz, rx = 0) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    this.add(mat, g);
  }
  // Symmetrisch links/rechts
  box2(mat, x, y, z, sx, sy, sz, rx = 0) {
    this.box(mat, x, y, z, sx, sy, sz, rx);
    this.box(mat, -x, y, z, sx, sy, sz, rx);
  }
  cyl(mat, x, y, z, r, len, axis = 'z', seg = 12) {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    g.translate(x, y, z);
    this.add(mat, g);
  }
  merged() {
    const out = {};
    for (const [k, list] of Object.entries(this.map)) {
      for (const g of list) {
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      }
      out[k] = mergeGeometries(list, false);
      out[k].computeBoundingSphere();
    }
    return out;
  }
}

// Seitenprofil extrudieren und in das Auto-Koordinatensystem drehen (Profil-x → Welt-z)
function extrudeShape(shape, width, bevel = 0.06, segments = 3) {
  const depth = Math.max(0.01, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: segments,
    curveSegments: 10,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

// Unterkante mit Radläufen
function underbody(sh, s) {
  const [rx, fx] = s.axles;
  const ar = s.wr + 0.07;
  const wy = s.wr;
  sh.moveTo(-s.L / 2 + 0.02, s.rearLow ?? 0.38);
  sh.lineTo(rx - ar - 0.05, s.sill);
  sh.lineTo(rx - ar, wy);
  sh.absarc(rx, wy, ar, Math.PI, 0, true);
  sh.lineTo(rx + ar + 0.02, s.sill);
  sh.lineTo(fx - ar - 0.02, s.sill);
  sh.lineTo(fx - ar, wy);
  sh.absarc(fx, wy, ar, Math.PI, 0, true);
  sh.lineTo(fx + ar + 0.05, s.sill + 0.02);
  sh.lineTo(s.L / 2 - 0.1, s.frontLow ?? 0.3);
}

function bodyShape(s) {
  const sh = new THREE.Shape();
  underbody(sh, s);
  for (const [x, y] of s.top) sh.lineTo(x, y);
  sh.closePath();
  return sh;
}

function polyShape(pts) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  return sh;
}

// Stab entlang einer Linie im Profil (für A-Säulen, Rahmen)
function strut(parts, mat, xLat, a, b, thick = 0.06, wide = 0.07) {
  const dz = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dz, dy);
  const g = new THREE.BoxGeometry(wide, thick, len);
  g.rotateX(-Math.atan2(dy, dz));
  g.translate(xLat, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
  parts.add(mat, g);
}

// ---------------------------------------------------------------------------
// Fahrzeugdefinitionen

export const MODELS = [
  {
    id: 'fuego',
    name: 'Fuego GT',
    cat: 'sport',
    L: 4.48,
    W: 1.98,
    H: 1.16,
    wr: 0.33,
    axles: [-1.32, 1.25],
    sill: 0.27,
    maxSpeed: 80,
    accel: 13.5,
    grip: 9.5,
    mass: 1500,
    colors: ['#c8101c', '#f4f4f4', '#101010', '#ffcc00', '#1d4fbf'],
    top: [
      [2.24, 0.36],
      [2.26, 0.5],
      [2.12, 0.62],
      [1.2, 0.76],
      [0.72, 0.81],
      [-0.2, 0.84],
      [-1.1, 0.93],
      [-2.05, 0.97],
      [-2.2, 0.95],
      [-2.26, 0.72],
      [-2.25, 0.45],
    ],
    cabin: [
      [0.86, 0.76],
      [0.02, 1.15],
      [-0.72, 1.17],
      [-1.55, 0.95],
      [-1.6, 0.86],
    ],
    cabinW: 1.46,
    head: [[0.68, 0.46, 0.34, 0.09]],
    tailY: 0.72,
    extras(p, s) {
      // Seitliche Kiemen (Testarossa-Stil)
      for (let i = 0; i < 5; i++) p.box2('black', s.W / 2 - 0.02, 0.46 + i * 0.065, -0.35, 0.06, 0.028, 1.05);
      // Heckgrill über den Rückleuchten
      p.box('tail', 0, 0.72, -s.L / 2 - 0.05, 1.7, 0.2, 0.04);
      for (let i = 0; i < 4; i++) p.box('black', 0, 0.64 + i * 0.05, -s.L / 2 - 0.08, 1.74, 0.02, 0.03);
      // Klappscheinwerfer (geschlossen) – Fugen
      p.box2('black', 0.62, 0.64, 1.9, 0.44, 0.012, 0.012);
      p.box2('black', 0.62, 0.64, 1.62, 0.44, 0.012, 0.012);
    },
  },
  {
    id: 'stiletto',
    name: 'Stiletto',
    cat: 'sport',
    L: 4.2,
    W: 2.0,
    H: 1.07,
    wr: 0.33,
    axles: [-1.27, 1.2],
    sill: 0.25,
    maxSpeed: 84,
    accel: 14.5,
    grip: 10,
    mass: 1450,
    colors: ['#f4f4f4', '#ffd400', '#d10b0b', '#111111', '#2bb04a'],
    top: [
      [2.1, 0.34],
      [2.13, 0.43],
      [1.2, 0.66],
      [0.55, 0.8],
      [-0.6, 0.86],
      [-1.9, 0.9],
      [-2.1, 0.88],
      [-2.1, 0.45],
    ],
    cabin: [
      [0.62, 0.77],
      [-0.28, 1.07],
      [-0.86, 1.07],
      [-1.75, 0.89],
      [-1.75, 0.84],
    ],
    cabinW: 1.38,
    head: [[0.62, 0.41, 0.34, 0.05]],
    tailY: 0.66,
    extras(p, s) {
      // Heckflügel auf Stützen
      p.box('paint', 0, 1.2, -1.92, 1.96, 0.05, 0.4);
      p.box2('paint', 0.62, 1.04, -1.85, 0.06, 0.32, 0.26);
      p.box2('paint', 0.99, 1.14, -1.92, 0.03, 0.16, 0.44);
      // NACA-Lufteinlässe
      p.box2('black', s.W / 2 - 0.02, 0.62, -0.25, 0.05, 0.14, 0.6);
      p.box2('black', 0.78, 0.9, -1.1, 0.34, 0.14, 0.7);
    },
  },
  {
    id: 'corsair',
    name: 'Corsair',
    cat: 'sport',
    L: 4.48,
    W: 1.84,
    H: 1.19,
    wr: 0.32,
    axles: [-1.25, 1.2],
    sill: 0.28,
    maxSpeed: 74,
    accel: 13,
    grip: 9,
    mass: 1450,
    colors: ['#ff2a6d', '#0b0b0b', '#f2f2f2', '#16a6c9', '#8c1ad8'],
    top: [
      [2.2, 0.32],
      [2.27, 0.46],
      [2.18, 0.6],
      [1.2, 0.75],
      [0.45, 0.84],
      [-0.9, 0.87],
      [-2.05, 0.93],
      [-2.23, 0.86],
      [-2.24, 0.5],
    ],
    cabin: [
      [0.52, 0.81],
      [-0.25, 1.18],
      [-0.9, 1.19],
      [-1.98, 0.93],
      [-1.95, 0.87],
    ],
    cabinW: 1.36,
    head: [[0.6, 0.47, 0.3, 0.06]],
    tailY: 0.76,
    tailRound: true,
    extras(p) {
      p.box2('black', 0.6, 0.62, 1.78, 0.42, 0.012, 0.012);
      p.box2('black', 0.93, 0.5, 0.1, 0.02, 0.05, 1.8);
    },
  },
  {
    id: 'monarch',
    name: 'Monarch 91',
    cat: 'sport',
    L: 4.29,
    W: 1.8,
    H: 1.29,
    wr: 0.32,
    axles: [-1.12, 1.17],
    sill: 0.28,
    maxSpeed: 77,
    accel: 14,
    grip: 9.8,
    mass: 1400,
    colors: ['#f0f0f0', '#1b1b1b', '#b31217', '#7a8a99', '#0f5132'],
    top: [
      [2.1, 0.34],
      [2.16, 0.5],
      [1.95, 0.64],
      [1.55, 0.72],
      [0.75, 0.84],
      [-0.4, 0.88],
      [-1.35, 0.9],
      [-1.9, 0.86],
      [-2.12, 0.66],
      [-2.12, 0.42],
    ],
    cabin: [
      [0.82, 0.82],
      [0.05, 1.24],
      [-0.55, 1.28],
      [-1.3, 1.08],
      [-1.95, 0.87],
      [-1.95, 0.84],
    ],
    cabinW: 1.34,
    head: [],
    tailY: 0.58,
    extras(p) {
      // Runde Scheinwerfer auf den Kotflügeln
      for (const x of [-0.62, 0.62]) {
        const g = new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
        g.rotateX(Math.PI / 2);
        g.translate(x, 0.63, 1.86);
        p.add('head', g);
        p.cyl('paint', x, 0.63, 1.8, 0.19, 0.18);
      }
      // Walfischschwanz-Spoiler
      p.box('paint', 0, 0.98, -1.85, 1.62, 0.07, 0.5);
      p.box('black', 0, 1.02, -2.08, 1.66, 0.05, 0.08);
      p.box('paint', 0, 0.92, -1.8, 1.5, 0.1, 0.4);
    },
  },
  {
    id: 'spyder',
    name: 'Vapor Spyder',
    cat: 'sport',
    L: 4.42,
    W: 1.78,
    H: 1.1,
    wr: 0.33,
    axles: [-1.2, 1.25],
    sill: 0.28,
    maxSpeed: 72,
    accel: 12.5,
    grip: 9,
    mass: 1400,
    colors: ['#0c0c0c', '#e8e2d0', '#c01020', '#1e3a8a', '#cfd4d9'],
    open: true,
    top: [
      [2.18, 0.33],
      [2.26, 0.48],
      [2.18, 0.64],
      [1.1, 0.8],
      [0.55, 0.84],
      [-0.5, 0.86],
      [-1.2, 0.88],
      [-2.05, 0.9],
      [-2.22, 0.82],
      [-2.22, 0.5],
    ],
    cabin: null,
    head: [[0.55, 0.58, 0.9, 0.06]],
    tailY: 0.72,
    tailRound: true,
    extras(p, s) {
      // Cockpit, Sitze, Lenkrad, Windschutzscheibe
      p.box('black', 0, 0.87, -0.35, 1.4, 0.04, 1.5);
      p.box2('interior', 0.36, 1.02, -0.75, 0.5, 0.35, 0.18, 0.2);
      p.box2('interior', 0.36, 0.92, -0.55, 0.5, 0.1, 0.45);
      p.cyl('black', 0.36, 1.07, 0.1, 0.17, 0.03, 'z', 16);
      strut(p, 'chrome', 0.66, [0.55, 0.85], [0.28, 1.2], 0.035, 0.035);
      strut(p, 'chrome', -0.66, [0.55, 0.85], [0.28, 1.2], 0.035, 0.035);
      const ws = new THREE.PlaneGeometry(1.32, 0.42);
      ws.rotateX(-Math.PI / 2 + Math.atan2(0.35, 0.27));
      ws.translate(0, 1.03, 0.42);
      p.add('glass', ws);
      p.box('chrome', 0, 1.2, 0.29, 1.34, 0.03, 0.03);
      // Überrollbügel hinter den Sitzen
      p.box2('paint', 0.36, 1.0, -1.1, 0.46, 0.22, 0.34);
      void s;
    },
  },
  {
    id: 'sedan',
    name: 'Admiral',
    cat: 'civil',
    L: 4.8,
    W: 1.86,
    H: 1.42,
    wr: 0.33,
    axles: [-1.4, 1.42],
    sill: 0.32,
    maxSpeed: 48,
    accel: 8,
    grip: 8,
    mass: 1650,
    colors: ['#1e2a44', '#6d6d6d', '#e8e4da', '#6b1e1e', '#2f4f3a', '#b8a78a', '#5d7fa8'],
    top: [
      [2.38, 0.4],
      [2.42, 0.8],
      [2.3, 0.86],
      [0.9, 0.9],
      [-1.05, 0.93],
      [-2.3, 0.95],
      [-2.4, 0.88],
      [-2.4, 0.42],
    ],
    cabin: [
      [0.96, 0.87],
      [0.3, 1.39],
      [-0.85, 1.41],
      [-1.35, 0.93],
      [-1.3, 0.9],
    ],
    cabinW: 1.6,
    head: [[0.62, 0.72, 0.4, 0.14]],
    tailY: 0.8,
    extras(p, s) {
      p.box('chrome', 0, 0.62, 2.43, 1.4, 0.2, 0.04);
      for (let i = 0; i < 4; i++) p.box('black', 0, 0.56 + i * 0.045, 2.45, 1.3, 0.02, 0.02);
      p.box('chrome', 0, 0.4, s.L / 2 + 0.02, 1.9, 0.12, 0.1);
      p.box('chrome', 0, 0.42, -s.L / 2 - 0.02, 1.9, 0.12, 0.1);
      p.box2('black', s.W / 2 + 0.005, 0.62, 0, 0.02, 0.06, 3.0);
    },
  },
  {
    id: 'taxi',
    name: 'Cabbie',
    cat: 'civil',
    base: 'sedan',
    colors: ['#f7c600'],
    sign: true,
  },
];

for (const m of MODELS) {
  if (m.base) {
    const b = MODELS.find((x) => x.id === m.base);
    for (const k of Object.keys(b)) if (!(k in m)) m[k] = b[k];
  }
}

// ---------------------------------------------------------------------------
// Aufbau eines Modells (Geometrie wird pro Modell gecacht)

const geoCache = new Map();

function buildGeometry(s) {
  if (geoCache.has(s.id)) return geoCache.get(s.id);
  const p = new Parts();
  const W = s.W;

  // Karosserie
  p.add('paint', extrudeShape(bodyShape(s), W, 0.07, 3));

  // Kabine: getöntes Glas + lackiertes Dach + A-/B-Säulen
  if (s.cabin) {
    const c = s.cabin;
    p.add('glass', extrudeShape(polyShape(c), s.cabinW, 0.1, 3));
    const roof = polyShape([
      [c[1][0] - 0.02, c[1][1] - 0.05],
      [c[1][0] + 0.02, c[1][1] + 0.035],
      [c[2][0] - 0.02, c[2][1] + 0.035],
      [c[2][0] + 0.02, c[2][1] - 0.05],
    ]);
    p.add('paint', extrudeShape(roof, s.cabinW + 0.16, 0.04, 2));
    const half = s.cabinW / 2 + 0.06;
    strut(p, 'paint', half, c[0], c[1], 0.07, 0.08);
    strut(p, 'paint', -half, c[0], c[1], 0.07, 0.08);
    const bx = (c[1][0] + c[2][0]) / 2 - 0.15;
    p.box2('paint', half - 0.02, (c[1][1] + 0.9) / 2, bx, 0.07, c[1][1] - 0.86, 0.12);
    strut(p, 'paint', half - 0.03, c[2], c[3], 0.07, 0.09);
    strut(p, 'paint', -half + 0.03, c[2], c[3], 0.07, 0.09);
    // Außenspiegel
    p.box2('paint', half + 0.14, c[0][1] + 0.1, c[0][0] - 0.2, 0.2, 0.1, 0.14);
  }

  // Scheinwerfer
  for (const [x, y, w, h] of s.head) {
    p.box2('head', x, y, s.L / 2 + 0.05, w, h, 0.06);
  }
  // Blinker
  p.box2('indicator', s.W / 2 - 0.16, 0.38, s.L / 2 + 0.04, 0.16, 0.06, 0.05);
  // Rückleuchten
  if (s.tailRound) {
    for (const x of [0.38, 0.68]) {
      p.cyl('tail', x, s.tailY, -s.L / 2 - 0.05, 0.075, 0.06, 'z', 14);
      p.cyl('tail', -x, s.tailY, -s.L / 2 - 0.05, 0.075, 0.06, 'z', 14);
    }
  } else if (s.id !== 'fuego') {
    p.box2('tail', s.W / 2 - 0.35, s.tailY, -s.L / 2 - 0.05, 0.5, 0.1, 0.05);
  }
  // Nummernschilder, Auspuff, Unterboden
  p.box('plate', 0, 0.36, s.L / 2 + 0.07, 0.52, 0.12, 0.02);
  p.box('plate', 0, 0.48, -s.L / 2 - 0.07, 0.52, 0.12, 0.02);
  p.cyl('chrome', 0.45, 0.3, -s.L / 2 + 0.05, 0.045, 0.2);
  p.cyl('chrome', -0.45, 0.3, -s.L / 2 + 0.05, 0.045, 0.2);
  p.box('black', 0, 0.2, 0, s.W - 0.3, 0.12, s.L - 0.5);

  if (s.sign) {
    p.box('black', 0, 1.45, -0.3, 0.3, 0.05, 0.2);
    const sign = new THREE.BoxGeometry(0.62, 0.2, 0.18);
    sign.translate(0, 1.56, -0.3);
    p.add('taxiSign', sign);
  }
  s.extras?.(p, s);

  const merged = p.merged();

  // Räder
  const tire = new THREE.CylinderGeometry(s.wr, s.wr, 0.27, 24, 1);
  tire.rotateZ(Math.PI / 2);
  const rimParts = [];
  const disc = new THREE.CylinderGeometry(s.wr * 0.64, s.wr * 0.64, 0.285, 18);
  disc.rotateZ(Math.PI / 2);
  rimParts.push(disc.toNonIndexed());
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.BoxGeometry(0.02, s.wr * 1.2, 0.07);
    sp.rotateX((i / 5) * Math.PI);
    for (const side of [-1, 1]) {
      const g = sp.clone();
      g.translate(side * 0.15, 0, 0);
      rimParts.push(g.toNonIndexed());
    }
  }
  const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.32, 8);
  hub.rotateZ(Math.PI / 2);
  rimParts.push(hub.toNonIndexed());
  const rim = mergeGeometries(rimParts, false);

  const out = { parts: merged, tire, rim };
  geoCache.set(s.id, out);
  return out;
}

// ---------------------------------------------------------------------------
// LOD für entfernte Autos: Karosserie + Räder als ein Mesh mit Vertex-Farben,
// Leuchten separat (damit sie nachts weiter leuchten) → 3 statt ~18 Draw-Calls.

const FAR_COLORS = {
  glass: '#0f1318',
  black: '#151515',
  chrome: '#cfd2d6',
  interior: '#3b2c22',
  plate: '#ecece4',
  indicator: '#ff8a00',
  taxiSign: '#fff4c0',
  rubber: '#1a1a1a',
  rim: '#b9bdc2',
};
const farCache = new Map();
let farMat = null;

function withColor(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function farGeometry(spec, color) {
  const key = spec.id + color;
  if (farCache.has(key)) return farCache.get(key);
  const geo = buildGeometry(spec);
  const list = [];
  for (const [k, g] of Object.entries(geo.parts)) {
    if (k === 'head' || k === 'tail') continue;
    list.push(withColor(g.clone(), k === 'paint' ? color : FAR_COLORS[k] || '#888888'));
  }
  const tx = spec.W / 2 - 0.2;
  for (const [x, z] of [[tx, spec.axles[1]], [-tx, spec.axles[1]], [tx, spec.axles[0]], [-tx, spec.axles[0]]]) {
    list.push(withColor(geo.tire.clone().toNonIndexed().translate(x, spec.wr, z), FAR_COLORS.rubber));
    list.push(withColor(geo.rim.clone().translate(x, spec.wr, z), FAR_COLORS.rim));
  }
  for (const g of list) for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n);
  const merged = mergeGeometries(list, false);
  merged.computeBoundingSphere();
  farCache.set(key, merged);
  return merged;
}

// Erzeugt die Szenengruppe eines Autos
export function createCarMesh(spec, color) {
  const mats = carMaterials();
  const geo = buildGeometry(spec);
  const root = new THREE.Group();
  const near = new THREE.Group();
  const body = new THREE.Group();
  near.add(body);
  root.add(near);
  if (!farMat) farMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.35 });
  const far = new THREE.Group();
  const farBody = new THREE.Mesh(farGeometry(spec, color), farMat);
  farBody.castShadow = true;
  far.add(farBody);
  if (geo.parts.head) far.add(new THREE.Mesh(geo.parts.head, mats.head));
  if (geo.parts.tail) far.add(new THREE.Mesh(geo.parts.tail, mats.tail));
  far.visible = false;
  root.add(far);
  let tailMesh = null;
  let paintMesh = null;
  for (const [k, g] of Object.entries(geo.parts)) {
    const mat = k === 'paint' ? paint(color) : mats[k];
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = k === 'paint' || k === 'glass' || k === 'black';
    mesh.receiveShadow = k === 'paint';
    body.add(mesh);
    if (k === 'tail') tailMesh = mesh;
    if (k === 'paint') paintMesh = mesh;
  }
  const wheels = [];
  const [rz, fz] = spec.axles;
  const tx = spec.W / 2 - 0.2;
  for (const [x, z, front] of [
    [tx, fz, true],
    [-tx, fz, true],
    [tx, rz, false],
    [-tx, rz, false],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, spec.wr, z);
    const spin = new THREE.Group();
    const t = new THREE.Mesh(geo.tire, mats.rubber);
    t.castShadow = true;
    const r = new THREE.Mesh(geo.rim, mats.rim);
    spin.add(t, r);
    pivot.add(spin);
    near.add(pivot);
    wheels.push({ pivot, spin, front });
  }
  // Fahrer (nur bei offenen Autos sichtbar)
  let driver = null;
  if (spec.open) {
    driver = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), mats.skin);
    head.position.set(0.36, 1.33, -0.62);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.hair);
    hair.position.set(0.36, 1.36, -0.64);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.22, 4, 8), paint('#2e7fd6'));
    torso.position.set(0.36, 1.1, -0.66);
    driver.add(head, hair, torso);
    driver.visible = false;
    body.add(driver);
  }
  // Scheinwerferkegel auf der Straße (nachts)
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(6, 18).rotateX(-Math.PI / 2), mats.beam);
  beam.position.set(0, 0.06, spec.L / 2 + 9);
  beam.rotation.y = Math.PI;
  beam.renderOrder = 3;
  root.add(beam);
  return {
    root,
    body,
    wheels,
    tailMesh,
    paintMesh,
    driver,
    beam,
    isFar: false,
    setFar(f) {
      if (f === this.isFar) return;
      this.isFar = f;
      near.visible = !f;
      far.visible = f;
    },
    setFarColor(c) {
      farBody.geometry = farGeometry(spec, c);
    },
  };
}

export function modelById(id) {
  return MODELS.find((m) => m.id === id);
}

export const SPORT_MODELS = MODELS.filter((m) => m.cat === 'sport');
export const CIVIL_MODELS = MODELS.filter((m) => m.cat === 'civil');
