import { Marker } from './markers.js';

// Rennen & Challenges. Medaillen: 3 = Gold, 2 = Silber, 1 = Bronze, 0 = keine.
// Zeiten in Sekunden (weniger ist besser), Punkte/Meter (mehr ist besser).
export const EVENTS = [
  {
    id: 'ocean-sprint',
    name: 'Ocean Drive Sprint',
    type: 'sprint',
    desc: 'Ocean Drive hoch und über den Starfish Causeway nach Downtown.',
    start: { x: 583.5, z: 560, h: Math.PI },
    cps: [[580, 400], [580, 200], [580, 0], [580, -200], [580, -400], [470, -400], [360, -400], [230, -400], [100, -400], [-50, -400]],
    medals: [44, 52, 62],
    reward: [1500, 900, 500],
  },
  {
    id: 'downtown-loop',
    name: 'Downtown-Rundkurs',
    type: 'circuit',
    laps: 2,
    desc: 'Zwei Runden um die Glastürme von Downtown.',
    start: { x: 103.5, z: 150, h: Math.PI },
    cps: [[100, -200], [-50, -200], [-200, -200], [-200, 0], [-200, 200], [-50, 200], [100, 200], [100, 130]],
    medals: [88, 102, 122],
    reward: [1800, 1100, 600],
  },
  {
    id: 'highway-blitz',
    name: 'Highway Blitz',
    type: 'sprint',
    desc: 'Vollgas auf dem Vice Highway, dann rechts ab.',
    start: { x: -643.8, z: 590, h: Math.PI },
    cps: [[-650, 300], [-650, 0], [-650, -300], [-650, -600], [-500, -600], [-350, -600], [-200, -600]],
    medals: [40, 47, 56],
    reward: [1200, 700, 400],
  },
  {
    id: 'causeway-jump',
    name: 'Causeway-Sprung',
    type: 'jump',
    desc: 'Nimm Anlauf und flieg über den Scheitel des Vice Causeway. Nitro hilft!',
    start: { x: -190, z: 3, h: Math.PI / 2 },
    limit: 30,
    medals: [75, 55, 35],
    reward: [1200, 700, 400],
  },
  {
    id: 'havana-drift',
    name: 'Little Havana Drift',
    type: 'drift',
    desc: '60 Sekunden driften. Lange Drifts erhöhen den Multiplikator, Crashs kosten die Combo.',
    start: { x: -346.5, z: 180, h: Math.PI },
    limit: 60,
    medals: [16000, 10000, 5000],
    reward: [1300, 800, 450],
  },
  {
    id: 'container-jump',
    name: 'Container-Sprung',
    type: 'jump',
    desc: 'Im Hafen über die Rampe und die Containerreihe fliegen. Weite zählt, Nitro hilft!',
    start: { x: -346, z: 878, h: Math.PI / 2 },
    limit: 30,
    medals: [105, 75, 45],
    reward: [1400, 800, 450],
  },
  {
    id: 'port-drift',
    name: 'Hafen-Drift',
    type: 'drift',
    desc: '60 Sekunden quer durch die Gassen zwischen den Containern und Lagerhallen.',
    start: { x: -320, z: 803, h: Math.PI / 2 },
    limit: 60,
    medals: [18000, 11000, 5500],
    reward: [1500, 900, 500],
  },
];

const lowerIsBetter = (ev) => ev.type === 'sprint' || ev.type === 'circuit';
export const MEDAL_NAMES = ['–', 'Bronze', 'Silber', 'Gold'];
// Ruf für eine neu erreichte Medaille (nur die Verbesserung zählt)
const MEDAL_REP = [0, 20, 40, 80];

// Drift-Wertung: lange Drifts erhöhen den Multiplikator, Crashs kosten die Combo
export class DriftCounter {
  constructor(hud) {
    this.hud = hud;
    this.score = 0;
    this.combo = 0;
    this.comboTime = 0;
    this.idle = 0;
    this.mult = 1;
  }

  update(dt, c) {
    const drifting = c.grounded && c.slip > 3.5 && c.speed > 8;
    if (c.frameImpact > 4 && this.combo > 0) {
      this.combo = 0;
      this.comboTime = 0;
      this.hud.bigMessage('Combo verloren', 1, 'fail');
    }
    if (drifting) {
      this.comboTime += dt;
      this.idle = 0;
      this.mult = Math.min(5, 1 + Math.floor(this.comboTime / 2));
      this.combo += c.slip * c.speed * dt * 1.5;
    } else if (this.combo > 0) {
      this.idle += dt;
      if (this.idle > 1.2) this.bank();
    }
  }

  bank() {
    if (this.combo <= 0) return 0;
    const pts = this.combo * (this.mult || 1);
    this.score += pts;
    this.hud.bigMessage(`+${Math.round(pts).toLocaleString('de-DE')}`, 1);
    this.combo = 0;
    this.comboTime = 0;
    this.mult = 1;
    return pts;
  }

