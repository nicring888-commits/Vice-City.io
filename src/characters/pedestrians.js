import { Walker } from './character.js';
import { clamp } from '../core/rng.js';

const SHIRTS = ['#d6336c', '#2e7fd6', '#2fb380', '#f08c00', '#7048e8', '#e03131', '#1098ad', '#ffd23f', '#ffffff', '#ff9ec4'];
const PANTS = ['#ece6da', '#3b4a6b', '#2b2b2b', '#c8b48a', '#f4f4f4', '#5a3e2b'];
const SKIN = ['#f1c9a5', '#c58c64', '#8d5a3b', '#e0ac69', '#5c3a21'];
const HAIR = ['#1b1b1b', '#2a1a10', '#6b4423', '#d9b36c', '#a33a1a', '#bbbbbb'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Fußgänger auf Gehwegen, an der Promenade und am Strand. Sie laufen feste Runden
// (Rechteck um einen Block bzw. Linien), weichen heranrasenden Autos aus, fliehen bei Gefahr
// und rappeln sich nach einem Rempler wieder auf (keine Verletzungen).
export class PedestrianManager {
  constructor(game) {
    this.game = game;
    this.target = { high: 18, medium: 12, low: 6 }[game.qualityKey] ?? 12;
    this.peds = [];
    this.pool = [];
    this.timer = 0;
    this.buildPaths();
  }

  // Wege: Gehweg-Rechtecke um bebaute Blöcke, dazu Promenade und Strand am Ocean Drive
  buildPaths() {
    const paths = [];
    for (const b of this.game.city.blocks) {
      if (b.type === 'bayfront' || b.type === 'beachpark' || b.type === 'quay') continue;
      const w = b.x1 - b.x0;
      const d = b.z1 - b.z0;
      if (w < 20 || d < 20) continue;
      const o = 2.2;
      paths.push({
        loop: true,
        weight: b.type === 'port' ? 0.25 : b.type === 'deco' ? 1.6 : 1,
        pts: [
          [b.x0 + o, b.z0 + o],
          [b.x1 - o, b.z0 + o],
          [b.x1 - o, b.z1 - o],
          [b.x0 + o, b.z1 - o],
        ],
      });
    }
    // Promenade und Strand (Hin und Her auf Linien)
    for (const x of [590, 632, 660, 675]) paths.push({ loop: false, weight: 5, beach: x > 640, pts: [[x, -660], [x, 660]] });
    for (const p of paths) {
      const xs = p.pts.map((q) => q[0]);
      const zs = p.pts.map((q) => q[1]);
      p.box = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
      p.len = [];
      p.total = 0;
      const n = p.loop ? p.pts.length : p.pts.length - 1;
      for (let i = 0; i < n; i++) {
        const a = p.pts[i];
        const b = p.pts[(i + 1) % p.pts.length];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        p.len.push(l);
        p.total += l;
      }
    }
    this.paths = paths;
  }

  pointOn(path, s) {
    s = path.loop ? ((s % path.total) + path.total) % path.total : clamp(s, 0, path.total);
    for (let i = 0; i < path.len.length; i++) {
      if (s <= path.len[i] || i === path.len.length - 1) {
        const a = path.pts[i];
        const b = path.pts[(i + 1) % path.pts.length];
        const t = clamp(s / path.len[i], 0, 1);
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
      s -= path.len[i];
    }
    return path.pts[0];
  }

  // Nächstgelegenen Punkt eines Weges (grob) für das Spawnen nahe am Spieler
  spawnOne(focus) {
    const near = [];
    let wsum = 0;
    for (const p of this.paths) {
      const [x0, z0, x1, z1] = p.box;
      const cx = clamp(focus.x, x0, x1);
      const cz = clamp(focus.z, z0, z1);
      const d = Math.hypot(cx - focus.x, cz - focus.z);
      if (d < 110) {
        near.push(p);
        wsum += p.weight;
      }
    }
    if (!near.length) return false;
    let r = Math.random() * wsum;
    let path = near[0];
    for (const p of near) {
      r -= p.weight;
      if (r <= 0) {
        path = p;
        break;
      }
    }
    for (let k = 0; k < 8; k++) {
      const s = Math.random() * path.total;
      const [x, z] = this.pointOn(path, s);
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d < 35 || d > 120) continue;
      if (this.game.traffic.visible(x, 0, z) && d < 70) continue;
      const w = this.pool.pop() || this.create(path.beach);
      w.place(x, z, 0);
      this.game.scene.add(w.char.root);
      this.peds.push({ w, path, s, dir: Math.random() < 0.5 ? 1 : -1, speed: 0.45 + Math.random() * 0.2, flee: 0, fx: 0, fz: 0, pause: 0, hit: false });
      return true;
    }
    return false;
  }

  create(beach) {
    return new Walker({
      shirt: pick(SHIRTS),
      flower: pick(['#f4f1e8', '#ffd23f', '#35f2ff', '#ff3fa4']),
      pants: beach ? pick(['#35c4ff', '#ff7a3d', '#ffffff']) : pick(PANTS),
      skin: pick(SKIN),
      hair: pick(HAIR),
    });
  }

  despawn(i) {
    const p = this.peds[i];
    this.game.scene.remove(p.w.char.root);
    this.pool.push(p.w);
    this.peds.splice(i, 1);
  }

  // Panik rund um einen Ort (Crash, Hupe, Polizei)
  scare(x, z, radius = 25) {
    for (const p of this.peds) {
      const dx = p.w.x - x;
      const dz = p.w.z - z;
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      p.flee = 3 + Math.random() * 2;
      p.fx = dx / (d || 1);
      p.fz = dz / (d || 1);
    }
  }

  update(dt, vehicles) {
    const g = this.game;
    const focus = g.focus;
    const rainy = g.weather ? g.weather.rain > 0.3 : false;
    // Auffüllen und entfernen (nicht jedes Frame)
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.4;
      for (let i = this.peds.length - 1; i >= 0; i--) {
        const p = this.peds[i];
        if (Math.hypot(p.w.x - focus.x, p.w.z - focus.z) > 150) this.despawn(i);
      }
      if (this.peds.length < this.target) this.spawnOne(focus);
    }
    for (const p of this.peds) {
      const w = p.w;
      const dist = Math.hypot(w.x - focus.x, w.z - focus.z);
      w.char.root.visible = dist < 110;
      if (dist > 110) continue;
      let mx = 0;
      let mz = 0;
      let sprint = false;
      // Heranrasendes Auto: zur Seite springen
      if (p.flee <= 0) {
        for (const v of vehicles) {
          if (!v.driver || v.speed < 7) continue;
          const rx = w.x - v.x;
          const rz = w.z - v.z;
          if (rx * rx + rz * rz > 400) continue;
          const f = v.forward;
          const along = rx * f.x + rz * f.z;
          const side = rx * -f.z + rz * f.x;
          if (along > 0 && along < 16 && Math.abs(side) < 3) {
            p.flee = 1.2;
            const s = side >= 0 ? 1 : -1;
            p.fx = -f.z * s;
            p.fz = f.x * s;
            if (v === g.playerCar && v.speed > 12) g.audio.blip(660, 0.05, 0.03);
          }
        }
      }
      if (p.flee > 0) {
        p.flee -= dt;
        mx = p.fx;
        mz = p.fz;
        sprint = true;
      } else if (p.pause > 0) {
        p.pause -= dt;
      } else {
        // Weiter auf dem Weg; am Linienende umdrehen, gelegentlich kurz stehen bleiben
        const speed = p.speed * (rainy ? 1.5 : 1);
        p.s += p.dir * speed * 2.6 * dt;
        if (!p.path.loop && (p.s < 0 || p.s > p.path.total)) p.dir *= -1;
        const [tx, tz] = this.pointOn(p.path, p.s + p.dir * 1.5);
        const dx = tx - w.x;
        const dz = tz - w.z;
        const l = Math.hypot(dx, dz) || 1;
        mx = (dx / l) * p.speed;
        mz = (dz / l) * p.speed;
        if (l > 6) p.s = this.nearestS(p.path, w.x, w.z, p.s);
        if (Math.random() < dt * 0.02) p.pause = 1 + Math.random() * 3;
      }
      const hitBy = w.move(dt, mx, mz, sprint, g.collision, vehicles);
      if (hitBy) {
        // Umgeworfen: aufstehen und weglaufen; Polizei reagiert, wenn es der Spieler war
        p.flee = 4;
        p.fx = w.vx;
        p.fz = w.vz;
        const l = Math.hypot(p.fx, p.fz) || 1;
        p.fx /= l;
        p.fz /= l;
        if (hitBy === g.playerCar && !p.hit) {
          p.hit = true;
          g.police.onPedestrianHit();
        }
      }
    }
  }

  nearestS(path, x, z, s0) {
    let best = s0;
    let bd = Infinity;
    for (let s = 0; s < path.total; s += 3) {
      const [px, pz] = this.pointOn(path, s);
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }
}
