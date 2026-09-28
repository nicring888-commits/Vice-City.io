import { Marker } from './markers.js';

// Werkstätten: reparieren, neu lackieren und (unbeobachtet) die Fahndung löschen
export const GARAGES = [
  { name: 'Vice Beach Werkstatt', x: 476.5, z: -300 },
  { name: 'Havana Werkstatt', x: -203.5, z: 300 },
];
const COST = 150;

export class GarageManager {
  constructor(game) {
    this.game = game;
    this.items = GARAGES.map((g) => ({ ...g, m: new Marker(game.scene, { x: g.x, z: g.z, radius: 4.5, color: '#35f2ff', height: 18 }) }));
    this.cooldown = null;
  }

  blips() {
    return this.items.map((g) => ({ x: g.x, z: g.z, kind: 'garage' }));
  }

  update(dt) {
    const g = this.game;
    const car = g.playerCar;
    for (const it of this.items) it.m.update(dt);
    if (!car) return;
    const inside = this.items.find((it) => it.m.contains(car.x, car.z));
    if (!inside) {
      this.cooldown = null;
      return;
    }
    if (this.cooldown === inside || car.speed > 5 || g.events.active) return;
    this.cooldown = inside;
    const needsRepair = car.damage > 0.02 || car.dead;
    const wanted = g.police.level > 0;
    if (!needsRepair && !wanted) {
      g.hud.toast('Alles in Ordnung', 1.5);
      return;
    }
    if (g.save.money < COST) {
      g.hud.toast(`Nicht genug Geld ($${COST})`, 2);
      return;
    }
    g.save.addMoney(-COST);
    car.repair();
    const colors = car.spec.colors.filter((c) => c !== car.color);
    if (colors.length) car.setColor(colors[Math.floor(Math.random() * colors.length)]);
    g.hud.flash();
    g.audio.door();
    if (wanted && !g.police.copWitness(car.x, car.z, 45)) g.police.clear('Neue Farbe – Fahndung eingestellt');
    else if (wanted) g.hud.toast('Die Polizei hat dich gesehen!', 2);
    g.hud.toast(`Repariert · −$${COST}`, 2);
  }
}
