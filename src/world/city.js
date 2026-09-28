import * as THREE from 'three';
import { GeoBuilder, ChunkedBuilder, col } from './geo.js';
import * as L from './layout.js';
import * as TX from './textures.js';
import { Rng } from '../core/rng.js';
import { createPalms, createStreetLights, createTrafficLights } from './props.js';

const FT = TX.FACADE_TILE;
const FLOOR = FT.h / 8; // 3.5 m

const PALETTE = {
  glass: ['#8fb4d6', '#7cc3bd', '#c3ccd4', '#d0ab82', '#98abe0', '#6d95c4', '#a9d8e6'],
  office: ['#efe7d6', '#ddd6cc', '#d2c1a8', '#f4f0e8', '#c5c0b8', '#e8d9c4'],
  residential: ['#f4e5cf', '#eed2c2', '#f8f2e4', '#dde8e4', '#f3dcb9', '#f5cfc6', '#e6e0f0'],
  deco: ['#ffc4d6', '#b4f0e6', '#fff0b0', '#c9dcff', '#e4ccff', '#ffd6aa', '#ffffff', '#c8f5c8'],
};
const DECO_ACCENT = ['#ff6fa8', '#2fc9c9', '#ffffff', '#ffb347', '#8a6cff', '#3fa0ff'];
const NEON = ['#ff2d95', '#22e6ff', '#b44dff', '#ff7a1a', '#39ff88', '#ffe14d'];
const CROWN = ['#22e6ff', '#ff2d95', '#b44dff', '#3f7bff', '#39ff88'];

const DISTRICTS = {
  downtown: { lot: [36, 52], h: [55, 170], facades: ['glass', 'glass', 'glass', 'office'], margin: [2, 5], park: 0.04, parking: 0.05 },
  uptown: { lot: [32, 46], h: [28, 105], facades: ['glass', 'office', 'office', 'residential'], margin: [2, 5], park: 0.08, parking: 0.08 },
  midrise: { lot: [28, 40], h: [12, 45], facades: ['office', 'residential', 'residential'], margin: [2, 5], park: 0.1, parking: 0.12 },
  suburb: { lot: [22, 32], h: [7, 17], facades: ['residential'], margin: [3, 6], park: 0.12, parking: 0.1 },
  deco: { lot: [20, 30], h: [10, 22], facades: ['deco'], margin: [1, 2.5], park: 0.03, parking: 0.04 },
};

export function createMaterials() {
  const m = {};
  const asphalt = TX.asphaltTexture();
  m.asphalt = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9, color: 0xd8d8d8 });
  m.concrete = new THREE.MeshStandardMaterial({ map: TX.concreteTexture(), roughness: 0.88, vertexColors: true });
  m.grass = new THREE.MeshStandardMaterial({ map: TX.grassTexture(), roughness: 0.97, vertexColors: true });
  m.sand = new THREE.MeshStandardMaterial({ map: TX.sandTexture(), roughness: 0.96, vertexColors: true });
  m.roof = new THREE.MeshStandardMaterial({ map: TX.roofTexture(), roughness: 0.9, vertexColors: true });
  m.plain = new THREE.MeshStandardMaterial({ roughness: 0.7, vertexColors: true });
  m.lot = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9, vertexColors: true });
  for (const [k, fn, metal] of [
    ['glass', TX.glassFacade, 1],
    ['office', TX.officeFacade, 0.8],
    ['residential', TX.residentialFacade, 0.5],
    ['deco', TX.decoFacade, 0.5],
  ]) {
    const f = fn();
    m[k] = new THREE.MeshStandardMaterial({
      map: f.map,
      emissiveMap: f.emissive,
      emissive: 0xffffff,
      emissiveIntensity: 0,
      roughnessMap: f.rough,
      metalnessMap: f.rough,
      roughness: 1,
      metalness: metal,
      vertexColors: true,
    });
  }
  m.markings = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.65,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  m.neon = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff });
  m.signs = new THREE.MeshBasicMaterial({ map: TX.signAtlas(), color: 0xffffff });
  return m;
}

// Viereck, dessen Normale nach oben zeigt (Reihenfolge wird bei Bedarf gedreht)
function quadUp(b, p0, p1, p2, p3, color, tile = 1) {
  const ax = p1[0] - p0[0];
  const az = p1[2] - p0[2];
  const bx = p2[0] - p0[0];
  const bz = p2[2] - p0[2];
  const ny = az * bx - ax * bz;
  const pts = ny >= 0 ? [p0, p1, p2, p3] : [p3, p2, p1, p0];
  const uvs = [];
  for (const p of pts) uvs.push(p[0] / tile, -p[2] / tile);
  b.quad(pts[0], pts[1], pts[2], pts[3], [0, 1, 0], uvs, color);
}

// Beliebiges Viereck mit berechneter Normale (Reihenfolge gegen den Uhrzeigersinn von außen)
function quadN(b, a, c1, c2, d, color, uvs = [0, 0, 1, 0, 1, 1, 0, 1]) {
  const v1 = new THREE.Vector3(c1[0] - a[0], c1[1] - a[1], c1[2] - a[2]);
  const v2 = new THREE.Vector3(c2[0] - a[0], c2[1] - a[1], c2[2] - a[2]);
  const n = v1.cross(v2).normalize();
  b.quad(a, c1, c2, d, [n.x, n.y, n.z], uvs, color);
}

