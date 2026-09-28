import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { SPORT_MODELS, CIVIL_MODELS, modelById } from './models.js';
import { lightState } from '../world/layout.js';
import { clamp } from '../core/rng.js';

const STOP_BACK = 7.2; // Haltelinie liegt so weit vor dem Kreuzungsrand

// KI-Fahrer: folgt den Fahrspuren des Straßengraphen (Pure Pursuit),
// hält an roten Ampeln, hält Abstand und wartet als Linksabbieger.
export class TrafficAI {
  constructor(vehicle) {
    this.v = vehicle;
    this.edge = null;
    this.lane = 0;
    this.next = null;
    this.nextLane = 0;
    this.turn = 0;
    this.stuck = 0;
    this.stunned = 0;
    this.lost = false;
    this.honkCooldown = 0;
    this.speedFactor = 0.85 + Math.random() * 0.25;
  }

  assign(edge, lane) {
    this.edge = edge;
    this.lane = Math.min(lane, edge.lanes.length - 1);
    this.lost = false;
    this.stuck = 0;
    this.stunned = 0;
    this.pickNext();
  }

  pickNext() {
    const e = this.edge;
    let outs = e.to.out.filter((o) => o !== e.reverse);
    if (!outs.length) outs = e.to.out;
    const weights = outs.map((o) => (o.dir.x * e.dir.x + o.dir.z * e.dir.z > 0.9 ? 3 : 1.4));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let pick = outs[0];
    for (let i = 0; i < outs.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        pick = outs[i];
        break;
      }
    }
    this.next = pick;
    const c = e.dir.x * pick.dir.z - e.dir.z * pick.dir.x;
    const d = e.dir.x * pick.dir.x + e.dir.z * pick.dir.z;
    // Rechtsabbiegen ⇔ neue Richtung zeigt nach rechts (c > 0); 2 = wenden
    this.turn = d > 0.9 ? 0 : d < -0.9 ? 2 : c > 0 ? 1 : -1;
    const n = pick.lanes.length;
    this.nextLane = this.turn === 1 ? n - 1 : this.turn === -1 ? 0 : Math.min(this.lane, n - 1);
  }

  update(dt, ctx) {
    const v = this.v;
    const out = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, analog: true };
    if (!this.edge) return out;
    if (this.stunned > 0) {
      this.stunned -= dt;
      out.brake = 1;
      return out;
    }
    const e = this.edge;
    const ln = e.lanes[this.lane];
    const ne = this.next;
    const nl = ne.lanes[this.nextLane];
    const px = v.x - ln.sx;
    const pz = v.z - ln.sz;
    const s = px * e.dir.x + pz * e.dir.z;
    const lat = px * e.right.x + pz * e.right.z;

    // Übergang auf die nächste Kante, sobald ihr Anfang passiert ist
    if ((v.x - nl.sx) * ne.dir.x + (v.z - nl.sz) * ne.dir.z > -0.5) {
      this.edge = ne;
      this.lane = this.nextLane;
      this.pickNext();
      return this.update(dt, ctx);
    }
    if (Math.abs(lat) > 14 || s > ln.len + 40 || s < -30) this.lost = true;

    const vF = v.forwardSpeed;
    const look = 5 + Math.abs(vF) * 0.55;
    const [tx, tz] = this.pointAhead(s + look, ln, e, nl, ne);

    // Pure Pursuit
    const f = v.forward;
    const r = v.right;
    const dx = tx - v.x;
    const dz = tz - v.z;
    const lx = dx * r.x + dz * r.z;
    const lz = dx * f.x + dz * f.z;
    const alpha = Math.atan2(lx, Math.max(0.1, lz));
    const wb = v.spec.axles[1] - v.spec.axles[0];
    const delta = Math.atan((2 * wb * Math.sin(alpha)) / Math.max(4, Math.hypot(dx, dz)));
    out.steer = clamp(delta / v.steerLimit(vF), -1, 1);
    if (lz < 0) out.steer = Math.sign(lx || 1); // Ziel hinter uns: voll einschlagen

    // Wunschgeschwindigkeit
    let desired = e.limit * this.speedFactor;
    const distToStop = ln.len - STOP_BACK - s;
    const distToEnd = ln.len - s;
    if (this.turn !== 0) {
      desired = Math.min(desired, 7 + Math.max(0, distToEnd) * 0.35);
      if (distToEnd < 0) desired = Math.min(desired, 8);
    }
    if (Math.abs(alpha) > 0.6) desired = Math.min(desired, 6);

    // Ampel
    const light = lightState(e.to, e.axis, ctx.time);
    if (light !== 'green' && distToStop > -1.5) {
      if (light === 'red' || distToStop > 6) {
        desired = Math.min(desired, Math.sqrt(2 * 4.5 * Math.max(0, distToStop - 0.3)));
        if (distToStop < 0.8) desired = 0;
      }
    }
    // Linksabbieger warten auf Gegenverkehr
    if (this.turn === -1 && distToStop < 4 && distToStop > -2) {
      for (const o of ctx.vehicles) {
        if (o === v || !o.ai || o.ai.edge?.to !== e.to) continue;
        const od = o.ai.edge.dir;
        if (od.x * e.dir.x + od.z * e.dir.z > -0.9) continue;
        const dn = Math.hypot(o.x - e.to.x, o.z - e.to.z);
        if (dn < 38 && o.forwardSpeed > 2) {
          desired = Math.min(desired, Math.sqrt(2 * 4 * Math.max(0, distToStop)));
          break;
        }
      }
    }

    // Abstand halten (Autos und Fußgänger/Spieler)
    let blockedByPlayer = false;
    const consider = (ox, oz, olen, ovx, ovz, isPlayer) => {
      const rx = ox - v.x;
      const rz = oz - v.z;
      const along = rx * f.x + rz * f.z;
      if (along <= 0 || along > 42) return;
      const side = rx * r.x + rz * r.z;
      // Korridor in Richtung des Lenkziels leicht mitdrehen
      const bend = (lx / Math.max(1, lz)) * along * 0.6;
      if (Math.abs(side - bend) > 2.3) return;
      const gap = along - (v.spec.L + olen) / 2;
      const oSpeed = Math.max(0, ovx * f.x + ovz * f.z);
      const allowed = gap < 1.5 ? 0 : (gap - 1.5) * 0.9 + oSpeed * 0.85;
      if (allowed < desired) {
        desired = allowed;
        if (isPlayer) blockedByPlayer = true;
      }
    };
    for (const o of ctx.vehicles) {
      if (o === v || !o.simulated) continue;
      const ddx = o.x - v.x;
      const ddz = o.z - v.z;
      if (ddx * ddx + ddz * ddz > 1900) continue;
      consider(o.x, o.z, o.spec.L, o.vx, o.vz, o.driver === 'player');
    }
    if (ctx.pedestrian) consider(ctx.pedestrian.x, ctx.pedestrian.z, 0.8, 0, 0, true);

    // Gas/Bremse (P-Regler)
    const err = desired - vF;
    if (desired < 0.3 && vF < 1.2) {
      out.brake = 1;
      out.throttle = 0;
    } else if (err > 0) {
      out.throttle = clamp(err * 0.35, 0.15, 1);
    } else {
      out.brake = clamp(-err * 0.25, 0, 1);
    }

    // Blockiert? Hupen
    this.honkCooldown -= dt;
    if (desired < 1 && vF < 0.5 && blockedByPlayer) {
      this.stuck += dt;
      if (this.stuck > 2.5 && this.honkCooldown <= 0) {
        this.honkCooldown = 3 + Math.random() * 3;
        ctx.honk?.(v);
      }
    } else if (vF < 0.3 && desired > 2) {
      this.stuck += dt;
    } else this.stuck = Math.max(0, this.stuck - dt * 2);
    if (this.stuck > 25) this.lost = true;
    return out;
  }

  pointAhead(dist, ln, e, nl, ne) {
    if (dist <= ln.len) return [ln.sx + e.dir.x * dist, ln.sz + e.dir.z * dist];
    let rem = dist - ln.len;
    const cx = nl.sx - ln.ex;
    const cz = nl.sz - ln.ez;
    const lc = Math.hypot(cx, cz) || 0.001;
    if (rem <= lc) return [ln.ex + (cx / lc) * rem, ln.ez + (cz / lc) * rem];
    rem -= lc;
    rem = Math.min(rem, nl.len);
    return [nl.sx + ne.dir.x * rem, nl.sz + ne.dir.z * rem];
  }
}

