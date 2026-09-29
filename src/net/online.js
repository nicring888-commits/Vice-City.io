import * as THREE from 'three';
import { createTransport } from './transport.js';
import { MAX_PLAYERS, SEND_HZ, RACE_SEND_HZ } from './config.js';
import { Vehicle } from '../vehicles/vehicle.js';
import { modelById } from '../vehicles/models.js';
import { Walker } from '../characters/character.js';
import { RaceLine } from '../game/racer.js';
import { formatTime } from '../game/events.js';

const COLORS = ['#ff3fa4', '#35f2ff', '#ffd23f', '#39ff88', '#b44dff', '#ff7a1a', '#ffffff', '#3f7bff'];
const DELAY = 0.15; // Darstellung liegt so weit hinter dem Empfang (weiche Bewegung trotz Paketabständen)

// Strecken für Online-Rennen (Kreuzungen im Straßenraster, die Route plant RaceLine)
export const TRACKS = [
  { id: 'ocean', name: 'Ocean Drive Sprint', route: [[580, 600], [580, -400], [360, -400], [100, -400], [-50, -400]] },
  { id: 'island', name: 'Vice-Beach-Runde', route: [[580, -200], [580, 200], [360, 200], [360, -200]], laps: 2 },
  { id: 'downtown', name: 'Downtown-Runde', route: [[100, -200], [-50, -200], [-50, 200], [100, 200]], laps: 2 },
  { id: 'port', name: 'Hafenrunde', route: [[-350, 800], [-50, 800], [100, 800], [100, 1000], [-350, 1000]], laps: 2 },
  { id: 'highway', name: 'Highway-Duell', route: [[-500, -600], [-650, -600], [-650, 600], [-500, 600], [-500, 200], [-200, 200]] },
  { id: 'grand', name: 'Große Stadtrundfahrt', route: [[-650, 600], [-650, 0], [100, 0], [360, 0], [580, 0], [580, -600]] },
];

export function randomRoomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

function nameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 34px Rajdhani, sans-serif';
  const w = Math.min(248, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(15,6,30,0.75)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 8, w, 48, 14);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(4, 1, 1);
  s.renderOrder = 20;
  return s;
}

// Mitspieler: Auto oder Fußgänger, Position aus einem Puffer von Zuständen interpoliert
class RemotePlayer {
  constructor(game, id, meta) {
    this.game = game;
    this.id = id;
    this.meta = meta;
    this.snaps = [];
    this.vehicle = null;
    this.walker = null;
    this.tag = nameTag(meta.nick, meta.color);
    game.scene.add(this.tag);
    this.last = null;
  }

  push(s) {
    s.rt = performance.now() / 1000;
    this.snaps.push(s);
    if (this.snaps.length > 12) this.snaps.shift();
    this.last = s;
  }

  ensureBody(s) {
    const g = this.game;
    if (s.f) {
      if (this.vehicle) this.dropVehicle();
      if (!this.walker) {
        this.walker = new Walker({ shirt: this.meta.color, flower: '#ffffff' });
        g.scene.add(this.walker.char.root);
      }
      return;
    }
    if (this.walker) {
      g.scene.remove(this.walker.char.root);
      this.walker = null;
    }
    if (this.vehicle && (this.vehicle.spec.id !== s.m || this.vehicle.color !== s.c)) this.dropVehicle();
    if (!this.vehicle) {
      const spec = modelById(s.m) || modelById('spyder');
      const v = new Vehicle(spec, s.c || spec.colors[0]);
      v.remote = true;
      v.driver = 'remote';
      v.indestructible = true;
      v.place(s.x, s.z, s.h, 0);
      g.addVehicle(v);
      if (v.mesh.driver) v.mesh.driver.visible = true;
      this.vehicle = v;
    }
  }

  dropVehicle() {
    this.game.removeVehicle(this.vehicle);
    this.vehicle = null;
  }

