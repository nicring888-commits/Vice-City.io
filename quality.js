// Qualitätsstufen – Desktop bekommt volle Effekte, Mobilgeräte eine schlankere Stufe.
export const IS_TOUCH =
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;

export const IS_MOBILE = IS_TOUCH && Math.min(screen.width, screen.height) < 900;

export const PRESETS = {
  high: {
    name: 'Hoch',
    pixelRatio: 1.5,
    shadows: true,
    shadowSize: 2048,
    shadowExtent: 90,
    bloom: true,
    msaa: 4,
    traffic: 30,
    lodDist: 75,
    fogFar: 1600,
    envInterval: 3,
    envSize: 256,
  },
  medium: {
    name: 'Mittel',
    pixelRatio: 1.25,
    shadows: true,
    shadowSize: 1024,
    shadowExtent: 70,
    bloom: true,
    msaa: 0,
    traffic: 20,
    lodDist: 55,
    fogFar: 1200,
    envInterval: 6,
    envSize: 128,
  },
  low: {
    name: 'Niedrig',
    pixelRatio: 1,
    shadows: false,
    shadowSize: 512,
    shadowExtent: 60,
    bloom: false,
    msaa: 0,
    traffic: 12,
    lodDist: 40,
    fogFar: 800,
    envInterval: 12,
    envSize: 64,
  },
};

export function detectQuality() {
  let saved = null;
  try {
    saved = localStorage.getItem('vc-quality');
  } catch {
    /* Speicher nicht verfügbar */
  }
  if (saved && PRESETS[saved]) return saved;
  return IS_MOBILE ? 'low' : IS_TOUCH ? 'medium' : 'high';
}

export function saveQuality(key) {
  try {
    localStorage.setItem('vc-quality', key);
  } catch {
    /* ignorieren */
  }
}

// Beobachtet die Bildrate und schlägt eine niedrigere Stufe vor, wenn es ruckelt
export class FpsWatcher {
  constructor() {
    this.samples = [];
    this.cooldown = 6;
  }
  push(dt) {
    this.cooldown -= dt;
    this.samples.push(dt);
    if (this.samples.length > 180) this.samples.shift();
  }
  get fps() {
    if (!this.samples.length) return 60;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    return 1 / avg;
  }
  shouldDowngrade() {
    if (this.cooldown > 0 || this.samples.length < 150) return false;
    // Unter 26 FPS herunterschalten (30-Hz-Displays/Stromsparmodus nicht bestrafen)
    if (this.fps < 26) {
      this.samples.length = 0;
      this.cooldown = 8;
      return true;
    }
    return false;
  }
}
