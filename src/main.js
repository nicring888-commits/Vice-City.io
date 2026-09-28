import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PRESETS, detectQuality, saveQuality, FpsWatcher, IS_TOUCH } from './core/quality.js';
import { Input } from './core/input.js';
import { AudioSystem } from './core/audio.js';
import { CollisionWorld } from './world/collision.js';
import { buildCity } from './world/city.js';
import { Environment } from './world/sky.js';
import { setMaxAnisotropy } from './world/textures.js';
import { Vehicle, collideVehicles } from './vehicles/vehicle.js';
import { SPORT_MODELS, modelById, setCarNight, setPaintQuality, setCarEnv, updateSirens } from './vehicles/models.js';
import { TrafficManager } from './vehicles/traffic.js';
import { Walker } from './characters/character.js';
import { CameraRig } from './camera.js';
import { Hud } from './ui/hud.js';
import { TouchControls } from './ui/touch.js';
import { ISLAND } from './world/layout.js';
import { Particles } from './world/particles.js';
import { SaveGame } from './game/save.js';
import { EventManager, EVENTS, formatValue, MEDAL_NAMES } from './game/events.js';
import { PoliceSystem } from './game/police.js';
import { GarageManager } from './game/garage.js';
import { Marker } from './game/markers.js';
import { Radio } from './core/radio.js';

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const SHIRTS = ['#d6336c', '#2e7fd6', '#2fb380', '#f08c00', '#7048e8', '#e03131', '#1098ad'];