export function buildCity({ scene, collision, quality, uniforms }) {
  const rng = new Rng(1986);
  const materials = createMaterials();
  const cb = new ChunkedBuilder(250);
  const palms = [];
  const lamps = [];
  const parking = [];
  const showroom = [];
  const footprints = [];
  const aviation = [];
  const white = col('#ffffff');
  const root = new THREE.Group();
  root.name = 'city';

  // ---------------------------------------------------------------- Boden
  const ground = new GeoBuilder();
  const walls = new GeoBuilder();
  const seawall = col('#9c968a');
  for (const land of [L.MAINLAND, L.ISLAND]) {
    ground.top(land.x0, land.z0, land.x1, land.z1, 0, white, 10);
    walls.walls(land.x0, land.z0, land.x1, land.z1, L.WATER_FLOOR, 0, seawall, 4, 4);
  }
  const groundMesh = new THREE.Mesh(ground.build(), materials.asphalt);
  groundMesh.receiveShadow = true;
  const wallMesh = new THREE.Mesh(walls.build(), materials.concrete);
  root.add(groundMesh, wallMesh);

  const graph = L.buildRoadGraph();

  // ---------------------------------------------------------------- Blöcke
  const blocks = L.buildBlocks();
  for (const b of blocks) buildBlock(b);

  function slab(b, x0, z0, x1, z1, mat, color, tile, y0 = 0, y1 = L.CURB) {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const g = cb.get(mat, cx, cz);
    g.walls(x0, z0, x1, z1, y0, y1, color, tile, tile);
    g.top(x0, z0, x1, z1, y1, color, tile);
  }

  function buildBlock(b) {
    const sidewalk = col(b.type === 'deco' || b.type === 'beachpark' ? '#e9dccb' : '#d6d0c6');
    if (b.type === 'beachpark') return buildBeachPark(b);
    slab(b, b.x0, b.z0, b.x1, b.z1, 'concrete', sidewalk, 6);
    if (b.type === 'bayfront') return buildBayfront(b);

    const D = DISTRICTS[b.type];
    const inset = 4.5;
    const inner = { x0: b.x0 + inset, x1: b.x1 - inset, z0: b.z0 + inset, z1: b.z1 - inset };
    const w = inner.x1 - inner.x0;
    const d = inner.z1 - inner.z0;
    if (w < 8 || d < 8) return;
    addStreetLightsAround(b);

    if (rng.chance(D.park) && w > 40 && d > 40) return buildPark(inner);

    const nx = Math.max(1, Math.round(w / rng.float(D.lot[0], D.lot[1])));
    const nz = Math.max(1, Math.round(d / rng.float(D.lot[0], D.lot[1])));
    const lw = w / nx;
    const ld = d / nz;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const lot = { x0: inner.x0 + i * lw, x1: inner.x0 + (i + 1) * lw, z0: inner.z0 + j * ld, z1: inner.z0 + (j + 1) * ld };
        const touches = { w: i === 0, e: i === nx - 1, n: j === 0, s: j === nz - 1 };
        if (rng.chance(D.parking) && lw > 18 && ld > 18) {
          buildParkingLot(lot);
          continue;
        }
        if (b.type === 'deco') buildDeco(lot, touches, b);
        else buildTower(lot, D, b.type);
      }
    }
  }

  // ---------------------------------------------------------------- Gebäude
  function buildTower(lot, D, district) {
    const m = rng.float(D.margin[0], D.margin[1]);
    const x0 = lot.x0 + m;
    const x1 = lot.x1 - m;
    const z0 = lot.z0 + m;
    const z1 = lot.z1 - m;
    if (x1 - x0 < 6 || z1 - z0 < 6) return;
    const facade = rng.pick(D.facades);
    const color = col(rng.pick(PALETTE[facade]));
    let h = rng.float(D.h[0], D.h[1]);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    if (district === 'downtown') {
      h += THREE.MathUtils.clamp((cx + 50) / 150, 0, 1) * 50; // Skyline steigt zur Bucht hin an
      if (rng.chance(0.08)) h = rng.float(200, 250);
    }
    if (facade === 'residential') h = Math.min(h, 60);
    h = Math.max(FLOOR * 2, Math.round(h / FLOOR) * FLOOR);
    const uOff = rng.int(0, 7) / 8;
    const vOff = rng.int(0, 7) / 8;
    collision.add({ x0, x1, z0, z1, h });
    footprints.push({ x0, x1, z0, z1, h, kind: facade });

    // Rücksprünge (Setbacks) für höhere Türme
    const tiers = h > 60 && rng.chance(0.65) ? rng.int(2, 3) : 1;
    let bx0 = x0;
    let bx1 = x1;
    let bz0 = z0;
    let bz1 = z1;
    let y = 0;
    const g = cb.get(facade, cx, cz);
    const roof = cb.get('roof', cx, cz);
    const plain = cb.get('plain', cx, cz);
    for (let t = 0; t < tiers; t++) {
      const top = t === tiers - 1 ? h : Math.round((y + (h - y) * rng.float(0.45, 0.7)) / FLOOR) * FLOOR;
      g.walls(bx0, bz0, bx1, bz1, y, top, color, FT.w, FT.h, uOff, vOff);
      roof.top(bx0, bz0, bx1, bz1, top, col('#8a8680'), 12);
      // Brüstung
      const pc = col('#b8b3aa');
      const pt = 0.35;
      plain.box(bx0, top, bz0, bx1, top + 0.9, bz0 + pt, pc);
      plain.box(bx0, top, bz1 - pt, bx1, top + 0.9, bz1, pc);
      plain.box(bx0, top, bz0, bx0 + pt, top + 0.9, bz1, pc);
      plain.box(bx1 - pt, top, bz0, bx1, top + 0.9, bz1, pc);
      y = top;
      const ins = Math.min((bx1 - bx0) * 0.18, (bz1 - bz0) * 0.18, rng.float(2, 5));
      bx0 += ins;
      bx1 -= ins;
      bz0 += ins;
      bz1 -= ins;
    }
    // Dachaufbauten
    const n = rng.int(1, 3);
    const rx0 = bx0 - 0;
    for (let k = 0; k < n; k++) {
      const sx = rng.float(2, 5);
      const sz = rng.float(2, 5);
      const px = rng.float(rx0 + 1, Math.max(rx0 + 1.1, bx1 - sx - 1));
      const pz = rng.float(bz0 + 1, Math.max(bz0 + 1.1, bz1 - sz - 1));
      plain.box(px, h, pz, px + sx, h + rng.float(1.5, 3.5), pz + sz, col('#9aa0a4'));
    }
    // LED-Krone (typisch für die Skyline von Miami)
    if (h > 75 && rng.chance(0.6)) {
      const neon = cb.get('neon', cx, cz);
      const c = col(rng.pick(CROWN));
      const yy = h - 1.2;
      const e = 0.12;
      neon.box(bx0 - e - 0.05, yy, bz0 - e - 0.05, bx1 + e, yy + 0.35, bz0 - 0.05, c);
      neon.box(bx0 - e - 0.05, yy, bz1 + 0.05, bx1 + e, yy + 0.35, bz1 + e + 0.05, c);
      neon.box(bx0 - e - 0.05, yy, bz0, bx0 - 0.05, yy + 0.35, bz1, c);
      neon.box(bx1 + 0.05, yy, bz0, bx1 + e + 0.05, yy + 0.35, bz1, c);
      // Senkrechte Lichtkanten
      if (rng.chance(0.5)) {
        for (const [px, pz] of [[bx0, bz0], [bx1, bz0], [bx0, bz1], [bx1, bz1]]) {
          neon.box(px - 0.15, y * 0.55, pz - 0.15, px + 0.15, h, pz + 0.15, c);
        }
      }
    }
    if (h > 110) {
      aviation.push(new THREE.Vector3(cx, h + 4.2, cz));
      plain.box(cx - 0.15, h, cz - 0.15, cx + 0.15, h + 4, cz + 0.15, col('#c0c0c0'));
    }
  }

  function faceOf(lot, touches, block) {
    // Bevorzugt die Seite zum Ocean Drive, sonst eine beliebige Straßenseite
    const opts = [];
    if (touches.e) opts.push('e');
    if (touches.w) opts.push('w');
    if (touches.n) opts.push('n');
    if (touches.s) opts.push('s');
    if (touches.e && block.x1 > 570) return 'e';
    return opts.length ? rng.pick(opts) : 'e';
  }

  // Box relativ zur Frontfassade: u entlang der Fassade (absolut), d = Abstand nach außen
  function frontBox(g, f, u0, u1, y0, y1, d0, d1, color) {
    if (f.axis === 'x') {
      const a = f.coord + f.sign * d0;
      const c = f.coord + f.sign * d1;
      g.box(Math.min(a, c), y0, u0, Math.max(a, c), y1, u1, color);
    } else {
      const a = f.coord + f.sign * d0;
      const c = f.coord + f.sign * d1;
      g.box(u0, y0, Math.min(a, c), u1, y1, Math.max(a, c), color);
    }
  }
  function frontQuad(g, f, u0, u1, y0, y1, d, uv, color) {
    const X = f.coord + f.sign * d;
    const [ua, ub, va, vb] = uv;
    const uvs = [ua, va, ub, va, ub, vb, ua, vb];
    if (f.axis === 'x' && f.sign > 0) g.quad([X, y0, u1], [X, y0, u0], [X, y1, u0], [X, y1, u1], [1, 0, 0], uvs, color);
    else if (f.axis === 'x') g.quad([X, y0, u0], [X, y0, u1], [X, y1, u1], [X, y1, u0], [-1, 0, 0], uvs, color);
    else if (f.sign > 0) g.quad([u0, y0, X], [u1, y0, X], [u1, y1, X], [u0, y1, X], [0, 0, 1], uvs, color);
    else g.quad([u1, y0, X], [u0, y0, X], [u0, y1, X], [u1, y1, X], [0, 0, -1], uvs, color);
  }

  function buildDeco(lot, touches, block) {
    const m = rng.float(0.5, 2);
    const x0 = lot.x0 + m;
    const x1 = lot.x1 - m;
    const z0 = lot.z0 + m;
    const z1 = lot.z1 - m;
    if (x1 - x0 < 8 || z1 - z0 < 8) return;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const floors = rng.int(3, 6);
    const h = floors * FLOOR + 1.2;
    const color = col(rng.pick(PALETTE.deco));
    const accent = col(rng.pick(DECO_ACCENT));
    const neonC = col(rng.pick(NEON));
    const facing = faceOf(lot, touches, block);
    const face =
      facing === 'e'
        ? { axis: 'x', sign: 1, coord: x1, u0: z0, u1: z1 }
        : facing === 'w'
          ? { axis: 'x', sign: -1, coord: x0, u0: z0, u1: z1 }
          : facing === 's'
            ? { axis: 'z', sign: 1, coord: z1, u0: x0, u1: x1 }
            : { axis: 'z', sign: -1, coord: z0, u0: x0, u1: x1 };
    const fw = face.u1 - face.u0;
    const um = (face.u0 + face.u1) / 2;

    collision.add({ x0, x1, z0, z1, h: h + 5 });
    footprints.push({ x0, x1, z0, z1, h, kind: 'deco' });

    const g = cb.get('deco', cx, cz);
    const plain = cb.get('plain', cx, cz);
    const roof = cb.get('roof', cx, cz);
    const neon = cb.get('neon', cx, cz);
    g.walls(x0, z0, x1, z1, 0, h, color, FT.w, FT.h, rng.int(0, 7) / 8, 0);
    roof.top(x0, z0, x1, z1, h, col('#b5aca0'), 12);
    // Weiße Attika mit Stufenkrone in der Mitte der Front
    const pc = col('#fbf8f2');
    plain.box(x0, h, z0, x1, h + 1.0, z0 + 0.4, pc);
    plain.box(x0, h, z1 - 0.4, x1, h + 1.0, z1, pc);
    plain.box(x0, h, z0, x0 + 0.4, h + 1.0, z1, pc);
    plain.box(x1 - 0.4, h, z0, x1, h + 1.0, z1, pc);
    const cw = Math.min(fw * 0.45, 12);
    frontBox(plain, face, um - cw / 2, um + cw / 2, h, h + 2.4, -2.5, 0.3, pc);
    frontBox(plain, face, um - cw / 4, um + cw / 4, h + 2.4, h + 4.2, -1.8, 0.3, accent);

    // Vordächer ("Eyebrows") je Etage
    for (let f = 1; f <= floors; f++) {
      const y = f * FLOOR - 0.45;
      frontBox(plain, face, face.u0 + 0.6, face.u1 - 0.6, y, y + 0.16, 0, 0.8, pc);
    }
    // Senkrechte Finne mit Neonkanten
    if (fw > 11) {
      const fu = rng.chance(0.5) ? um : face.u0 + fw * rng.float(0.2, 0.3);
      frontBox(plain, face, fu - 1.1, fu + 1.1, 0, h + 5.5, 0, 1.4, accent);
      frontBox(neon, face, fu - 1.25, fu - 1.1, 3.5, h + 5.5, 1.3, 1.45, neonC);
      frontBox(neon, face, fu + 1.1, fu + 1.25, 3.5, h + 5.5, 1.3, 1.45, neonC);
      // Leuchtschild mit Hotelnamen
      if (rng.chance(block.x1 > 570 ? 0.85 : 0.35)) {
        const s = rng.int(0, TX.SIGN_NAMES.length - 1);
        const signs = cb.get('signs', cx, cz);
        const sh = Math.min(h * 0.75, 12);
        frontQuad(signs, face, fu - 0.95, fu + 0.95, h + 5 - sh, h + 5, 1.46, [s / 8, (s + 1) / 8, 0, 1], white);
      }
    }
    // Neonband über dem Erdgeschoss und an der Dachkante
    frontBox(neon, face, face.u0 + 0.3, face.u1 - 0.3, 3.3, 3.45, 0.8, 0.95, neonC);
    frontBox(neon, face, face.u0, face.u1, h + 0.95, h + 1.1, 0.3, 0.45, neonC);
    // Markise über dem Eingang
    frontBox(plain, face, um - 3, um + 3, 2.8, 3.0, 0, 2.2, accent);

    // Palmen vor der Front
    if (rng.chance(0.4)) {
      const d = 3.2;
      for (const u of [face.u0 + 2, face.u1 - 2]) {
        const px = face.axis === 'x' ? face.coord + face.sign * d : u;
        const pz = face.axis === 'x' ? u : face.coord + face.sign * d;
        addPalm(px, pz);
      }
    }
  }

  // ---------------------------------------------------------------- Parks, Parkplätze
  function buildPark(r) {
    const g = cb.get('grass', (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
    g.top(r.x0, r.z0, r.x1, r.z1, L.CURB + 0.03, col('#ffffff'), 8);
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    // Wege als Kreuz
    const c = cb.get('concrete', (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
    const mx = (r.x0 + r.x1) / 2;
    const mz = (r.z0 + r.z1) / 2;
    c.top(mx - 2, r.z0, mx + 2, r.z1, L.CURB + 0.05, col('#e6dccb'), 6);
    c.top(r.x0, mz - 2, r.x1, mz + 2, L.CURB + 0.05, col('#e6dccb'), 6);
    const n = Math.floor((w * d) / 750);
    for (let i = 0; i < n; i++) {
      const x = rng.float(r.x0 + 3, r.x1 - 3);
      const z = rng.float(r.z0 + 3, r.z1 - 3);
      if (Math.abs(x - mx) < 4 || Math.abs(z - mz) < 4) continue;
      addPalm(x, z);
    }
    // Brunnen in der Mitte
    const p = cb.get('plain', mx, mz);
    p.box(mx - 4, L.CURB, mz - 4, mx + 4, L.CURB + 0.7, mz + 4, col('#d9d2c4'));
    p.top(mx - 3.5, mz - 3.5, mx + 3.5, mz + 3.5, L.CURB + 0.72, col('#3aa7b8'));
    collision.add({ x0: mx - 4, x1: mx + 4, z0: mz - 4, z1: mz + 4, h: 1 });
  }

  function buildParkingLot(r) {
    const g = cb.get('lot', (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
    g.top(r.x0 + 1, r.z0 + 1, r.x1 - 1, r.z1 - 1, L.CURB + 0.02, col('#b0b0b0'), 10);
    const mk = cb.get('markings', (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
    const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
    const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
    const n = Math.floor((len - 4) / 3.2);
    const y = L.CURB + 0.04;
    for (let i = 0; i <= n; i++) {
      const s = (alongX ? r.x0 : r.z0) + 2 + i * 3.2;
      if (alongX) {
        mk.top(s - 0.06, r.z0 + 2, s + 0.06, r.z0 + 7.5, y, col('#e8e8e8'));
        mk.top(s - 0.06, r.z1 - 7.5, s + 0.06, r.z1 - 2, y, col('#e8e8e8'));
      } else {
        mk.top(r.x0 + 2, s - 0.06, r.x0 + 7.5, s + 0.06, y, col('#e8e8e8'));
        mk.top(r.x1 - 7.5, s - 0.06, r.x1 - 2, s + 0.06, y, col('#e8e8e8'));
      }
      if (i < n) {
        const m = s + 1.6;
        if (alongX) {
          parking.push({ x: m, z: r.z0 + 4.8, heading: Math.PI });
          parking.push({ x: m, z: r.z1 - 4.8, heading: 0 });
        } else {
          parking.push({ x: r.x0 + 4.8, z: m, heading: -Math.PI / 2 });
          parking.push({ x: r.x1 - 4.8, z: m, heading: Math.PI / 2 });
        }
      }
    }
  }

  function buildBayfront(b) {
    const g = cb.get('grass', (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const east = b.x0 < 200; // Festland: Wasser im Osten, Insel: Wasser im Westen
    const promW = 6;
    const gx0 = east ? b.x0 + 3 : b.x0 + promW;
    const gx1 = east ? b.x1 - promW : b.x1 - 3;
    g.top(gx0, b.z0 + 3, gx1, b.z1 - 3, L.CURB + 0.03, white, 8);
    // Promenade mit Geländer
    const p = cb.get('plain', (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const rx = east ? b.x1 - 0.3 : b.x0 + 0.3;
    for (let z = b.z0; z < b.z1 - 0.1; z += 60) {
      const z1 = Math.min(b.z1, z + 60);
      p.box(rx - 0.08, L.CURB + 0.9, z, rx + 0.08, L.CURB + 1.05, z1, col('#e8e8e8'));
    }
    for (let z = b.z0 + 1; z < b.z1; z += 3) p.box(rx - 0.05, L.CURB, z - 0.05, rx + 0.05, L.CURB + 0.95, z + 0.05, col('#e8e8e8'));
    // Palmenreihen
    for (let z = b.z0 + 6; z < b.z1 - 4; z += rng.float(13, 19)) {
      addPalm(east ? gx1 - 2 : gx0 + 2, z + rng.float(-1, 1));
      if (gx1 - gx0 > 16 && rng.chance(0.3)) addPalm(rng.float(gx0 + 3, gx1 - 5), z + rng.float(-4, 4));
    }
    for (let z = b.z0 + 15; z < b.z1; z += 45) {
      lamps.push({ x: east ? gx1 + 1 : gx0 - 1, z, rot: east ? Math.PI / 2 : -Math.PI / 2, groundY: L.CURB });
    }
  }

  function buildBeachPark(b) {
    const cz = 0;
    // Gehweg an Ocean Drive, Rasen mit Palmen, Promenade, Sandstrand
    for (let z0 = b.z0; z0 < b.z1; z0 += 200) {
      const z1 = Math.min(b.z1, z0 + 200);
      slab(b, b.x0, z0, 592, z1, 'concrete', col('#eadfcd'), 6);
      slab(b, 592, z0, 628, z1, 'grass', white, 8);
      slab(b, 628, z0, 636, z1, 'concrete', col('#f2e6d2'), 6);
      slab(b, 636, z0, L.ISLAND.x1, z1, 'sand', white, 10);
    }
    // Sandstrand fällt ins Meer ab
    const sand = cb.get('sand', 720, cz);
    for (let z0 = b.z0; z0 < b.z1; z0 += 100) {
      const z1 = z0 + 100;
      quadN(sand, [L.ISLAND.x1, L.CURB, z1], [L.ISLAND.x1 + 60, -3.5, z1], [L.ISLAND.x1 + 60, -3.5, z0], [L.ISLAND.x1, L.CURB, z0], white, [
        L.ISLAND.x1 / 10, -z1 / 10, (L.ISLAND.x1 + 60) / 10, -z1 / 10, (L.ISLAND.x1 + 60) / 10, -z0 / 10, L.ISLAND.x1 / 10, -z0 / 10,
      ]);
    }
    // Showroom-Platz: hier startet das Spiel, mit einer Reihe Sportwagen
    const sx0 = 594;
    const sx1 = 626;
    const sz0 = -150;
    const sz1 = -64;
    const plaza = cb.get('concrete', 610, -100);
    plaza.top(sx0, sz0, sx1, sz1, L.CURB + 0.06, col('#f6efe4'), 6);
    const mk = cb.get('markings', 610, -100);
    for (let i = 0; i <= 5; i++) {
      const z = sz0 + 8 + i * 14;
      mk.top(sx0 + 3, z - 0.07, sx1 - 8, z + 0.07, L.CURB + 0.08, col('#ff5fa2'));
      if (i < 5) showroom.push({ x: sx0 + 10, z: z + 7, heading: -Math.PI / 2 });
    }
    // Palmen im Park
    for (let z = b.z0 + 5; z < b.z1 - 5; z += rng.float(11, 17)) {
      if (z > sz0 - 3 && z < sz1 + 3) continue;
      addPalm(rng.float(596, 624), z);
      if (rng.chance(0.35)) addPalm(rng.float(596, 624), z + rng.float(-3, 3));
    }
    for (let z = b.z0 + 8; z < b.z1; z += rng.float(14, 22)) addPalm(rng.float(640, 660), z);
    for (let z = b.z0 + 20; z < b.z1; z += 40) lamps.push({ x: 591, z, rot: -Math.PI / 2, groundY: 0 });
    // Rettungsschwimmer-Türme (pastellfarben, auf Stelzen)
    const plain = cb.get('plain', 680, 0);
    const towerColors = ['#ff9ec4', '#7fe0d6', '#ffe27a', '#b99cff', '#ff8a5c', '#8fd3ff'];
    for (let i = 0, z = -560; z < 600; z += 220, i++) {
      const x = 682;
      const p = cb.get('plain', x, z);
      for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
        p.box(x + ox - 0.1, L.CURB, z + oz - 0.1, x + ox + 0.1, L.CURB + 2.4, z + oz + 0.1, col('#e8e2d6'));
      }
      p.box(x - 1.8, L.CURB + 2.4, z - 1.8, x + 1.8, L.CURB + 2.6, z + 1.8, col('#f0ece0'));
      p.box(x - 1.5, L.CURB + 2.6, z - 1.5, x + 1.5, L.CURB + 4.6, z + 1.5, col(towerColors[i % towerColors.length]));
      p.box(x - 1.9, L.CURB + 4.6, z - 1.9, x + 1.9, L.CURB + 4.9, z + 1.9, col('#ffffff'));
      p.box(x + 1.5, L.CURB + 3.4, z - 1.0, x + 1.55, L.CURB + 4.2, z + 1.0, col('#2b3e50'));
      p.box(x - 3.6, 0.4, z - 0.5, x - 1.5, L.CURB + 2.5, z + 0.5, col('#e8e2d6'));
      collision.add({ x0: x - 1.9, x1: x + 1.9, z0: z - 1.9, z1: z + 1.9, h: 5 });
    }
    // Sonnenschirme
    const umb = ['#ff4f81', '#ffffff', '#2fd2c4', '#ffd23f', '#6c7bff'];
    const cone = new THREE.ConeGeometry(1.4, 0.5, 10, 1, true);
    const stick = new THREE.CylinderGeometry(0.03, 0.03, 2.3, 5);
    const mat = new THREE.Matrix4();
    for (let z = b.z0 + 30; z < b.z1 - 30; z += rng.float(9, 20)) {
      const x = rng.float(652, 700);
      const p = cb.get('plain', x, z);
      mat.makeTranslation(x, L.CURB + 2.25, z);
      p.addGeometry(cone, mat, col(rng.pick(umb)));
      mat.makeTranslation(x, L.CURB + 1.15, z);
      p.addGeometry(stick, mat, col('#dddddd'));
    }
    void plain;
  }

  function addPalm(x, z) {
    palms.push({ x, z });
    collision.add({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, h: 9, pole: true });
  }

  // Laternen entlang der Blockränder, Arm Richtung Straße
  function addStreetLightsAround(b) {
    const step = 38;
    const inset = 1.0;
    if (b.edges.w) for (let z = b.z0 + 10; z < b.z1 - 8; z += step) lamps.push({ x: b.x0 + inset, z, rot: -Math.PI / 2 });
    if (b.edges.e) for (let z = b.z0 + 29; z < b.z1 - 8; z += step) lamps.push({ x: b.x1 - inset, z, rot: Math.PI / 2 });
    if (b.edges.n) for (let x = b.x0 + 29; x < b.x1 - 8; x += step) lamps.push({ x, z: b.z0 + inset, rot: Math.PI });
    if (b.edges.s) for (let x = b.x0 + 10; x < b.x1 - 8; x += step) lamps.push({ x, z: b.z1 - inset, rot: 0 });
  }

  // ---------------------------------------------------------------- Markierungen
  buildMarkings();
  function buildMarkings() {
    const Y = col('#e8b923');
    const W = col('#eeeeee');
    const done = new Set();
    for (const e of graph.edges) {
      if (done.has(e.reverse.id)) continue;
      done.add(e.id);
      const A = e.from;
      const B = e.to;
      const hA = e.axis === 'ew' ? A.hx : A.hz;
      const hB = e.axis === 'ew' ? B.hx : B.hz;
      const sx = A.x + e.dir.x * hA;
      const sz = A.z + e.dir.z * hA;
      const len = Math.hypot(B.x - A.x, B.z - A.z) - hA - hB;
      const mid = { x: sx + e.dir.x * len * 0.5, z: sz + e.dir.z * len * 0.5 };
      const mk = cb.get('markings', mid.x, mid.z);
      const t = e.type;
      const hw = t.width / 2;
      const edgeOff = t.lanes[t.lanes.length - 1] + 1.9;
      const bridge = e.bridge;
      const yAt = (x) => (bridge ? L.bridgeProfile(bridge, x) + 0.05 : 0.02);
      const stripe = (off, w, c, s0, s1) => {
        const segLen = bridge ? 4 : s1 - s0;
        for (let s = s0; s < s1 - 0.01; s += segLen) {
          const s2 = Math.min(s1, s + segLen);
          const p = (ss, oo) => {
            const x = sx + e.dir.x * ss + e.right.x * oo;
            const z = sz + e.dir.z * ss + e.right.z * oo;
            return [x, yAt(x), z];
          };
          quadUp(mk, p(s, off - w / 2), p(s2, off - w / 2), p(s2, off + w / 2), p(s, off + w / 2), c);
        }
      };
      const dashed = (off, w, c, s0, s1) => {
        for (let s = s0; s < s1 - 3; s += 9) stripe(off, w, c, s, s + 3);
      };
      const cw = 7; // Freiraum für Zebrastreifen + Haltelinie an beiden Enden
      stripe(-0.16, 0.11, Y, cw, len - cw);
      stripe(0.16, 0.11, Y, cw, len - cw);
      stripe(-edgeOff, 0.14, W, 0, len);
      stripe(edgeOff, 0.14, W, 0, len);
      if (t.lanes.length > 1) {
        const lo = (t.lanes[0] + t.lanes[1]) / 2;
        dashed(lo, 0.13, W, cw, len - cw);
        dashed(-lo, 0.13, W, cw, len - cw);
      }
      // Haltelinien (rechte Seite in Fahrtrichtung) und Zebrastreifen
      if (B.lights) {
        stripeAcross(mk, e, sx, sz, len - 6.6, 0.45, 0.3, edgeOff, W, yAt);
        zebra(mk, e, sx, sz, len - 5.6, len - 2.6, hw, W, yAt);
      }
      if (A.lights) {
        stripeAcross(mk, e, sx, sz, 6.6, 0.45, -edgeOff, -0.3, W, yAt);
        zebra(mk, e, sx, sz, 2.6, 5.6, hw, W, yAt);
      }
    }
  }
  function stripeAcross(mk, e, sx, sz, s, w, o0, o1, c, yAt) {
    const p = (ss, oo) => {
      const x = sx + e.dir.x * ss + e.right.x * oo;
      const z = sz + e.dir.z * ss + e.right.z * oo;
      return [x, yAt(x), z];
    };
    quadUp(mk, p(s - w / 2, o0), p(s + w / 2, o0), p(s + w / 2, o1), p(s - w / 2, o1), c);
  }
  function zebra(mk, e, sx, sz, s0, s1, hw, c, yAt) {
    for (let o = -hw + 0.8; o < hw - 0.6; o += 1.1) {
      const p = (ss, oo) => {
        const x = sx + e.dir.x * ss + e.right.x * oo;
        const z = sz + e.dir.z * ss + e.right.z * oo;
        return [x, yAt(x), z];
      };
      quadUp(mk, p(s0, o), p(s1, o), p(s1, o + 0.55), p(s0, o + 0.55), c);
    }
  }

  // ---------------------------------------------------------------- Brücken
  const bridgeConcrete = materials.concrete.clone();
  bridgeConcrete.side = THREE.DoubleSide;
  const bridgeAsphalt = materials.asphalt.clone();
  bridgeAsphalt.side = THREE.DoubleSide;
  for (const b of L.BRIDGES) buildBridge(b);
  function buildBridge(b) {
    const deck = new GeoBuilder();
    const conc = new GeoBuilder();
    const hw = b.type.width / 2;
    const H = L.BRIDGE_HALF;
    const x0 = b.x0 + 7;
    const x1 = b.x1 - 6;
    const cc = col('#d8d3ca');
    const side = col('#bdb6aa');
    const step = 3;
    for (let x = x0; x < x1 - 0.01; x += step) {
      const xa = x;
      const xb = Math.min(x1, x + step);
      const ya = L.bridgeProfile(b, xa);
      const yb = L.bridgeProfile(b, xb);
      const land = (xx) => xx < L.MAINLAND.x1 || xx > L.ISLAND.x0;
      // Fahrbahn
      quadUp(deck, [xa, ya + 0.03, b.z - hw], [xb, yb + 0.03, b.z - hw], [xb, yb + 0.03, b.z + hw], [xa, ya + 0.03, b.z + hw], white, 10);
      for (const s of [-1, 1]) {
        const zi = b.z + s * hw;
        const zo = b.z + s * H;
        const zp = b.z + s * (H + 0.6);
        // Gehweg (erhöht)
        quadUp(conc, [xa, ya + 0.22, zi], [xb, yb + 0.22, zi], [xb, yb + 0.22, zo], [xa, ya + 0.22, zo], cc, 6);
        // Bordsteinkante
        const n1 = s < 0 ? [xa, ya + 0.03, zi] : [xb, yb + 0.03, zi];
        const n2 = s < 0 ? [xb, yb + 0.03, zi] : [xa, ya + 0.03, zi];
        const n3 = s < 0 ? [xb, yb + 0.22, zi] : [xa, ya + 0.22, zi];
        const n4 = s < 0 ? [xa, ya + 0.22, zi] : [xb, yb + 0.22, zi];
        quadN(conc, n1, n2, n3, n4, side);
        // Brüstung
        quadUp(conc, [xa, ya + 1.25, zo], [xb, yb + 1.25, zo], [xb, yb + 1.25, zp], [xa, ya + 1.25, zp], cc, 6);
        if (s < 0) quadN(conc, [xb, yb + 0.22, zo], [xa, ya + 0.22, zo], [xa, ya + 1.25, zo], [xb, yb + 1.25, zo], side);
        else quadN(conc, [xa, ya + 0.22, zo], [xb, yb + 0.22, zo], [xb, yb + 1.25, zo], [xa, ya + 1.25, zo], side);
        // Außenseite bis zur Unterkante (auf Land bis zum Boden)
        const ba = land(xa) ? -0.5 : ya - 1.4;
        const bb = land(xb) ? -0.5 : yb - 1.4;
        if (s < 0) quadN(conc, [xa, ba, zp], [xb, bb, zp], [xb, yb + 1.25, zp], [xa, ya + 1.25, zp], side);
        else quadN(conc, [xb, bb, zp], [xa, ba, zp], [xa, ya + 1.25, zp], [xb, yb + 1.25, zp], side);
      }
      // Unterseite
      if (!land(xa)) {
        const za = b.z - H - 0.6;
        const zb = b.z + H + 0.6;
        quadN(conc, [xa, ya - 1.4, za], [xa, ya - 1.4, zb], [xb, yb - 1.4, zb], [xb, yb - 1.4, za], side);
      }
    }
    // Pfeiler
    for (let x = L.MAINLAND.x1 + 12; x < L.ISLAND.x0 - 8; x += 26) {
      const y = L.bridgeProfile(b, x) - 1.3;
      for (const s of [-1, 1]) conc.box(x - 1.2, L.WATER_FLOOR, b.z + s * 4.5 - 1.2, x + 1.2, y, b.z + s * 4.5 + 1.2, side, 4);
      conc.box(x - 1.4, y - 1.2, b.z - 7, x + 1.4, y, b.z + 7, side, 4);
    }
    const dm = new THREE.Mesh(deck.build(), bridgeAsphalt);
    dm.receiveShadow = true;
    const cm = new THREE.Mesh(conc.build(), bridgeConcrete);
    cm.receiveShadow = true;
    cm.castShadow = true;
    root.add(dm, cm);
    // Laternen auf der Brücke
    for (let x = x0 + 10; x < x1 - 5; x += 30) {
      const y = L.bridgeProfile(b, x);
      lamps.push({ x, z: b.z - H - 0.3, rot: 0, y: y + 1.25, groundY: y });
      lamps.push({ x: x + 15, z: b.z + H + 0.3, rot: Math.PI, y: L.bridgeProfile(b, x + 15) + 1.25, groundY: L.bridgeProfile(b, x + 15) });
    }
  }

  // ---------------------------------------------------------------- Wasser
  const waterGeo = new THREE.PlaneGeometry(9000, 9000, 180, 180);
  waterGeo.rotateX(-Math.PI / 2);
  const wp = waterGeo.attributes.position;
  const wc = [];
  const deep = col('#0a3552');
  const bay = col('#15647a');
  const shallow = col('#2fc4bd');
  const tmp = new THREE.Color();
  for (let i = 0; i < wp.count; i++) {
    const x = wp.getX(i);
    const z = wp.getZ(i);
    if (x > L.ISLAND.x1 - 20) {
      const t = THREE.MathUtils.smoothstep(x, L.ISLAND.x1 + 20, L.ISLAND.x1 + 260);
      tmp.copy(shallow).lerp(deep, t);
    } else if (x > L.MAINLAND.x1 - 10 && x < L.ISLAND.x0 + 10 && Math.abs(z) < 760) tmp.copy(bay);
    else tmp.copy(bay).lerp(deep, THREE.MathUtils.smoothstep(Math.hypot(x, z), 900, 1800));
    wc.push(tmp.r, tmp.g, tmp.b);
  }
  waterGeo.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
  const waterNormal = TX.waterNormalTexture();
  waterNormal.repeat.set(9000 / 44, 9000 / 44);
  waterNormal.rotation = 0.45;
  const waterMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.06,
    metalness: 0.15,
    normalMap: waterNormal,
    normalScale: new THREE.Vector2(0.24, 0.24),
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.set(0, L.WATER_LEVEL, 0);
  water.receiveShadow = true;
  root.add(water);

  // ---------------------------------------------------------------- Chunks → Meshes
  const flags = {
    glass: { cast: true },
    office: { cast: true },
    residential: { cast: true },
    deco: { cast: true },
    plain: { cast: true },
    roof: { cast: false },
    neon: { cast: false, receive: false },
    signs: { cast: false, receive: false },
    markings: { cast: false },
  };
  const chunkMeshes = cb.meshes(materials, flags);
  for (const m of chunkMeshes) root.add(m);

  // Kollision: Kaimauern + Brückengeländer
  for (const box of L.seawallBoxes()) collision.add(box);

  // Requisiten
  const palmGroup = createPalms(palms, uniforms, quality);
  const lights = createStreetLights(lamps);
  for (const l of lamps) {
    if (l.y === undefined) collision.add({ x0: l.x - 0.2, x1: l.x + 0.2, z0: l.z - 0.2, z1: l.z + 0.2, h: 8, pole: true });
  }
  const traffic = createTrafficLights(graph, collision);
  root.add(palmGroup, lights.group, traffic.group);

  // Rote Flugwarnlichter auf Hochhäusern
  const avMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.3, 0.2), toneMapped: false });
  const av = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 8, 6), avMat, Math.max(1, aviation.length));
  aviation.forEach((p, i) => av.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  av.count = aviation.length;
  av.computeBoundingSphere();
  root.add(av);

  scene.add(root);

  const facadeMats = ['glass', 'office', 'residential', 'deco'].map((k) => materials[k]);
  const neonBase = new THREE.Color(1, 1, 1);
  return {
    root,
    graph,
    blocks,
    footprints,
    parking,
    showroom,
    materials,
    water,
    // Glasfassaden und Wasser spiegeln den Himmel kräftiger als das gedämpfte Umgebungslicht
    setEnv(tex, intensity) {
      for (const k of ['glass', 'office']) {
        materials[k].envMap = tex;
        materials[k].envMapIntensity = intensity;
      }
      waterMat.envMap = tex;
      waterMat.envMapIntensity = intensity;
    },
    setNight(n, time) {
      for (const m of facadeMats) m.emissiveIntensity = n * 1.35;
      const k = 0.9 + n * 2.4;
      materials.neon.color.copy(neonBase).multiplyScalar(k);
      materials.signs.color.setScalar(0.55 + n * 1.9);
      lights.setNight(n);
      avMat.color.setRGB(8 * (0.2 + n) * (Math.sin(time * 3) > 0.2 ? 1 : 0.05), 0.3, 0.2);
    },
    // Kacheln hinter der Nebelgrenze gar nicht erst zeichnen
    cull(cam, maxDist) {
      for (const m of chunkMeshes) {
        const s = m.geometry.boundingSphere;
        const d = Math.hypot(s.center.x - cam.x, s.center.z - cam.z) - s.radius;
        m.visible = d < maxDist;
      }
    },
    update(time, dt) {
      traffic.update(time);
      waterNormal.offset.x += dt * 0.004;
      waterNormal.offset.y += dt * 0.0025;
    },
  };
}
