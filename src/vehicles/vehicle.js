import * as THREE from 'three';
import { createCarMesh, carMaterials, paint } from './models.js';
import { heightAt, WATER_LEVEL } from '../world/layout.js';
import { clamp, damp } from '../core/rng.js';

const GRAVITY = 16;
const GEAR_TOPS = [0.17, 0.3, 0.45, 0.61, 0.8, 1.0];
const contacts = [];

// Arcade-Fahrphysik: Fahrradmodell für die Lenkung, getrennte Längs-/Querhaftung,
// Driften per Handbremse, Nitro, Luftsprünge über Kuppen.
export class Vehicle {
  constructor(spec, color) {
    this.spec = spec;
    this.color = color;
    this.mesh = createCarMesh(spec, color);
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.vy = 0;
    this.heading = 0;
    this.vx = 0;
    this.vz = 0;
    this.angVel = 0;
    this.steer = 0;
    this.grounded = true;
    this.driver = null; // 'player' | 'ai' | null
    this.ai = null;
    this.nitro = 1;
    this.nitroActive = false;
    this.rpm = 900;
    this.gear = 1;
    this.slip = 0;
    this.throttle = 0;
    this.braking = false;
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.susp = 0;
    this.damage = 0;
    this.impact = 0; // stärkster Aufprall im letzten Schritt
    this.airTime = 0;
    this.airborne = false;
    this.sinking = 0;
    this.mass = spec.mass;
    this.inertia = (spec.mass * (spec.L * spec.L + spec.W * spec.W)) / 12;
    this.radius = spec.W / 2 + 0.02;
    this.offset = spec.L / 2 - this.radius;
    this.maxSteer = 0.58;
    this.active = true;
    // Motorrad: Schräglage, Wheelie, gestürzt (Seite -1/1)
    this.lean = 0;
    this.wheelie = 0;
    this.fallen = 0;
  }

