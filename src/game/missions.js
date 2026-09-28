import { Vehicle } from '../vehicles/vehicle.js';
import { modelById } from '../vehicles/models.js';
import { RaceLine, RacerAI } from './racer.js';
import { DriftCounter, formatTime } from './events.js';
import { CHARS } from './career.js';
import { clamp } from '../core/rng.js';

// Gemeinsame Basis: Startaufstellung, Countdown, Abbruch bei Aussteigen/Totalschaden, Rivalen
class Mission {
  constructor(career, def) {
    this.career = career;
    this.g = career.game;
    this.def = def;
    this.phase = 'countdown';
    this.count = 3.5;
    this.t = 0;
    this.away = 0;
    this.rivals = [];
    this.car = null;
  }

  // Startposition: Wegpunkte → Linie, (lateral, längs) relativ zum Startpunkt
  slot(line, lat, along) {
    const s = line.start;
    return { x: s.x + line.right.x * lat + line.dir.x * along, z: s.z + line.right.z * lat + line.dir.z * along, h: s.h };
  }

  // Verkehr und abgestellte Autos rund um den Start entfernen
  clearArea(x, z, r) {
    const g = this.g;
    for (const v of [...g.vehicles]) {
      if (v === g.playerCar || v.driver === 'police' || v.driver === 'racer') continue;
      if ((v.x - x) ** 2 + (v.z - z) ** 2 > r * r) continue;
      if (v.driver === 'ai') g.traffic.release(v);
      else if (!v.owned) g.removeVehicle(v);
    }
  }

  placePlayer(p) {
    const g = this.g;
    this.car = g.playerCar;
    this.car.place(p.x, p.z, p.h, 0);
    this.car.nitro = 1;
    g.rig.initialized = false;
  }

  spawnRival(id, p, line, extra = {}) {
    const c = CHARS[id];
    const v = new Vehicle(modelById(c.car), c.paint);
    v.place(p.x, p.z, p.h, 0);
    v.driver = 'racer';
    v.indestructible = true;
    v.nitro = 1;
    v.ai = new RacerAI(v, line, { ...c.style, ...extra });
    v.racer = c;
    this.g.addVehicle(v);
    this.rivals.push(v);
    return v;
  }

  // Zurücksetzen nur, wenn die Kamera es nicht sieht (oder nach sehr langem Hängen)
  handleRespawn(v) {
    const ai = v.ai;
    if (!ai.wantRespawn) return;
    const f = this.g.focus;
    const far = Math.hypot(v.x - f.x, v.z - f.z) > 90;
    if (far || !this.g.traffic.visible(v.x, v.y, v.z) || ai.noProgress >= 14) ai.respawn();
  }

  countdown(dt) {
    const g = this.g;
    const before = Math.ceil(this.count);
    this.count -= dt;
    const now = Math.ceil(this.count);
    if (now !== before && now > 0 && now <= 3) {
      g.hud.bigMessage(String(now), 0.8);
      g.audio.blip(520, 0.18, 0.12);
    }
    if (this.count <= 0) {
      this.phase = 'run';
      g.hud.bigMessage('LOS!', 1);
      g.audio.blip(1040, 0.35, 0.14);
      for (const r of this.rivals) r.ai.hold = false;
      if (this.def.police) g.police.raise(this.def.police, 'Die Polizei mischt mit!');
      this.onGo?.();
    }
  }

  // true, wenn die Mission deswegen gescheitert ist
  checkCar(dt) {
    const g = this.g;
    if (g.playerCar !== this.car || this.car.dead) {
      if (this.car.dead) return this.fail('Totalschaden – Mission gescheitert');
      this.away += dt;
      if (this.away > 5) return this.fail('Auto verlassen – Mission gescheitert');
    } else this.away = 0;
    return false;
  }

  update(dt) {
    if (this.phase === 'countdown') return this.countdown(dt);
    if (this.phase !== 'run') return;
    this.t += dt;
    if (this.checkCar(dt)) return;
    this.step(dt);
  }

  succeed() {
    this.phase = 'done';
    this.career.succeed(this);
    return true;
  }

  fail(reason) {
    this.phase = 'done';
    this.career.fail(reason);
    return true;
  }

  get target() {
    return null;
  }

  blips() {
    return this.rivals.map((v) => ({ x: v.x, z: v.z, kind: 'rival', color: v.racer.color }));
  }

  // Rivalen verschwinden, wenn niemand hinsieht; sonst rollen sie aus und werden später aufgeräumt
  cleanup() {
    const g = this.g;
    for (const v of this.rivals) {
      if (!g.vehicles.includes(v)) continue;
      if (g.traffic.visible(v.x, v.y, v.z) && Math.hypot(v.x - g.focus.x, v.z - g.focus.z) < 150) {
        v.driver = null;
        v.ai = null;
        v.indestructible = false;
      } else g.removeVehicle(v);
    }
    this.rivals = [];
  }
}

