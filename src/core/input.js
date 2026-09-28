// Einheitliche Eingabe: Tastatur, Maus (Kamera ziehen), Gamepad und Touch-Steuerung.
const BIND = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  nitro: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyF', 'KeyE', 'Enter'],
  camera: ['KeyC'],
  horn: ['KeyH'],
  time: ['KeyT'],
  pause: ['Escape', 'KeyP'],
  mute: ['KeyM'],
  reset: ['KeyR'],
};

export class Input {
  constructor(dom) {
    this.down = new Set();
    this.edges = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.lastLook = -10;
    // Touch-Zustand (wird von der Touch-UI gesetzt)
    this.touch = { x: 0, y: 0, active: false, buttons: new Set() };
    this.pad = { steer: 0, throttle: 0, brake: 0, lookX: 0, lookY: 0, buttons: new Set() };
    this.padPrev = new Set();

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      for (const [a, codes] of Object.entries(BIND)) if (codes.includes(e.code)) this.edges.add(a);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());

    let dragging = false;
    dom.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') dragging = true;
    });
    addEventListener('pointerup', () => (dragging = false));
    addEventListener('pointermove', (e) => {
      if (dragging && e.pointerType === 'mouse') this.look(e.movementX, e.movementY);
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  look(dx, dy) {
    this.lookDX += dx;
    this.lookDY += dy;
    this.lastLook = performance.now() / 1000;
  }

  held(action) {
    if (BIND[action].some((c) => this.down.has(c))) return true;
    if (this.touch.buttons.has(action)) return true;
    if (this.pad.buttons.has(action)) return true;
    return false;
  }

  pressed(action) {
    if (this.edges.has(action)) {
      this.edges.delete(action);
      return true;
    }
    return false;
  }

  // Wird von der Touch-UI für Tipp-Aktionen genutzt
  trigger(action) {
    this.edges.add(action);
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    const b = new Set();
    if (!gp) {
      this.pad.steer = this.pad.throttle = this.pad.brake = this.pad.lookX = this.pad.lookY = 0;
      this.pad.buttons = b;
      return;
    }
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    this.pad.steer = dz(gp.axes[0] || 0);
    this.pad.moveY = dz(gp.axes[1] || 0);
    this.pad.lookX = dz(gp.axes[2] || 0);
    this.pad.lookY = dz(gp.axes[3] || 0);
    this.pad.throttle = gp.buttons[7]?.value || 0;
    this.pad.brake = gp.buttons[6]?.value || 0;
    const map = { 0: 'handbrake', 2: 'nitro', 3: 'interact', 5: 'camera', 1: 'horn', 9: 'pause' };
    for (const [i, a] of Object.entries(map)) if (gp.buttons[i]?.pressed) b.add(a);
    for (const a of b) if (!this.padPrev.has(a)) this.edges.add(a);
    this.padPrev = b;
    this.pad.buttons = b;
    if (this.pad.lookX || this.pad.lookY) this.look(this.pad.lookX * 12, this.pad.lookY * 8);
  }

  // Fahrzeugsteuerung
  vehicle() {
    const t = this.touch;
    let steer = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    if (t.active) steer = t.x;
    if (this.pad.steer) steer = this.pad.steer;
    const throttle = Math.max(this.held('throttle') ? 1 : 0, this.pad.throttle);
    const brake = Math.max(this.held('brake') ? 1 : 0, this.pad.brake);
    return {
      throttle,
      brake,
      steer,
      analog: t.active || !!this.pad.steer,
      handbrake: this.held('handbrake'),
      nitro: this.held('nitro'),
    };
  }

  // Zu-Fuß-Steuerung (relativ zur Kamera)
  foot() {
    let x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let y = (this.held('throttle') ? 1 : 0) - (this.held('brake') ? 1 : 0);
    let sprint = this.held('nitro');
    if (this.touch.active) {
      x = this.touch.x;
      y = -this.touch.y;
      sprint = Math.hypot(x, y) > 0.85;
    }
    if (this.pad.steer || this.pad.moveY) {
      x = this.pad.steer;
      y = -(this.pad.moveY || 0);
    }
    return { x, y, sprint };
  }

  consumeLook() {
    const r = [this.lookDX, this.lookDY];
    this.lookDX = this.lookDY = 0;
    return r;
  }

  endFrame() {
    this.edges.clear();
  }
}
