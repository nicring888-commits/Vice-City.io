import * as THREE from 'three';
import * as TX from './textures.js';
import { Rng } from '../core/rng.js';
import { lightState } from './layout.js';

const up = new THREE.Vector3(0, 1, 0);

// Wind: Vertex-Shader-Erweiterung, Ausschlag wächst mit der Höhe
function addWind(material, uniforms, strength = 0.18) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float hgt = max(position.y, 0.0) / 10.0;
          float w = sin(uTime * 1.3 + ip.x * 0.11 + ip.z * 0.07) + 0.4 * sin(uTime * 2.7 + ip.z * 0.3);
          transformed.x += w * ${strength.toFixed(3)} * hgt * hgt;
          transformed.z += w * ${(strength * 0.6).toFixed(3)} * hgt * hgt;
        }`,
      );
  };
}

// --------------------------------------------------------------------------
// Palmen: prozeduraler, gebogener Stamm + herabhängende, gefaltete Wedel

function buildPalmVariant(seed) {
  const rng = new Rng(seed);
  const H = rng.float(8.5, 13);
  const bend = rng.float(0.6, 2.6);
  const spine = (t) => new THREE.Vector3(bend * t * t, H * t, 0);

  // Stamm
  const segs = 7;
  const around = 6;
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = spine(t);
    const r = THREE.MathUtils.lerp(0.3, 0.15, t) * (i === 0 ? 1.25 : 1);
    for (let j = 0; j <= around; j++) {
      const a = (j / around) * Math.PI * 2;
      const n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      pos.push(c.x + n.x * r, c.y, c.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      uv.push(j / around, (t * H) / 2);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * (around + 1) + j;
      const b = a + around + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const trunk = new THREE.BufferGeometry();
  trunk.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  trunk.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  trunk.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  trunk.setIndex(idx);

  // Wedel
  const top = spine(1);
  const fp = [];
  const fn = [];
  const fu = [];
  const fi = [];
  const count = 9;
  for (let k = 0; k < count; k++) {
    const ang = (k / count) * Math.PI * 2 + rng.float(-0.2, 0.2);
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const side = new THREE.Vector3().crossVectors(up, dir).normalize();
    const len = rng.float(3.6, 5.0);
    const lift = rng.float(0.6, 1.4);
    const droop = rng.float(1.8, 3.2);
    const steps = 5;
    const base = fp.length / 3;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const p = top
        .clone()
        .addScaledVector(dir, t * len)
        .addScaledVector(up, Math.sin(t * Math.PI * 0.7) * lift - t * t * droop);
      const width = Math.sin(Math.min(1, t * 1.15 + 0.08) * Math.PI) * 0.95 + 0.08;
      const fold = width * 0.35;
      // links, Mitte, rechts (leichte V-Faltung)
      const L = p.clone().addScaledVector(side, -width).addScaledVector(up, fold);
      const R = p.clone().addScaledVector(side, width).addScaledVector(up, fold);
      for (const [v, u] of [[L, 0], [p, 0.5], [R, 1]]) {
        fp.push(v.x, v.y, v.z);
        fn.push(0, 1, 0);
        fu.push(u, t);
      }
    }
    for (let s = 0; s < steps; s++) {
      const a = base + s * 3;
      const b = a + 3;
      fi.push(a, b, a + 1, b, b + 1, a + 1);
      fi.push(a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
    }
  }
  const fronds = new THREE.BufferGeometry();
  fronds.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  fronds.setAttribute('normal', new THREE.Float32BufferAttribute(fn, 3));
  fronds.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
  fronds.setIndex(fi);
  fronds.computeVertexNormals();
  return { trunk, fronds, height: H };
}

export function createPalms(positions, uniforms, quality) {
  const group = new THREE.Group();
  const variants = [buildPalmVariant(3), buildPalmVariant(8), buildPalmVariant(21)];
  const bark = new THREE.MeshStandardMaterial({ map: TX.barkTexture(), roughness: 0.95 });
  const leaf = new THREE.MeshStandardMaterial({
    map: TX.frondTexture(),
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.75,
    color: 0xd8f0b0,
  });
  addWind(bark, uniforms, 0.12);
  addWind(leaf, uniforms, 0.2);
  const rng = new Rng(99);
  // Nach Kacheln und Variante gruppieren, damit Frustum-Culling pro Kachel greift
  const CH = 400;
  const buckets = new Map();
  for (const p of positions) {
    const key = `${Math.floor(p.x / CH)},${Math.floor(p.z / CH)},${rng.int(0, variants.length - 1)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  for (const [key, list] of buckets) {
    const v = variants[+key.split(',')[2]];
    const trunk = new THREE.InstancedMesh(v.trunk, bark, list.length);
    const fronds = new THREE.InstancedMesh(v.fronds, leaf, list.length);
    list.forEach((p, k) => {
      q.setFromAxisAngle(up, rng.float(0, Math.PI * 2));
      const sc = rng.float(0.8, 1.15);
      s.set(sc, sc, sc);
      m.compose(new THREE.Vector3(p.x, p.y ?? 0.15, p.z), q, s);
      trunk.setMatrixAt(k, m);
      fronds.setMatrixAt(k, m);
    });
    trunk.castShadow = fronds.castShadow = true;
    trunk.receiveShadow = fronds.receiveShadow = true;
    trunk.computeBoundingSphere();
    fronds.computeBoundingSphere();
    group.add(trunk, fronds);
  }
  return group;
}

// --------------------------------------------------------------------------
// Straßenlaternen (Kobra-Kopf-Stil) + Lichtflecken auf der Straße

