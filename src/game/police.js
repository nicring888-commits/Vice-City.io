import { modelById } from '../vehicles/models.js';
import { TrafficAI } from '../vehicles/traffic.js';
import { clamp } from '../core/rng.js';

const COPS_PER_LEVEL = [0, 1, 2, 3, 4, 6];
const STATION = { x: -341, z: -300, h: -Math.PI / 2 };

// Kürzester Weg im Straßengraph (A*), liefert Liste von Knoten
export function route(graph, from, to) {
  const open = new Map([[from.id, { n: from, g: 0, f: 0, prev: null }]]);
  const closed = new Map();
  while (open.size) {
    let cur = null;
    for (const o of open.values()) if (!cur || o.f < cur.f) cur = o;
    open.delete(cur.n.id);
    closed.set(cur.n.id, cur);
    if (cur.n === to) {
      const path = [];
      for (let c = cur; c; c = c.prev) path.unshift(c.n);
      return path;
    }
    for (const e of cur.n.out) {
      const n = e.to;
      if (closed.has(n.id)) continue;
      const g = cur.g + Math.hypot(n.x - cur.n.x, n.z - cur.n.z);
      const old = open.get(n.id);
      if (!old || g < old.g) open.set(n.id, { n, g, f: g + Math.hypot(n.x - to.x, n.z - to.z), prev: cur });
    }
  }
  return [to];
}

