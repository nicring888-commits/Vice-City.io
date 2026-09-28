import { Rng } from './rng.js';

// Prozedurales Autoradio: jeder Sender komponiert endlos neue Songs im 80er-Stil.
export const STATIONS = [
  {
    name: 'Flash 86',
    bpm: 118,
    scale: [0, 2, 4, 5, 7, 9, 11],
    roots: [57, 60, 62, 55],
    progs: [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 4, 4]],
    drums: 'pop',
    bass: 'octaves',
    arp: true,
    pad: 0.45,
    cutoff: 3200,
  },
  {
    name: 'Wave 92',
    bpm: 90,
    scale: [0, 2, 3, 5, 7, 8, 10],
    roots: [57, 52, 55, 53],
    progs: [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6], [5, 6, 0, 0]],
    drums: 'slow',
    bass: 'long',
    arp: true,
    pad: 0.8,
    cutoff: 1900,
  },
  {
    name: 'Night Drive FM',
    bpm: 106,
    scale: [0, 2, 3, 5, 7, 8, 10],
    roots: [50, 52, 45, 48],
    progs: [[0, 0, 5, 6], [0, 3, 0, 4], [0, 6, 3, 4], [0, 5, 6, 4]],
    drums: 'drive',
    bass: 'sixteenths',
    arp: false,
    pad: 0.4,
    cutoff: 2300,
  },
];

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

export class Radio {
  constructor(audio, onAnnounce) {
    this.audio = audio;
    this.onAnnounce = onAnnounce;
    this.station = -1;
    this.playing = false;
    this.ready = false;
    this.seed = Math.floor(Math.random() * 1e6);
  }

  init() {
    if (this.ready || !this.audio.ctx) return;
    const ctx = (this.ctx = this.audio.ctx);
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 7500;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(tone).connect(this.out).connect(this.audio.master);
    // Hall (künstliche Impulsantwort) und Echo
    const conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    conv.buffer = ir;
    this.reverb = ctx.createGain();
    this.reverb.gain.value = 0.5;
    this.reverb.connect(conv).connect(this.bus);
    this.delay = ctx.createDelay(1);
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.5;
    this.delaySend.connect(this.delay);
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(this.bus);
    this.noise = this.audio.noiseBuf;
    this.ready = true;
  }

  get name() {
    return this.station < 0 ? 'Radio aus' : STATIONS[this.station].name;
  }

  setStation(i) {
    this.station = i;
    if (!this.ready) return;
    this.stopTimer();
    this.playing = false;
    if (i < 0) this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    this.setActive(!!this.inCar);
  }

  next() {
    const n = this.station + 1;
    this.setStation(n >= STATIONS.length ? -1 : n);
    return this.name;
  }

  // Im Auto an, zu Fuß aus
  setActive(on) {
    this.inCar = on;
    if (!this.ready) return;
    const want = on && this.station >= 0;
    if (want === this.playing) return;
    this.playing = want;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(want ? 0.55 : 0, t, want ? 0.4 : 0.15);
    if (want) this.startSong(true);
    else this.stopTimer();
  }

  stopTimer() {
    clearInterval(this.timer);
    this.timer = null;
  }