// Verwaltet die KI-Autos rund um den Spieler (Spawnen außerhalb der Sicht, Recycling)
export class TrafficManager {
  constructor(game) {
    this.game = game;
    this.graph = game.city.graph;
    this.pool = new Map();
    this.target = game.quality.traffic;
    this.timer = 0;
    this.frustum = new THREE.Frustum();
    this.m4 = new THREE.Matrix4();
    this.tv = new THREE.Vector3();
  }

  get active() {
    return this.game.vehicles.filter((v) => v.driver === 'ai');
  }

  obtain(spec, color) {
    const list = this.pool.get(spec.id);
    let v = list && list.pop();
    if (!v) v = new Vehicle(spec, color);
    else v.setColor(color);
    return v;
  }

  release(v) {
    this.game.removeVehicle(v);
    v.ai = null;
    v.driver = null;
    if (!this.pool.has(v.spec.id)) this.pool.set(v.spec.id, []);
    this.pool.get(v.spec.id).push(v);
  }

  randomSpec() {
    if (Math.random() < 0.07) return modelById('police');
    if (Math.random() < 0.45) return SPORT_MODELS[Math.floor(Math.random() * SPORT_MODELS.length)];
    return Math.random() < 0.22 ? modelById('taxi') : modelById('sedan');
  }

