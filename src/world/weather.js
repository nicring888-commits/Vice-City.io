import * as THREE from 'three';
import { clamp, damp } from '../core/rng.js';
import { WORLD } from '../vehicles/vehicle.js';

// Tropisches Wetter: Sonne, Regenschauer und nachts Gewitter.
// rain (0..1) steuert Tropfen, Himmel und Geräusch; wet (0..1) die nasse Straße und den Grip.
// Modi: 'auto' (wechselt von selbst), 'clear', 'rain', 'storm'.
const BOX = 70; // Kantenlänge des Regenwürfels um die Kamera
const HEIGHT = 34;

export class Weather {
  constructor(scene, quality) {
    this.scene = scene;
    this.mode = 'auto';
    this.state = 'clear';
    this.rain = 0;
    this.wet = 0;
    this.storm = 0;
    this.timer = 90 + Math.random() * 120; // erster Schauer nach 1,5–3,5 Minuten
    this.lightning = 0;
    this.flashT = 0;
    this.nextBolt = 6;
    this.onThunder = null;
    this.buildRain(quality);
    // Blitz: kurzer, kräftiger Lichtimpuls
    this.flashLight = new THREE.AmbientLight(0xdfe6ff, 0);
    scene.add(this.flashLight);
  }

  buildRain(quality) {
    const n = quality.name === 'Hoch' ? 6000 : quality.name === 'Mittel' ? 3500 : 1400;
    const pos = new Float32Array(n * 2 * 3);
    const end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * BOX;
      const y = Math.random() * HEIGHT;
      const z = Math.random() * BOX;
      pos.set([x, y, z, x, y, z], i * 6);
      end[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.uniforms = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uRain: { value: 0 },
      uWind: { value: new THREE.Vector2(0.18, 0.06) },
      uColor: { value: new THREE.Color(0xbfd0e0) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aEnd;
        uniform float uTime;
        uniform vec3 uCam;
        uniform float uRain;
        uniform vec2 uWind;
        varying float vA;
        void main() {
          vec3 p = position;
          // Fallen und um die Kamera kacheln (Tropfen bleiben in Weltkoordinaten)
          p.y = mod(p.y - uTime * 26.0, ${HEIGHT.toFixed(1)});
          p.xz = mod(p.xz + uWind * uTime * 26.0 - uCam.xz, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)} + uCam.xz;
          p.y += uCam.y - 8.0;
          // Streifen: unteres Ende etwas versetzt
          p -= aEnd * vec3(uWind.x, 1.0, uWind.y) * 0.75;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = length(mv.xyz);
          vA = uRain * (1.0 - smoothstep(18.0, 36.0, d)) * (0.55 - aEnd * 0.35);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vA;
        void main() { gl_FragColor = vec4(uColor, vA); }`,
    });
    this.drops = new THREE.LineSegments(g, mat);
    this.drops.frustumCulled = false;
    this.drops.renderOrder = 8;
    this.drops.visible = false;
    this.scene.add(this.drops);
  }

  setMode(mode) {
    this.mode = mode;
    if (mode !== 'auto') this.state = mode;
    else this.timer = 60;
  }

  get label() {
    return this.storm > 0.5 && this.rain > 0.3 ? 'Gewitter' : this.rain > 0.3 ? 'Regen' : 'Sonnig';
  }

  update(dt, camera, night) {
    // Automatischer Wechsel: lange Sonne, kurze Schauer, nachts öfter Gewitter
    if (this.mode === 'auto') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.state === 'clear') {
          this.state = Math.random() < 0.25 + night * 0.35 ? 'storm' : 'rain';
          this.timer = 60 + Math.random() * 90;
        } else {
          this.state = 'clear';
          this.timer = 150 + Math.random() * 200;
        }
      }
    }
    const targetRain = this.state === 'clear' ? 0 : this.state === 'storm' ? 1 : 0.7;
    this.rain = damp(this.rain, targetRain, 0.18, dt);
    this.storm = damp(this.storm, this.state === 'storm' ? 1 : 0, 0.2, dt);
    // Straße wird schnell nass und trocknet langsam
    const wetTarget = clamp(this.rain * 1.4, 0, 1);
    this.wet = damp(this.wet, wetTarget, wetTarget > this.wet ? 0.12 : 0.025, dt);
    WORLD.wet = this.wet;

    const u = this.uniforms;
    u.uTime.value += dt;
    u.uRain.value = clamp(this.rain * 1.3, 0, 1);
    u.uCam.value.copy(camera.position);
    u.uColor.value.setScalar(0.75 - night * 0.35);
    this.drops.visible = this.rain > 0.02;

    // Blitze bei Gewitter
    this.flashT -= dt;
    if (this.storm > 0.6 && this.rain > 0.5) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 7 + Math.random() * 14;
        this.flashT = 0.35;
        this.onThunder?.(0.4 + Math.random() * 2.2);
      }
    }
    // Doppelblitz: zwei kurze Spitzen
    const f = this.flashT > 0 ? (this.flashT > 0.25 || (this.flashT > 0.08 && this.flashT < 0.16) ? 1 : 0.15) : 0;
    this.lightning = f;
    this.flashLight.intensity = f * (0.7 + night * 1.3);
  }
}