  update(dt) {
    if (!this.snaps.length) return;
    const now = performance.now() / 1000 - DELAY;
    // Zwei Zustände um den Darstellungszeitpunkt suchen, sonst vom letzten aus hochrechnen
    let a = this.snaps[0];
    let b = null;
    for (let i = 0; i < this.snaps.length - 1; i++) {
      if (this.snaps[i].rt <= now && this.snaps[i + 1].rt >= now) {
        a = this.snaps[i];
        b = this.snaps[i + 1];
        break;
      }
    }
    if (!b) a = this.snaps[this.snaps.length - 1];
    this.ensureBody(a);
    let x;
    let z;
    let y;
    let h;
    if (b) {
      const t = (now - a.rt) / Math.max(1e-3, b.rt - a.rt);
      x = a.x + (b.x - a.x) * t;
      z = a.z + (b.z - a.z) * t;
      y = a.y + (b.y - a.y) * t;
      let dh = b.h - a.h;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      h = a.h + dh * t;
    } else {
      const ex = Math.min(0.35, Math.max(0, now - a.rt));
      x = a.x + a.vx * ex;
      z = a.z + a.vz * ex;
      y = a.y;
      h = a.h;
    }
    if (this.vehicle) {
      const v = this.vehicle;
      v.x = x;
      v.z = z;
      v.y = y;
      v.heading = h;
      v.vx = a.vx;
      v.vz = a.vz;
      v.steer = a.st || 0;
      v.braking = !!(a.b & 1);
      v.nitroActive = !!(a.b & 2);
      v.angVel = a.w || 0;
      v.wheelie = a.wh || 0;
      v.syncMesh(dt);
      v.mesh.beam.visible = this.game.env.night > 0.1;
      this.tag.position.set(x, y + (v.spec.bike ? 2.3 : 2.6), z);
    } else if (this.walker) {
      const w = this.walker;
      const sp = Math.hypot(x - w.x, z - w.z) / Math.max(dt, 1e-3);
      w.x = x;
      w.z = z;
      w.y = y;
      w.heading = h;
      w.sync(dt, Math.min(7, sp));
      this.tag.position.set(x, y + 2.3, z);
    }
    const f = this.game.focus;
    this.tag.visible = Math.hypot(x - f.x, z - f.z) < 260;
  }

  get pos() {
    return this.vehicle || this.walker || null;
  }

  dispose() {
    if (this.vehicle) this.dropVehicle();
    if (this.walker) this.game.scene.remove(this.walker.char.root);
    this.game.scene.remove(this.tag);
    this.tag.material.map.dispose();
    this.tag.material.dispose();
  }
}

// Online-Rennen: gemeinsame Startaufstellung, Countdown, Checkpoints; der Host sammelt die Zeiten
class OnlineRace {
  constructor(session, msg) {
    this.s = session;
    const g = (this.g = session.game);
    this.track = TRACKS.find((t) => t.id === msg.track) || TRACKS[0];
    this.ids = msg.ids;
    this.nicks = new Map(this.ids.map((id) => [id, session.nickOf(id)])); // Namen beim Start merken
    this.line = new RaceLine(g.city.graph, this.track.route, { laps: this.track.laps || 1 });
    this.phase = 'countdown';
    this.count = msg.count ?? 4.5;
    this.t = 0;
    this.cp = 0;
    this.finish = new Map(); // id → Zeit
    this.doneAt = null;
    this.place();
  }

  slot(i) {
    const L = this.line;
    const lat = i % 2 === 0 ? 2.8 : -2.8;
    const along = -9 * Math.floor(i / 2);
    return { x: L.start.x + L.right.x * lat + L.dir.x * along, z: L.start.z + L.right.z * lat + L.dir.z * along, h: L.start.h };
  }