  setColor(color) {
    this.color = color;
    this.mesh.paintMesh.material = paint(color);
    this.mesh.setFarColor(color);
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }
  get forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }
  get right() {
    return { x: -Math.cos(this.heading), z: Math.sin(this.heading) };
  }
  get forwardSpeed() {
    return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
  }

  place(x, z, heading, speed = 0) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = Math.sin(heading) * speed;
    this.vz = Math.cos(heading) * speed;
    this.angVel = 0;
    this.y = heightAt(x, z);
    this.vy = 0;
    this.sinking = 0;
    this.airborne = false;
    this.grounded = true;
    this.fallen = 0;
    this.wheelie = 0;
    this.repair();
    this.syncMesh(0);
  }

  repair() {
    this.damage = 0;
    this.dead = false;
    this.mesh.resetDamage();
  }

  steerLimit(v) {
    return this.maxSteer * (1 - clamp(Math.abs(v) / 70, 0, 1) * 0.72);
  }

  update(dt, input) {
    const s = this.spec;
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    const fx = sin;
    const fz = cos;
    const rx = -cos;
    const rz = sin;
    let vF = this.vx * fx + this.vz * fz;
    let vR = this.vx * rx + this.vz * rz;

    const inp = input || { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    // Lenkung glätten (Tastatur), analog direkter
    const target = clamp(inp.steer, -1, 1);
    const rate = inp.analog ? 12 : target === 0 ? 7 : 4.5;
    this.steer = damp(this.steer, target, rate, dt);

    this.throttle = inp.throttle;
    this.braking = false;
    this.impact = 0;

    this.grounded = !this.airborne;

    let acc = 0;
    let maxV = s.maxSpeed;
    this.nitroActive = false;
    // Schaden kostet Leistung, Totalschaden legt den Motor lahm
    const power = this.dead ? 0 : 1 - this.damage * 0.45;
    if (this.grounded) {
      if (inp.nitro && this.nitro > 0 && inp.throttle > 0 && !this.dead) {
        this.nitroActive = true;
        this.nitro = Math.max(0, this.nitro - dt / 3.5);
        maxV *= 1.28;
        acc += s.accel * 0.9;
      }
      if (inp.throttle > 0 && !this.dead) {
        if (vF < -0.5) {
          acc += 20 * inp.throttle; // bremst aus dem Rückwärtsgang
          this.braking = true;
        } else {
          const r = clamp(vF / maxV, 0, 1);
          acc += s.accel * power * inp.throttle * (1 - r * r) * (vF < 12 ? 1.15 : 1);
        }
      }
      if (inp.brake > 0) {
        if (vF > 0.8) {
          acc -= 26 * inp.brake;
          this.braking = true;
        } else if (vF > -16) {
          acc -= s.accel * 0.55 * inp.brake; // rückwärts
        }
      }
      // Luftwiderstand + Rollreibung
      acc -= vF * Math.abs(vF) * 0.0011 + Math.sign(vF) * (inp.throttle > 0 ? 0.25 : 1.2);
      if (!this.driver) acc -= Math.sign(vF) * 6; // abgestellt: Handbremse
      if (inp.handbrake) acc -= Math.sign(vF) * 5;
      // Motorrad: Wheelie beim harten Anfahren oder mit Nitro (nur Optik)
      if (s.bike) {
        const want = !s.noWheelie && !this.dead && inp.throttle > 0.8 && ((this.nitroActive && vF < 45) || (vF > 1 && vF < 13 && acc > 8)) ? 0.36 : 0;
        this.wheelie = damp(this.wheelie, want, want ? 3 : 6, dt);
      }
      const newVF = vF + acc * dt;
      if (Math.sign(newVF) !== Math.sign(vF) && inp.throttle === 0 && inp.brake === 0) vF = 0;
      else vF = newVF;

      // Seitenhaftung: Handbremse und hohe Querkraft lassen das Heck ausbrechen
      let grip = s.grip;
      if (inp.handbrake) grip = 1.3;
      else if (Math.abs(vR) > 5) grip *= 0.55;
      if (!this.driver) grip = 14;
      vR *= Math.exp(-grip * dt);
      this.slip = Math.abs(vR);

      // Gieren
      const steerAngle = this.steer * this.steerLimit(vF);
      const wb = s.axles[1] - s.axles[0];
      let targetYaw = (-vF * Math.tan(steerAngle)) / wb;
      if (inp.handbrake && Math.abs(vF) > 5) targetYaw *= 1.55;
      this.angVel = damp(this.angVel, targetYaw, inp.handbrake ? 5 : 9, dt);

      this.vx = fx * vF + rx * vR;
      this.vz = fz * vF + rz * vR;
    } else {
      this.slip = 0;
      this.angVel *= Math.exp(-0.5 * dt);
    }

    this.heading += this.angVel * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // Vertikal: am Boden haften, über Kuppen (Brückenbogen) bei hohem Tempo abheben.
    // Land ist flach (Straße 0 m, Gehweg 0.15 m) – nur Brücken liefern echte Steigungen.
    const g2 = heightAt(this.x, this.z);
    if (!this.airborne) {
      const dy = g2 - this.y;
      const ramp = g2 > 0.2 || this.y > 0.2;
      const vyNew = ramp ? dy / Math.max(dt, 1e-4) : 0;
      if ((ramp && vyNew < this.vy - GRAVITY * dt * 1.05 && this.speed > 12) || dy < -1.5) {
        this.airborne = true;
        this.vy -= GRAVITY * dt;
        this.y += this.vy * dt;
      } else {
        this.y = g2;
        this.vy = vyNew;
      }
    } else {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      this.airTime += dt;
      if (this.y <= g2) {
        // Beim Aufsetzen die Hangneigung übernehmen, sonst hüpft das Auto am Gefälle erneut ab
        const ahead = heightAt(this.x + this.vx * dt, this.z + this.vz * dt);
        const slopeVy = g2 > 0.2 && ahead > -1 ? (ahead - g2) / Math.max(dt, 1e-4) : 0;
        const hit = slopeVy - this.vy;
        if (hit > 5) {
          this.impact = Math.max(this.impact, hit * 0.35);
          this.susp = Math.min(0.14, hit * 0.012);
        }
        this.y = g2;
        this.vy = slopeVy;
        this.airborne = false;
        this.airTime = 0;
      }
    }
    if (!this.sinking && this.y < WATER_LEVEL - 0.3) this.sinking = 0.001;
    if (this.sinking) {
      this.sinking += dt;
      this.vx *= Math.exp(-2 * dt);
      this.vz *= Math.exp(-2 * dt);
    }

    // Drehzahl/Gänge (für Sound und HUD)
    const v = Math.abs(vF);
    let g = 0;
    while (g < GEAR_TOPS.length - 1 && v > GEAR_TOPS[g] * s.maxSpeed) g++;
    this.gear = vF < -0.5 ? -1 : g + 1;
    const top = GEAR_TOPS[g] * s.maxSpeed;
    let rpm = 900 + 6400 * clamp(v / top, 0, 1.05);
    if (inp.handbrake && inp.throttle) rpm = 6800;
    if (!this.grounded && inp.throttle) rpm = 7200;
    this.rpm = damp(this.rpm, rpm, 10, dt);

    // Karosseriebewegung (Nicken/Wanken)
    this.bodyPitch = damp(this.bodyPitch, clamp(-acc * 0.0045, -0.05, 0.06), 6, dt);
    this.bodyRoll = damp(this.bodyRoll, clamp(this.angVel * vF * 0.0035, -0.07, 0.07), 6, dt);
    this.susp = damp(this.susp, 0, 8, dt);
  }

  // Kollision mit statischer Welt
  collideWorld(world) {
    const f = this.forward;
    for (const side of [1, -1]) {
      const ox = f.x * this.offset * side;
      const oz = f.z * this.offset * side;
      const cx = this.x + ox;
      const cz = this.z + oz;
      world.circleContacts(cx, cz, this.radius, this.y, contacts);
      for (const c of contacts) {
        this.x += c.nx * c.pen;
        this.z += c.nz * c.pen;
        this.applyImpulse(ox, oz, c.nx, c.nz, null, 0.2);
      }
    }
  }

  // Impuls an einem Kontaktpunkt (optional gegen ein zweites Fahrzeug)
  applyImpulse(ox, oz, nx, nz, other = null, e = 0.25, oox = 0, ooz = 0) {
    const pvx = this.vx + this.angVel * oz;
    const pvz = this.vz - this.angVel * ox;
    let rvx = pvx;
    let rvz = pvz;
    if (other) {
      rvx -= other.vx + other.angVel * ooz;
      rvz -= other.vz - other.angVel * oox;
    }
    const vn = rvx * nx + rvz * nz;
    if (vn >= 0) return 0;
    const rn = oz * nx - ox * nz;
    let denom = 1 / this.mass + (rn * rn) / this.inertia;
    let rn2 = 0;
    if (other) {
      rn2 = ooz * nx - oox * nz;
      denom += 1 / other.mass + (rn2 * rn2) / other.inertia;
    }
    const j = (-(1 + e) * vn) / denom;
    this.vx += (j * nx) / this.mass;
    this.vz += (j * nz) / this.mass;
    this.angVel += (rn * j) / this.inertia;
    // Reibung entlang der Wand
    const tx = -nz;
    const tz = nx;
    const vt = rvx * tx + rvz * tz;
    const jt = clamp(-vt / denom, -Math.abs(j) * 0.4, Math.abs(j) * 0.4);
    this.vx += (jt * tx) / this.mass;
    this.vz += (jt * tz) / this.mass;
    if (other) {
      other.vx -= (j * nx + jt * tx) / other.mass;
      other.vz -= (j * nz + jt * tz) / other.mass;
      other.angVel -= (rn2 * j) / other.inertia;
      other.impact = Math.max(other.impact, -vn);
    }
    this.impact = Math.max(this.impact, -vn);
    // Beulen: Kontaktpunkt liegt am Kreisrand gegenüber der Stoßrichtung
    this.hit(ox - nx * this.radius, oz - nz * this.radius, nx, nz, -vn);
    if (other) other.hit(oox + nx * other.radius, ooz + nz * other.radius, -nx, -nz, -vn);
    return -vn;
  }

  // Schaden an einem Punkt (relativ zum Mittelpunkt, Weltachsen); (nx, nz) zeigt ins Auto hinein
  hit(px, pz, nx, nz, strength) {
    if (strength < 5 || this.indestructible) return;
    const k = strength - 5;
    this.damage = Math.min(1, this.damage + k * 0.009);
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    // Welt → Autokoordinaten (lokal x = (cos h, -sin h), lokal z = (sin h, cos h))
    const lx = px * c - pz * s;
    const lz = px * s + pz * c;
    const dx = nx * c - nz * s;
    const dz = nx * s + nz * c;
    this.mesh.dent(lx, lz, dx, dz, Math.min(0.22, k * 0.014));
    if (this.damage > 0.45) this.mesh.setCracked(true);
    if (this.damage >= 1 && !this.dead) this.dead = true;
  }

  syncMesh(dt) {
    const m = this.mesh;
    m.root.position.set(this.x, this.y, this.z);
    m.root.rotation.set(0, this.heading, 0);
    // Neigung am Hang aus Höhenunterschied vorn/hinten
    const f = this.forward;
    const hl = this.spec.L * 0.4;
    const hf = heightAt(this.x + f.x * hl, this.z + f.z * hl);
    const hb = heightAt(this.x - f.x * hl, this.z - f.z * hl);
    let slope = !this.airborne && hf > -2 && hb > -2 ? Math.atan2(hf - hb, hl * 2) : this.vy * 0.012;
    slope = clamp(slope, -0.35, 0.35);
    this.slopeAngle = damp(this.slopeAngle ?? 0, slope, 10, dt || 1);
    m.root.rotation.x = -this.slopeAngle;
    if (this.spec.bike) {
      // In die Kurve legen; abgestellt auf dem Seitenständer, gestürzt auf der Seite
      const vF0 = this.forwardSpeed;
      let lean = -Math.atan(clamp((this.angVel * vF0) / 9.8, -0.7, 0.7));
      if (!this.driver && this.speed < 0.5) lean = 0.2;
      if (this.fallen) lean = this.fallen * 1.42;
      this.lean = damp(this.lean, lean, this.fallen ? 5 : 8, dt || 1);
      m.body.rotation.set(0, 0, this.lean);
      m.pitch.rotation.x = -this.wheelie;
      m.driver.visible = !!this.driver && !this.fallen;
    } else {
      m.body.rotation.set(this.bodyPitch, 0, this.bodyRoll);
      m.body.position.y = -this.susp;
    }
    if (this.sinking) m.root.position.y = this.y - Math.min(3, this.sinking * 1.2);
    // Räder
    const vF = this.forwardSpeed;
    const steerAngle = this.steer * this.steerLimit(vF);
    for (const w of m.wheels) {
      if (w.front) w.pivot.rotation.y = steerAngle;
      w.spin.rotation.x += (vF / this.spec.wr) * dt;
    }
    if (m.tailMesh) m.tailMesh.material = this.braking ? carMaterials().brake : carMaterials().tail;
  }
}