  get sub() {
    return this.combo > 0 ? `Combo ${Math.round(this.combo)} × ${this.mult}` : null;
  }
}

export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export function formatValue(ev, v) {
  if (lowerIsBetter(ev)) return formatTime(v);
  if (ev.type === 'jump') return `${v.toFixed(1)} m`;
  return `${Math.round(v).toLocaleString('de-DE')} Pkt`;
}

function medalFor(ev, v) {
  const [g, s, b] = ev.medals;
  if (lowerIsBetter(ev)) return v <= g ? 3 : v <= s ? 2 : v <= b ? 1 : 0;
  return v >= g ? 3 : v >= s ? 2 : v >= b ? 1 : 0;
}

export class EventManager {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.near = null;
    this.startMarkers = EVENTS.map((ev) => ({ ev, m: new Marker(game.scene, { x: ev.start.x, z: ev.start.z, radius: 5.5, color: '#ffd23f', height: 40 }) }));
    this.cpMarker = new Marker(game.scene, { x: 0, z: 0, radius: 9, color: '#ff3fa4', height: 60 });
    this.cpNext = new Marker(game.scene, { x: 0, z: 0, radius: 6, color: '#35f2ff', height: 25 });
    this.cpMarker.visible = this.cpNext.visible = false;
  }

  get locked() {
    return this.active?.phase === 'countdown';
  }

  // Ziel für Navigationspfeil und Minimap
  get target() {
    const a = this.active;
    if (!a || a.phase === 'done') return null;
    if (a.route) {
      const p = a.route[Math.min(a.cp, a.route.length - 1)];
      return { x: p[0], z: p[1], label: a.cp === a.route.length - 1 ? 'Ziel' : 'Checkpoint' };
    }
    return null;
  }

  blips() {
    const out = [];
    if (!this.game.busy) for (const { ev } of this.startMarkers) out.push({ x: ev.start.x, z: ev.start.z, kind: 'event' });
    const t = this.target;
    if (t) out.push({ x: t.x, z: t.z, kind: 'checkpoint' });
    return out;
  }

  start(ev) {
    const g = this.game;
    const car = g.playerCar;
    if (!car || g.busy) return;
    if (g.police.level > 0) {
      g.hud.toast('Erst die Polizei abhängen!', 2);
      return;
    }
    car.place(ev.start.x, ev.start.z, ev.start.h, 0);
    car.nitro = 1;
    g.rig.initialized = false;
    let route = null;
    if (ev.cps) {
      route = [];
      for (let l = 0; l < (ev.laps || 1); l++) route.push(...ev.cps);
    }
    this.active = { ev, car, phase: 'countdown', t: 0, count: 3.5, cp: 0, route, drift: new DriftCounter(g.hud), best: 0, jump: null, away: 0 };
    this.updateCpMarkers();
    g.hud.setEventHud(this.hudState());
  }

  cancel(reason = 'Event abgebrochen') {
    if (!this.active) return;
    this.game.hud.bigMessage(reason, 2.5, 'fail');
    this.finishCleanup();
  }

  finishCleanup() {
    this.active = null;
    this.cpMarker.visible = this.cpNext.visible = false;
    this.game.hud.setEventHud(null);
  }

  updateCpMarkers() {
    const a = this.active;
    if (!a?.route) {
      this.cpMarker.visible = this.cpNext.visible = false;
      return;
    }
    const cur = a.route[a.cp];
    const nxt = a.route[a.cp + 1];
    this.cpMarker.visible = !!cur;
    if (cur) this.cpMarker.moveTo(cur[0], cur[1]);
    this.cpNext.visible = !!nxt;
    if (nxt) this.cpNext.moveTo(nxt[0], nxt[1]);
  }

  hudState() {
    const a = this.active;
    if (!a) return null;
    const ev = a.ev;
    const best = this.game.save.best(ev.id);
    const s = { title: ev.name, best: best ? formatValue(ev, best.value) : null, medals: ev.medals.map((m) => formatValue(ev, m)) };
    if (ev.type === 'sprint' || ev.type === 'circuit') {
      s.main = formatTime(a.t);
      const per = ev.cps.length;
      s.sub = ev.laps ? `Runde ${Math.min(ev.laps, Math.floor(a.cp / per) + 1)}/${ev.laps} · CP ${(a.cp % per) + 1}/${per}` : `Checkpoint ${a.cp + 1}/${a.route.length}`;
    } else if (ev.type === 'drift') {
      s.main = `${Math.round(a.drift.score).toLocaleString('de-DE')} Pkt`;
      s.sub = a.drift.sub || `Noch ${Math.max(0, ev.limit - a.t).toFixed(0)} s`;
    } else {
      s.main = `${a.best.toFixed(1)} m`;
      s.sub = a.jump ? 'In der Luft …' : `Noch ${Math.max(0, ev.limit - a.t).toFixed(0)} s`;
    }
    return s;
  }

  update(dt) {
    const g = this.game;
    const car = g.playerCar;
    for (const s of this.startMarkers) s.m.update(dt);
    this.cpMarker.update(dt);
    this.cpNext.update(dt);

    for (const s of this.startMarkers) s.m.visible = !g.busy;
    if (!this.active) {
      this.near = null;
      if (car && !car.dead && !g.busy) {
        for (const { ev, m } of this.startMarkers) {
          if (m.contains(car.x, car.z, 1) && car.speed < 9) this.near = ev;
        }
      }
      if (this.near) {
        g.hud.offerPrompt(this.promptFor(this.near));
        if (g.input.pressed('start')) this.start(this.near);
      }
      return;
    }

    const a = this.active;
    const ev = a.ev;
    // Abbruch: Auto verlassen, Totalschaden
    if (g.playerCar !== a.car || a.car.dead) {
      a.away += dt;
      if (a.car.dead) return this.cancel('Totalschaden – Event verloren');
      if (a.away > 5) return this.cancel('Event abgebrochen');
    } else a.away = 0;

    if (a.phase === 'countdown') {
      const before = Math.ceil(a.count);
      a.count -= dt;
      const now = Math.ceil(a.count);
      if (now !== before && now > 0 && now <= 3) {
        g.hud.bigMessage(String(now), 0.8);
        g.audio.blip(520, 0.18, 0.12);
      }
      if (a.count <= 0) {
        a.phase = 'run';
        g.hud.bigMessage('LOS!', 1);
        g.audio.blip(1040, 0.35, 0.14);
      }
      g.hud.setEventHud(this.hudState());
      return;
    }
    if (a.phase !== 'run') return;
    a.t += dt;

    if (a.route) {
      const cp = a.route[a.cp];
      if (Math.hypot(a.car.x - cp[0], a.car.z - cp[1]) < 12.5) {
        a.cp++;
        if (a.cp >= a.route.length) return this.finish(a.t);
        g.audio.blip(880, 0.1, 0.1);
        if (ev.laps && a.cp % ev.cps.length === 0) g.hud.bigMessage(`Runde ${a.cp / ev.cps.length + 1}`, 1.2);
        this.updateCpMarkers();
      }
    } else if (ev.type === 'drift') {
      a.drift.update(dt, a.car);
      if (a.t >= ev.limit) {
        a.drift.bank();
        return this.finish(a.drift.score);
      }
    } else if (ev.type === 'jump') {
      const c = a.car;
      if (c.airborne && !a.jump) a.jump = { x: c.x, z: c.z };
      if (!c.airborne && a.jump) {
        const d = Math.hypot(c.x - a.jump.x, c.z - a.jump.z);
        a.jump = null;
        if (d > 8) {
          a.best = Math.max(a.best, d);
          g.hud.bigMessage(`${d.toFixed(1)} m`, 1.5);
          if (d > 20) return this.finish(a.best);
        }
      }
      if (a.t >= ev.limit && !a.jump) return this.finish(a.best);
    }
    g.hud.setEventHud(this.hudState());
  }

  finish(value) {
    const g = this.game;
    const a = this.active;
    const ev = a.ev;
    a.phase = 'done';
    const medal = medalFor(ev, value);
    const prevMedal = g.save.best(ev.id)?.medal ?? 0;
    const record = g.save.record(ev.id, value, medal, lowerIsBetter(ev));
    const reward = medal ? ev.reward[3 - medal] : 0;
    if (reward) g.save.addMoney(reward);
    const rep = medal > prevMedal ? MEDAL_REP[medal] - MEDAL_REP[prevMedal] : 0;
    if (rep) g.addRep(rep);
    const lines = [formatValue(ev, value), medal ? `${MEDAL_NAMES[medal]} · +$${reward.toLocaleString('de-DE')}` : 'Keine Medaille'];
    if (rep) lines.push(`+${rep} Ruf`);
    if (record) lines.push('Neue Bestleistung!');
    g.hud.bigMessage(lines.join('\n'), 5, medal ? `medal${medal}` : 'fail');
    g.audio.blip(medal ? 1320 : 300, 0.5, 0.14);
    this.finishCleanup();
  }

  promptFor(ev) {
    const best = this.game.save.best(ev.id);
    return {
      name: ev.name,
      desc: ev.desc,
      meta: `Bestleistung: ${best ? `${formatValue(ev, best.value)} (${MEDAL_NAMES[best.medal]})` : 'noch keine'} · Gold: ${formatValue(ev, ev.medals[0])}`,
    };
  }
}