  place() {
    const g = this.g;
    g.police.clear();
    const i = Math.max(0, this.ids.indexOf(this.s.id));
    const p = this.slot(i);
    // Verkehr und abgestellte Autos rund um den Start entfernen
    for (const v of [...g.vehicles]) {
      if (v === g.playerCar || v.remote) continue;
      if (Math.hypot(v.x - p.x, v.z - p.z) > 40) continue;
      if (v.driver === 'ai' || v.driver === 'police') g.traffic.release(v);
      else if (!v.owned) g.removeVehicle(v);
    }
    let car = g.playerCar;
    if (!car) {
      car = g.dealer.spawnOwn(g.save.data.car, p);
      g.enterCar(car);
    }
    car.place(p.x, p.z, p.h, 0);
    car.nitro = 1;
    this.car = car;
    g.rig.initialized = false;
    g.waypoint = null;
    g.hud.flash();
    this.s.game.career.showCps(this.line.cps, 0);
  }

  get locked() {
    return this.phase === 'countdown';
  }

  get progress() {
    if (this.finish.has(this.s.id)) return this.line.total + 1000 - this.finish.get(this.s.id);
    return this.line.progressOf(this.cp, this.car.x, this.car.z);
  }

  position() {
    const me = this.progress;
    let ahead = 0;
    for (const id of this.ids) {
      if (id === this.s.id) continue;
      const fin = this.finish.get(id);
      const p = fin !== undefined ? this.line.total + 1000 - fin : this.s.players.get(id)?.last?.p ?? -1;
      if (p > me) ahead++;
    }
    return ahead + 1;
  }

  get target() {
    const c = this.line.cps[this.cp];
    if (!c || this.phase !== 'run') return null;
    return { x: c[0], z: c[1], label: this.cp === this.line.cps.length - 1 ? 'Ziel' : 'Checkpoint' };
  }

  onFinish(id, time) {
    if (!this.finish.has(id)) this.finish.set(id, time);
    if (this.doneAt === null) this.doneAt = this.t;
  }

  update(dt) {
    const g = this.g;
    if (this.phase === 'countdown') {
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
      }
      return;
    }
    if (this.phase === 'done') return;
    this.t += dt;
    const L = this.line;
    const car = g.playerCar;
    if (!this.finish.has(this.s.id) && car) {
      const c = L.cps[this.cp];
      if (Math.hypot(car.x - c[0], car.z - c[1]) < 13) {
        this.cp++;
        g.audio.blip(880, 0.1, 0.1);
        if (this.cp >= L.cps.length) {
          const place = this.position();
          this.onFinish(this.s.id, this.t);
          this.s.send('fin', { id: this.s.id, t: this.t });
          g.hud.bigMessage(`Platz ${place}\n${formatTime(this.t)}`, 3.5, place === 1 ? 'medal3' : place === 2 ? 'medal2' : place === 3 ? 'medal1' : '');
          g.career.hideMarkers();
        } else {
          if (L.laps > 1 && this.cp % L.lapCps === 0) g.hud.bigMessage(`Runde ${this.cp / L.lapCps + 1}`, 1.2);
          g.career.showCps(L.cps, this.cp);
        }
      }
    }
    // Ende: alle im Ziel oder 45 s nach dem ersten Zieleinlauf (Host wertet aus)
    const everyone = this.ids.every((id) => this.finish.has(id) || (!this.s.presence.has(id) && !this.s.players.has(id)));
    if (this.s.isHost && (everyone || (this.doneAt !== null && this.t - this.doneAt > 45))) {
      const res = this.results();
      this.s.send('res', { res });
      this.s.showResults(res);
    }
  }

  results() {
    const out = this.ids.map((id) => ({ id, nick: this.nicks.get(id) || this.s.nickOf(id), t: this.finish.get(id) ?? null }));
    out.sort((a, b) => (a.t ?? 1e9) - (b.t ?? 1e9));
    return out;
  }

  hud() {
    const L = this.line;
    const s = { title: `Online · ${this.track.name}`, main: formatTime(this.t), pos: `${this.position()}./${this.ids.length}` };
    if (this.phase === 'countdown') s.main = 'Gleich geht’s los';
    s.sub = L.laps > 1 ? `Runde ${Math.min(L.laps, Math.floor(this.cp / L.lapCps) + 1)}/${L.laps} · CP ${(this.cp % L.lapCps) + 1}/${L.lapCps}` : `Checkpoint ${Math.min(this.cp + 1, L.cps.length)}/${L.cps.length}`;
    if (this.finish.has(this.s.id)) s.sub = 'Im Ziel – warte auf die anderen';
    s.info = `${this.ids.length} Fahrer · ${this.finish.size} im Ziel`;
    return s;
  }

  end() {
    this.phase = 'done';
    this.g.career.hideMarkers();
    this.g.hud.setEventHud(null);
  }
}

