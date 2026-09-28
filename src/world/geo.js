import * as THREE from 'three';

// Sammelt Quads/Boxen in einem gemeinsamen Buffer, damit die Stadt aus wenigen
// Draw-Calls besteht. UVs werden in Weltmetern berechnet, damit Texturen
// (Fenster, Gehwegplatten) überall im richtigen Maßstab liegen.
export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.count = 0;
  }

  quad(a, b, c, d, n, uvs, color) {
    const base = this.count;
    for (let i = 0; i < 4; i++) {
      const p = [a, b, c, d][i];
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
      this.col.push(color.r, color.g, color.b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.count += 4;
  }

  // Vier Seitenwände eines Quaders; Textur kachelt mit tileW × tileH Metern
  walls(x0, z0, x1, z1, y0, y1, color, tileW = 1, tileH = 1, uOff = 0, vOff = 0, skip = null) {
    const v0 = y0 / tileH + vOff;
    const v1 = y1 / tileH + vOff;
    const dx = (x1 - x0) / tileW;
    const dz = (z1 - z0) / tileW;
    if (!skip || !skip.e)
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [uOff, v0, uOff + dz, v0, uOff + dz, v1, uOff, v1], color);
    if (!skip || !skip.w)
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [uOff, v0, uOff + dz, v0, uOff + dz, v1, uOff, v1], color);
    if (!skip || !skip.s)
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [uOff, v0, uOff + dx, v0, uOff + dx, v1, uOff, v1], color);
    if (!skip || !skip.n)
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [uOff, v0, uOff + dx, v0, uOff + dx, v1, uOff, v1], color);
  }

  top(x0, z0, x1, z1, y, color, tile = 1) {
    this.quad(
      [x0, y, z1],
      [x1, y, z1],
      [x1, y, z0],
      [x0, y, z0],
      [0, 1, 0],
      [x0 / tile, -z1 / tile, x1 / tile, -z1 / tile, x1 / tile, -z0 / tile, x0 / tile, -z0 / tile],
      color,
    );
  }

  bottom(x0, z0, x1, z1, y, color, tile = 1) {
    this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], color);
  }

  box(x0, y0, z0, x1, y1, z1, color, tile = 1, withBottom = false) {
    this.walls(x0, z0, x1, z1, y0, y1, color, tile, tile);
    this.top(x0, z0, x1, z1, y1, color, tile);
    if (withBottom) this.bottom(x0, z0, x1, z1, y0, color, tile);
  }

  // Beliebige Three-Geometrie mit Transformation einfügen
  addGeometry(geo, matrix, color) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const uv = g.attributes.uv;
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const base = this.count;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      this.nor.push(v.x, v.y, v.z);
      this.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      this.col.push(color.r, color.g, color.b);
      this.idx.push(base + i);
    }
    this.count += p.count;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Verteilt Geometrie auf Kacheln (Chunks), damit Frustum-Culling greift.
export class ChunkedBuilder {
  constructor(size = 250) {
    this.size = size;
    this.map = new Map();
  }
  get(mat, x, z) {
    const k = `${mat}|${Math.floor(x / this.size)}|${Math.floor(z / this.size)}`;
    let b = this.map.get(k);
    if (!b) {
      b = new GeoBuilder();
      b.mat = mat;
      this.map.set(k, b);
    }
    return b;
  }
  meshes(materials, flags = {}) {
    const out = [];
    for (const b of this.map.values()) {
      if (b.count === 0) continue;
      const m = new THREE.Mesh(b.build(), materials[b.mat]);
      const f = flags[b.mat] || {};
      m.castShadow = !!f.cast;
      m.receiveShadow = f.receive !== false;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      out.push(m);
    }
    return out;
  }
}

export const col = (hex) => new THREE.Color(hex);
