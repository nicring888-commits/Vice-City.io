// Spielstand im Browser (localStorage). Fehlt der Speicher (privates Fenster o. ä.),
// läuft das Spiel einfach ohne Speichern weiter.
const KEY = 'vc-save-v1';

const DEFAULTS = {
  money: 500,
  best: {}, // eventId → { value, medal }
  radio: 0,
};

export class SaveGame {
  constructor() {
    this.data = structuredClone(DEFAULTS);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch {
      /* ohne Speicher weiterspielen */
    }
    this.timer = null;
  }

  get money() {
    return this.data.money;
  }

  addMoney(n) {
    this.data.money = Math.max(0, Math.round(this.data.money + n));
    this.persist();
    return this.data.money;
  }

  best(id) {
    return this.data.best[id] || null;
  }

  // Speichert ein Ergebnis, wenn es besser ist; liefert true bei neuer Bestleistung
  record(id, value, medal, lowerIsBetter) {
    const cur = this.data.best[id];
    const better = !cur || (lowerIsBetter ? value < cur.value : value > cur.value);
    if (better) this.data.best[id] = { value, medal: Math.max(medal, cur?.medal ?? 0) };
    else if (medal > (cur.medal ?? 0)) cur.medal = medal;
    this.persist();
    return better;
  }

  set(key, value) {
    this.data[key] = value;
    this.persist();
  }

  persist() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch {
        /* ignorieren */
      }
    }, 300);
  }
}
