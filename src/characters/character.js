import * as THREE from 'three';
import { shirtTexture } from '../world/textures.js';
import { heightAt } from '../world/layout.js';
import { clamp, damp, wrapAngle } from '../core/rng.js';

const skinMats = new Map();
function mat(key, make) {
  if (!skinMats.has(key)) skinMats.set(key, make());
  return skinMats.get(key);
}

function limb(r, len, material, y0 = 0) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  g.translate(0, -(len / 2 + r) + y0, 0);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  return m;
}

// Figur aus Grundkörpern: Hawaiihemd, helle Hose, Sonnenbrille
export function createCharacter(o = {}) {
  const shirt = o.shirt || '#2e7fd6';
  const flower = o.flower || '#f4f1e8';
  const skinC = o.skin || '#c58c64';
  const pantsC = o.pants || '#ece6da';
  const hairC = o.hair || '#2a1a10';
  const shirtMat = mat('shirt' + shirt + flower, () => new THREE.MeshStandardMaterial({ map: shirtTexture(shirt, flower), roughness: 0.8 }));
  const skin = mat('skin' + skinC, () => new THREE.MeshStandardMaterial({ color: skinC, roughness: 0.65 }));
  const pants = mat('pants' + pantsC, () => new THREE.MeshStandardMaterial({ color: pantsC, roughness: 0.85 }));
  const hair = mat('hair' + hairC, () => new THREE.MeshStandardMaterial({ color: hairC, roughness: 0.9 }));
  const shoe = mat('shoe', () => new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.6 }));
  const glasses = mat('glasses', () => new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.1, metalness: 0.6 }));

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.36, 4, 12), shirtMat);
  torso.scale.set(1, 1, 0.68);
  torso.position.y = 1.24;
  torso.castShadow = true;
  body.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8), skin);
  neck.position.y = 1.52;
  body.add(neck);
  const head = new THREE.Group();
  head.position.y = 1.66;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), skin);
  skull.scale.set(0.92, 1.05, 1);
  skull.castShadow = true;
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairM.position.set(0, 0.02, -0.01);
  const shades = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.03), glasses);
  shades.position.set(0, 0.02, 0.11);
  head.add(skull, hairM, shades);
  body.add(head);

  const mkArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.25, 1.44, 0);
    const sleeve = limb(0.075, 0.12, shirtMat);
    const arm = limb(0.052, 0.46, skin, -0.04);
    pivot.add(sleeve, arm);
    body.add(pivot);
    return pivot;
  };
  const mkLeg = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.1, 0.96, 0);
    const leg = limb(0.08, 0.72, pants);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.24), shoe);
    foot.position.set(0, -0.93, 0.05);
    foot.castShadow = true;
    pivot.add(leg, foot);
    body.add(pivot);
    return pivot;
  };
  const armL = mkArm(1);
  const armR = mkArm(-1);
  const legL = mkLeg(1);
  const legR = mkLeg(-1);
  armL.rotation.z = 0.08;
  armR.rotation.z = -0.08;

  return {
    root,
    body,
    animate(phase, amount, run = 0) {
      const a = Math.sin(phase);
      legL.rotation.x = a * 0.75 * amount;
      legR.rotation.x = -a * 0.75 * amount;
      armL.rotation.x = -a * (0.6 + run * 0.5) * amount;
      armR.rotation.x = a * (0.6 + run * 0.5) * amount;
      body.position.y = Math.abs(Math.cos(phase)) * 0.05 * amount;
      body.rotation.x = run * 0.12 * amount;
    },
  };
}

const tmp = [];

// Figur zu Fuß: Bewegung relativ zur Kamera, Kollision, Umgeworfen-Zustand
export class Walker {
  constructor(opts) {
    this.char = createCharacter(opts);
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.heading = 0;
    this.phase = 0;
    this.knock = 0;
    this.radius = 0.35;
  }

  place(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = this.vz = this.vy = 0;
    this.y = heightAt(x, z);
    this.knock = 0;
    this.sync(0, 0);
  }

  // mx/mz: gewünschte Bewegungsrichtung in Welt-Koordinaten (Länge = Anteil der Geschwindigkeit)
  move(dt, mx, mz, sprint, world, vehicles) {
    if (this.knock > 0) {
      this.knock -= dt;
      this.vx *= Math.exp(-2 * dt);
      this.vz *= Math.exp(-2 * dt);
    } else {
      const len = Math.min(1, Math.hypot(mx, mz));
      const speed = sprint ? 6.5 : 2.6;
      const tx = len > 0.05 ? (mx / Math.hypot(mx, mz)) * len * speed : 0;
      const tz = len > 0.05 ? (mz / Math.hypot(mx, mz)) * len * speed : 0;
      this.vx = damp(this.vx, tx, 10, dt);
      this.vz = damp(this.vz, tz, 10, dt);
      if (len > 0.05) {
        const target = Math.atan2(mx, mz);
        this.heading += wrapAngle(target - this.heading) * Math.min(1, dt * 12);
      }
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    const g = heightAt(this.x, this.z);
    if (this.y > g + 0.02 || this.vy > 0) {
      this.vy -= 20 * dt;
      this.y = Math.max(g, this.y + this.vy * dt);
      if (this.y === g) this.vy = 0;
    } else this.y = g;

    // Welt-Kollision
    world.circleContacts(this.x, this.z, this.radius, this.y, tmp);
    for (const c of tmp) {
      this.x += c.nx * c.pen;
      this.z += c.nz * c.pen;
      const vn = this.vx * c.nx + this.vz * c.nz;
      if (vn < 0) {
        this.vx -= vn * c.nx;
        this.vz -= vn * c.nz;
      }
    }
    // Autos: wegschieben; bei Tempo umwerfen
    let hitBy = null;
    for (const v of vehicles) {
      const dx = this.x - v.x;
      const dz = this.z - v.z;
      if (dx * dx + dz * dz > 16) continue;
      const f = v.forward;
      for (const s of [1, -1]) {
        const cx = v.x + f.x * v.offset * s;
        const cz = v.z + f.z * v.offset * s;
        const ex = this.x - cx;
        const ez = this.z - cz;
        const r = v.radius + this.radius;
        const d2 = ex * ex + ez * ez;
        if (d2 >= r * r || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        this.x += (ex / d) * (r - d);
        this.z += (ez / d) * (r - d);
        const rel = Math.hypot(v.vx - this.vx, v.vz - this.vz);
        if (rel > 6 && this.knock <= 0) {
          this.knock = 1.6;
          this.vx = v.vx * 0.7 + (ex / d) * 3;
          this.vz = v.vz * 0.7 + (ez / d) * 3;
          this.vy = 4 + rel * 0.08;
          this.y += 0.05;
          hitBy = v;
        }
      }
    }
    this.sync(dt, Math.hypot(this.vx, this.vz));
    return hitBy;
  }

  sync(dt, speed) {
    const c = this.char;
    c.root.position.set(this.x, this.y, this.z);
    c.root.rotation.y = this.heading;
    if (this.knock > 0) {
      c.animate(0, 0);
      this.fall = damp(this.fall || 0, -Math.PI / 2, 8, dt);
      c.body.rotation.x = this.fall;
      c.body.position.y = 0.22;
      return;
    }
    this.fall = 0;
    this.phase += dt * (speed > 4 ? 11 : 7.5) * Math.min(1, speed / 1.5);
    c.animate(this.phase, clamp(speed / 2.5, 0, 1), speed > 4 ? 1 : 0);
  }
}
