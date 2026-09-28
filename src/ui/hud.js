import * as L from '../world/layout.js';

const $ = (id) => document.getElementById(id);

export function districtName(x, z) {
  for (const b of L.BRIDGES) if (x > L.MAINLAND.x1 && x < L.ISLAND.x0 && Math.abs(z - b.z) < 12) return b.name;
  if (x >= L.ISLAND.x0 - 5) {
    if (x > 636) return 'Ocean Beach';
    if (x > 560) return 'Ocean Drive';
    return 'Vice Beach';
  }
  if (x > 100) return 'Bayfront Park';
  if (x > -200) return 'Downtown';
  if (x > -500) return 'Little Havana';
  return 'Little Haiti';
}

export class Hud {
  constructor(city) {
    this.root = $('hud');
    this.speedo = $('speedo');
    this.sc = $('speedoCanvas');
    this.sctx = this.sc.getContext('2d');
    this.mm = $('minimap');
    this.mctx = this.mm.getContext('2d');
    this.clock = $('clockText');
    this.clockIcon = $('clockIcon');
    this.hint = $('hint');
    this.toastEl = $('toast');
    this.areaEl = $('area');
    this.lastHint = null;
    this.lastClock = '';
    this.area = '';
    this.toastTimer = 0;
    this.areaTimer = 0;
    const dpr = Math.min(2, devicePixelRatio || 1);
    for (const c of [this.sc, this.mm]) {
      const r = c.getBoundingClientRect();
      c.width = Math.round((r.width || 200) * dpr);
      c.height = Math.round((r.height || 200) * dpr);
    }
    this.dpr = dpr;
    this.map = this.renderMap(city);
  }

  resize() {
    const dpr = this.dpr;
    for (const c of [this.sc, this.mm]) {
      const r = c.getBoundingClientRect();
      if (!r.width) continue;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    }
  }

  // Karte einmalig vorzeichnen (1 px = 1 m)
  renderMap(city) {
    const X0 = -760;
    const Z0 = -760;
    const W = 1580;
    const H = 1520;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.translate(-X0, -Z0);
    g.fillStyle = '#123f5a';
    g.fillRect(X0, Z0, W, H);
    g.fillStyle = '#1c6b80';
    g.fillRect(L.MAINLAND.x1, -760, L.ISLAND.x0 - L.MAINLAND.x1, 1520);
    for (const land of [L.MAINLAND, L.ISLAND]) {
      g.fillStyle = '#3d3d44';
      g.fillRect(land.x0, land.z0, land.x1 - land.x0, land.z1 - land.z0);
    }
    for (const b of city.blocks) {
      g.fillStyle = b.type === 'bayfront' ? '#3f7a45' : b.type === 'beachpark' ? '#e3cf9c' : '#8d8a86';
      g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
      if (b.type === 'beachpark') {
        g.fillStyle = '#3f7a45';
        g.fillRect(592, b.z0, 44, b.z1 - b.z0);
      }
    }
    for (const f of city.footprints) {
      g.fillStyle = f.kind === 'deco' ? '#e7a9c4' : f.kind === 'glass' ? '#9fb7cc' : '#bdb6ad';
      g.fillRect(f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0);
    }
    g.strokeStyle = '#d8d8d8';
    for (const b of L.BRIDGES) {
      g.fillStyle = '#5a5a62';
      g.fillRect(b.x0, b.z - 8, b.x1 - b.x0, 16);
    }
    return { canvas: c, X0, Z0 };
  }

