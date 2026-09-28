// Synthetischer Sound mit der Web Audio API – keine Audiodateien nötig.
export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ready = false;
  }

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    // Rauschen als Grundlage für Reifen, Wind, Meer, Crash
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const noise = () => {
      const n = ctx.createBufferSource();
      n.buffer = buf;
      n.loop = true;
      n.start();
      return n;
    };

    // Motor: zwei verstimmte Sägezähne + Rechteck-Subharmonische → Verzerrung → Tiefpass
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 800;
    this.engineFilter.Q.value = 2;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 2.6);
    }
    shaper.curve = curve;
    this.osc = [];
    for (const [type, mult, gain] of [
      ['sawtooth', 1, 0.5],
      ['sawtooth', 1.007, 0.4],
      ['square', 0.5, 0.35],
      ['triangle', 2, 0.18],
    ]) {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(shaper);
      o.start();
      this.osc.push({ o, mult });
    }
    // Leichtes Tremolo für "Blubbern" im Leerlauf
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 12;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.15;
    const trem = ctx.createGain();
    trem.gain.value = 0.85;
    this.lfo.connect(this.lfoGain).connect(trem.gain);
    this.lfo.start();
    shaper.connect(this.engineFilter).connect(trem).connect(this.engineGain).connect(this.master);

    // Reifenquietschen
    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;
    const tf = ctx.createBiquadFilter();
    tf.type = 'bandpass';
    tf.frequency.value = 1300;
    tf.Q.value = 5;
    const tf2 = ctx.createBiquadFilter();
    tf2.type = 'peaking';
    tf2.frequency.value = 2600;
    tf2.gain.value = 10;
    noise().connect(tf).connect(tf2).connect(this.tireGain).connect(this.master);

    // Fahrtwind
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 600;
    noise().connect(wf).connect(this.windGain).connect(this.master);

    // Meeresrauschen
    this.seaGain = ctx.createGain();
    this.seaGain.gain.value = 0;
    const sf = ctx.createBiquadFilter();
    sf.type = 'lowpass';
    sf.frequency.value = 450;
    const seaLfo = ctx.createOscillator();
    seaLfo.frequency.value = 0.12;
    const seaLfoGain = ctx.createGain();
    seaLfoGain.gain.value = 0.5;
    const seaMod = ctx.createGain();
    seaMod.gain.value = 0.6;
    seaLfo.connect(seaLfoGain).connect(seaMod.gain);
    seaLfo.start();
    noise().connect(sf).connect(seaMod).connect(this.seaGain).connect(this.master);

    // Nitro
    this.nitroGain = ctx.createGain();
    this.nitroGain.gain.value = 0;
    const nf = ctx.createBiquadFilter();
    nf.type = 'highpass';
    nf.frequency.value = 2500;
    noise().connect(nf).connect(this.nitroGain).connect(this.master);

    // Hupe
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    const hf = ctx.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 1800;
    for (const f of [392, 494]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(hf);
      o.start();
    }
    hf.connect(this.hornGain).connect(this.master);

    // Polizeisirene (auf- und abschwellendes Heulen)
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    const so = ctx.createOscillator();
    so.type = 'sawtooth';
    so.frequency.value = 980;
    const sl = ctx.createOscillator();
    sl.type = 'triangle';
    sl.frequency.value = 0.42;
    const slg = ctx.createGain();
    slg.gain.value = 380;
    sl.connect(slg).connect(so.frequency);
    const sf2 = ctx.createBiquadFilter();
    sf2.type = 'lowpass';
    sf2.frequency.value = 2200;
    so.connect(sf2).connect(this.sirenGain).connect(this.master);
    so.start();
    sl.start();

    this.ready = true;
    this.setMuted(this.muted);
  }

  siren(vol) {
    if (!this.ready) return;
    this.sirenGain.gain.setTargetAtTime(vol * 0.07, this.ctx.currentTime, 0.2);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  // Motorsound + Reifen + Wind je Frame
  update(state) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const { inCar, rpm = 900, throttle = 0, slip = 0, speed = 0, nitro = false, horn = false, sea = 0 } = state;
    const base = (rpm / 60) * 2; // Zündfrequenz eines V8 (4 Zündungen/Umdrehung / 2)
    for (const { o, mult } of this.osc) o.frequency.setTargetAtTime(base * mult, t, 0.03);
    this.lfo.frequency.setTargetAtTime(base / 4, t, 0.05);
    this.lfoGain.gain.setTargetAtTime(rpm < 1500 ? 0.25 : 0.05, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(350 + throttle * 1800 + rpm * 0.25, t, 0.05);
    this.engineGain.gain.setTargetAtTime(inCar ? 0.05 + throttle * 0.09 + (rpm / 7500) * 0.05 : 0, t, 0.08);
    this.tireGain.gain.setTargetAtTime(inCar ? Math.min(0.22, Math.max(0, slip - 3) * 0.03) : 0, t, 0.05);
    this.windGain.gain.setTargetAtTime(Math.min(0.25, (speed / 80) ** 2 * 0.3), t, 0.1);
    this.nitroGain.gain.setTargetAtTime(nitro ? 0.12 : 0, t, 0.05);
    this.hornGain.gain.setTargetAtTime(horn ? 0.12 : 0, t, 0.02);
    this.seaGain.gain.setTargetAtTime(sea * 0.35, t, 0.3);
  }

  crash(strength, distance = 0) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const vol = Math.min(1, strength / 18) / (1 + distance * 0.05);
    if (vol < 0.03) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500 + strength * 60;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol * 0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35 + vol * 0.4);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 1);
    // Metallisches Klirren
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 180 + Math.random() * 300;
    const og = ctx.createGain();
    og.gain.setValueAtTime(vol * 0.25, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
  }

  honk(distance) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const vol = 0.14 / (1 + distance * 0.06);
    if (vol < 0.01) return;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.setValueAtTime(vol, t + 0.35);
    g.gain.linearRampToValueAtTime(0, t + 0.42);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1500;
    for (const fr of [340 + Math.random() * 80, 430 + Math.random() * 80]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = fr;
      o.connect(f);
      o.start(t);
      o.stop(t + 0.45);
    }
    f.connect(g).connect(this.master);
  }

  blip(freq = 880, dur = 0.08, vol = 0.08) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Tür/Einsteigen
  door() {
    if (!this.ready || this.muted) return;
    this.crash(3.2, 0);
    setTimeout(() => this.blip(160, 0.12, 0.1), 60);
  }
}