// Fahrzeug gegen Fahrzeug (je zwei Kreise)
export function collideVehicles(a, b) {
  const dx0 = a.x - b.x;
  const dz0 = a.z - b.z;
  if (dx0 * dx0 + dz0 * dz0 > 49) return 0;
  if (Math.abs(a.y - b.y) > 2.5) return 0;
  const fa = a.forward;
  const fb = b.forward;
  let hit = 0;
  for (const sa of [1, -1]) {
    for (const sb of [1, -1]) {
      const oax = fa.x * a.offset * sa;
      const oaz = fa.z * a.offset * sa;
      const obx = fb.x * b.offset * sb;
      const obz = fb.z * b.offset * sb;
      const dx = a.x + oax - (b.x + obx);
      const dz = a.z + oaz - (b.z + obz);
      const r = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const pen = r - d;
      const tot = a.mass + b.mass;
      a.x += nx * pen * (b.mass / tot);
      a.z += nz * pen * (b.mass / tot);
      b.x -= nx * pen * (a.mass / tot);
      b.z -= nz * pen * (a.mass / tot);
      hit = Math.max(hit, a.applyImpulse(oax, oaz, nx, nz, b, 0.3, obx, obz));
    }
  }
  return hit;
}

export const tmpVec = new THREE.Vector3();
