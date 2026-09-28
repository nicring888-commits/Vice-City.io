import * as THREE from 'three';
import { heightAt } from '../world/layout.js';

// Leuchtende Bodenmarkierung mit Lichtsäule (Rennstart, Checkpoint, Werkstatt)
let beamTex = null;
function beamTexture() {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  beamTex = new THREE.CanvasTexture(c);
  return beamTex;
}

const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(0.82, 48).rotateX(-Math.PI / 2);
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0);

export class Marker {
  constructor(scene, { x, z, radius = 6, color = '#ffd23f', height = 30 }) {
    this.x = x;
    this.z = z;
    this.radius = radius;
    this.group = new THREE.Group();
    const c = new THREE.Color(color);
    const hdr = c.clone().multiplyScalar(2.5);
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true };
    this.ringMat = new THREE.MeshBasicMaterial({ color: hdr, ...add, side: THREE.DoubleSide, toneMapped: false });
    this.discMat = new THREE.MeshBasicMaterial({ color: c, opacity: 0.18, ...add });
    this.beamMat = new THREE.MeshBasicMaterial({ color: c, map: beamTexture(), opacity: 0.55, ...add, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, this.ringMat);
    const disc = new THREE.Mesh(discGeo, this.discMat);
    const beam = new THREE.Mesh(beamGeo, this.beamMat);
    ring.scale.setScalar(radius);
    disc.scale.setScalar(radius);
    beam.scale.set(radius * 0.92, height, radius * 0.92);
    ring.renderOrder = disc.renderOrder = beam.renderOrder = 5;
    this.ring = ring;
    this.group.add(disc, ring, beam);
    this.group.position.set(x, heightAt(x, z) + 0.08, z);
    scene.add(this.group);
    this.t = Math.random() * 6;
  }

  set visible(v) {
    this.group.visible = v;
  }
  get visible() {
    return this.group.visible;
  }

  moveTo(x, z) {
    this.x = x;
    this.z = z;
    this.group.position.set(x, heightAt(x, z) + 0.08, z);
  }

  contains(px, pz, extra = 0) {
    return (px - this.x) ** 2 + (pz - this.z) ** 2 < (this.radius + extra) ** 2;
  }

  update(dt) {
    this.t += dt;
    const s = 1 + Math.sin(this.t * 3) * 0.05;
    this.ring.scale.setScalar(this.radius * s);
    // Lichtsäule ausblenden, wenn die Kamera nah dran oder drin ist
    const cam = Marker.camera;
    if (cam) {
      const d = Math.hypot(cam.position.x - this.x, cam.position.z - this.z) - this.radius;
      this.beamMat.opacity = 0.55 * Math.min(1, Math.max(0, (d - 4) / 40));
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    this.ringMat.dispose();
    this.discMat.dispose();
    this.beamMat.dispose();
  }
}
