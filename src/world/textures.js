import * as THREE from 'three';
import { Rng } from '../core/rng.js';

// Alle Texturen werden prozedural per Canvas erzeugt – keine externen Assets nötig.

let maxAniso = 4;
export function setMaxAnisotropy(v) {
  maxAniso = v;
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

function noise(ctx, w, h, rng, count, size, colorFn) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colorFn(rng);
    const s = rng.float(size[0], size[1]);
    ctx.fillRect(rng.float(0, w), rng.float(0, h), s, s);
  }
}

const cache = {};
function cached(key, fn) {
  if (!cache[key]) cache[key] = fn();
  return cache[key];
}

export function asphaltTexture() {
  return cached('asphalt', () => {
    const [c, g] = canvas(512);
    const rng = new Rng(11);
    g.fillStyle = '#3a3b3e';
    g.fillRect(0, 0, 512, 512);
    noise(g, 512, 512, rng, 26000, [1, 2.2], (r) => {
      const v = r.int(35, 95);
      return `rgba(${v},${v},${v + 3},${r.float(0.25, 0.7)})`;
    });
    // Flecken und Ausbesserungen
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(20,20,22,${rng.float(0.08, 0.2)})`;
      g.beginPath();
      g.ellipse(rng.float(0, 512), rng.float(0, 512), rng.float(20, 90), rng.float(10, 50), rng.float(0, 3), 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(25,25,25,0.5)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      let x = rng.float(0, 512);
      let y = rng.float(0, 512);
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += rng.float(-18, 18);
        y += rng.float(-18, 18);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    return tex(c);
  });
}

export function concreteTexture() {
  return cached('concrete', () => {
    const [c, g] = canvas(512);
    const rng = new Rng(12);
    g.fillStyle = '#a9a49b';
    g.fillRect(0, 0, 512, 512);
    noise(g, 512, 512, rng, 16000, [1, 2], (r) => {
      const v = r.int(140, 200);
      return `rgba(${v},${v - 4},${v - 10},${r.float(0.2, 0.5)})`;
    });
    // Gehwegplatten (4×4 Platten pro Kachel)
    g.strokeStyle = 'rgba(80,76,70,0.55)';
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * 128, 0);
      g.lineTo(i * 128, 512);
      g.moveTo(0, i * 128);
      g.lineTo(512, i * 128);
      g.stroke();
    }
    return tex(c);
  });
}

export function grassTexture() {
  return cached('grass', () => {
    const [c, g] = canvas(512);
    const rng = new Rng(13);
    g.fillStyle = '#4f7a31';
    g.fillRect(0, 0, 512, 512);
    noise(g, 512, 512, rng, 40000, [1, 3], (r) => {
      const h = r.int(75, 105);
      return `hsla(${h},${r.int(35, 60)}%,${r.int(22, 42)}%,${r.float(0.4, 0.8)})`;
    });
    return tex(c);
  });
}

export function sandTexture() {
  return cached('sand', () => {
    const [c, g] = canvas(512);
    const rng = new Rng(14);
    g.fillStyle = '#e8d3a8';
    g.fillRect(0, 0, 512, 512);
    noise(g, 512, 512, rng, 45000, [1, 2], (r) => {
      const l = r.int(68, 90);
      return `hsla(${r.int(35, 45)},${r.int(40, 60)}%,${l}%,${r.float(0.3, 0.7)})`;
    });
    g.strokeStyle = 'rgba(190,160,110,0.18)';
    g.lineWidth = 3;
    for (let y = 0; y < 512; y += 22) {
      g.beginPath();
      for (let x = 0; x <= 512; x += 8) g.lineTo(x, y + Math.sin(x * 0.03 + y) * 5);
      g.stroke();
    }
    return tex(c);
  });
}

export function roofTexture() {
  return cached('roof', () => {
    const [c, g] = canvas(256);
    const rng = new Rng(15);
    g.fillStyle = '#6d6a66';
    g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, rng, 9000, [1, 2], (r) => {
      const v = r.int(70, 150);
      return `rgba(${v},${v},${v - 5},0.5)`;
    });
    return tex(c);
  });
}

// ---------------------------------------------------------------------------
// Fassaden: 8×8 Fensterfelder pro Kachel. Farbtextur + Nachtbeleuchtung (Emissive)
// + Rauheit/Metall (G/B-Kanal) für spiegelnde Glasflächen.

export const FACADE_TILE = { w: 24, h: 28 }; // Meter pro Texturkachel (8 Achsen × 8 Etagen)

function facadeSet(key, draw) {
  return cached('facade-' + key, () => {
    const S = 512;
    const cell = S / 8;
    const [c, g] = canvas(S);
    const [ce, ge] = canvas(S);
    const [cr, gr] = canvas(S);
    const rng = new Rng(key.length * 97 + 31);
    ge.fillStyle = '#000';
    ge.fillRect(0, 0, S, S);
    draw({ g, ge, gr, S, cell, rng });
    const map = tex(c);
    const emissive = tex(ce);
    const rough = tex(cr, { srgb: false });
    return { map, emissive, rough };
  });
}

function litWindow(ge, rng, x, y, w, h, prob) {
  if (!rng.chance(prob)) return;
  const warm = rng.chance(0.75);
  const l = rng.float(0.55, 1);
  ge.fillStyle = warm
    ? `rgb(${255 * l | 0},${(200 + rng.int(0, 40)) * l | 0},${(120 + rng.int(0, 50)) * l | 0})`
    : `rgb(${(170 * l) | 0},${(210 * l) | 0},${(255 * l) | 0})`;
  ge.fillRect(x, y, w, h);
}

export function glassFacade() {
  return facadeSet('glass', ({ g, ge, gr, S, cell, rng }) => {
    g.fillStyle = '#cfd6dc';
    g.fillRect(0, 0, S, S);
    gr.fillStyle = 'rgb(0,150,40)'; // Rahmen: rau, wenig Metall
    gr.fillRect(0, 0, S, S);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const x = i * cell + 3;
        const y = j * cell + 4;
        const w = cell - 6;
        const h = cell - 10;
        const v = rng.int(60, 85);
        const grad = g.createLinearGradient(x, y, x + w, y + h);
        grad.addColorStop(0, `rgb(${v},${v + 12},${v + 22})`);
        grad.addColorStop(1, `rgb(${v - 25},${v - 15},${v})`);
        g.fillStyle = grad;
        g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x + w / 2 - 1, y, 2, h);
        gr.fillStyle = 'rgb(0,18,220)'; // Glas: glatt, metallisch spiegelnd
        gr.fillRect(x, y, w, h);
        litWindow(ge, rng, x, y, w, h, 0.32);
      }
      g.fillStyle = 'rgba(90,100,110,0.9)';
      g.fillRect(0, i * cell + cell - 6, S, 6);
    }
  });
}

export function officeFacade() {
  return facadeSet('office', ({ g, ge, gr, S, cell, rng }) => {
    g.fillStyle = '#e4dccd';
    g.fillRect(0, 0, S, S);
    gr.fillStyle = 'rgb(0,210,0)';
    gr.fillRect(0, 0, S, S);
    for (let j = 0; j < 8; j++) {
      const y = j * cell + 12;
      const h = cell - 26;
      g.fillStyle = '#2d3a44';
      g.fillRect(0, y, S, h);
      gr.fillStyle = 'rgb(0,30,120)';
      gr.fillRect(0, y, S, h);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = 'rgba(200,200,200,0.55)';
        g.fillRect(i * cell, y, 3, h);
        litWindow(ge, rng, i * cell + 3, y, cell - 3, h, 0.38);
      }
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, y + h, S, 5);
    }
  });
}

export function residentialFacade() {
  return facadeSet('residential', ({ g, ge, gr, S, cell, rng }) => {
    g.fillStyle = '#efe6d8';
    g.fillRect(0, 0, S, S);
    gr.fillStyle = 'rgb(0,235,0)';
    gr.fillRect(0, 0, S, S);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const x = i * cell + 16;
        const y = j * cell + 14;
        const w = cell - 32;
        const h = cell - 28;
        g.fillStyle = 'rgba(0,0,0,0.15)';
        g.fillRect(x - 3, y - 3, w + 6, h + 8);
        g.fillStyle = '#34414d';
        g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x, y + h / 2 - 1, w, 2);
        gr.fillStyle = 'rgb(0,40,90)';
        gr.fillRect(x, y, w, h);
        litWindow(ge, rng, x, y, w, h, 0.4);
        // Balkone
        if (j % 2 === 0 && rng.chance(0.5)) {
          g.fillStyle = 'rgba(255,255,255,0.9)';
          g.fillRect(x - 6, y + h + 2, w + 12, 4);
        }
      }
    }
  });
}

export function decoFacade() {
  return facadeSet('deco', ({ g, ge, gr, S, cell, rng }) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, S, S);
    gr.fillStyle = 'rgb(0,225,0)';
    gr.fillRect(0, 0, S, S);
    for (let j = 0; j < 8; j++) {
      // "Eyebrows": markante Vordächer über den Fensterbändern
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(0, j * cell + 10, S, 6);
      g.fillStyle = 'rgba(255,255,255,1)';
      g.fillRect(0, j * cell + 6, S, 5);
      for (let i = 0; i < 8; i++) {
        const x = i * cell + 10;
        const y = j * cell + 18;
        const w = cell - 20;
        const h = cell - 30;
        g.fillStyle = i % 4 === 3 ? 'rgba(0,0,0,0.05)' : '#2f4b5a';
        if (i % 4 !== 3) {
          g.fillRect(x, y, w, h);
          g.fillStyle = 'rgba(160,220,230,0.25)';
          g.fillRect(x + 2, y + 2, w / 2 - 3, h - 4);
          gr.fillStyle = 'rgb(0,35,110)';
          gr.fillRect(x, y, w, h);
          litWindow(ge, rng, x, y, w, h, 0.45);
        } else {
          // Vertikale Zierlisenen
          g.fillStyle = 'rgba(0,0,0,0.07)';
          g.fillRect(x + w / 2 - 4, j * cell, 8, cell);
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Palmen

export function frondTexture() {
  return cached('frond', () => {
    const [c, g] = canvas(256, 512);
    g.clearRect(0, 0, 256, 512);
    // Mittelrippe verläuft von unten (Stamm) nach oben (Spitze)
    const rng = new Rng(21);
    for (let i = 0; i < 70; i++) {
      const t = i / 70;
      const y = 500 - t * 490;
      const len = Math.sin(Math.min(1, t * 1.25) * Math.PI) * 118 + 8;
      for (const side of [-1, 1]) {
        const hue = rng.int(78, 100);
        g.strokeStyle = `hsl(${hue},${rng.int(40, 58)}%,${rng.int(22, 36)}%)`;
        g.lineWidth = rng.float(3, 5);
        g.beginPath();
        g.moveTo(128, y);
        g.quadraticCurveTo(128 + side * len * 0.5, y - 6, 128 + side * len, y - 26 - rng.float(0, 10));
        g.stroke();
      }
    }
    g.strokeStyle = '#5b5a2e';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(128, 512);
    g.lineTo(128, 6);
    g.stroke();
    const t = tex(c, { repeat: false });
    return t;
  });
}

export function barkTexture() {
  return cached('bark', () => {
    const [c, g] = canvas(128, 256);
    const rng = new Rng(22);
    g.fillStyle = '#8a7358';
    g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 8) {
      g.fillStyle = `rgba(60,45,30,${rng.float(0.35, 0.6)})`;
      g.fillRect(0, y, 128, rng.float(2, 4));
      g.fillStyle = `rgba(190,170,140,${rng.float(0.1, 0.25)})`;
      g.fillRect(0, y + 4, 128, 2);
    }
    noise(g, 128, 256, rng, 2500, [1, 2], (r) => `rgba(40,30,20,${r.float(0.1, 0.3)})`);
    return tex(c);
  });
}

// Weicher runder Lichtkegel (für Laternen-Lichtflecken, Scheinwerfer etc.)
export function glowTexture() {
  return cached('glow', () => {
    const [c, g] = canvas(128);
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return tex(c, { repeat: false });
  });
}

export function beamTexture() {
  return cached('beam', () => {
    const [c, g] = canvas(128, 256);
    const grad = g.createLinearGradient(0, 256, 0, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(54, 256);
    g.lineTo(74, 256);
    g.lineTo(128, 0);
    g.lineTo(0, 0);
    g.closePath();
    g.fill();
    const t = tex(c, { repeat: false });
    return t;
  });
}

// Kachelbare Wasser-Normalmap aus überlagerten Sinuswellen mit ganzzahligen Frequenzen
export function waterNormalTexture() {
  return cached('waterNormal', () => {
    const S = 256;
    const [c, g] = canvas(S);
    const img = g.createImageData(S, S);
    const rng = new Rng(33);
    const waves = [];
    for (let i = 0; i < 14; i++) {
      waves.push({ fx: rng.int(-9, 9), fy: rng.int(1, 9), a: rng.float(0.3, 1) / (i * 0.35 + 1), p: rng.float(0, 6.28) });
    }
    const h = (x, y) => {
      let v = 0;
      for (const w of waves) v += w.a * Math.sin(((w.fx * x + w.fy * y) / S) * Math.PI * 2 + w.p);
      return v;
    };
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = h(x + 1, y) - h(x - 1, y);
        const dy = h(x, y + 1) - h(x, y - 1);
        const nx = -dx * 2.2;
        const ny = -dy * 2.2;
        const l = Math.hypot(nx, ny, 1);
        const i = (y * S + x) * 4;
        img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
        img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return tex(c, { srgb: false });
  });
}

// Neon-Schriftzüge der Art-déco-Hotels (Atlas mit 8 senkrechten Schildern)
export const SIGN_NAMES = ['FLAMINGO', 'PARADISE', 'OCEAN VIEW', 'MARLIN', 'CORAL', 'SUNSET', 'TROPICANA', 'PELICAN'];
export const SIGN_COLORS = ['#ff3fa4', '#35f2ff', '#ffd23f', '#9b5bff', '#ff5f3f', '#3fff9b', '#ff3fa4', '#35f2ff'];
export function signAtlas() {
  return cached('signs', () => {
    const W = 1024;
    const H = 1024;
    const [c, g] = canvas(W, H);
    g.fillStyle = '#07060c';
    g.fillRect(0, 0, W, H);
    const colW = W / 8;
    SIGN_NAMES.forEach((name, i) => {
      const x = i * colW + colW / 2;
      const color = SIGN_COLORS[i];
      g.strokeStyle = color;
      g.lineWidth = 4;
      g.strokeRect(i * colW + 8, 8, colW - 16, H - 16);
      const letters = name.replace(' ', '').split('');
      const step = (H - 60) / Math.max(letters.length, 6);
      g.font = `bold ${Math.min(96, step * 0.82)}px "Arial Black", Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      letters.forEach((ch, k) => {
        const y = 30 + step * (k + 0.5) + (H - 60 - step * letters.length) / 2;
        g.shadowColor = color;
        g.shadowBlur = 18;
        g.fillStyle = color;
        g.fillText(ch, x, y);
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillText(ch, x, y);
      });
    });
    const t = tex(c, { repeat: false });
    return t;
  });
}

export function taxiSignTexture() {
  return cached('taxi', () => {
    const [c, g] = canvas(256, 64);
    g.fillStyle = '#fff6c8';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#111';
    g.font = 'bold 44px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('TAXI', 128, 34);
    return tex(c, { repeat: false });
  });
}

// Hawaiihemd-Muster für die Figuren
export function shirtTexture(base = '#2e7fd6', flower = '#f4f1e8') {
  return cached('shirt' + base + flower, () => {
    const [c, g] = canvas(256);
    const rng = new Rng(base.length + base.charCodeAt(1) * 7);
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 36; i++) {
      const x = rng.float(0, 256);
      const y = rng.float(0, 256);
      const r = rng.float(6, 13);
      g.fillStyle = flower;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.55, r * 0.3, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#f2c230';
      g.beginPath();
      g.arc(x, y, r * 0.25, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(30,90,40,0.8)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x + r, y + r);
      g.quadraticCurveTo(x + r * 2, y, x + r * 2.4, y + r * 1.8);
      g.stroke();
    }
    return tex(c);
  });
}
