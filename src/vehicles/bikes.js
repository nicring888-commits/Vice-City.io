import * as THREE from 'three';

// Motorräder: Daten und Bauplan. Aufgebaut wird in models.js (createBikeMesh), die Helfer
// (Parts, strut, polyShape, extrudeShape) kommen als H herein, damit es keine Import-Schleife gibt.
// Koordinaten wie bei den Autos: Profil-x = Längsachse nach vorn, y = Höhe; box(x seitlich, y, z vorn).

function sphere(r, sx, sy, sz, x, y, z) {
  const g = new THREE.SphereGeometry(r, 16, 10);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

export const BIKE_MODELS = [
  {
    id: 'shinobi',
    name: 'Shinobi 750',
    cat: 'bike',
    bike: true,
    L: 2.1,
    W: 0.8,
    H: 1.15,
    wr: 0.31,
    wrF: 0.31,
    tireW: [0.2, 0.15], // hinten, vorn
    axles: [-0.72, 0.7],
    maxSpeed: 82,
    accel: 17,
    grip: 10,
    mass: 280,
    enginePitch: 2.1,
    colors: ['#e8112d', '#35c4ff', '#f4f4f4', '#101010', '#2bb04a'],
    rider: { seat: [0.9, -0.3], bars: [1.0, 0.45], lean: 0.35 },
    head: [0, 0.82, 1.03],
    tail: [0, 0.95, -1.03],
    build(p, s, H) {
      // Vollverkleidung als Seitenprofil
      const fairing = H.polyShape([
        [1.0, 0.5],
        [1.03, 0.78],
        [0.8, 1.02],
        [0.52, 1.08],
        [0.25, 0.88],
        [-0.25, 0.86],
        [-0.7, 0.98],
        [-1.03, 0.97],
        [-0.92, 0.8],
        [-0.45, 0.72],
        [-0.2, 0.42],
        [0.45, 0.36],
      ]);
      p.add('paint', H.extrudeShape(fairing, 0.46, 0.05, 2));
      p.box('glass', 0, 1.1, 0.64, 0.32, 0.24, 0.02, -0.55);
      p.box('black', 0, 0.93, -0.36, 0.3, 0.07, 0.52);
      p.box('black', 0, 0.5, 0.05, 0.34, 0.28, 0.5);
      p.cyl('chrome', 0.17, 0.62, -0.62, 0.06, 0.42, 'z', 12);
      H.strut(p, 'chrome', 0.09, [0.7, 0.31], [0.52, 1.0], 0.045, 0.045);
      H.strut(p, 'chrome', -0.09, [0.7, 0.31], [0.52, 1.0], 0.045, 0.045);
      p.box('black', 0, 1.0, 0.46, 0.64, 0.035, 0.035);
      H.strut(p, 'black', 0.12, [-0.72, 0.31], [-0.1, 0.45], 0.06, 0.04);
      H.strut(p, 'black', -0.12, [-0.72, 0.31], [-0.1, 0.45], 0.06, 0.04);
      p.box('plate', 0, 0.72, -1.02, 0.16, 0.11, 0.02);
    },
  },
  {
    id: 'hogg',
    name: 'Hogg Cruiser',
    cat: 'bike',
    bike: true,
    L: 2.5,
    W: 0.9,
    H: 1.3,
    wr: 0.34,
    wrF: 0.37,
    tireW: [0.22, 0.12],
    axles: [-0.9, 1.05],
    maxSpeed: 66,
    accel: 12.5,
    grip: 9,
    mass: 340,
    enginePitch: 0.8,
    colors: ['#101010', '#8b1a1a', '#1e3a8a', '#e8e2d0', '#c9a227'],
    rider: { seat: [0.8, -0.28], bars: [1.3, 0.5], lean: -0.05 },
    head: [0, 1.0, 0.76],
    tail: [0, 0.74, -1.23],
    build(p, s, H) {
      // Tropfentank, fetter Heckkotflügel, V2-Motor, lange Gabel, Ape-Hanger-Lenker
      p.add('paint', sphere(0.2, 1, 0.7, 1.7, 0, 0.98, 0.32));
      p.box('paint', 0, 0.68, -0.92, 0.26, 0.06, 0.62, 0.35);
      p.box('paint', 0, 0.44, -1.22, 0.24, 0.26, 0.05);
      p.box('black', 0, 0.8, -0.28, 0.34, 0.08, 0.5);
      p.box('chrome', 0, 0.52, 0.16, 0.3, 0.26, 0.4);
      p.cyl('chrome', 0.06, 0.78, 0.26, 0.08, 0.3, 'y', 12);
      p.cyl('chrome', -0.06, 0.78, 0.04, 0.08, 0.3, 'y', 12);
      p.cyl('chrome', 0.2, 0.4, -0.45, 0.045, 1.05, 'z', 10);
      p.cyl('chrome', 0.2, 0.5, -0.45, 0.045, 1.0, 'z', 10);
      H.strut(p, 'chrome', 0.1, [1.05, 0.37], [0.62, 1.18], 0.05, 0.05);
      H.strut(p, 'chrome', -0.1, [1.05, 0.37], [0.62, 1.18], 0.05, 0.05);
      H.strut(p, 'black', 0, [0.6, 1.08], [-0.9, 0.5], 0.06, 0.06);
      H.strut(p, 'black', 0, [0.55, 0.9], [0.05, 0.36], 0.06, 0.06);
      H.strut(p, 'chrome', 0.24, [0.62, 1.15], [0.55, 1.32], 0.03, 0.03);
      H.strut(p, 'chrome', -0.24, [0.62, 1.15], [0.55, 1.32], 0.03, 0.03);
      p.box('chrome', 0, 1.33, 0.52, 0.72, 0.03, 0.03);
      p.add('head', sphere(0.1, 1, 1, 0.6, 0, 1.0, 0.76));
    },
  },
  {
    id: 'zippy',
    name: 'Zippy Roller',
    cat: 'bike',
    bike: true,
    L: 1.8,
    W: 0.72,
    H: 1.1,
    wr: 0.22,
    wrF: 0.22,
    tireW: [0.12, 0.12],
    axles: [-0.55, 0.62],
    maxSpeed: 38,
    accel: 9,
    grip: 9,
    mass: 150,
    enginePitch: 2.6,
    noWheelie: true,
    colors: ['#7fe0d6', '#ff9ec4', '#ffe27a', '#f4f4f4', '#b99cff'],
    rider: { seat: [0.84, -0.3], bars: [1.08, 0.5], lean: 0.05 },
    head: [0, 0.94, 0.73],
    tail: [0, 0.72, -0.91],
    build(p, s, H) {
      // Beinschild, Trittbrett, rundes Heck
      p.add('paint', H.extrudeShape(H.polyShape([[0.7, 0.24], [0.78, 0.6], [0.62, 1.05], [0.5, 1.05], [0.48, 0.3]]), 0.44, 0.05, 2));
      p.box('black', 0, 0.28, 0.12, 0.36, 0.06, 0.62);
      p.add('paint', H.extrudeShape(H.polyShape([[-0.05, 0.28], [0.02, 0.6], [-0.3, 0.8], [-0.72, 0.78], [-0.92, 0.6], [-0.82, 0.28]]), 0.44, 0.08, 3));
      p.box('black', 0, 0.84, -0.36, 0.3, 0.08, 0.6);
      H.strut(p, 'chrome', 0, [0.62, 0.22], [0.54, 1.06], 0.05, 0.05);
      p.box('chrome', 0, 1.08, 0.52, 0.56, 0.035, 0.035);
      p.box('glass', 0, 1.18, 0.6, 0.3, 0.2, 0.02, -0.3);
    },
  },
];

// Fahrer auf dem Motorrad (sitzend): Glieder als Kapseln zwischen zwei Punkten
function segment(r, a, b, mat) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 4, 8);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  return m;
}