export function createStreetLights(list) {
  const group = new THREE.Group();
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, 8, 8);
  poleGeo.translate(0, 4, 0);
  const armGeo = new THREE.BoxGeometry(0.1, 0.1, 2.4);
  armGeo.translate(0, 7.9, 1.2);
  const baseGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.6, 8);
  baseGeo.translate(0, 0.3, 0);
  const merged = mergeSimple([poleGeo, armGeo, baseGeo]);
  const headGeo = new THREE.BoxGeometry(0.45, 0.16, 0.8);
  headGeo.translate(0, 7.82, 2.5);

  const metal = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.45, metalness: 0.7 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd8a0, emissiveIntensity: 0 });
  const poles = new THREE.InstancedMesh(merged, metal, list.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, list.length);
  const pools = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: TX.glowTexture(),
      color: 0xffc27a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
    list.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  list.forEach((l, i) => {
    q.setFromAxisAngle(up, l.rot);
    m.compose(new THREE.Vector3(l.x, l.y ?? 0.15, l.z), q, one);
    poles.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    const px = l.x + Math.sin(l.rot) * 3;
    const pz = l.z + Math.cos(l.rot) * 3;
    m.compose(new THREE.Vector3(px, (l.groundY ?? 0) + 0.03, pz), q, new THREE.Vector3(15, 1, 15));
    pools.setMatrixAt(i, m);
  });
  poles.castShadow = true;
  poles.receiveShadow = true;
  pools.renderOrder = 2;
  for (const im of [poles, heads, pools]) im.computeBoundingSphere();
  group.add(poles, heads, pools);
  return {
    group,
    setNight(n) {
      headMat.emissiveIntensity = n * 6;
      pools.material.opacity = n * 0.55;
      pools.visible = n > 0.02;
    },
  };
}

// --------------------------------------------------------------------------
// Ampeln an Mastauslegern, Lichter als Instanzen mit HDR-Farben (für Bloom)

const BULB_ON = {
  red: new THREE.Color(6, 0.25, 0.15),
  yellow: new THREE.Color(5, 3.2, 0.2),
  green: new THREE.Color(0.2, 5, 1.6),
};
const BULB_OFF = {
  red: new THREE.Color(0.08, 0.01, 0.01),
  yellow: new THREE.Color(0.08, 0.06, 0.01),
  green: new THREE.Color(0.01, 0.07, 0.03),
};

export function createTrafficLights(graph, collision) {
  const heads = [];
  for (const node of graph.nodes) {
    if (!node.lights) continue;
    for (const e of graph.edges) {
      if (e.to !== node) continue;
      const halfAlong = e.axis === 'ew' ? node.hx : node.hz;
      const hw = e.type.width / 2;
      const px = node.x - e.dir.x * (halfAlong + 1.4) + e.right.x * (hw + 1.1);
      const pz = node.z - e.dir.z * (halfAlong + 1.4) + e.right.z * (hw + 1.1);
      heads.push({ node, axis: e.axis, x: px, z: pz, yaw: Math.atan2(-e.dir.x, -e.dir.z) });
    }
  }
  const poleGeo = mergeSimple([
    new THREE.CylinderGeometry(0.14, 0.18, 6.2, 8).translate(0, 3.1, 0),
    new THREE.BoxGeometry(5.6, 0.16, 0.16).translate(-2.8, 5.9, 0),
    new THREE.BoxGeometry(0.4, 1.15, 0.32).translate(-5.4, 5.3, 0),
    new THREE.BoxGeometry(0.34, 0.34, 0.3).translate(0, 2.2, 0.2),
  ]);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.5, metalness: 0.5 });
  const poles = new THREE.InstancedMesh(poleGeo, mat, heads.length);
  const bulbGeo = new THREE.CircleGeometry(0.13, 12);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, heads.length * 3);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const off = new THREE.Vector3();
  heads.forEach((h, i) => {
    q.setFromAxisAngle(up, h.yaw);
    m.compose(new THREE.Vector3(h.x, 0.15, h.z), q, one);
    poles.setMatrixAt(i, m);
    ['red', 'yellow', 'green'].forEach((c, k) => {
      off.set(-5.4, 5.3 + 0.36 - k * 0.36, 0.17).applyQuaternion(q);
      m.compose(new THREE.Vector3(h.x + off.x, 0.15 + off.y, h.z + off.z), q, one);
      bulbs.setMatrixAt(i * 3 + k, m);
      bulbs.setColorAt(i * 3 + k, BULB_OFF[c]);
    });
    collision.add({ x0: h.x - 0.25, x1: h.x + 0.25, z0: h.z - 0.25, z1: h.z + 0.25, h: 6, pole: true });
  });
  poles.castShadow = true;
  poles.computeBoundingSphere();
  bulbs.computeBoundingSphere();
  const group = new THREE.Group();
  group.add(poles, bulbs);
  let last = -1;
  return {
    group,
    update(time) {
      const tick = Math.floor(time * 4);
      if (tick === last) return;
      last = tick;
      heads.forEach((h, i) => {
        const s = lightState(h.node, h.axis, time);
        bulbs.setColorAt(i * 3, s === 'red' ? BULB_ON.red : BULB_OFF.red);
        bulbs.setColorAt(i * 3 + 1, s === 'yellow' ? BULB_ON.yellow : BULB_OFF.yellow);
        bulbs.setColorAt(i * 3 + 2, s === 'green' ? BULB_ON.green : BULB_OFF.green);
      });
      bulbs.instanceColor.needsUpdate = true;
    },
  };
}

// Kleine Hilfsfunktion: Geometrien (gleiche Attribute) zusammenführen
export function mergeSimple(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = parts[0].attributes[name].itemSize;
    const total = parts.reduce((s, g) => s + g.attributes[name].array.length, 0);
    const arr = new Float32Array(total);
    let o = 0;
    for (const g of parts) {
      arr.set(g.attributes[name].array, o);
      o += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}