// Rennen gegen 1–3 Rivalen (optional mit Polizei), Positionsanzeige, Rubber-Banding
export class RaceMission extends Mission {
  setup() {
    const d = this.def;
    const g = this.g;
    const L = (this.line = new RaceLine(g.city.graph, d.route, { laps: d.laps || 1 }));
    this.clearArea(L.start.x, L.start.z, 45);
    this.placePlayer(this.slot(L, 2.8, 0));
    const slots = [[-2.8, 0], [2.8, -10], [-2.8, -10]];
    d.rivals.forEach((id, i) => this.spawnRival(id, this.slot(L, slots[i][0], slots[i][1]), L));
    this.cp = 0;
    this.finishedRivals = 0;
    this.career.showCps(L.cps, 0);
  }

  get target() {
    if (this.phase === 'done') return null;
    const c = this.line.cps[this.cp];
    return c ? { x: c[0], z: c[1], label: this.cp === this.line.cps.length - 1 ? 'Ziel' : 'Checkpoint' } : null;
  }

  blips() {
    const out = super.blips();
    const t = this.target;
    if (t) out.push({ x: t.x, z: t.z, kind: 'checkpoint' });
    return out;
  }

  progress() {
    return this.line.progressOf(this.cp, this.car.x, this.car.z);
  }

  position() {
    const p = this.progress();
    return 1 + this.rivals.filter((r) => r.ai.finished || r.ai.s > p).length;
  }

  step() {
    const g = this.g;
    const L = this.line;
    const car = this.car;
    // Checkpoints des Spielers
    const c = L.cps[this.cp];
    if (Math.hypot(car.x - c[0], car.z - c[1]) < 13) {
      this.cp++;
      if (this.cp >= L.cps.length) {
        const place = this.position();
        return place === 1 ? this.succeed() : this.fail(`Platz ${place} – verloren`);
      }
      g.audio.blip(880, 0.1, 0.1);
      if (L.laps > 1 && this.cp % L.lapCps === 0) g.hud.bigMessage(`Runde ${this.cp / L.lapCps + 1}`, 1.2);
      this.career.showCps(L.cps, this.cp);
    }
    // Rivalen: Rubber-Banding, Hänger, Zieleinlauf
    const pp = this.progress();
    for (const r of this.rivals) {
      const ai = r.ai;
      const gap = ai.s - pp;
      ai.rubber = gap > 30 ? clamp(1 - (gap - 30) / 350, 0.72, 1) : gap < -40 ? clamp(1 + (-gap - 40) / 500, 1, 1.12) : 1;
      ai.boost = gap < -40;
      this.handleRespawn(r);
      if (ai.finished) return this.fail(`${r.racer.short} gewinnt das Rennen`);
    }
  }

  hud() {
    const L = this.line;
    const s = { title: this.def.name, main: formatTime(this.t), pos: `${this.position()}./${this.rivals.length + 1}` };
    if (L.laps > 1) s.sub = `Runde ${Math.min(L.laps, Math.floor(this.cp / L.lapCps) + 1)}/${L.laps} · CP ${(this.cp % L.lapCps) + 1}/${L.lapCps}`;
    else s.sub = `Checkpoint ${Math.min(this.cp + 1, L.cps.length)}/${L.cps.length}`;
    s.info = `Gegen ${this.def.rivals.map((id) => CHARS[id].short).join(', ')}`;
    return s;
  }
}

// Drift-Battle gegen die Punktzahl eines Rivalen
export class DriftMission extends Mission {
  setup() {
    const d = this.def;
    const L = new RaceLine(this.g.city.graph, d.route);
    this.clearArea(L.start.x, L.start.z, 40);
    this.placePlayer(this.slot(L, 2.8, 0));
    this.drift = new DriftCounter(this.g.hud);
  }

  step(dt) {
    this.drift.update(dt, this.car);
    if (this.drift.score >= this.def.target) return this.succeed();
    if (this.t >= this.def.limit) {
      this.drift.bank();
      return this.drift.score >= this.def.target ? this.succeed() : this.fail(`${CHARS[this.def.rival].short} bleibt vorn`);
    }
  }

  hud() {
    const d = this.def;
    return {
      title: d.name,
      main: `${Math.round(this.drift?.score || 0).toLocaleString('de-DE')} Pkt`,
      sub: this.drift?.sub || `Noch ${Math.max(0, d.limit - this.t).toFixed(0)} s`,
      info: `${CHARS[d.rival].short}: ${d.target.toLocaleString('de-DE')} Pkt`,
    };
  }
}