  startSong(announce) {
    this.stopTimer();
    if (this.station < 0) {
      this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      this.playing = false;
      return;
    }
    this.out.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.3);
    const st = STATIONS[this.station];
    const rng = new Rng(this.seed++);
    const root = rng.pick(st.roots);
    const prog = rng.pick(st.progs);
    const arpPat = rng.pick([[0, 1, 2, 1], [0, 1, 2, 3], [0, 2, 1, 2], [2, 1, 0, 1]]);
    // Melodie-Motiv über zwei Takte (Skalenstufen oder Pause)
    const motif = [];
    for (let i = 0; i < 32; i++) {
      if (i % 2 === 1 && rng.chance(0.6)) motif.push(null);
      else motif.push(rng.chance(0.2) ? null : rng.int(0, 7) + (rng.chance(0.25) ? 7 : 0));
    }
    const sections = ['intro', 'intro', 'A', 'A', 'B', 'B', 'A', 'A', 'B', 'B', 'outro'];
    this.song = { st, root, prog, arpPat, motif, sections, bar: 0, step: 0, jingle: announce ? 1 : 0 };
    this.stepDur = 60 / st.bpm / 4;
    this.delay.delayTime.value = this.stepDur * 3;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
    if (announce) this.onAnnounce?.(st.name);
  }

  schedule() {
    if (!this.playing) return;
    const ctx = this.ctx;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.playStep(this.nextTime);
      this.nextTime += this.stepDur;
      const s = this.song;
      s.step++;
      if (s.step >= 16) {
        s.step = 0;
        s.bar++;
        if (s.bar >= s.sections.length * 4) return this.startSong(false);
      }
    }
  }

  chordAt(bar) {
    const s = this.song;
    const deg = s.prog[bar % s.prog.length];
    const sc = s.st.scale;
    const note = (d) => s.root + sc[d % 7] + 12 * Math.floor(d / 7);
    return [note(deg), note(deg + 2), note(deg + 4)];
  }

  playStep(t) {
    const s = this.song;
    const st = s.st;
    const sec = s.sections[Math.floor(s.bar / 4)];
    const step = s.step;
    const chord = this.chordAt(s.bar);
    const full = sec === 'A' || sec === 'B';
    const bd = this.stepDur;

    // Drums
    if (full || (sec === 'outro' && s.bar % 4 < 2)) {
      if (st.drums === 'pop') {
        if (step % 8 === 0) this.kick(t);
        if (step % 8 === 4) this.snare(t);
        if (step % 2 === 0) this.hat(t, step % 4 === 2 ? 0.1 : 0.05);
      } else if (st.drums === 'slow') {
        if (step === 0 || step === 10) this.kick(t);
        if (step === 8) this.snare(t, 1.4);
        if (step % 4 === 2) this.hat(t, 0.06);
      } else {
        if (step % 4 === 0) this.kick(t);
        if (step % 8 === 4) this.snare(t);
        this.hat(t, step % 4 === 2 ? 0.1 : 0.03);
      }
    }
    // Bass
    if (sec !== 'intro' || s.bar % 4 >= 2) {
      const r = chord[0] - 24;
      if (st.bass === 'octaves' && step % 2 === 0) this.bassNote(t, r + (step % 4 === 2 ? 12 : 0), bd * 1.8);
      if (st.bass === 'long' && step === 0) this.bassNote(t, r, bd * 15);
      if (st.bass === 'long' && step === 10) this.bassNote(t, r + 7, bd * 5);
      if (st.bass === 'sixteenths') this.bassNote(t, r + (step % 8 === 6 ? 12 : 0), bd * 0.9, step % 4 === 0 ? 1 : 0.6);
    }
    // Arpeggio
    if (st.arp && step % 1 === 0 && sec !== 'outro') {
      const idx = s.arpPat[step % s.arpPat.length];
      const n = chord[idx % 3] + 12 * (idx >= 3 ? 1 : 0) + 12;
      this.pluck(t, n, bd * 0.9, sec === 'intro' ? 0.05 : 0.07);
    }
    // Flächen
    if (step === 0) this.pad(t, chord, bd * 16, st.pad, st.cutoff);
    // Melodie im Refrain
    if (sec === 'B') {
      const m = s.motif[(s.bar % 2) * 16 + step];
      if (m !== null) {
        const sc = st.scale;
        const note = s.root + 12 + sc[m % 7] + 12 * Math.floor(m / 7);
        this.lead(t, note, bd * 1.8);
      }
    }
  }

  // ---------------------------------------------------------------- Instrumente
  env(g, t, a, peak, d, end = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + d);
  }

  kick(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.003, 0.9, 0.35);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.4);
  }

  snare(t, big = 1) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.7;
    const g = this.ctx.createGain();
    this.env(g, t, 0.002, 0.45 * big, 0.2 * big);
    n.connect(f).connect(g);
    g.connect(this.bus);
    g.connect(this.reverb);
    n.start(t, Math.random());
    n.stop(t + 0.4);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 185;
    const og = this.ctx.createGain();
    this.env(og, t, 0.002, 0.25, 0.08);
    o.connect(og).connect(this.bus);
    o.start(t);
    o.stop(t + 0.15);
  }

  hat(t, v) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    const g = this.ctx.createGain();
    this.env(g, t, 0.001, v, 0.05);
    n.connect(f).connect(g).connect(this.bus);
    n.start(t, Math.random());
    n.stop(t + 0.1);
  }

  bassNote(t, m, dur, vol = 1) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(220, t + Math.min(dur, 0.3));
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28 * vol, t + 0.01);
    g.gain.setValueAtTime(0.28 * vol, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  pluck(t, m, dur, vol) {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = mtof(m);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3500, t);
    f.frequency.exponentialRampToValueAtTime(600, t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.003, vol, dur);
    o.connect(f).connect(g);
    g.connect(this.bus);
    g.connect(this.delaySend);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  pad(t, chord, dur, vol, cutoff) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff * 0.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * vol, t + dur * 0.3);
    g.gain.setValueAtTime(0.05 * vol, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
    f.connect(g);
    g.connect(this.bus);
    g.connect(this.reverb);
    for (const m of chord) {
      for (const det of [-8, 8]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur * 1.1);
      }
    }
  }

  lead(t, m, dur) {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2800;
    this.env(g, t, 0.01, 0.07, dur);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vg = this.ctx.createGain();
    vg.gain.value = 6;
    vib.connect(vg);
    for (const [type, det] of [['sawtooth', -5], ['square', 5]]) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = mtof(m);
      o.detune.value = det;
      vg.connect(o.detune);
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    vib.start(t);
    vib.stop(t + dur + 0.05);
    f.connect(g);
    g.connect(this.bus);
    g.connect(this.delaySend);
    g.connect(this.reverb);
  }
}
