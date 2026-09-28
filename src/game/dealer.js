import { Marker } from './markers.js';
import { Vehicle } from '../vehicles/vehicle.js';
import { DEALER_MODELS, modelById } from '../vehicles/models.js';

const $ = (id) => document.getElementById(id);

// Sunshine Autos: Lolas Händler am Showroom-Platz. Kaufen, eigene Autos abholen, umlackieren.
export const DEALER = { name: 'Sunshine Autos', x: 596, z: -143 };
const PICKUP = { x: 598, z: -100, h: -Math.PI / 2 };
// Preis und benötigter Ruf je Modell
export const PRICES = {
  spyder: [4000, 0],
  corsair: [6500, 0],
  monarch: [9000, 300],
  fuego: [14000, 600],
  stiletto: [20000, 1000],
  toro: [30000, 1400],
  phantom: [42000, 1900],
};

export class Dealer {
  constructor(game) {
    this.game = game;
    this.marker = new Marker(game.scene, { x: DEALER.x, z: DEALER.z, radius: 4.5, color: '#39ff88', height: 22 });
    this.el = $('shop');
    this.pick = {}; // gewählte Farbe je Modell (vor dem Kauf)
    this.inside = false;
    $('shopClose').addEventListener('click', () => this.close());
  }

  blips() {
    return [{ x: DEALER.x, z: DEALER.z, kind: 'dealer' }];
  }

  instance(id) {
    return this.game.vehicles.find((v) => v.owned && v.spec.id === id) || null;
  }

  // Eigenes Auto in die Welt setzen (vorhandenes Exemplar wird ersetzt, außer der Spieler sitzt drin)
  spawnOwn(id, at = PICKUP) {
    const g = this.game;
    const c = g.save.ownCar(id) || g.save.data.cars[0];
    if (!c) return null;
    const old = this.instance(c.id);
    if (old && old === g.playerCar) return old;
    if (old) g.removeVehicle(old);
    const v = new Vehicle(modelById(c.id), c.color);
    v.owned = true;
    v.place(at.x, at.z, at.h, 0);
    g.addVehicle(v);
    return v;
  }

  update(dt) {
    const g = this.game;
    this.marker.update(dt);
    this.marker.visible = !g.busy;
    const f = g.focus;
    const car = g.playerCar;
    if (g.busy || !this.marker.contains(f.x, f.z, 0.5) || (car && car.speed > 6)) {
      this.inside = false;
      return;
    }
    if (!this.inside) {
      this.inside = true;
      // Eigene Autos repariert Lola kostenlos
      if (car?.owned && (car.damage > 0.02 || car.dead)) {
        car.repair();
        g.hud.flash();
        g.hud.toast('Kostenlos repariert', 2);
      }
    }
    g.hud.offerPrompt({
      name: DEALER.name,
      desc: 'Lolas Autohandel: Sportwagen kaufen, eigene Autos abholen und umlackieren.',
      meta: `Eigene Autos: ${g.save.data.cars.length} · Ruf ${g.save.rep}`,
      go: document.body.classList.contains('touch') ? 'Tippe <b>START</b>' : '<kbd>Enter</kbd> Autohaus öffnen',
    });
    if (g.input.pressed('start')) this.open();
  }

  open() {
    this.render();
    this.el.classList.remove('hidden');
    this.game.setModal(this);
  }

  close() {
    this.el.classList.add('hidden');
    this.game.setModal(null);
  }

  modalUpdate(input) {
    if (input.pressed('pause')) this.close();
  }

  render() {
    const g = this.game;
    const save = g.save;
    $('shopMoney').textContent = `$ ${save.money.toLocaleString('de-DE')} · Ruf ${save.rep}`;
    const list = $('shopList');
    list.innerHTML = '';
    const bar = (label, v) => `<div class="st"><span>${label}</span><i style="--v:${Math.round(Math.min(1, v) * 100)}%"></i></div>`;
    for (const spec of DEALER_MODELS) {
      const own = save.ownCar(spec.id);
      const [price, req] = PRICES[spec.id];
      const color = own ? own.color : this.pick[spec.id] || spec.colors[0];
      const card = document.createElement('div');
      card.className = 'shop-car' + (own ? ' owned' : '') + (spec.exclusive ? ' excl' : '');
      card.innerHTML = `
        <div class="sc-top"><b>${spec.name}</b>${spec.exclusive ? '<span class="tag">Exklusiv</span>' : ''}${own ? '<span class="tag own">Deins</span>' : ''}</div>
        ${bar('Tempo', (spec.maxSpeed - 40) / 55)}${bar('Beschl.', (spec.accel - 7) / 9.5)}${bar('Grip', (spec.grip - 7) / 3.8)}
        <div class="sc-cols"></div>
        <div class="sc-act"></div>`;
      const cols = card.querySelector('.sc-cols');
      for (const c of spec.colors) {
        const b = document.createElement('button');
        b.className = 'sw' + (c === color ? ' on' : '');
        b.style.background = c;
        b.setAttribute('aria-label', 'Farbe');
        b.addEventListener('click', () => this.setColor(spec.id, c));
        cols.appendChild(b);
      }
      const act = card.querySelector('.sc-act');
      const btn = document.createElement('button');
      btn.className = 'small-btn';
      if (own) {
        const driving = g.playerCar?.owned && g.playerCar.spec.id === spec.id;
        btn.textContent = driving ? 'Du fährst ihn' : 'Fahren';
        btn.disabled = driving;
        btn.addEventListener('click', () => this.drive(spec.id));
      } else if (save.rep < req) {
        btn.textContent = `Ab ${req} Ruf`;
        btn.disabled = true;
      } else {
        btn.textContent = `Kaufen · $${price.toLocaleString('de-DE')}`;
        btn.disabled = save.money < price;
        btn.addEventListener('click', () => this.buy(spec.id));
      }
      act.appendChild(btn);
      list.appendChild(card);
    }
  }

  setColor(id, color) {
    const g = this.game;
    const own = g.save.ownCar(id);
    if (!own) {
      this.pick[id] = color;
      return this.render();
    }
    own.color = color;
    g.save.persist();
    this.instance(id)?.setColor(color);
    this.render();
  }

  buy(id) {
    const g = this.game;
    const [price, req] = PRICES[id];
    if (g.save.ownCar(id) || g.save.money < price || g.save.rep < req) return;
    g.save.addMoney(-price);
    g.save.data.cars.push({ id, color: this.pick[id] || modelById(id).colors[0] });
    g.save.persist();
    g.audio.blip(1320, 0.3, 0.12);
    this.render();
  }

  // Eigenes Auto vorfahren lassen und einsteigen. Ein anderes eigenes Auto kommt zurück in die Garage.
  drive(id) {
    const g = this.game;
    this.close();
    const cur = g.playerCar;
    if (cur?.owned && cur.spec.id === id) return;
    if (cur) {
      g.exitCar();
      if (cur.owned) g.removeVehicle(cur);
    }
    const v = this.spawnOwn(id);
    if (!v) return;
    g.enterCar(v);
    g.save.set('car', id);
    g.rig.initialized = false;
  }
}
