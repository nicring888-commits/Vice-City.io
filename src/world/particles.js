import * as THREE from 'three';

// Leichtgewichtiges Partikelsystem (ein Draw-Call) für Reifenqualm, Motorrauch und Funken.
export class Particles {
  constructor(scene, max = 700) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.cursor = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: {
        uScale: { value: 400 },
        ...THREE.UniformsLib.fog,
      },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying float vAlpha; varying vec3 vColor; uniform float uScale;
        #include <fog_pars_vertex>
        void main(){
          vAlpha = alpha; vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(0.1, -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        varying float vAlpha; varying vec3 vColor;
        #include <fog_pars_fragment>
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c) * 4.0;
          if (d > 1.0) discard;
          gl_FragColor = vec4(vColor, vAlpha * (1.0 - d) * (1.0 - d));
          #include <fog_fragment>
        }`,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
  }

  resize(heightPx) {
    this.material.uniforms.uScale.value = heightPx * 0.9;
  }

  // Einzelnes Partikel ausstoßen
  emit(x, y, z, vx, vy, vz, { life = 1.5, size = 1, grow = 2, alpha = 0.5, color = 0xdddddd } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    const c = typeof color === 'number' ? new THREE.Color(color) : color;
    this.col.set([c.r, c.g, c.b], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = size;
    this.grow[i] = grow;
    this.alpha0[i] = alpha;
  }

  update(dt) {
    const p = this.pos;
    const v = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
      v[i * 3] *= 1 - dt * 1.5;
      v[i * 3 + 2] *= 1 - dt * 1.5;
      this.size[i] = this.size0[i] + this.grow[i] * t;
      this.alpha[i] = this.alpha0[i] * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}
