import { TRACKS, randomRoomCode } from '../net/online.js';
import { MAX_PLAYERS } from '../net/config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Online-Menü: Spitzname, Raum erstellen/beitreten, Link teilen, Spielerliste, Rennen starten (Host)
export class OnlineUI {
  constructor(game) {
    this.game = game;
    this.s = game.online;
    this.el = $('online');
    this.s.onChange = () => this.render();
    $('onClose').addEventListener('click', () => this.close());
    $('onCreate').addEventListener('click', () => this.connect(randomRoomCode()));
    $('onJoin').addEventListener('click', () => {
      const code = $('onCode').value.trim().toUpperCase();
      if (code.length < 3) return this.status('Bitte einen Raum-Code eingeben');
      this.connect(code);
    });
    $('onLeave').addEventListener('click', () => this.s.leave());
    $('onShare').addEventListener('click', () => this.share());
    $('onStartRace').addEventListener('click', () => {
      this.s.startRace($('onTrack').value);
      this.close();
    });
    $('onAbort').addEventListener('click', () => this.s.abortRace());
    $('onTrack').innerHTML = TRACKS.map((t) => `<option value="${t.id}">${t.name}${t.laps ? ` (${t.laps} Runden)` : ''}</option>`).join('');
    $('onNick').value = game.save.data.nick || `Fahrer${Math.floor(10 + Math.random() * 90)}`;
    // Tastatureingaben im Menü nicht ans Spiel weitergeben
    for (const id of ['onNick', 'onCode']) $(id).addEventListener('keydown', (e) => e.stopPropagation());
    const room = new URLSearchParams(location.search).get('room');
    if (room) $('onCode').value = room.toUpperCase().slice(0, 8);
  }

  get pendingRoom() {
    return new URLSearchParams(location.search).get('room');
  }

  open() {
    this.el.classList.remove('hidden');
    this.game.setModal(this);
    this.render();
  }

  close() {
    this.el.classList.add('hidden');
    this.game.setModal(null);
  }

  modalUpdate(input) {
    if (input.pressed('pause')) this.close();
  }

  status(text) {
    $('onStatus').textContent = text || '';
  }

  async connect(code) {
    const nick = $('onNick').value.trim().slice(0, 16) || 'Fahrer';
    this.game.save.set('nick', nick);
    this.status('Verbinde …');
    try {
      await this.s.join(code, nick);
      this.status('');
      history.replaceState(null, '', this.s.link);
    } catch (e) {
      this.status(`Verbindung fehlgeschlagen: ${e.message}`);
    }
    this.render();
  }

  async share() {
    const url = this.s.link;
    try {
      if (navigator.share) await navigator.share({ title: 'Vice City – fahr mit mir!', text: `Raum ${this.s.room}`, url });
      else {
        await navigator.clipboard.writeText(url);
        this.status('Link kopiert!');
      }
    } catch {
      this.status(url);
    }
  }

  render() {
    const s = this.s;
    const on = s.connected;
    $('onJoinBox').hidden = on;
    $('onRoomBox').hidden = !on;
    if (!on) return;
    $('onRoom').textContent = s.room;
    const players = [...s.presence.entries()].sort((a, b) => a[1].joined - b[1].joined);
    $('onCount').textContent = `${players.length}/${MAX_PLAYERS} Spieler`;
    $('onPlayers').innerHTML = players
      .map(([id, m]) => `<div class="on-p"><i style="background:${esc(m.color)}"></i><b>${esc(m.nick)}</b>${id === s.hostId ? '<span class="tag">Host</span>' : ''}${id === s.id ? '<span class="tag own">Du</span>' : ''}</div>`)
      .join('');
    $('onHostBox').hidden = !s.isHost || !!s.race;
    $('onGuestHint').hidden = s.isHost || !!s.race;
    $('onAbort').hidden = !(s.race && s.isHost);
    this.game.hud.setNet(s);
  }
}