  toast(text, secs = 2.5) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTimer = secs;
  }

  setHint(text) {
    if (text === this.lastHint) return;
    this.lastHint = text;
    this.hint.innerHTML = text || '';
    this.hint.classList.toggle('show', !!text);
  }

  update(dt, s) {
    // Uhr
    if (s.clock !== this.lastClock) {
      this.lastClock = s.clock;
      this.clock.textContent = s.clock;
      this.clockIcon.textContent = s.night > 0.5 ? '☾' : '☀';
    }
    // Stadtteil-Einblendung (wie im Original unten rechts in Schreibschrift)
    const name = districtName(s.x, s.z);
    if (name !== this.area) {
      this.area = name;
      this.areaEl.textContent = name;
      this.areaEl.classList.remove('show');
      void this.areaEl.offsetWidth;
      this.areaEl.classList.add('show');
      this.areaTimer = 3.5;
    }
    if (this.areaTimer > 0) {
      this.areaTimer -= dt;
      if (this.areaTimer <= 0) this.areaEl.classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
    this.speedo.classList.toggle('show', !!s.vehicle);
    if (s.vehicle) this.drawSpeedo(s.vehicle);
    this.drawMinimap(s);
  }

  drawSpeedo(v) {
    const c = this.sctx;
    const W = this.sc.width;
    const H = this.sc.height;
    const cx = W / 2;
    const cy = H / 2;
    const R = W * 0.42;
    c.clearRect(0, 0, W, H);
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    const maxKmh = 320;
    const kmh = Math.abs(v.forwardSpeed) * 3.6;
    // Hintergrund
    c.fillStyle = 'rgba(10,6,24,0.55)';
    c.beginPath();
    c.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
    c.fill();
    // Skala
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,255,255,0.15)';
    c.lineWidth = W * 0.035;
    c.beginPath();
    c.arc(cx, cy, R, a0, a1);
    c.stroke();
    const grad = c.createLinearGradient(0, H, W, 0);
    grad.addColorStop(0, '#35f2ff');
    grad.addColorStop(0.6, '#ff3fa4');
    grad.addColorStop(1, '#ffd23f');
    c.strokeStyle = grad;
    c.shadowColor = '#ff3fa4';
    c.shadowBlur = W * 0.05;
    c.beginPath();
    c.arc(cx, cy, R, a0, a0 + (a1 - a0) * Math.min(1, kmh / maxKmh));
    c.stroke();
    c.shadowBlur = 0;
    // Striche
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.font = `${Math.round(W * 0.055)}px Rajdhani, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let k = 0; k <= maxKmh; k += 20) {
      const a = a0 + ((a1 - a0) * k) / maxKmh;
      const major = k % 40 === 0;
      c.strokeStyle = major ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)';
      c.lineWidth = major ? W * 0.012 : W * 0.006;
      const r1 = R * 0.8;
      const r2 = R * (major ? 0.9 : 0.86);
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      c.stroke();
      if (major) c.fillText(String(k), cx + Math.cos(a) * R * 0.66, cy + Math.sin(a) * R * 0.66);
    }
    // Drehzahl-Balken (innen)
    const rpmFrac = Math.min(1, v.rpm / 7500);
    c.strokeStyle = rpmFrac > 0.88 ? '#ff4040' : 'rgba(255,255,255,0.55)';
    c.lineWidth = W * 0.015;
    c.beginPath();
    c.arc(cx, cy, R * 0.47, a0, a0 + (a1 - a0) * rpmFrac);
    c.stroke();
    // Nitro-Anzeige
    c.strokeStyle = 'rgba(53,242,255,0.25)';
    c.lineWidth = W * 0.02;
    c.beginPath();
    c.arc(cx, cy, R * 1.1, Math.PI * 0.8, Math.PI * 0.2, true);
    c.stroke();
    c.strokeStyle = v.nitroActive ? '#ffffff' : '#35f2ff';
    c.shadowColor = '#35f2ff';
    c.shadowBlur = W * 0.04;
    c.beginPath();
    c.arc(cx, cy, R * 1.1, Math.PI * 0.8, Math.PI * 0.8 - Math.PI * 0.6 * v.nitro, true);
    c.stroke();
    c.shadowBlur = 0;
    // Nadel
    const na = a0 + (a1 - a0) * Math.min(1.02, kmh / maxKmh);
    c.strokeStyle = '#ff3fa4';
    c.lineWidth = W * 0.014;
    c.beginPath();
    c.moveTo(cx - Math.cos(na) * R * 0.1, cy - Math.sin(na) * R * 0.1);
    c.lineTo(cx + Math.cos(na) * R * 0.78, cy + Math.sin(na) * R * 0.78);
    c.stroke();
    // Digital
    c.fillStyle = '#fff';
    c.font = `700 ${Math.round(W * 0.17)}px Rajdhani, sans-serif`;
    c.fillText(String(Math.round(kmh)), cx, cy + R * 0.3);
    c.font = `600 ${Math.round(W * 0.06)}px Rajdhani, sans-serif`;
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillText('km/h', cx, cy + R * 0.55);
    c.fillStyle = '#35f2ff';
    c.font = `700 ${Math.round(W * 0.09)}px Rajdhani, sans-serif`;
    c.fillText(v.gear < 0 ? 'R' : v.forwardSpeed < 0.5 && v.throttle === 0 ? 'N' : String(v.gear), cx, cy - R * 0.2);
  }

  drawMinimap(s) {
    const c = this.mctx;
    const W = this.mm.width;
    const H = this.mm.height;
    const scale = (W / 320) * (s.vehicle ? 0.75 + 0.25 * Math.max(0, 1 - s.speed / 60) : 1.1);
    c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath();
    c.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#123f5a';
    c.fillRect(0, 0, W, H);
    c.translate(W / 2, H / 2);
    c.rotate(s.yaw + Math.PI);
    c.scale(scale, scale);
    c.translate(-s.x, -s.z);
    c.drawImage(this.map.canvas, this.map.X0, this.map.Z0);
    // Autos
    for (const v of s.vehicles) {
      if (v.driver === 'player') continue;
      const dx = v.x - s.x;
      const dz = v.z - s.z;
      if (dx * dx + dz * dz > 40000) continue;
      if (!v.driver && v.spec.cat === 'sport') {
        c.fillStyle = '#ff3fa4';
        c.fillRect(v.x - 5, v.z - 5, 10, 10);
        c.strokeStyle = '#fff';
        c.lineWidth = 1.5;
        c.strokeRect(v.x - 5, v.z - 5, 10, 10);
      } else {
        c.fillStyle = 'rgba(255,255,255,0.75)';
        c.fillRect(v.x - 2, v.z - 2, 4, 4);
      }
    }
    // Spielerpfeil
    c.translate(s.x, s.z);
    c.rotate(Math.atan2(Math.cos(s.heading), Math.sin(s.heading)));
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#ff3fa4';
    c.lineWidth = 3 / scale;
    c.beginPath();
    const k = 11 / scale;
    c.moveTo(k * 1.2, 0);
    c.lineTo(-k * 0.8, k * 0.75);
    c.lineTo(-k * 0.4, 0);
    c.lineTo(-k * 0.8, -k * 0.75);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
    // Rahmen + Norden
    c.strokeStyle = 'rgba(255,63,164,0.9)';
    c.lineWidth = 3 * this.dpr;
    c.beginPath();
    c.arc(W / 2, H / 2, W / 2 - 2 * this.dpr, 0, Math.PI * 2);
    c.stroke();
    const na = s.yaw + Math.PI - Math.PI / 2;
    const nr = W / 2 - 12 * this.dpr;
    c.fillStyle = '#fff';
    c.font = `700 ${Math.round(12 * this.dpr)}px Rajdhani, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('N', W / 2 + Math.cos(na) * nr, H / 2 + Math.sin(na) * nr);
  }
}