// Online-Sitzung: Raum per Link, Spitzname, bis zu 8 Spieler. KI-Verkehr bleibt lokal.
export class OnlineSession {
  constructor(game) {
    this.game = game;
    this.transport = null;
    this.room = null;
    this.id = Math.random().toString(36).slice(2, 10);
    this.players = new Map(); // id → RemotePlayer
    this.presence = new Map(); // id → meta (inkl. eigener)
    this.race = null;
    this.sendT = 0;
    this.onChange = null; // UI aktualisieren
    this.kind = new URLSearchParams(location.search).get('net') === 'local' ? 'local' : 'supabase';
  }

  get connected() {
    return !!this.transport;
  }

  get hostId() {
    let best = null;
    for (const [id, m] of this.presence) if (!best || m.joined < best.m.joined || (m.joined === best.m.joined && id < best.id)) best = { id, m };
    return best?.id ?? this.id;
  }

  get isHost() {
    return this.hostId === this.id;
  }

  nickOf(id) {
    return this.presence.get(id)?.nick || this.players.get(id)?.meta.nick || '???';
  }

  get link() {
    const u = new URL(location.href);
    u.search = '';
    u.searchParams.set('room', this.room);
    if (this.kind === 'local') u.searchParams.set('net', 'local');
    return u.toString();
  }

  async join(room, nick) {
    if (this.transport) this.leave();
    this.room = room.toUpperCase();
    this.nick = nick;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    this.meta = { id: this.id, nick, color, joined: Date.now() };
    this.transport = await createTransport(this.kind, this.room, this.meta, {
      message: (type, p) => this.onMessage(type, p),
      presence: (map) => this.onPresence(map),
    });
    this.game.hud.toast(`Raum ${this.room}`, 2);
    this.onChange?.();
  }

  leave() {
    if (this.race) this.endRace();
    this.transport?.leave();
    this.transport = null;
    for (const p of this.players.values()) p.dispose();
    this.players.clear();
    this.presence.clear();
    this.room = null;
    this.onChange?.();
  }

  send(type, payload) {
    this.transport?.send(type, payload);
  }

  onPresence(map) {
    const before = new Set(this.presence.keys());
    this.presence = map;
    // Raum voll: wer zuletzt kam, geht wieder
    if (map.size > MAX_PLAYERS) {
      const sorted = [...map.entries()].sort((a, b) => a[1].joined - b[1].joined);
      if (sorted.findIndex(([id]) => id === this.id) >= MAX_PLAYERS) {
        this.game.hud.bigMessage('Raum ist voll (max. 8)', 3, 'fail');
        this.leave();
        return;
      }
    }
    for (const [id, m] of map) {
      if (id !== this.id && !before.has(id) && before.size) this.game.hud.toast(`${m.nick} ist da`, 2);
    }
    for (const id of before) {
      if (map.has(id)) continue;
      const p = this.players.get(id);
      if (p) {
        this.game.hud.toast(`${p.meta.nick} ist weg`, 2);
        p.dispose();
        this.players.delete(id);
      }
    }
    this.onChange?.();
  }

