import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, smoothstep } from '../core/rng.js';

// Farbverläufe über die Sonnenhöhe (Grad)
function gradient(stops) {
  const cols = stops.map(([e, c, v]) => [e, new THREE.Color(c), v]);
  const outC = new THREE.Color();
  return (el) => {
    if (el >= cols[0][0]) return { c: outC.copy(cols[0][1]), v: cols[0][2] };
    for (let i = 1; i < cols.length; i++) {
      if (el >= cols[i][0]) {
        const t = (el - cols[i][0]) / (cols[i - 1][0] - cols[i][0]);
        return { c: outC.copy(cols[i][1]).lerp(cols[i - 1][1], t), v: cols[i][2] + (cols[i - 1][2] - cols[i][2]) * t };
      }
    }
    const l = cols[cols.length - 1];
    return { c: outC.copy(l[1]), v: l[2] };
  };
}

const FOG = gradient([
  [30, '#b3cbe0', 0],
  [10, '#dcc6ad', 0],
  [3, '#eea27c', 0],
  [-1, '#c9728a', 0],
  [-5, '#4a2f63', 0],
  [-10, '#161633', 0],
]);
const SUN = gradient([
  [35, '#fff4e6', 3.0],
  [12, '#ffdcb0', 3.0],
  [3, '#ff9d5c', 2.2],
  [-1, '#ff6a4a', 0.0],
]);
const HEMI_SKY = gradient([
  [30, '#cfe2f5', 0.55],
  [5, '#f2c1a8', 0.7],
  [-3, '#8b5a9a', 0.45],
  [-10, '#2a3462', 0.4],
]);

export class Environment {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    this.hours = 17.1; // Start in der "Golden Hour" kurz vor Sonnenuntergang
    this.dayLength = 12 * 60; // Sekunden pro Spieltag
    this.timeScale = 1;
    this.sunDir = new THREE.Vector3();
    this.night = 0;
    this.elevation = 0;

