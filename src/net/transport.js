import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// Übertragung für Online-Räume. Zwei Varianten mit gleicher Schnittstelle:
//  - SupabaseTransport: Realtime-Kanal (Broadcast für Nachrichten, Presence für die Spielerliste)
//  - LocalTransport: BroadcastChannel zwischen Tabs desselben Browsers (Entwicklung und Tests, ?net=local)
// handlers: { message(type, payload), presence(map id → meta), status(text) }
export const EVENTS = ['st', 'race', 'fin', 'res', 'abort'];

export async function createTransport(kind, room, meta, handlers) {
  const t = kind === 'local' ? new LocalTransport() : new SupabaseTransport();
  await t.join(room, meta, handlers);
  return t;
}

class SupabaseTransport {
  async join(room, meta, handlers) {
    const { createClient } = await import('@supabase/supabase-js');
    this.client = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: 30 } } });
    const ch = this.client.channel(`vc-room-${room}`, { config: { broadcast: { self: false, ack: false }, presence: { key: meta.id } } });
    this.ch = ch;
    for (const ev of EVENTS) ch.on('broadcast', { event: ev }, ({ payload }) => handlers.message(ev, payload));
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      const map = new Map();
      for (const [id, list] of Object.entries(state)) if (list[0]) map.set(id, list[0]);
      handlers.presence(map);
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Zeitüberschreitung beim Verbinden')), 12000);
      ch.subscribe(async (status) => {
        handlers.status?.(status);
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          await ch.track(meta);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          reject(new Error('Verbindung fehlgeschlagen'));
        }
      });
    });
  }

  send(type, payload) {
    this.ch?.send({ type: 'broadcast', event: type, payload });
  }

  track(meta) {
    this.ch?.track(meta);
  }

  leave() {
    if (!this.ch) return;
    this.ch.unsubscribe();
    this.client.removeChannel(this.ch);
    this.ch = null;
  }
}

// Presence-Nachbau: jeder sendet jede Sekunde ein Lebenszeichen, Stille > 10 s = weg
class LocalTransport {
  async join(room, meta, handlers) {
    this.meta = meta;
    this.handlers = handlers;
    this.peers = new Map([[meta.id, { meta, seen: performance.now() }]]);
    this.bc = new BroadcastChannel(`vc-room-${room}`);
    this.bc.onmessage = (e) => {
      const { type, payload, from, meta: m } = e.data;
      if (type === 'pres') {
        const had = this.peers.has(from);
        this.peers.set(from, { meta: m, seen: performance.now() });
        if (!had) this.emitPresence();
        return;
      }
      if (type === 'bye') {
        this.peers.delete(from);
        this.emitPresence();
        return;
      }
      handlers.message(type, payload);
    };
    this.beat = setInterval(() => {
      this.bc.postMessage({ type: 'pres', from: meta.id, meta: this.meta });
      const now = performance.now();
      let changed = false;
      for (const [id, p] of this.peers) {
        if (id !== meta.id && now - p.seen > 10000) {
          this.peers.delete(id);
          changed = true;
        }
      }
      if (changed) this.emitPresence();
    }, 1000);
    this.bc.postMessage({ type: 'pres', from: meta.id, meta });
    handlers.status?.('SUBSCRIBED');
    this.emitPresence();
  }

  emitPresence() {
    this.handlers.presence(new Map([...this.peers].map(([id, p]) => [id, p.meta])));
  }

  send(type, payload) {
    this.bc?.postMessage({ type, payload });
  }

  track(meta) {
    this.meta = meta;
    this.peers.set(meta.id, { meta, seen: performance.now() });
    this.bc?.postMessage({ type: 'pres', from: meta.id, meta });
  }

  leave() {
    if (!this.bc) return;
    this.bc.postMessage({ type: 'bye', from: this.meta.id });
    clearInterval(this.beat);
    this.bc.close();
    this.bc = null;
  }
}