  visible(x, y, z) {
    const cam = this.game.camera;
    this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m4);
    return this.frustum.containsPoint(this.tv.set(x, y + 1, z));
  }

  trySpawn(focus, minR, maxR) {
    const edges = this.graph.edges;
    for (let attempt = 0; attempt < 12; attempt++) {
      const e = edges[Math.floor(Math.random() * edges.length)];
      const lane = Math.floor(Math.random() * e.lanes.length);
      const ln = e.lanes[lane];
      const t = 0.1 + Math.random() * 0.6;
      const x = ln.sx + (ln.ex - ln.sx) * t;
      const z = ln.sz + (ln.ez - ln.sz) * t;
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d < minR || d > maxR) continue;
      if (d < 220 && this.visible(x, 0, z)) continue;
      let clear = true;
      for (const o of this.game.vehicles) {
        if ((o.x - x) ** 2 + (o.z - z) ** 2 < 196) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      const spec = this.randomSpec();
      const color = spec.colors[Math.floor(Math.random() * spec.colors.length)];
      const v = this.obtain(spec, color);
      v.driver = 'ai';
      if (!v.ai) v.ai = new TrafficAI(v);
      v.ai.v = v;
      v.ai.assign(e, lane);
      v.place(x, z, Math.atan2(e.dir.x, e.dir.z), e.limit * 0.6);
      v.nitro = 1;
      v.mesh.setSiren(false);
      this.game.addVehicle(v);
      return v;
    }
    return null;
  }

  fill(focus) {
    for (let i = 0; i < this.target * 3 && this.active.length < this.target; i++) this.trySpawn(focus, 25, 330);
  }

  update(dt, focus) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const act = this.active;
    for (const v of act) {
      const d = Math.hypot(v.x - focus.x, v.z - focus.z);
      const far = d > 400;
      const lostGone = v.ai.lost && d > 60 && !this.visible(v.x, v.y, v.z);
      const sunk = v.sinking > 3;
      if (far || lostGone || sunk) this.release(v);
    }
    // Vom Spieler abgestellte Autos aufräumen, wenn sie weit weg und nicht zu sehen sind
    for (const v of this.game.vehicles) {
      if (v.driver || v.parkedSpot) continue;
      const d = Math.hypot(v.x - focus.x, v.z - focus.z);
      if (d > 450 && !this.visible(v.x, v.y, v.z)) this.release(v);
    }
    const n = this.active.length;
    if (n < this.target) this.trySpawn(focus, 140, 340);
    if (n > this.target + 2) {
      // Überzählige, weit entfernte Autos entfernen
      const extra = this.active.sort((a, b) => Math.hypot(b.x - focus.x, b.z - focus.z) - Math.hypot(a.x - focus.x, a.z - focus.z));
      const v = extra[0];
      if (v && !this.visible(v.x, v.y, v.z)) this.release(v);
    }
  }
}