export function nearestNode(graph, x, z) {
  let best = null;
  let bd = Infinity;
  for (const n of graph.nodes) {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

// Verfolger: direkt aufs Ziel, wenn in Sicht, sonst über das Straßennetz
export class PursuitAI {
  constructor(v, police) {
    this.v = v;
    this.police = police;
    this.path = null;
    this.repath = 0;
    this.stuck = 0;
    this.reverse = 0;
    this.lost = false;
    this.los = false;
    this.stunned = 0;
  }

  update(dt, ctx) {
    const v = this.v;
    const out = { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false, analog: true };
    if (this.stunned > 0) {
      this.stunned -= dt;
      out.throttle = 0.3;
    }
    const tgt = this.police.targetPos;
    const dist = Math.hypot(tgt.x - v.x, tgt.z - v.z);
    let aim = tgt;
    this.repath -= dt;
    if (!(this.los && dist < 120)) {
      if (this.repath <= 0 || !this.path) {
        const g = this.police.graph;
        this.path = route(g, nearestNode(g, v.x, v.z), nearestNode(g, tgt.x, tgt.z));
        this.repath = 1.2;
        // Liegt der erste Knoten hinter uns (wir sind schon Richtung zweiter unterwegs), überspringen
        if (this.path.length > 1) {
          const [a, b] = this.path;
          if (Math.hypot(b.x - v.x, b.z - v.z) < Math.hypot(b.x - a.x, b.z - a.z)) this.path.shift();
        }
      }
      while (this.path.length > 1 && Math.hypot(this.path[0].x - v.x, this.path[0].z - v.z) < 16) this.path.shift();
      const n = this.path[0];
      if (n && Math.hypot(n.x - v.x, n.z - v.z) > 16) aim = n;
    }
    const f = v.forward;
    const r = v.right;
    const dx = aim.x - v.x;
    const dz = aim.z - v.z;
    const lx = dx * r.x + dz * r.z;
    const lz = dx * f.x + dz * f.z;
    const alpha = Math.atan2(lx, lz);
    out.steer = clamp(alpha * 1.8, -1, 1);
    const speed = v.forwardSpeed;
    if (Math.abs(alpha) > 0.9 && speed > 16) {
      out.throttle = 0.2;
      out.brake = 0.6;
    }
    if (Math.abs(alpha) > 1.3 && speed > 10) out.handbrake = true;
    // Ganz nah am (fast stehenden) Spieler: abbremsen, um ihn festzusetzen
    if (dist < 9 && this.police.targetSpeed < 4) {
      out.throttle = 0;
      out.brake = 1;
    } else if (dist < 7) out.throttle = Math.min(out.throttle, 0.3);
    // Festgefahren: kurz zurücksetzen
    if (this.reverse > 0) {
      this.reverse -= dt;
      return { throttle: 0, brake: 1, steer: -Math.sign(lx || 1), handbrake: false, nitro: false, analog: true };
    }
    if (out.throttle > 0.5 && Math.abs(speed) < 1.2 && dist > 10) {
      this.stuck += dt;
      if (this.stuck > 1.4) {
        this.stuck = 0;
        this.reverse = 1.3;
      }
    } else this.stuck = Math.max(0, this.stuck - dt);
    return out;
  }
}

// Fahndungssystem: Sterne, Verstärkung, Abhängen, Festnahme
export class PoliceSystem {
  constructor(game) {
    this.game = game;
    this.graph = game.city.graph;
    this.level = 0;
    this.lastSeen = 0;
    this.time = 0;
    this.heat = 0;
    this.chase = 0;
    this.dispatch = 0;
    this.bust = 0;
    this.targetPos = { x: 0, z: 0 };
    this.targetSpeed = 0;
    this.lastHit = -9;
  }

  get cops() {
    return this.game.vehicles.filter((v) => v.driver === 'police');
  }

  get searching() {
    return this.level > 0 && this.time - this.lastSeen > 2;
  }

  raise(to, reason) {
    if (this.game.online?.race) return; // im Online-Rennen keine Polizei
    const lvl = clamp(to, 0, 5);
    if (lvl <= this.level) return;
    const first = this.level === 0;
    this.level = lvl;
    this.lastSeen = this.time;
    this.chase = 0;
    if (first) this.game.hud.bigMessage(reason || 'Fahndung!', 1.6, 'fail');
    this.activateNearby();
  }

  // Streifenwagen im normalen Verkehr in der Nähe nehmen die Verfolgung auf
  activateNearby() {
    const f = this.game.focus;
    for (const v of this.game.vehicles) {
      if (v.spec.police && v.driver === 'ai' && Math.hypot(v.x - f.x, v.z - f.z) < 180) this.makePursuer(v);
    }
  }

  makePursuer(v) {
    v.driver = 'police';
    v.ai = new PursuitAI(v, this);
    v.mesh.setSiren(true);
  }

  // Polizist in Sichtweite? (für Carjacking-Zeugen, Rasen)
  copWitness(x, z, range = 80) {
    for (const v of this.game.vehicles) {
      if (!v.spec.police || v.driver === 'player' || !v.driver) continue;
      if (Math.hypot(v.x - x, v.z - z) > range) continue;
      if (this.game.collision.raycast(v.x, 1.5, v.z, x, 1.5, z) >= 1) return v;
    }
    return null;
  }

  onCarjack(v, x, z) {
    if (v.spec.police) return this.raise(Math.max(2, this.level + 1), 'Streifenwagen geklaut!');
    if (this.copWitness(x, z)) this.raise(1, 'Carjacking – die Polizei hat es gesehen!');
    else if (Math.random() < 0.3) this.raise(1, 'Ein Zeuge hat die Polizei gerufen!');
  }

  onPedestrianHit() {
    this.raise(this.level + 1, 'Fußgänger angefahren!');
  }

  onCopHit(strength) {
    if (this.time - this.lastHit < 1) return;
    this.lastHit = this.time;
    if (this.level === 0) return this.raise(1, 'Streifenwagen gerammt!');
    this.heat += strength;
    if (this.heat > 45) {
      this.heat = 0;
      this.raise(this.level + 1);
    }
  }

  clear(msg = 'Abgehängt!') {
    if (!this.level) return;
    this.level = 0;
    this.heat = 0;
    this.bust = 0;
    this.game.hud.bigMessage(msg, 1.8, 'medal3');
    // Verfolger kehren in den normalen Verkehr zurück oder verschwinden
    for (const v of this.cops) {
      v.mesh.setSiren(false);
      const d = Math.hypot(v.x - this.game.focus.x, v.z - this.game.focus.z);
      if (d > 120 && !this.game.traffic.visible(v.x, v.y, v.z)) this.game.traffic.release(v);
      else this.toTraffic(v);
    }
  }

  toTraffic(v) {
    let best = null;
    let bd = Infinity;
    for (const e of this.graph.edges) {
      const ln = e.lanes[0];
      const t = clamp(((v.x - ln.sx) * e.dir.x + (v.z - ln.sz) * e.dir.z) / ln.len, 0, 1);
      const d = (ln.sx + e.dir.x * ln.len * t - v.x) ** 2 + (ln.sz + e.dir.z * ln.len * t - v.z) ** 2;
      if (d < bd && t < 0.9) {
        bd = d;
        best = e;
      }
    }
    v.driver = 'ai';
    v.ai = new TrafficAI(v);
    v.ai.assign(best, 0);
  }

  spawnCop() {
    const g = this.game;
    const f = g.focus;
    const edges = this.graph.edges;
    for (let i = 0; i < 16; i++) {
      const e = edges[Math.floor(Math.random() * edges.length)];
      const ln = e.lanes[0];
      const t = 0.2 + Math.random() * 0.6;
      const x = ln.sx + (ln.ex - ln.sx) * t;
      const z = ln.sz + (ln.ez - ln.sz) * t;
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < 110 || d > 240 || g.traffic.visible(x, 0, z)) continue;
      if (g.vehicles.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < 150)) continue;
      const spec = modelById('police');
      const v = g.traffic.obtain(spec, spec.colors[0]);
      v.place(x, z, Math.atan2(e.dir.x, e.dir.z), 12);
      this.makePursuer(v);
      g.addVehicle(v);
      return v;
    }
    return null;
  }

  busted() {
    const g = this.game;
    const fine = Math.max(100, Math.round(g.save.money * 0.1));
    g.save.addMoney(-fine);
    g.events.active && g.events.cancel('Verhaftet – Event verloren');
    g.career.active && g.career.fail('Verhaftet – Mission gescheitert');
    if (g.playerCar) g.exitCar();
    g.player.place(STATION.x, STATION.z, STATION.h);
    g.rig.initialized = false;
    this.clear('Verhaftet');
    g.hud.bigMessage(`VERHAFTET\nStrafe: $${fine}`, 3.5, 'fail');
    for (const v of this.cops) if (Math.hypot(v.x - STATION.x, v.z - STATION.z) > 60) g.traffic.release(v);
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    const f = g.focus;
    const car = g.playerCar;
    const vx = car ? car.vx : g.player.vx;
    const vz = car ? car.vz : g.player.vz;
    this.targetSpeed = Math.hypot(vx, vz);
    this.targetPos.x = f.x + vx * 0.6;
    this.targetPos.z = f.z + vz * 0.6;

    // Rasen direkt vor einem Streifenwagen
    if (this.level === 0 && car && car.speed > 40 && this.copWitness(car.x, car.z, 45)) this.raise(1, 'Zu schnell – Polizei!');
    if (!this.level) {
      g.audio.siren(0);
      return;
    }

    const cops = this.cops;
    let nearest = Infinity;
    let seen = false;
    for (const v of cops) {
      const d = Math.hypot(v.x - f.x, v.z - f.z);
      nearest = Math.min(nearest, d);
      v.ai.los = d < 200 && g.collision.raycast(v.x, 1.5, v.z, f.x, 1.5, f.z) >= 1;
      if (v.ai.los && d < 70 + this.level * 15) seen = true;
      // Weit abgehängte Verfolger recyceln
      if (d > 420 && !g.traffic.visible(v.x, v.y, v.z)) g.traffic.release(v);
    }
    if (seen) this.lastSeen = this.time;

    // Verstärkung anfordern
    this.dispatch -= dt;
    if (this.dispatch <= 0 && cops.length < COPS_PER_LEVEL[this.level]) {
      this.dispatch = 2.5;
      this.spawnCop();
    }

    // Lange Verfolgung eskaliert bis 3 Sterne
    if (seen) {
      this.chase += dt;
      if (this.chase > 50 && this.level < 3) this.raise(this.level + 1);
    }

    // Abhängen bringt Ruf (10 je Stern)
    if (this.time - this.lastSeen > 7 + this.level * 2) {
      const lvl = this.level;
      this.clear();
      g.addRep(10 * lvl);
      return;
    }

    // Festnahme: langsam und ein Polizist direkt daneben
    const close = car ? 10.5 : 4.5;
    if (nearest < close && this.targetSpeed < 1.5) {
      this.bust += dt;
      if (this.bust > 2.5) this.busted();
    } else this.bust = Math.max(0, this.bust - dt * 2);

    g.audio.siren(clamp(1 - nearest / 160, 0, 1));
  }
}
