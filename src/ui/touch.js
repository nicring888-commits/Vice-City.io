// Touch-Steuerung: virtueller Joystick links, Knöpfe rechts, Kamera durch Wischen.
export class TouchControls {
  constructor(input, root) {
    this.input = input;
    this.el = root;
    root.innerHTML = `
      <div class="joy" id="joy"><div class="joy-knob" id="joyKnob"></div></div>
      <div class="tbtns car-only">
        <button class="tbtn big gas" data-hold="throttle">GAS</button>
        <button class="tbtn brake" data-hold="brake">BREMSE</button>
        <button class="tbtn nitro" data-hold="nitro">NITRO</button>
        <button class="tbtn drift" data-hold="handbrake">DRIFT</button>
      </div>
      <div class="tbtns-top">
        <button class="tbtn small" data-tap="camera">CAM</button>
        <button class="tbtn small" data-tap="horn" data-hold="horn">HUPE</button>
        <button class="tbtn small car-only radio" data-tap="radio">RADIO</button>
      </div>
      <button class="tbtn start" data-tap="start">START</button>
      <button class="tbtn interact" data-tap="interact">EIN</button>`;
    this.joy = root.querySelector('#joy');
    this.knob = root.querySelector('#joyKnob');
    this.interactBtn = root.querySelector('.interact');
    this.joyId = null;
    this.lookId = null;
    this.origin = { x: 0, y: 0 };
    this.last = { x: 0, y: 0 };

    const opts = { passive: false };
    root.addEventListener('touchstart', (e) => this.onStart(e), opts);
    root.addEventListener('touchmove', (e) => this.onMove(e), opts);
    root.addEventListener('touchend', (e) => this.onEnd(e), opts);
    root.addEventListener('touchcancel', (e) => this.onEnd(e), opts);
  }

  setMode(inCar, canInteract, canStart = false) {
    this.el.classList.toggle('in-car', inCar);
    this.el.classList.toggle('can-start', canStart);
    this.interactBtn.textContent = inCar ? 'AUS' : 'EIN';
    this.interactBtn.classList.toggle('pulse', !inCar && canInteract);
  }

  onStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const btn = t.target.closest?.('[data-hold],[data-tap]');
      if (btn) {
        btn.classList.add('down');
        btn._touch = t.identifier;
        if (btn.dataset.hold) this.input.touch.buttons.add(btn.dataset.hold);
        if (btn.dataset.tap) this.input.trigger(btn.dataset.tap);
        continue;
      }
      if (t.clientX < innerWidth * 0.45 && this.joyId === null) {
        this.joyId = t.identifier;
        this.origin = { x: t.clientX, y: t.clientY };
        this.joy.style.left = `${t.clientX}px`;
        this.joy.style.top = `${t.clientY}px`;
        this.joy.classList.add('active');
        this.input.touch.active = true;
        this.input.touch.x = this.input.touch.y = 0;
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.last = { x: t.clientX, y: t.clientY };
      }
    }
  }

  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joyId) {
        const R = 55;
        let dx = t.clientX - this.origin.x;
        let dy = t.clientY - this.origin.y;
        const d = Math.hypot(dx, dy);
        if (d > R) {
          dx = (dx / d) * R;
          dy = (dy / d) * R;
        }
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.input.touch.x = dx / R;
        this.input.touch.y = dy / R;
      } else if (t.identifier === this.lookId) {
        this.input.look((t.clientX - this.last.x) * 1.6, (t.clientY - this.last.y) * 1.2);
        this.last = { x: t.clientX, y: t.clientY };
      }
    }
  }

  onEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.joyId) {
        this.joyId = null;
        this.knob.style.transform = '';
        this.joy.classList.remove('active');
        this.input.touch.active = false;
        this.input.touch.x = this.input.touch.y = 0;
      }
      if (t.identifier === this.lookId) this.lookId = null;
      for (const btn of this.el.querySelectorAll('.down')) {
        if (btn._touch === t.identifier) {
          btn.classList.remove('down');
          if (btn.dataset.hold) this.input.touch.buttons.delete(btn.dataset.hold);
        }
      }
    }
  }
}