  onMessage(type, p) {
    if (type === 'st') {
      if (p.id === this.id) return;
      let rp = this.players.get(p.id);
      if (!rp) {
        const meta = this.presence.get(p.id) || { nick: p.n || 'Fahrer', color: p.col || '#ffffff' };
        rp = new RemotePlayer(this.game, p.id, meta);
        this.players.set(p.id, rp);
      }
      rp.push(p);
    } else if (type === 'race') {
      if (this.game.busy && !this.race) {
        this.game.events.active && this.game.events.cancel('Online-Rennen startet');
        this.game.career.active && this.game.career.fail('Online-Rennen startet');
      }
      this.startLocalRace(p);
    } else if (type === 'fin') {
      this.race?.onFinish(p.id, p.t);
    } else if (type === 'res') {
      this.showResults(p.res);
    } else if (type === 'abort') {
      if (this.race) {
        this.game.hud.bigMessage('Rennen abgebrochen', 2, 'fail');
        this.endRace();
      }
    }
  }

  // Host startet ein Rennen für alle im Raum
  startRace(trackId) {
    if (!this.isHost || this.race) return;
    const ids = [...this.presence.entries()].sort((a, b) => a[1].joined - b[1].joined).map(([id]) => id);
    const msg = { track: trackId, ids, count: 4.5 };
    this.send('race', msg);
    this.startLocalRace(msg);
  }

  abortRace() {
    if (!this.race) return;
    this.send('abort', {});
    this.endRace();
  }

  startLocalRace(msg) {
    if (this.race) this.endRace();
    if (!msg.ids.includes(this.id)) return;
    this.game.closeModal();
    this.game.setPaused(false);
    this.race = new OnlineRace(this, msg);
    this.onChange?.();
  }

  endRace() {
    this.race?.end();
    this.race = null;
    this.onChange?.();
  }

  showResults(res) {
    if (!this.race) return;
    const lines = res.slice(0, 8).map((r, i) => `${i + 1}. ${r.nick}  ${r.t !== null ? formatTime(r.t) : 'DNF'}`);
    this.game.hud.bigMessage(`Ergebnis\n${lines.join('\n')}`, 7, 'medal3');
    this.endRace();
  }

  // Eigenen Zustand senden (8 Hz, im Rennen 12 Hz)
  sendState() {
    const g = this.game;
    const c = g.playerCar;
    const f = g.focus;
    const r = (n, d = 100) => Math.round(n * d) / d;
    const s = { id: this.id, n: this.nick, col: this.meta.color, x: r(f.x), z: r(f.z), y: r(f.y ?? 0), h: r(f.heading, 1000), vx: r(f.vx ?? 0), vz: r(f.vz ?? 0) };
    if (c) {
      s.m = c.spec.id;
      s.c = c.color;
      s.st = r(c.steer);
      s.b = (c.braking ? 1 : 0) | (c.nitroActive ? 2 : 0);
      s.w = r(c.angVel);
      if (c.spec.bike) s.wh = r(c.wheelie);
    } else s.f = 1;
    if (this.race) s.p = Math.round(this.race.progress);
    this.send('st', s);
  }

  update(dt) {
    if (!this.transport) return;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / (this.race ? RACE_SEND_HZ : SEND_HZ);
      this.sendState();
    }
    for (const p of this.players.values()) p.update(dt);
    if (this.race) {
      this.race.update(dt);
      if (this.race) this.game.hud.setEventHud(this.race.hud());
    }
  }

  blips() {
    const out = [];
    for (const p of this.players.values()) {
      const o = p.pos;
      if (o) out.push({ x: o.x, z: o.z, kind: 'friend', color: p.meta.color, glyph: p.meta.nick[0]?.toUpperCase() || '?', pin: true });
    }
    const t = this.race?.target;
    if (t) out.push({ x: t.x, z: t.z, kind: 'checkpoint' });
    return out;
  }
}
