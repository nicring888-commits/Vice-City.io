import { Marker } from './markers.js';
import { CHAPTERS, ALL_MISSIONS, CHARS, INTRO, rankName } from './career.js';
import { MISSION_TYPES } from './missions.js';

const TYPE_NAMES = { race: 'Rennen', drift: 'Drift-Battle', delivery: 'Überführung', tail: 'Verfolgung' };

// Ablauf der Karriere: Missionsgeber, Ruf-Sperren, Start/Ende von Missionen, Dialoge, Übersicht
export class CareerManager {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.pending = null; // Dialog nach dem Ergebnis (kurz verzögert)
    this.givers = CHAPTERS.map((ch) => ({ ch, m: new Marker(game.scene, { x: ch.giver.x, z: ch.giver.z, radius: 5.5, color: ch.color, height: 55 }) }));
    this.cpMarker = new Marker(game.scene, { x: 0, z: 0, radius: 9, color: '#ff3fa4', height: 60 });
    this.cpNext = new Marker(game.scene, { x: 0, z: 0, radius: 6, color: '#35f2ff', height: 25 });
    this.destMarker = new Marker(game.scene, { x: 0, z: 0, radius: 8, color: '#39ff88', height: 60 });
    this.hideMarkers();
  }

  get data() {
    return this.game.save.data.career;
  }

  isDone(id) {
    return !!this.data.done[id];
  }

  get complete() {
    return ALL_MISSIONS.every((m) => this.isDone(m.id));
  }

  get rank() {
    return rankName(this.game.save.rep, this.complete);
  }

  // Nächste offene Mission (Kapitel werden der Reihe nach gespielt, Missionen im Kapitel auch)
  next() {
    return ALL_MISSIONS.find((m) => !this.isDone(m.id)) || null;
  }

  get locked() {
    return this.active?.phase === 'countdown';
  }

  get target() {
    return this.active?.target ?? null;
  }

  blips() {
    if (this.active) return this.active.blips();
    const n = this.next();
    if (!n || this.game.busy) return [];
    const g = n.ch.giver;
    return [{ x: g.x, z: g.z, kind: 'mission', color: n.ch.color, glyph: '!', pin: true }];
  }

  hideMarkers() {
    this.cpMarker.visible = this.cpNext.visible = this.destMarker.visible = false;
  }

  showCps(cps, i) {
    const cur = cps[i];
    const nxt = cps[i + 1];
    this.cpMarker.visible = !!cur;
    if (cur) this.cpMarker.moveTo(cur[0], cur[1]);
    this.cpNext.visible = !!nxt;
    if (nxt) this.cpNext.moveTo(nxt[0], nxt[1]);
  }

  showDest(d) {
    this.destMarker.visible = true;
    this.destMarker.moveTo(d.x, d.z);
  }

  // Kurzer Hinweis auf die nächste Mission (HUD und Pausenmenü)
  hint() {
    const n = this.next();
    if (!n) return 'Karriere abgeschlossen – du bist der Champion von Vice City';
    const rep = this.game.save.rep;
    if (rep < n.req) return `Nächste Mission: ${n.name} · noch ${n.req - rep} Ruf nötig`;
    return `Nächste Mission: ${n.name} · ${n.ch.giver.name}`;
  }

  promptFor(n) {
    const rep = this.game.save.rep;
    const idx = `Kapitel ${n.ci + 1} · ${n.boss ? 'Boss-Rennen' : `Mission ${n.mi + 1}/5`} · ${TYPE_NAMES[n.type]}`;
    const p = { name: `${n.ch.giver.name}: ${n.name}`, desc: n.desc, meta: `${idx} · $${n.reward.toLocaleString('de-DE')} · +${n.rep} Ruf` };
    if (rep < n.req) {
      p.meta = `Benötigt ${n.req} Ruf – du hast ${rep}. Gewinne Medaillen oder häng die Polizei ab.`;
      p.go = 'Noch gesperrt';
    } else if (n.type !== 'delivery' && !this.game.playerCar?.owned) {
      p.go = 'Nur mit eigenem Auto (Sunshine Autos)';
    }
    return p;
  }

  update(dt) {
    const g = this.game;
    for (const { m } of this.givers) m.update(dt);
    this.cpMarker.update(dt);
    this.cpNext.update(dt);
    this.destMarker.update(dt);
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) {
        const p = this.pending;
        this.pending = null;
        g.dialog.show(p.cards, p.done);
      }
    }
    const n = this.next();
    for (const gv of this.givers) gv.m.visible = !g.busy && n?.ch === gv.ch;
    if (this.active) {
      this.active.update(dt);
      if (this.active) g.hud.setEventHud(this.active.hud());
      return;
    }
    if (!n || g.busy) return;
    const giver = this.givers[n.ci].m;
    const f = g.focus;
    if (!giver.contains(f.x, f.z, 1) || (g.playerCar && g.playerCar.speed > 9)) return;
    g.hud.offerPrompt(this.promptFor(n));
    if (g.input.pressed('start')) this.begin(n);
  }

  begin(n) {
    const g = this.game;
    if (g.police.level > 0) return g.hud.toast('Erst die Polizei abhängen!', 2);
    if (g.save.rep < n.req) return g.hud.toast(`Zu wenig Ruf (${n.req})`, 2);
    if (n.type !== 'delivery' && !g.playerCar?.owned) {
      return g.hud.toast(g.playerCar ? 'Die Crews fahren nur gegen eigene Autos' : 'Steig in dein eigenes Auto', 2.5);
    }
    g.dialog.show(n.intro, () => this.launch(n));
  }

  launch(n) {
    const g = this.game;
    if (g.busy || g.police.level > 0) return;
    if (n.type !== 'delivery' && !g.playerCar?.owned) return;
    const M = MISSION_TYPES[n.type];
    const run = new M(this, n);
    this.active = run;
    g.waypoint = null;
    run.setup();
    g.hud.flash();
    g.hud.setEventHud(run.hud());
  }

  end() {
    const run = this.active;
    this.active = null;
    run?.cleanup();
    this.hideMarkers();
    this.game.hud.setEventHud(null);
  }

  succeed(run) {
    const g = this.game;
    const d = run.def;
    const chapterDone = d.boss;
    this.data.done[d.id] = true;
    g.save.persist();
    g.save.addMoney(d.reward);
    g.addRep(d.rep);
    this.end();
    g.hud.bigMessage(`${d.boss ? 'BOSS BESIEGT' : 'MISSION ERFÜLLT'}\n+$${d.reward.toLocaleString('de-DE')} · +${d.rep} Ruf`, 4, 'medal3');
    g.audio.blip(1320, 0.5, 0.14);
    const nxt = this.next();
    this.pending = {
      t: 1.8,
      cards: d.outro,
      done: () => {
        if (!nxt) {
          g.hud.bigMessage('CHAMPION VON VICE CITY', 5, 'medal3');
          return;
        }
        if (chapterDone) {
          g.hud.toast(`Kapitel ${nxt.ci + 1}: ${nxt.ch.name}`, 3);
          g.waypoint = { x: nxt.ch.giver.x, z: nxt.ch.giver.z, label: nxt.ch.giver.name };
        }
      },
    };
  }

  fail(reason) {
    const g = this.game;
    this.end();
    g.hud.bigMessage(`${reason}\nNeuer Versuch beim Missionsgeber`, 3.5, 'fail');
    g.audio.blip(300, 0.5, 0.14);
  }

  cancel() {
    if (this.active) this.fail('Mission abgebrochen');
  }

  // Einführung beim ersten Start
  intro() {
    if (this.data.intro) return;
    this.game.dialog.show(INTRO, () => {
      this.data.intro = true;
      this.game.save.persist();
      const n = this.next();
      if (n) this.game.waypoint = { x: n.ch.giver.x, z: n.ch.giver.z, label: n.ch.giver.name };
    });
  }

  // Karriere-Übersicht für das Pausenmenü
  renderOverview(el) {
    const g = this.game;
    const rep = g.save.rep;
    const n = this.next();
    let html = `<div class="car-head"><span class="car-rank">${this.rank}</span><span>Ruf ${rep.toLocaleString('de-DE')}</span></div>`;
    html += `<div class="car-hint">${this.hint()}</div>`;
    CHAPTERS.forEach((ch, ci) => {
      const unlocked = !n || n.ci >= ci;
      const doneCount = ch.missions.filter((m) => this.isDone(m.id)).length;
      const boss = CHARS[ch.boss];
      html += `<div class="car-ch${unlocked ? '' : ' locked'}" style="--c:${ch.color}">`;
      html += `<div class="car-ch-h"><b>Kapitel ${ci + 1}: ${ch.name}</b><span>${ch.crew} · Boss: ${boss.name}</span><span class="car-n">${doneCount}/${ch.missions.length}</span></div>`;
      if (unlocked) {
        html += '<div class="car-ms">';
        for (const m of ch.missions) {
          const done = this.isDone(m.id);
          const cur = n && n.id === m.id;
          const state = done ? '✓' : cur ? (rep >= m.req ? '▶' : '🔒') : '·';
          html += `<span class="car-m${done ? ' done' : ''}${cur ? ' cur' : ''}" title="${m.desc}">${state} ${m.name}${cur && rep < m.req ? ` (${m.req} Ruf)` : ''}</span>`;
        }
        html += '</div>';
      } else html += `<div class="car-ms"><span class="car-m">Gesperrt – erst Kapitel ${ci} abschließen</span></div>`;
      html += '</div>';
    });
    el.innerHTML = html;
  }
}
