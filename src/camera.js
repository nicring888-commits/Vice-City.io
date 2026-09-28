import * as THREE from 'three';
import { heightAt } from './world/layout.js';
import { clamp, damp, wrapAngle } from './core/rng.js';

const VIEWS = [
  { name: 'Nah', dist: 6.6, height: 2.1, look: 1.1 },
  { name: 'Weit', dist: 10.5, height: 3.4, look: 1.3 },
  { name: 'Motorhaube', hood: true },
];

// Verfolgerkamera: Auto (mitdrehend) oder zu Fuß (frei drehbar), mit Gebäudekollision
export class CameraRig {
  constructor(camera, collision) {
    this.camera = camera;
    this.collision = collision;
    this.yaw = 0;
    this.orbit = 0;
    this.pitch = 0.22;
    this.view = 0;
    this.shake = 0;
    this.fov = 62;
    this.pos = new THREE.Vector3(0, 5, -10);
    this.target = new THREE.Vector3();
    this.initialized = false;
  }

  nextView() {
    this.view = (this.view + 1) % VIEWS.length;
    return VIEWS[this.view].name;
  }

  addShake(s) {
    this.shake = Math.min(1.2, this.shake + s);
  }

  update(dt, { vehicle, walker, look, lookIdle }) {
    const cam = this.camera;
    const [dx, dy] = look;
    let desiredPos;
    let lookAt;
    let fov = 62;

    if (vehicle) {
      const v = vehicle;
      const view = VIEWS[this.view];
      const speed = v.speed;
      const vF = v.forwardSpeed;
      // Beim Rückwärtsfahren nicht herumschwenken
      const baseYaw = v.heading;
      if (!this.initialized) this.yaw = baseYaw;
      this.orbit += dx * 0.006;
      if (lookIdle > 1.4) this.orbit = damp(this.orbit, 0, 3, dt);
      this.orbit = wrapAngle(this.orbit);
      this.pitch = clamp(this.pitch + dy * 0.003, -0.05, 0.9);
      if (lookIdle > 1.4) this.pitch = damp(this.pitch, 0.18, 2, dt);
      this.yaw += wrapAngle(baseYaw - this.yaw) * (1 - Math.exp(-(speed > 3 ? 5 : 3) * dt));
      const yaw = this.yaw + this.orbit;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      if (view.hood) {
        const f = v.forward;
        desiredPos = new THREE.Vector3(v.x + f.x * 0.3, v.y + 1.12, v.z + f.z * 0.3);
        lookAt = new THREE.Vector3(v.x + f.x * 30, v.y + 0.9, v.z + f.z * 30);
        this.pos.copy(desiredPos);
        this.target.copy(lookAt);
      } else {
        const dist = view.dist + clamp(speed * 0.035, 0, 3);
        const h = view.height + this.pitch * dist * 0.6;
        desiredPos = new THREE.Vector3(v.x - fx * dist, v.y + h, v.z - fz * dist);
        lookAt = new THREE.Vector3(v.x + Math.sin(v.heading) * 3, v.y + view.look, v.z + Math.cos(v.heading) * 3);
        if (!this.initialized) this.pos.copy(desiredPos);
        this.pos.x = damp(this.pos.x, desiredPos.x, 14, dt);
        this.pos.z = damp(this.pos.z, desiredPos.z, 14, dt);
        this.pos.y = damp(this.pos.y, desiredPos.y, 6, dt);
        this.target.lerp(lookAt, this.initialized ? 1 - Math.exp(-18 * dt) : 1);
      }
      fov = 60 + clamp(speed * 0.2, 0, 16) + (v.nitroActive ? 9 : 0);
      void vF;
    } else if (walker) {
      const w = walker;
      this.yaw += dx * 0.006;
      this.pitch = clamp(this.pitch + dy * 0.004, -0.25, 1.1);
      // Kamera richtet sich beim Laufen langsam hinter der Figur aus
      const moving = Math.hypot(w.vx, w.vz) > 1;
      if (moving && lookIdle > 1.5) this.yaw += wrapAngle(w.heading - this.yaw) * (1 - Math.exp(-1.2 * dt));
      if (!this.initialized) this.yaw = w.heading;
      const dist = 4.6;
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const cp = Math.cos(this.pitch);
      const sp = Math.sin(this.pitch);
      lookAt = new THREE.Vector3(w.x, w.y + 1.55, w.z);
      desiredPos = new THREE.Vector3(w.x - fx * dist * cp, w.y + 1.7 + dist * sp, w.z - fz * dist * cp);
      if (!this.initialized) {
        this.pos.copy(desiredPos);
        this.target.copy(lookAt);
      }
      this.pos.lerp(desiredPos, 1 - Math.exp(-12 * dt));
      this.target.lerp(lookAt, 1 - Math.exp(-14 * dt));
      fov = 60;
    }

    // Kollision: Kamera vor Gebäude ziehen
    if (!(vehicle && VIEWS[this.view].hood)) {
      const t = this.collision.raycast(this.target.x, this.target.y, this.target.z, this.pos.x, this.pos.y, this.pos.z);
      if (t < 1) this.pos.lerpVectors(this.target, this.pos, Math.max(0.15, t * 0.92));
      const gy = heightAt(this.pos.x, this.pos.z);
      if (this.pos.y < gy + 0.5) this.pos.y = gy + 0.5;
    }
    this.initialized = true;

    this.fov = damp(this.fov, fov, 4, dt);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
    cam.position.copy(this.pos);
    if (this.shake > 0.001) {
      const s = this.shake * 0.25;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      this.shake = damp(this.shake, 0, 5, dt);
    }
    cam.lookAt(this.target);
  }

  // Blickrichtung (für Bewegung zu Fuß relativ zur Kamera)
  get forwardYaw() {
    return Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
  }
}