// Überführung: fremdes Auto unter Zeitdruck und mit Schadenslimit ans Ziel bringen
export class DeliveryMission extends Mission {
  setup() {
    const g = this.g;
    const d = this.def;
    const L = new RaceLine(g.city.graph, d.route);
    const p = this.slot(L, 2.8, 0);
    this.clearArea(p.x, p.z, 35);
    // Das eigene Auto bleibt in Lolas Garage, der Spieler übernimmt den Auftragswagen
    this.ownId = g.playerCar?.owned ? g.playerCar.spec.id : g.save.data.car;
    if (g.playerCar) {
      const own = g.playerCar;
      g.exitCar();
      if (own.owned) g.removeVehicle(own);
    }
    const v = new Vehicle(modelById(d.car), d.paint);
    v.place(p.x, p.z, p.h, 0);
    g.addVehicle(v);
    g.enterCar(v);
    this.car = v;
    v.nitro = 1;
    g.rig.initialized = false;
    this.career.showDest(d.dest);
  }

  get target() {
    return this.phase === 'done' ? null : { x: this.def.dest.x, z: this.def.dest.z, label: this.def.dest.name };
  }

  blips() {
    return [{ x: this.def.dest.x, z: this.def.dest.z, kind: 'checkpoint' }];
  }

  step() {
    const d = this.def;
    const car = this.car;
    if (car.damage > d.maxDamage) return this.fail('Zu viel Schaden – Auftrag verloren');
    if (this.t > d.limit) return this.fail('Zu spät – Auftrag verloren');
    if (Math.hypot(car.x - d.dest.x, car.z - d.dest.z) < 9 && car.speed < 10) return this.succeed();
  }

  hud() {
    const d = this.def;
    const dmg = Math.round((this.car?.damage || 0) * 100);
    return {
      title: d.name,
      main: formatTime(Math.max(0, d.limit - this.t)),
      sub: `Schaden ${dmg} % · max. ${Math.round(d.maxDamage * 100)} %`,
      info: `Ziel: ${d.dest.name}`,
    };
  }

  // Auftragswagen gegen das eigene Auto tauschen (Lola lässt es bringen)
  cleanup() {
    super.cleanup();
    const g = this.g;
    const v = this.car;
    if (!v || !g.vehicles.includes(v)) return;
    const inCar = g.playerCar === v;
    const pos = { x: v.x, z: v.z, h: v.heading };
    if (inCar) g.exitCar();
    g.removeVehicle(v);
    const own = g.dealer.spawnOwn(this.ownId, pos);
    if (inCar && own) g.enterCar(own);
  }
}

// Verfolgung: einem Rivalen folgen, ohne entdeckt zu werden oder ihn zu verlieren
export class TailMission extends Mission {
  setup() {
    const g = this.g;
    const d = this.def;
    const L = (this.line = new RaceLine(g.city.graph, d.route, { startOffset: 20 }));
    this.clearArea(L.start.x, L.start.z, 45);
    this.placePlayer(this.slot(L, 2.8, 0));
    const p = L.pointAt(60);
    this.clearArea(p.x, p.z, 25);
    const r = this.spawnRival(d.rival, { x: p.x + -p.dz * 2.5, z: p.z + p.dx * 2.5, h: Math.atan2(p.dx, p.dz) }, L, { cruise: d.cruise, lane: 2.5, drift: false });
    r.ai.idx = p.idx;
    r.ai.s = 60;
    this.rival = r;
    this.suspicion = 0;
    this.lostT = 0;
    this.dist = 60;
  }

  get target() {
    if (this.phase === 'done' || !this.rival) return null;
    return { x: this.rival.x, z: this.rival.z, label: this.rival.racer.short };
  }

  step(dt) {
    const r = this.rival;
    const ai = r.ai;
    const car = this.car;
    const d = (this.dist = Math.hypot(car.x - r.x, car.z - r.z));
    // Zu nah: Verdacht steigt (Rammen verrät dich sofort)
    if (d < 7 && (r.frameImpact > 2 || car.frameImpact > 2)) return this.fail(`${r.racer.short} hat dich bemerkt!`);
    const rate = d < 18 ? 0.55 : d < 30 ? 0.22 : -0.15;
    this.suspicion = clamp(this.suspicion + rate * dt, 0, 1);
    if (this.suspicion >= 1) return this.fail(`${r.racer.short} hat dich bemerkt!`);
    // Zu weit: kurz warten lassen, dann gilt er als verloren
    ai.style.cruise = this.def.cruise * (d > 110 ? 0.55 : 1);
    if (d > 150) {
      this.lostT += dt;
      if (this.lostT > 6 || d > 260) return this.fail(`${r.racer.short} ist weg – aus den Augen verloren`);
    } else this.lostT = 0;
    this.handleRespawn(r);
    if (ai.finished && r.speed < 4) return this.succeed();
  }

  hud() {
    const n = Math.round((this.suspicion || 0) * 5);
    const bar = '■'.repeat(n) + '□'.repeat(5 - n);
    const d = Math.round(this.dist || 0);
    const warn = d > 150 ? ' · Du verlierst ihn!' : d < 30 ? ' · Zu nah!' : '';
    return { title: this.def.name, main: `${d} m`, sub: `Verdacht ${bar}${warn}`, info: 'Abstand halten: 30–150 m' };
  }
}

export const MISSION_TYPES = { race: RaceMission, drift: DriftMission, delivery: DeliveryMission, tail: TailMission };