class Game {
  constructor() {
    this.qualityKey = detectQuality();
    this.quality = { ...PRESETS[this.qualityKey] };
    if (IS_TOUCH) document.body.classList.add('touch');

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false }));
    r.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality.pixelRatio));
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    $('app').appendChild(r.domElement);
    setMaxAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy()));
    setPaintQuality(this.qualityKey !== 'low');

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 5000);
    this.collision = new CollisionWorld(32);
    this.input = new Input(r.domElement);
    this.audio = new AudioSystem();
    this.fps = new FpsWatcher();
    this.uniforms = { uTime: { value: 0 } };
    this.vehicles = [];
    this.npcs = [];
    this.playerCar = null;
    this.exitPending = false;
    this.lightTime = 0;
    this.started = false;
    this.paused = false;
    this.attractAngle = 0;
    this.sinkTimer = 0;
    this.save = new SaveGame();
    this.waypoint = null;
    addEventListener('resize', () => this.resize());
  }

  async init() {
    const progress = (p, t) => {
      $('loadBar').style.width = `${Math.round(p * 100)}%`;
      $('loadText').textContent = t;
    };
    progress(0.08, 'Himmel über Vice City …');
    await nextFrame();
    this.env = new Environment(this.renderer, this.scene, this.quality);
    progress(0.2, 'Straßen, Hochhäuser und Art-déco-Hotels …');
    await nextFrame();
    this.city = buildCity({ scene: this.scene, collision: this.collision, quality: this.quality, uniforms: this.uniforms });
    progress(0.6, 'Sportwagen werden poliert …');
    await nextFrame();

    // Reflexionen für Glas, Wasser und Lack
    const onEnv = (tex, night) => {
      // Mittags ist der Himmel sehr hell → schwächer spiegeln, sonst wirkt der Lack ausgewaschen
      const el = this.env.elevation;
      const day = 0.35 + 0.5 * (1 - Math.min(1, Math.max(0, (el - 5) / 35)));
      const refl = day * (1 - night) + 1.2 * night;
      this.city.setEnv(tex, refl);
      setCarEnv(tex, refl);
    };
    this.env.listeners.push(onEnv);
    onEnv(this.env.envTarget.texture, this.env.night);

    this.headlight = new THREE.SpotLight(0xfff0d8, 0, 110, 0.52, 0.55, 1.1);
    this.scene.add(this.headlight, this.headlight.target);

    this.player = new Walker({ shirt: '#2e7fd6' });
    this.spawnInitial();
    this.rig = new CameraRig(this.camera, this.collision);
    this.hud = new Hud(this.city);
    if (IS_TOUCH) this.touch = new TouchControls(this.input, $('touch'));
    this.traffic = new TrafficManager(this);
    progress(0.75, 'Verkehr rollt an …');
    await nextFrame();
    this.traffic.fill(this.player);
    this.particles = new Particles(this.scene);
    this.particles.resize(this.renderer.getDrawingBufferSize(new THREE.Vector2()).y);
    this.police = new PoliceSystem(this);
    Marker.camera = this.camera;
    this.events = new EventManager(this);
    this.garages = new GarageManager(this);
    this.radio = new Radio(this.audio, (name) => this.hud.toast(name, 2));
    this.radio.station = this.save.data.radio ?? 0;
    this.setupComposer();
    progress(0.88, 'Shader werden vorbereitet …');
    await nextFrame();
    this.update(0.016, true);
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      /* ältere Browser: kein Problem, wird beim ersten Frame kompiliert */
    }
    progress(1, 'Bereit.');
    this.bindUi();
    $('btnStart').disabled = false;
    $('loading').style.visibility = 'hidden';
    this.last = performance.now() / 1000;
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  // ------------------------------------------------------------------ Welt befüllen
  spawnInitial() {
    const show = this.city.showroom;
    SPORT_MODELS.forEach((spec, i) => {
      const s = show[i % show.length];
      const v = new Vehicle(spec, spec.colors[0]);
      v.place(s.x, s.z, s.heading);
      v.parkedSpot = true;
      this.addVehicle(v);
    });
    // Geparkte Autos auf Parkplätzen der Stadt
    const spots = [...this.city.parking];
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    const count = Math.min(spots.length, this.qualityKey === 'low' ? 18 : 34);
    for (let i = 0; i < count; i++) {
      const s = spots[i];
      const spec = Math.random() < 0.7 ? SPORT_MODELS[Math.floor(Math.random() * SPORT_MODELS.length)] : modelById('sedan');
      const v = new Vehicle(spec, spec.colors[Math.floor(Math.random() * spec.colors.length)]);
      v.place(s.x, s.z, s.heading);
      v.parkedSpot = true;
      this.addVehicle(v);
    }
    // Spieler steht auf dem Showroom-Platz vor der Autoreihe
    const s0 = show[2];
    this.player.place(s0.x + 7, s0.z - 1, -Math.PI / 2);
    this.scene.add(this.player.char.root);
  }

  addVehicle(v) {
    this.vehicles.push(v);
    this.scene.add(v.mesh.root);
  }

  removeVehicle(v) {
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
    this.scene.remove(v.mesh.root);
  }

  // ------------------------------------------------------------------ Rendering
  setupComposer() {
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      this.composer = null;
    }
    if (!this.quality.bloom) return;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: this.quality.msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(innerWidth, innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.5, 0.6, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  applyQuality(key) {
    this.qualityKey = key;
    Object.assign(this.quality, PRESETS[key]);
    saveQuality(key);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality.pixelRatio));
    this.env.configureShadows(this.quality);
    this.traffic.target = this.quality.traffic;
    this.setupComposer();
    for (const id of ['qualitySelect', 'qualitySelect2']) $(id).value = key;
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer?.setSize(innerWidth, innerHeight);
    this.hud?.resize();
    this.particles?.resize(this.renderer.getDrawingBufferSize(new THREE.Vector2()).y);
    this.checkOrientation();
  }

  checkOrientation() {
    const portrait = IS_TOUCH && innerHeight > innerWidth && this.started;
    $('rotate').classList.toggle('hidden', !portrait || this.rotateDismissed);
  }

  // ------------------------------------------------------------------ UI
  bindUi() {
    for (const id of ['qualitySelect', 'qualitySelect2']) {
      $(id).value = this.qualityKey;
      $(id).addEventListener('change', (e) => this.applyQuality(e.target.value));
    }
    $('btnStart').addEventListener('click', () => this.start());
    $('btnResume').addEventListener('click', () => this.setPaused(false));
    $('btnPause').addEventListener('click', () => this.setPaused(!this.paused));
    $('btnMute').addEventListener('click', () => this.toggleMute());
    $('rotate').addEventListener('click', () => {
      this.rotateDismissed = true;
      this.checkOrientation();
    });
    $('btnCancelEvent').addEventListener('click', () => {
      this.events.cancel();
      this.setPaused(false);
    });
    for (const b of $('timeButtons').querySelectorAll('button')) {
      b.addEventListener('click', () => {
        this.env.hours = parseFloat(b.dataset.h);
        this.env.envTimer = 0;
        this.env.lastEnvHours = -99;
      });
    }
  }

  start() {
    this.audio.init();
    this.radio.init();
    this.started = true;
    $('menu').classList.add('fade');
    setTimeout(() => $('menu').classList.add('hidden'), 900);
    $('hud').classList.add('on');
    document.body.classList.add('playing');
    this.rig.initialized = false;
    this.hud.toast('Willkommen in Vice City', 3);
    if (IS_TOUCH) {
      const el = document.documentElement;
      el.requestFullscreen?.().catch(() => {});
      screen.orientation?.lock?.('landscape').catch(() => {});
    }
    this.checkOrientation();
  }

  setPaused(p) {
    if (!this.started) return;
    this.paused = p;
    $('pause').classList.toggle('hidden', !p);
    $('fpsInfo').textContent = `${Math.round(this.fps.fps)} FPS · Grafik: ${this.quality.name}`;
    if (p) {
      this.audio.update({ inCar: false });
      this.audio.siren(0);
      this.buildEventList();
    }
    this.radio.setActive(!p && !!this.playerCar);
  }

  // Liste der Events im Pausenmenü (mit Bestleistung und Route)
  buildEventList() {
    const list = $('eventList');
    list.innerHTML = '';
    for (const ev of EVENTS) {
      const best = this.save.best(ev.id);
      const row = document.createElement('div');
      row.className = 'ev-row';
      const medal = best?.medal || 0;
      row.innerHTML = `<span class="ev-n">${ev.name}</span><span class="ev-b ${medal ? 'm' + medal : ''}">${
        best ? `${formatValue(ev, best.value)} · ${MEDAL_NAMES[medal]}` : '–'
      }</span>`;
      const btn = document.createElement('button');
      btn.textContent = 'Route';
      btn.addEventListener('click', () => {
        this.waypoint = { x: ev.start.x, z: ev.start.z, label: ev.name };
        this.setPaused(false);
      });
      row.appendChild(btn);
      list.appendChild(row);
    }
    $('btnCancelEvent').hidden = !this.events.active;
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    $('btnMute').classList.toggle('off', this.audio.muted);
  }

  // ------------------------------------------------------------------ Hauptschleife
  frame(t) {
    const now = t / 1000;
    const dt = Math.min(0.05, Math.max(0.0001, now - this.last));
    this.last = now;
    this.fps.push(dt);
    this.input.pollGamepad();
    if (this.started) {
      if (this.input.pressed('pause')) this.setPaused(!this.paused);
      if (this.input.pressed('mute')) this.toggleMute();
    }
    if (!this.paused) this.update(dt, !this.started);
    this.render();
    if (this.started && !this.paused && this.fps.shouldDowngrade()) {
      const next = this.qualityKey === 'high' ? 'medium' : this.qualityKey === 'medium' ? 'low' : null;
      if (next) {
        this.applyQuality(next);
        this.hud.toast(`Grafik: ${this.quality.name}`, 2);
      }
    }
    this.input.endFrame();
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  get focus() {
    return this.playerCar || this.player;
  }

  update(dt, attract = false) {
    const input = this.input;
    this.lightTime += dt;
    this.uniforms.uTime.value += dt;
    const inCar = !!this.playerCar;

    // Globale Tasten
    if (!attract) {
      this.env.timeScale = input.held('time') ? 40 : 1;
      if (input.pressed('camera')) this.hud.toast(`Kamera: ${this.rig.nextView()}`, 1.2);
      if (input.pressed('interact')) {
        if (inCar) this.exitPending = true;
        else this.tryEnter();
      }
      if (input.pressed('reset') && this.playerCar && !this.events.active) this.resetCar(this.playerCar);
      if (input.pressed('radio') && this.playerCar) {
        this.radio.next();
        this.save.set('radio', this.radio.station);
        if (this.radio.station < 0) this.hud.toast('Radio aus', 1.5);
      }
    }

    // Eingaben für das Spielerauto
    let carInput = null;
    const car = this.playerCar;
    if (car) {
      carInput = attract ? null : input.vehicle();
      if (this.exitPending) {
        carInput = { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false };
        if (Math.abs(car.forwardSpeed) < 1.5) this.exitCar();
      } else if (this.events.locked) carInput = { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false };
    }

    // Simulation (Unterschritte für stabile Physik)
    const focus = this.focus;
    const sim = [];
    const cam = this.camera.position;
    const lod2 = this.quality.lodDist ** 2;
    for (const v of this.vehicles) {
      const d2 = (v.x - focus.x) ** 2 + (v.z - focus.z) ** 2;
      v.simulated = v === this.playerCar || d2 < 270 * 270 || (v.driver === 'police' && d2 < 600 * 600);
      v.mesh.root.visible = d2 < 480 * 480;
      v.mesh.setFar(v !== this.playerCar && (v.x - cam.x) ** 2 + (v.z - cam.z) ** 2 > lod2);
      if (v.simulated) sim.push(v);
      v.frameImpact = 0;
    }
    const ctx = {
      time: this.lightTime,
      vehicles: sim,
      pedestrian: this.playerCar ? null : this.player,
      honk: (v) => this.audio.honk(Math.hypot(v.x - focus.x, v.z - focus.z)),
    };
    const steps = Math.ceil(dt / (1 / 60));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const v of sim) {
        let inp = null;
        if (v === this.playerCar) inp = carInput;
        else if (v.ai && v.driver) inp = v.ai.update(h, ctx);
        else if (v.speed < 0.05 && Math.abs(v.angVel) < 0.01 && !v.airborne) continue;
        v.update(h, inp);
      }
      for (const v of sim) v.collideWorld(this.collision);
      for (let i = 0; i < sim.length; i++) {
        for (let j = i + 1; j < sim.length; j++) {
          const hit = collideVehicles(sim[i], sim[j]);
          // Spieler rammt Streifenwagen
          if (hit > 4 && this.playerCar && (sim[i] === this.playerCar || sim[j] === this.playerCar)) {
            const other = sim[i] === this.playerCar ? sim[j] : sim[i];
            if (other.spec.police && other.driver && this.playerCar.speed > 8 && this.playerCar.throttle > 0) this.police.onCopHit(hit);
          }
        }
      }
      for (const v of sim) v.frameImpact = Math.max(v.frameImpact, v.impact);
    }
    for (const v of sim) {
      v.syncMesh(dt);
      const imp = v.frameImpact;
      if (imp > 2.5) {
        if (v === this.playerCar) {
          this.audio.crash(imp);
          this.rig.addShake(Math.min(1, imp / 14));
        } else {
          this.audio.crash(imp, Math.hypot(v.x - focus.x, v.z - focus.z));
          if (v.ai && imp > 3) v.ai.stunned = 1 + Math.random() * 1.5;
        }
      }
      v.mesh.beam.visible = !!v.driver && this.env.night > 0.1;
      this.emitSmoke(v, dt);
    }

    // Spielerauto: Nitro auffüllen (Driften lädt schneller), Wasser
    if (this.playerCar) {
      const c = this.playerCar;
      if (!c.nitroActive) c.nitro = Math.min(1, c.nitro + dt * (c.slip > 5 && c.speed > 10 ? 0.14 : 0.025));
      if (c.dead && !this.deadShown) {
        this.deadShown = true;
        this.hud.bigMessage('Totalschaden', 2.5, 'fail');
      }
      if (c.sinking) {
        this.sinkTimer += dt;
        if (this.sinkTimer > 2) {
          this.resetCar(c);
          this.hud.toast('Abgeschleppt!', 2);
        }
      } else this.sinkTimer = 0;
    }

    // Spieler zu Fuß
    let canInteract = false;
    if (!this.playerCar) {
      const f = attract ? { x: 0, y: 0, sprint: false } : input.foot();
      const yaw = this.rig.initialized ? this.rig.forwardYaw : this.player.heading;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const rx = -Math.cos(yaw);
      const rz = Math.sin(yaw);
      const hitBy = this.player.move(dt, fx * f.y + rx * f.x, fz * f.y + rz * f.x, f.sprint, this.collision, sim);
      if (hitBy) {
        this.audio.crash(6);
        this.rig.addShake(0.4);
      }
      const near = this.nearestEnterable();
      canInteract = !!near;
      if (!attract) {
        this.introTimer = (this.introTimer ?? 9) - dt;
        if (near) {
          const verb = near.driver ? 'Klauen' : 'Einsteigen';
          this.hud.setHint(IS_TOUCH ? `<b>EIN</b> ${verb} · ${near.spec.name}` : `<kbd>F</kbd> ${verb} · ${near.spec.name}`);
        } else if (this.introTimer > 0 && this.introTimer < 6.5) {
          this.hud.setHint(IS_TOUCH ? 'Lauf zu einem Sportwagen und tippe <b>EIN</b>' : 'Lauf mit <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> zu einem Sportwagen');
        } else this.hud.setHint(null);
      }
    } else if (!attract) {
      const c = this.playerCar;
      this.hud.setHint(c.sinking ? 'Auto versinkt …' : c.dead ? (IS_TOUCH ? 'Totalschaden – <b>AUS</b> und ein anderes Auto nehmen' : 'Totalschaden – <kbd>F</kbd> aussteigen und ein anderes Auto nehmen') : null);
    }
    this.updateNpcs(dt, sim);

    // Events, Polizei, Werkstätten, Effekte
    if (!attract) {
      this.events.update(dt);
      this.police.update(dt);
      this.garages.update(dt);
      if (this.waypoint && Math.hypot(this.waypoint.x - focus.x, this.waypoint.z - focus.z) < 25) this.waypoint = null;
    }
    updateSirens(this.lightTime);
    this.particles.update(dt);
    this.radio.setActive(!attract && !!this.playerCar);

    // Verkehr, Tageszeit, Licht
    this.traffic.update(dt, focus);
    const night = this.env.update(dt, focus, this.camera);
    this.city.setNight(night, this.lightTime);
    this.city.update(this.lightTime, dt);
    if ((this.cullTick = (this.cullTick || 0) + 1) % 10 === 0) this.city.cull(this.camera.position, this.scene.fog.far + 60);
    setCarNight(night);
    if (this.bloom) {
      // Tagsüber nur echte Lichtquellen (Sonne, Glanzlichter) überstrahlen, nachts Neon und Fenster
      this.bloom.strength = 0.28 + night * 0.6;
      this.bloom.threshold = 0.85 + 11 * (1 - night) ** 2;
      this.bloom.radius = 0.45 + night * 0.25;
    }
    const hl = this.headlight;
    if (this.playerCar && night > 0.05) {
      const c = this.playerCar;
      const f = c.forward;
      hl.position.set(c.x + f.x * c.spec.L * 0.5, c.y + 0.75, c.z + f.z * c.spec.L * 0.5);
      hl.target.position.set(c.x + f.x * 30, c.y, c.z + f.z * 30);
      hl.intensity = night * 55;
    } else hl.intensity = 0;

    // Kamera
    if (attract) this.attractCamera(dt);
    else {
      const [lx, ly] = input.consumeLook();
      this.rig.update(dt, {
        vehicle: this.playerCar,
        walker: this.playerCar ? null : this.player,
        look: [lx, ly],
        lookIdle: performance.now() / 1000 - input.lastLook,
      });
    }

    // HUD, Touch, Audio
    if (!attract) {
      const f = this.focus;
      this.hud.update(dt, {
        clock: this.env.clock,
        night,
        x: f.x,
        z: f.z,
        heading: f.heading,
        yaw: this.rig.forwardYaw,
        speed: this.playerCar ? this.playerCar.speed : 0,
        vehicle: this.playerCar,
        vehicles: sim,
        money: this.save.money,
        wanted: this.police.level,
        searching: this.police.searching,
        target: this.events.target || this.waypoint,
        blips: [
          ...this.events.blips(),
          ...this.garages.blips(),
          ...(this.waypoint ? [{ ...this.waypoint, kind: 'waypoint' }] : []),
          ...sim.filter((v) => v.driver === 'police').map((v) => ({ x: v.x, z: v.z, kind: 'police' })),
        ],
      });
      this.touch?.setMode(!!this.playerCar, canInteract, !!this.events.near);
      const c = this.playerCar;
      const sea = Math.max(0, 1 - Math.abs(f.x - (ISLAND.x1 + 10)) / 180);
      this.audio.update({
        inCar: !!c,
        rpm: c ? c.rpm : 0,
        throttle: c ? c.throttle : 0,
        slip: c && c.grounded ? c.slip : 0,
        speed: c ? c.speed : 0,
        nitro: c ? c.nitroActive : false,
        horn: input.held('horn'),
        sea,
      });
    }
  }

  attractCamera(dt) {
    // Langsame Kamerafahrt um den Showroom-Platz, während das Menü offen ist
    this.attractAngle += dt * 0.08;
    const c = { x: 604, z: -107 };
    const a = this.attractAngle;
    this.camera.position.set(c.x + Math.cos(a) * 34, 9 + Math.sin(a * 0.7) * 3, c.z + Math.sin(a) * 34);
    this.camera.lookAt(c.x - 4, 2, c.z);
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ Ein-/Aussteigen
  nearestEnterable() {
    const p = this.player;
    let best = null;
    let bd = 4.4;
    for (const v of this.vehicles) {
      if (v.driver === 'player' || v.sinking || !v.simulated) continue;
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < bd && v.speed < 8) {
        best = v;
        bd = d;
      }
    }
    return best;
  }

  tryEnter() {
    const v = this.nearestEnterable();
    if (!v) return;
    if (v.driver === 'ai' || v.driver === 'police') {
      // Fahrer rauswerfen – er flüchtet zu Fuß
      const r = v.right;
      const off = v.spec.W / 2 + 0.6;
      const npc = new Walker({ shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)], flower: '#fff4d6', pants: '#3b4a6b', hair: '#1b1b1b' });
      npc.place(v.x - r.x * off, v.z - r.z * off, v.heading + Math.PI / 2);
      this.scene.add(npc.char.root);
      this.npcs.push({ w: npc, t: 0 });
      v.ai = null;
      this.hud.toast('Carjacking!', 1.6);
      this.police.onCarjack(v, v.x, v.z);
      v.mesh.setSiren(false);
    }
    this.deadShown = v.dead;
    v.driver = 'player';
    v.parkedSpot = false;
    this.playerCar = v;
    this.exitPending = false;
    this.scene.remove(this.player.char.root);
    if (v.mesh.driver) v.mesh.driver.visible = true;
    this.audio.door();
    this.hud.toast(v.spec.name, 2.2);
    this.hud.setHint(null);
  }

  exitCar() {
    const v = this.playerCar;
    if (!v) return;
    const r = v.right;
    const f = v.forward;
    const off = v.spec.W / 2 + 0.75;
    const cands = [
      [v.x - r.x * off, v.z - r.z * off],
      [v.x + r.x * off, v.z + r.z * off],
      [v.x + f.x * (v.spec.L / 2 + 1), v.z + f.z * (v.spec.L / 2 + 1)],
      [v.x - f.x * (v.spec.L / 2 + 1), v.z - f.z * (v.spec.L / 2 + 1)],
    ];
    const tmp = [];
    let pos = cands[0];
    for (const c of cands) {
      if (!this.collision.circleContacts(c[0], c[1], 0.45, 0, tmp).length) {
        pos = c;
        break;
      }
    }
    this.player.place(pos[0], pos[1], v.heading);
    this.scene.add(this.player.char.root);
    v.driver = null;
    v.braking = false;
    if (v.mesh.driver) v.mesh.driver.visible = false;
    this.playerCar = null;
    this.exitPending = false;
    this.audio.door();
  }

  // Auto auf die nächste Fahrspur setzen (bei Wasser oder wenn man feststeckt)
  resetCar(v) {
    let best = null;
    let bd = Infinity;
    for (const e of this.city.graph.edges) {
      const ln = e.lanes[0];
      const px = v.x - ln.sx;
      const pz = v.z - ln.sz;
      const t = Math.max(0.05, Math.min(0.95, (px * e.dir.x + pz * e.dir.z) / ln.len));
      const x = ln.sx + e.dir.x * ln.len * t;
      const z = ln.sz + e.dir.z * ln.len * t;
      const d = (x - v.x) ** 2 + (z - v.z) ** 2;
      if (d < bd) {
        bd = d;
        best = { x, z, h: Math.atan2(e.dir.x, e.dir.z) };
      }
    }
    if (best) v.place(best.x, best.z, best.h, 0);
    this.sinkTimer = 0;
    this.rig.initialized = false;
  }

  // Reifenqualm beim Driften, Motorrauch bei schweren Schäden
  emitSmoke(v, dt) {
    if (v.mesh.isFar || !v.mesh.root.visible) return;
    const f = v.forward;
    const r = v.right;
    const P = this.particles;
    if (v.grounded && v.slip > 4.5 && v.speed > 6 && Math.random() < dt * 30) {
      for (const side of [-1, 1]) {
        const x = v.x - f.x * v.spec.L * 0.32 + r.x * side * v.spec.W * 0.42;
        const z = v.z - f.z * v.spec.L * 0.32 + r.z * side * v.spec.W * 0.42;
        P.emit(x, v.y + 0.3, z, (Math.random() - 0.5) * 2, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 2, {
          life: 1.8,
          size: 1.1,
          grow: 4,
          alpha: 0.32,
          color: 0xeeeeee,
        });
      }
    }
    if (v.damage > 0.55 && Math.random() < dt * (v.damage > 0.85 ? 16 : 7)) {
      const heavy = v.damage > 0.85;
      const x = v.x + f.x * v.spec.L * 0.33;
      const z = v.z + f.z * v.spec.L * 0.33;
      P.emit(x, v.y + 1, z, (Math.random() - 0.5) * 0.6, 1.8 + Math.random(), (Math.random() - 0.5) * 0.6, {
        life: 2.4,
        size: 0.8,
        grow: heavy ? 4 : 2.5,
        alpha: heavy ? 0.55 : 0.35,
        color: heavy ? 0x1e1e1e : 0x9a9a9a,
      });
    }
  }

  updateNpcs(dt, sim) {
    const p = this.focus;
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      n.t += dt;
      const dx = n.w.x - p.x;
      const dz = n.w.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const run = n.t < 7;
      const hitBy = n.w.move(dt, run ? dx / d : 0, run ? dz / d : 0, true, this.collision, sim);
      if (hitBy && hitBy === this.playerCar && !n.hit) {
        n.hit = true;
        this.police.onPedestrianHit();
      }
      if (n.t > 14 || d > 150) {
        this.scene.remove(n.w.char.root);
        this.npcs.splice(i, 1);
      }
    }
  }
}

const game = new Game();
window.__game = game;
game.init().catch((e) => {
  console.error(e);
  $('loadText').textContent = 'Fehler beim Laden: ' + e.message;
});
