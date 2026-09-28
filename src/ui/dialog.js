import { CHARS } from '../game/career.js';

const $ = (id) => document.getElementById(id);

// Dialogkarten vor und nach Missionen: Porträt-Symbol, Name, 2–4 Zeilen.
// Weiter mit Enter/F/Leertaste, Klick oder Tippen. Das Spiel pausiert, solange eine Karte offen ist.
export class Dialog {
  constructor(game) {
    this.game = game;
    this.el = $('dialog');
    this.queue = [];
    this.onDone = null;
    this.opened = 0;
    this.el.addEventListener('click', () => this.next());
  }

  get open() {
    return this.queue.length > 0;
  }

  show(cards, onDone = null) {
    if (!cards?.length) return onDone?.();
    this.queue = cards.slice();
    this.total = cards.length;
    this.onDone = onDone;
    this.opened = performance.now();
    this.el.classList.remove('hidden');
    this.game.setModal(this);
    this.render();
  }

  render() {
    const c = this.queue[0];
    const who = CHARS[c.who];
    $('dlgPortrait').textContent = who.glyph;
    $('dlgPortrait').style.setProperty('--c', who.color);
    $('dlgName').textContent = who.name;
    $('dlgName').style.color = who.color;
    $('dlgRole').textContent = who.role;
    $('dlgText').innerHTML = c.text
      .split('\n')
      .map((l) => `<p>${l}</p>`)
      .join('');
    const idx = this.total - this.queue.length + 1;
    const touch = document.body.classList.contains('touch');
    $('dlgNext').innerHTML = `${this.total > 1 ? `${idx}/${this.total} · ` : ''}${touch ? 'Tippen' : '<kbd>Enter</kbd>'} ${this.queue.length > 1 ? 'weiter' : 'los'}`;
  }

  next() {
    // Versehentliches Überspringen direkt nach dem Öffnen verhindern
    if (!this.open || performance.now() - this.opened < 250) return;
    this.queue.shift();
    if (this.queue.length) return this.render();
    this.el.classList.add('hidden');
    this.game.setModal(null);
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  // Wird von der Spielschleife aufgerufen, solange der Dialog offen ist
  modalUpdate(input) {
    if (input.pressed('start') || input.pressed('interact') || input.pressed('handbrake')) this.next();
  }
}
