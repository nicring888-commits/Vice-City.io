// Statische Kollision: achsenparallele Boxen (Gebäude, Masten, Kaimauern) in einem Raster.
export class CollisionWorld {
  constructor(cell = 32) {
    this.cell = cell;
    this.grid = new Map();
    this.boxes = [];
    this.stamp = 0;
  }

  add(box) {
    box.h ??= 50;
    box._s = 0;
    this.boxes.push(box);
    const c = this.cell;
    for (let i = Math.floor(box.x0 / c); i <= Math.floor(box.x1 / c); i++) {
      for (let j = Math.floor(box.z0 / c); j <= Math.floor(box.z1 / c); j++) {
        const k = i * 100003 + j;
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(box);
      }
    }
    return box;
  }

  query(x0, z0, x1, z1, out = []) {
    out.length = 0;
    const s = ++this.stamp;
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) {
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
        const arr = this.grid.get(i * 100003 + j);
        if (!arr) continue;
        for (const b of arr) {
          if (b._s === s) continue;
          b._s = s;
          if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
          out.push(b);
        }
      }
    }
    return out;
  }

  // Kreis gegen Boxen: liefert Kontakte {nx, nz, pen, box}
  circleContacts(x, z, r, y = 0, out = []) {
    const boxes = this.query(x - r, z - r, x + r, z + r, this._tmp || (this._tmp = []));
    out.length = 0;
    for (const b of boxes) {
      if (y > b.h) continue;
      const cx = x < b.x0 ? b.x0 : x > b.x1 ? b.x1 : x;
      const cz = z < b.z0 ? b.z0 : z > b.z1 ? b.z1 : z;
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        out.push({ nx: dx / d, nz: dz / d, pen: r - d, box: b });
      } else {
        // Mittelpunkt steckt in der Box: kürzesten Weg hinaus nehmen
        const l = x - b.x0;
        const rr = b.x1 - x;
        const t = z - b.z0;
        const bt = b.z1 - z;
        const m = Math.min(l, rr, t, bt);
        if (m === l) out.push({ nx: -1, nz: 0, pen: l + r, box: b });
        else if (m === rr) out.push({ nx: 1, nz: 0, pen: rr + r, box: b });
        else if (m === t) out.push({ nx: 0, nz: -1, pen: t + r, box: b });
        else out.push({ nx: 0, nz: 1, pen: bt + r, box: b });
      }
    }
    return out;
  }

  // Sichtlinie (für Kamera): erster Treffer entlang Strecke, als Anteil 0..1
  raycast(ax, ay, az, bx, by, bz) {
    const x0 = Math.min(ax, bx);
    const x1 = Math.max(ax, bx);
    const z0 = Math.min(az, bz);
    const z1 = Math.max(az, bz);
    const boxes = this.query(x0, z0, x1, z1, this._tmp2 || (this._tmp2 = []));
    let best = 1;
    const dx = bx - ax;
    const dz = bz - az;
    for (const b of boxes) {
      if (b.h < 4) continue;
      // Slab-Test in 2D
      let tmin = 0;
      let tmax = 1;
      if (Math.abs(dx) < 1e-9) {
        if (ax < b.x0 || ax > b.x1) continue;
      } else {
        let t1 = (b.x0 - ax) / dx;
        let t2 = (b.x1 - ax) / dx;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
      }
      if (Math.abs(dz) < 1e-9) {
        if (az < b.z0 || az > b.z1) continue;
      } else {
        let t1 = (b.z0 - az) / dz;
        let t2 = (b.z1 - az) / dz;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
      }
      if (tmin > tmax) continue;
      const yAt = ay + (by - ay) * tmin;
      if (yAt > b.h) continue;
      if (tmin < best) best = tmin;
    }
    return best;
  }
}
