import { clamp, damp } from '../core/rng.js';
import { route, nearestNode } from './police.js';

const BRAKE = 15; // Verzögerung (m/s²), mit der die KI ihre Bremspunkte plant

const unit = (x, z) => {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
};

// Kurvengeschwindigkeit (m/s) für einen Abbiegewinkel in Radiant, vor dem Fahrstil-Faktor
const cornerSpeed = (ang) => Math.max(7, 34 - 12 * ang);

// Rennstrecke über den Straßengraph: Wegpunkte (Kreuzungen) → Knotenfolge (A*) → Ideallinie.
// Checkpoints sind alle Kreuzungen nach dem Start, dadurch zählt jede Route über das Straßennetz.
export class RaceLine {
  constructor(graph, waypoints, { laps = 1, loop = laps > 1, startOffset = 35 } = {}) {
    const wp = waypoints.map(([x, z]) => nearestNode(graph, x, z));
    const seq = loop ? [...wp, wp[0]] : wp;
    const nodes = [seq[0]];
    for (let i = 1; i < seq.length; i++) nodes.push(...route(graph, seq[i - 1], seq[i]).slice(1));
    this.lapCps = nodes.length - 1;
    if (loop) {
      const lap = nodes.slice(1);
      for (let l = 1; l < laps; l++) nodes.push(...lap);
    }
    this.laps = laps;
    this.nodes = nodes;
    const a = nodes[0];
    const b = nodes[1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    this.dir = unit(b.x - a.x, b.z - a.z);
    this.right = { x: -this.dir.z, z: this.dir.x };
    const off = Math.min(startOffset, len * 0.4);
    this.start = { x: a.x + this.dir.x * off, z: a.z + this.dir.z * off, h: Math.atan2(this.dir.x, this.dir.z) };
    this.cps = nodes.slice(1).map((n) => [n.x, n.z]);
    this.build();
  }

  build() {
    const N = this.nodes;
    const pts = [{ x: this.start.x, z: this.start.z, v: Infinity }];
    for (let i = 1; i < N.length; i++) {
      const n = N[i];
      const p = N[i - 1];
      const q = N[i + 1];
      const din = unit(n.x - p.x, n.z - p.z);
      const dout = q ? unit(q.x - n.x, q.z - n.z) : din;
      const dot = din.x * dout.x + din.z * dout.z;
      if (dot > 0.95) {
        pts.push({ x: n.x, z: n.z, v: Infinity, cp: i - 1 });
        continue;
      }
      // Abbiegen: Einlenk-, Scheitel- und Ausfahrpunkt, damit die Linie in der Kreuzung bleibt
      const vc = cornerSpeed(Math.acos(clamp(dot, -1, 1)));
      const k = 8;
      pts.push({ x: n.x - din.x * k, z: n.z - din.z * k, v: vc });
      pts.push({ x: n.x + (dout.x - din.x) * 2.2, z: n.z + (dout.z - din.z) * 2.2, v: vc, cp: i - 1 });
      pts.push({ x: n.x + dout.x * k, z: n.z + dout.z * k, v: vc });
    }
    let s = 0;
    pts[0].s = 0;
    this.cpS = [];
    for (let i = 1; i < pts.length; i++) {
      s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      pts[i].s = s;
      if (pts[i].cp !== undefined) this.cpS[pts[i].cp] = s;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const d = unit(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
      pts[i].dx = d.x;
      pts[i].dz = d.z;
    }
    const last = pts[pts.length - 1];
    last.dx = pts[pts.length - 2].dx;
    last.dz = pts[pts.length - 2].dz;
    this.pts = pts;
    this.total = s;
  }

  // Nächster Punkt auf der Linie, Suche nur ab dem bisherigen Segment vorwärts (Runden überlappen sich)
  project(x, z, hint = 0) {
    const P = this.pts;
    let best = null;
    for (let i = hint; i < Math.min(P.length - 1, hint + 5); i++) {
      const a = P[i];
      const b = P[i + 1];
      const len = b.s - a.s || 1e-3;
      const t = clamp(((x - a.x) * a.dx + (z - a.z) * a.dz) / len, 0, 1);
      const px = a.x + a.dx * len * t;
      const pz = a.z + a.dz * len * t;
      const d = Math.hypot(x - px, z - pz);
      // Leicht nach vorn gewichten, damit das Segment bei Gleichstand weiterrückt
      const score = d - (i - hint) * 0.01;
      if (!best || score < best.score) best = { idx: t >= 1 && i + 1 < P.length - 1 ? i + 1 : i, s: a.s + len * t, dist: d, score };
    }
    return best;
  }

  // Punkt und Richtung bei Streckenmeter s
  pointAt(s, hint = 0) {
    const P = this.pts;
    let i = Math.min(hint, P.length - 2);
    while (i < P.length - 2 && P[i + 1].s < s) i++;
    const a = P[i];
    const t = s - a.s;
    return { x: a.x + a.dx * t, z: a.z + a.dz * t, dx: a.dx, dz: a.dz, idx: i };
  }

  // Wunschgeschwindigkeit: Kurven voraus rechtzeitig anbremsen
  speedAt(s, hint, skill) {
    const P = this.pts;
    let best = Infinity;
    const cur = P[hint];
    const nxt = P[hint + 1];
    if (cur && nxt && cur.v !== Infinity && nxt.v !== Infinity) best = cur.v * skill;
    for (let j = hint + 1; j < P.length && P[j].s - s < 260; j++) {
      if (P[j].v === Infinity) continue;
      const d = Math.max(0, P[j].s - s);
      best = Math.min(best, Math.sqrt((P[j].v * skill) ** 2 + 2 * BRAKE * d));
    }
    return best;
  }

  nextCornerDist(s, hint) {
    const P = this.pts;
    for (let j = hint + 1; j < P.length; j++) if (P[j].v !== Infinity) return P[j].s - s;
    return this.total - s;
  }

  // Fortschritt (Streckenmeter) eines Fahrers, der Checkpoints abfährt
  progressOf(cp, x, z) {
    if (cp >= this.cps.length) return this.total;
    const c = this.cps[cp];
    return Math.max(cp > 0 ? this.cpS[cp - 1] : 0, this.cpS[cp] - Math.hypot(x - c[0], z - c[1]));
  }
}

// KI-Rennfahrer: fährt die Ideallinie (Pure Pursuit), bremst vor Kurven, nutzt Nitro auf Geraden,
// weicht Verkehr aus und setzt bei Hängern zurück. Fahrstil über style:
//   skill (Kurventempo), top (Anteil der Höchstgeschwindigkeit), aggro (Nitro), lane (Spurversatz),
//   drift (Handbremse in Kurven), cruise (feste Reisegeschwindigkeit für Verfolgungen)
export class RacerAI {
  constructor(v, line, style = {}) {
    this.v = v;
    this.line = line;
    this.style = { skill: 1, top: 0.95, aggro: 0.5, lane: 0, drift: false, cruise: Infinity, ...style };
    this.idx = 0;
    this.s = 0;
    this.hold = true;
    this.finished = false;
    this.rubber = 1;
    this.boost = false;
    this.stunned = 0;
    this.stuck = 0;
    this.reverse = 0;
    this.revSteer = 1;
    this.dodge = 0;
    this.dodgeT = 0;
    this.lastS = 0;
    this.checkT = 0;
    this.noProgress = 0;
    this.offRoute = 0;
    this.wantRespawn = false;
    this.lost = false;
  }

  // Setzt das Auto auf die Linie zurück (wird von der Mission aufgerufen, wenn niemand hinsieht)
  respawn(ahead = 6) {
    const p = this.line.pointAt(this.s + ahead, this.idx);
    this.v.place(p.x, p.z, Math.atan2(p.dx, p.dz), 10);
    this.v.nitro = Math.max(this.v.nitro, 0.3);
    this.idx = p.idx;
    this.s += ahead;
    this.lastS = this.s;
    this.noProgress = 0;
    this.offRoute = 0;
    this.stuck = 0;
    this.reverse = 0;
    this.wantRespawn = false;
  }

  update(dt, ctx) {
    const v = this.v;
    const L = this.line;
    const st = this.style;
    const out = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, analog: true };
    if (this.hold) {
      out.brake = 1;
      return out;
    }
    const pr = L.project(v.x, v.z, this.idx);
    this.idx = pr.idx;
    this.s = pr.s;
    if (!this.finished && this.s >= L.total - 6) this.finished = true;
    if (!v.nitroActive) v.nitro = Math.min(1, v.nitro + dt * 0.03);

    // Hängt fest, kein Fortschritt oder weit weg von der Linie → Zurücksetzen anfordern
    this.checkT += dt;
    if (this.checkT >= 1) {
      this.checkT = 0;
      if (this.s - this.lastS < 3 && !this.finished) this.noProgress++;
      else this.noProgress = 0;
      this.lastS = this.s;
    }
    this.offRoute = pr.dist > 30 ? this.offRoute + dt : 0;
    this.wantRespawn = !this.finished && (this.noProgress >= 6 || this.offRoute > 3 || v.sinking > 0.5 || v.dead);

    if (this.reverse > 0) {
      this.reverse -= dt;
      out.brake = 1;
      out.steer = this.revSteer;
      return out;
    }

    const vF = v.forwardSpeed;
    // Ausweichen: Fahrzeug im Korridor voraus → auf die freie Seite ziehen und notfalls bremsen
    const f = v.forward;
    const r = v.right;
    let limit = Infinity;
    for (const o of ctx.vehicles) {
      if (o === v) continue;
      const rx = o.x - v.x;
      const rz = o.z - v.z;
      if (rx * rx + rz * rz > 1300) continue;
      const along = rx * f.x + rz * f.z;
      if (along <= 0 || along > 32) continue;
      const side = rx * r.x + rz * r.z;
      if (Math.abs(side) > 2.6) continue;
      if (this.dodgeT <= 0) {
        this.dodge = side > 0 ? -3.4 : 3.4;
        this.dodgeT = 1.3;
      }
      const oSpeed = Math.max(0, o.vx * f.x + o.vz * f.z);
      if (along < 14 && Math.abs(side) < 2) limit = Math.min(limit, oSpeed + Math.max(0, along - 5) * 0.8);
    }
    this.dodgeT -= dt;
    if (this.dodgeT <= 0) this.dodge = damp(this.dodge, 0, 1.5, dt);

    // Lenkziel auf der Linie, seitlich versetzt
    const look = 6 + Math.max(0, vF) * 0.42;
    const aim = L.pointAt(this.s + look, this.idx);
    const off = clamp(st.lane + this.dodge, -4.5, 4.5);
    const tx = aim.x - aim.dz * off;
    const tz = aim.z + aim.dx * off;
    const dx = tx - v.x;
    const dz = tz - v.z;
    const lx = dx * r.x + dz * r.z;
    const lz = dx * f.x + dz * f.z;
    const alpha = Math.atan2(lx, Math.max(0.1, lz));
    const wb = v.spec.axles[1] - v.spec.axles[0];
    const delta = Math.atan((2 * wb * Math.sin(alpha)) / Math.max(4, Math.hypot(dx, dz)));
    out.steer = clamp(delta / v.steerLimit(vF), -1, 1);
    if (lz < 0) out.steer = Math.sign(lx || 1);

    if (this.finished) {
      out.brake = vF > 3 ? 0.5 : 1;
      return out;
    }

    // Wunschgeschwindigkeit: Fahrstil, Rubber-Banding, Kurven, Verkehr
    let desired = Math.min(v.spec.maxSpeed * st.top * this.rubber, st.cruise);
    desired = Math.min(desired, L.speedAt(this.s, this.idx, st.skill), limit);
    const straight = L.nextCornerDist(this.s, this.idx);
    const wantNitro = st.cruise === Infinity && v.nitro > 0.2 && vF > 12 && straight > 110 && (st.aggro >= 0.5 || this.boost);
    if (wantNitro && desired > vF + 2) out.nitro = true;
    const err = desired - vF;
    if (err > 0) out.throttle = clamp(0.4 + err * 0.3, 0, 1);
    else {
      out.throttle = err > -1.5 ? 0.25 : 0;
      out.brake = clamp(-err * 0.18, 0, 1);
    }
    if (Math.abs(alpha) > 0.9 && vF > 14) {
      out.throttle = 0;
      out.brake = Math.max(out.brake, 0.5);
    }
    if (st.drift && Math.abs(alpha) > 0.55 && vF > 16 && vF < 32) out.handbrake = true;
    if (this.stunned > 0) {
      this.stunned = Math.min(this.stunned, 0.4) - dt;
      out.throttle *= 0.4;
    }

    // Festgefahren: kurz zurücksetzen
    if (out.throttle > 0.5 && Math.abs(vF) < 1.5) {
      this.stuck += dt;
      if (this.stuck > 1.2) {
        this.stuck = 0;
        this.reverse = 1.1;
        this.revSteer = -Math.sign(lx || 1);
      }
    } else this.stuck = Math.max(0, this.stuck - dt);
    return out;
  }
}