    this.sky = new Sky();
    this.sky.scale.setScalar(3000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 2.6;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.85;
    u.cloudCoverage.value = 0.32;
    u.cloudDensity.value = 0.45;
    u.cloudScale.value = 0.00022;
    u.cloudElevation.value = 0.55;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // Nachthimmel: Verlauf (Lichtverschmutzung am Horizont) + Sterne
    this.nightDome = new THREE.Mesh(
      new THREE.SphereGeometry(2600, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: { uNight: { value: 0 } },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vDir; uniform float uNight;
          void main(){
            float h = clamp(vDir.y, 0.0, 1.0);
            vec3 horizon = vec3(0.30, 0.13, 0.32);
            vec3 zenith = vec3(0.012, 0.016, 0.05);
            vec3 c = mix(horizon, zenith, pow(h, 0.45));
            gl_FragColor = vec4(c, uNight);
          }`,
      }),
    );
    this.nightDome.renderOrder = -9;
    this.nightDome.frustumCulled = false;
    scene.add(this.nightDome);

    const starCount = 1800;
    const sp = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const th = Math.random() * Math.PI * 2;
      const y = Math.random() * 0.95 + 0.05;
      const r = Math.sqrt(1 - y * y);
      sp.set([Math.cos(th) * r * 2400, y * 2400, Math.sin(th) * r * 2400], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }),
    );
    this.stars.renderOrder = -8;
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // Mond
    const moonTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 20, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,250,235,1)');
      gr.addColorStop(0.42, 'rgba(255,250,235,1)');
      gr.addColorStop(0.5, 'rgba(200,210,255,0.25)');
      gr.addColorStop(1, 'rgba(200,210,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, transparent: true, fog: false, depthWrite: false, opacity: 0 }));
    this.moon.scale.setScalar(160);
    this.moon.renderOrder = -7;
    scene.add(this.moon);

    // Licht
    this.key = new THREE.DirectionalLight(0xffffff, 3);
    this.key.castShadow = quality.shadows;
    this.configureShadows(quality);
    scene.add(this.key, this.key.target);
    this.hemi = new THREE.HemisphereLight(0xcfe2f5, 0x5d5044, 0.8);
    scene.add(this.hemi);

    scene.fog = new THREE.Fog(0xb3cbe0, 150, 1500);

    // Umgebungs-Map für Reflexionen (Autolack, Glas, Wasser)
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.material = this.sky.material;
    this.envSky.scale.setScalar(100);
    this.envScene.add(this.envSky);
    this.envGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(40, 40, 8, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x5a2a6a, side: THREE.BackSide, transparent: true, opacity: 0 }),
    );
    this.envGlow.position.y = 1;
    this.envScene.add(this.envGlow);
    // Dunkler "Boden" in der Umgebungs-Map, damit Lack und Glas unten nicht den Himmel spiegeln
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2a2a2e }));
    floor.position.y = -2;
    this.envFloor = floor;
    this.envScene.add(floor);
    this.envTarget = null;
    this.envTimer = 0;
    this.lastEnvHours = -99;
    this.listeners = [];
    this.update(0, new THREE.Vector3(), null, true);
  }

  configureShadows(q) {
    const s = this.key.shadow;
    s.mapSize.set(q.shadowSize, q.shadowSize);
    const e = q.shadowExtent;
    s.camera.left = -e;
    s.camera.right = e;
    s.camera.top = e;
    s.camera.bottom = -e;
    s.camera.near = 10;
    s.camera.far = 900;
    s.bias = -0.0004;
    s.normalBias = 0.04;
    s.camera.updateProjectionMatrix();
    if (s.map) {
      s.map.dispose();
      s.map = null;
    }
    this.key.castShadow = q.shadows;
  }

  get clock() {
    const h = Math.floor(this.hours) % 24;
    const m = Math.floor((this.hours % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  update(dt, focus, camera, force = false) {
    this.hours = (this.hours + (dt * this.timeScale * 24) / this.dayLength) % 24;
    const angle = ((this.hours - 6) / 12) * Math.PI;
    this.sunDir.set(Math.cos(angle), Math.sin(angle) * 0.9, 0.38).normalize();
    const el = THREE.MathUtils.radToDeg(Math.asin(this.sunDir.y));
    this.elevation = el;
    const night = smoothstep(3, -7, el);
    this.night = night;

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.time.value += dt;
    this.nightDome.material.uniforms.uNight.value = night * 0.97;
    this.stars.material.opacity = smoothstep(0.5, 1, night);

    // Mond gegenüber der Sonne
    const moonDir = new THREE.Vector3(-this.sunDir.x, Math.abs(this.sunDir.y) * 0.8 + 0.25, -this.sunDir.z * 0.5).normalize();
    this.moon.material.opacity = night;

    // Licht: Sonne am Tag, Mond in der Nacht
    const sun = SUN(el);
    const lightDir = el > -1 ? this.sunDir : moonDir;
    if (el > -1) {
      this.key.color.copy(sun.c);
      this.key.intensity = sun.v;
    } else {
      this.key.color.set('#9fb4ff');
      this.key.intensity = 0.55 * smoothstep(-1, -6, el);
    }
    const hemi = HEMI_SKY(el);
    this.hemi.color.copy(hemi.c);
    this.hemi.intensity = hemi.v;
    this.hemi.groundColor.set(night > 0.5 ? '#1a1620' : '#6a5a4a');

    const fog = FOG(el);
    this.scene.fog.color.copy(fog.c);
    const far = this.quality.fogFar * (1 - night * 0.25);
    this.scene.fog.near = far * 0.12;
    this.scene.fog.far = far;

    // Der physikalische Himmel ist mittags extrem hell – indirektes Licht entsprechend dämpfen
    const dayEnv = 0.55 - smoothstep(4, 40, el) * 0.4;
    this.scene.environmentIntensity = dayEnv * (1 - night) + 0.9 * night;
    this.renderer.toneMappingExposure = 0.6 + night * 0.3;

    // Schatten folgen dem Fokus (Spieler), auf Texel ausgerichtet gegen Flimmern
    const f = focus;
    const texel = (this.quality.shadowExtent * 2) / this.quality.shadowSize;
    const fx = Math.round(f.x / texel) * texel;
    const fz = Math.round(f.z / texel) * texel;
    this.key.target.position.set(fx, 0, fz);
    this.key.position.set(fx + lightDir.x * 400, lightDir.y * 400, fz + lightDir.z * 400);
    this.key.castShadow = this.quality.shadows && (el > 2 || el < -4);

    if (camera) {
      this.sky.position.copy(camera.position);
      this.nightDome.position.copy(camera.position);
      this.stars.position.copy(camera.position);
      this.moon.position.copy(camera.position).addScaledVector(moonDir, 2300);
    }

    // Umgebungs-Map regelmäßig neu erzeugen
    this.envTimer -= dt;
    if (force || (this.envTimer <= 0 && Math.abs(this.hours - this.lastEnvHours) > 0.08)) {
      this.envTimer = this.quality.envInterval;
      this.lastEnvHours = this.hours;
      this.envGlow.material.opacity = night * 0.9;
      u.showSunDisc.value = 0;
      const t = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000, { size: this.quality.envSize });
      u.showSunDisc.value = 1;
      this.scene.environment = t.texture;
      // Spiegelnde Materialien bekommen die Map direkt (mit eigener, höherer Intensität)
      for (const fn of this.listeners) fn(t.texture, night);
      if (this.envTarget) this.envTarget.dispose();
      this.envTarget = t;
    }
    return clamp(night, 0, 1);
  }
}