let riderMats = null;
export function createRider(spec, helmetMat, skinMat) {
  if (!riderMats) {
    riderMats = {
      jacket: new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.55 }),
      jeans: new THREE.MeshStandardMaterial({ color: 0x2f3f66, roughness: 0.85 }),
      visor: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.05, metalness: 0.6 }),
    };
  }
  const M = riderMats;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const [sy, sz] = spec.rider.seat;
  const [by, bz] = spec.rider.bars;
  const g = new THREE.Group();
  const hip = V(0, sy + 0.12, sz);
  const sh = V(0, sy + 0.66, sz + 0.18 + spec.rider.lean * 0.6);
  g.add(segment(0.17, hip, sh, M.jacket));
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), helmetMat);
  helmet.position.set(0, sh.y + 0.24, sh.z + 0.05);
  helmet.castShadow = true;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.152, 12, 8, -0.9, 1.8, 1.0, 0.7), M.visor);
  visor.position.copy(helmet.position);
  g.add(helmet, visor);
  g.userData.helmet = helmet;
  for (const side of [-1, 1]) {
    const shoulder = V(side * 0.17, sh.y - 0.04, sh.z);
    const hand = V(side * 0.27, by + 0.02, bz);
    const elbow = V(side * 0.24, (shoulder.y + hand.y) / 2 - 0.06, (shoulder.z + hand.z) / 2);
    g.add(segment(0.055, shoulder, elbow, M.jacket), segment(0.05, elbow, hand, M.jacket));
    const h = V(side * 0.11, hip.y, hip.z);
    const knee = V(side * 0.19, sy + 0.08, sz + 0.42);
    const foot = V(side * 0.18, 0.32, sz + 0.3);
    g.add(segment(0.075, h, knee, M.jeans), segment(0.06, knee, foot, M.jeans));
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skinMat);
    glove.position.copy(hand);
    g.add(glove);
  }
  return g;
}
