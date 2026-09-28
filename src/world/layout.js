// Stadtplan von Vice City: Festland (Downtown) im Westen, die Bucht in der Mitte,
// Vice Beach (Art-déco-Insel mit Ocean Drive) im Osten, dahinter der Atlantik.
// Alle Maße in Metern, +x = Osten, +z = Süden.

export const CURB = 0.15;
export const WATER_LEVEL = -1.1;
export const WATER_FLOOR = -6;

export const MAINLAND = { x0: -720, x1: 150, z0: -700, z1: 700 };
export const ISLAND = { x0: 330, x1: 705, z0: -700, z1: 700 };
// Hafen von Vice: Landfläche südlich von Downtown (Container, Kräne, Lagerhallen)
export const PORT = { x0: -500, x1: 150, z0: 700, z1: 1080 };
export const PORT_X = [-350, -50, 100]; // Straßen, die vom Festland in den Hafen führen
export const PORT_ROWS = [800, 1000];
// Rampen (Höhe steigt in Richtung dir an, am hohen Ende fällt sie senkrecht ab)
export const RAMPS = [
  { x0: -300, x1: -286, z0: 872, z1: 884, dir: 'x', h: 3.5, name: 'Container-Rampe' },
  { x0: 20, x1: 36, z0: 1030, z1: 1042, dir: 'x', h: 2.4, name: 'Kai-Rampe' },
];
export const BEACH_X0 = 640; // Sandstrand beginnt hier (bis ISLAND.x1)

export const ROAD_TYPES = {
  std: { width: 12, lanes: [3], limit: 13, name: 'std' },
  blvd: { width: 14, lanes: [3.5], limit: 15, name: 'blvd' },
  hwy: { width: 20, lanes: [2.6, 6.2], limit: 24, name: 'hwy' },
};

const T = ROAD_TYPES;
export const ROWS_Z = [-600, -400, -200, 0, 200, 400, 600];

// Nord-Süd-Straßen
export const V_ROADS = [
  { x: -650, type: T.hwy, name: 'Vice Highway' },
  { x: -500, type: T.std, name: 'Palm Avenue' },
  { x: -350, type: T.std, name: 'Flamingo Street' },
  { x: -200, type: T.std, name: 'Starfish Avenue' },
  { x: -50, type: T.std, name: 'Downtown Avenue' },
  { x: 100, type: T.blvd, name: 'Bayshore Boulevard' },
  { x: 360, type: T.std, name: 'Bay Road' },
  { x: 470, type: T.std, name: 'Collins Avenue' },
  { x: 580, type: T.blvd, name: 'Ocean Drive' },
];
export const MAIN_X = [-650, -500, -350, -200, -50, 100];
export const ISLAND_X = [360, 470, 580];

// Ost-West-Straßen (je Zeile ein Abschnitt auf dem Festland und einer auf der Insel)
export const H_ROADS = [];
for (const z of ROWS_Z) {
  H_ROADS.push({ z, x0: -650, x1: 100, type: T.std });
  H_ROADS.push({ z, x0: 360, x1: 580, type: T.std });
}

// Brücken über die Bucht (Bogenprofil)
export const BRIDGES = [
  { z: 0, x0: 100, x1: 360, a0: 112, a1: 348, height: 13, type: T.blvd, name: 'Vice Causeway' },
  { z: -400, x0: 100, x1: 360, a0: 112, a1: 348, height: 5, type: T.blvd, name: 'Starfish Causeway' },
];
export const BRIDGE_HALF = 7.6; // Abstand der Geländer zur Mittellinie

export function bridgeProfile(b, x) {
  if (x <= b.a0 || x >= b.a1) return 0;
  const t = (x - b.a0) / (b.a1 - b.a0);
  return (b.height * (1 - Math.cos(t * Math.PI * 2))) / 2;
}

// ---------------------------------------------------------------------------
// Straßengraph (Knoten = Kreuzungen, gerichtete Kanten = Fahrspuren je Richtung)

function vRoadAt(x) {
  return V_ROADS.find((r) => r.x === x);
}

export function buildRoadGraph() {
  const nodes = new Map();
  const key = (x, z) => `${x},${z}`;
  const node = (x, z) => {
    const k = key(x, z);
    if (!nodes.has(k)) nodes.set(k, { id: nodes.size, x, z, hx: 0, hz: 0, out: [], edges: 0, phase: 0, lights: false });
    return nodes.get(k);
  };
  const edges = [];

  const link = (a, b, type, axis, bridge = null) => {
    for (const [p, q] of [[a, b], [b, a]]) {
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const len = Math.hypot(dx, dz);
      const e = {
        id: edges.length,
        from: p,
        to: q,
        dir: { x: dx / len, z: dz / len },
        right: { x: -dz / len, z: dx / len },
        type,
        axis,
        bridge,
        limit: bridge ? 17 : type.limit,
        lanes: [],
        reverse: null,
      };
      edges.push(e);
      p.out.push(e);
    }
    edges[edges.length - 1].reverse = edges[edges.length - 2];
    edges[edges.length - 2].reverse = edges[edges.length - 1];
    a.edges++;
    b.edges++;
  };

  for (const vr of V_ROADS) {
    for (let i = 0; i < ROWS_Z.length; i++) {
      const n = node(vr.x, ROWS_Z[i]);
      n.hx = Math.max(n.hx, vr.type.width / 2);
      n.hz = Math.max(n.hz, T.std.width / 2);
      if (i > 0) link(node(vr.x, ROWS_Z[i - 1]), n, vr.type, 'ns');
    }
  }
  for (const hr of H_ROADS) {
    const xs = (hr.x0 < 200 ? MAIN_X : ISLAND_X).filter((x) => x >= hr.x0 && x <= hr.x1);
    for (let i = 1; i < xs.length; i++) link(node(xs[i - 1], hr.z), node(xs[i], hr.z), hr.type, 'ew');
  }
  // Hafen: drei Straßen nach Süden verlängert, zwei Querstraßen
  for (const x of PORT_X) {
    const type = x === 100 ? T.blvd : T.std;
    let prev = node(x, 600);
    for (const z of PORT_ROWS) {
      const n = node(x, z);
      n.hx = Math.max(n.hx, type.width / 2);
      n.hz = Math.max(n.hz, T.std.width / 2);
      link(prev, n, type, 'ns');
      prev = n;
    }
  }
  for (const z of PORT_ROWS) {
    for (let i = 1; i < PORT_X.length; i++) link(node(PORT_X[i - 1], z), node(PORT_X[i], z), T.std, 'ew');
  }
  for (const b of BRIDGES) {
    const a = node(b.x0, b.z);
    const c = node(b.x1, b.z);
    a.hz = Math.max(a.hz, b.type.width / 2);
    c.hz = Math.max(c.hz, b.type.width / 2);
    link(a, c, b.type, 'ew', b);
  }

  // Spurgeometrie: Start/Ende jeweils an der Haltelinie der Kreuzungen
  for (const e of edges) {
    const halfFrom = e.axis === 'ew' ? e.from.hx : e.from.hz;
    const halfTo = e.axis === 'ew' ? e.to.hx : e.to.hz;
    for (const off of e.type.lanes) {
      const sx = e.from.x + e.dir.x * halfFrom + e.right.x * off;
      const sz = e.from.z + e.dir.z * halfFrom + e.right.z * off;
      const ex = e.to.x - e.dir.x * halfTo + e.right.x * off;
      const ez = e.to.z - e.dir.z * halfTo + e.right.z * off;
      e.lanes.push({ sx, sz, ex, ez, len: Math.hypot(ex - sx, ez - sz), off });
    }
    e.len = e.lanes[0].len;
  }

  let seed = 7;
  for (const n of nodes.values()) {
    n.lights = n.edges >= 3;
    seed = (seed * 16807) % 2147483647;
    n.phase = (seed / 2147483647) * 24;
  }

  return { nodes: [...nodes.values()], edges };
}

// Ampelphasen (24-s-Zyklus, mit kurzer Allrot-Phase)
export const LIGHT_CYCLE = 24;
export function lightState(node, axis, time) {
  if (!node.lights) return 'green';
  const p = (time + node.phase) % LIGHT_CYCLE;
  if (axis === 'ns') {
    if (p < 9) return 'green';
    if (p < 11.5) return 'yellow';
    return 'red';
  }
  if (p < 12) return 'red';
  if (p < 21) return 'green';
  if (p < 23.5) return 'yellow';
  return 'red';
}

// ---------------------------------------------------------------------------
// Flächen: Straßen, Blöcke, Land, Wasser

const ROAD_RECTS = [];
(function buildRoadRects() {
  for (const vr of V_ROADS) {
    const hw = vr.type.width / 2;
    ROAD_RECTS.push({ x0: vr.x - hw, x1: vr.x + hw, z0: -600 - 6, z1: 600 + 6 });
  }
  for (const hr of H_ROADS) {
    const hw = hr.type.width / 2;
    ROAD_RECTS.push({ x0: hr.x0, x1: hr.x1, z0: hr.z - hw, z1: hr.z + hw });
  }
  for (const b of BRIDGES) {
    const hw = b.type.width / 2;
    ROAD_RECTS.push({ x0: b.x0, x1: b.x1, z0: b.z - hw, z1: b.z + hw, bridge: b });
  }
  for (const x of PORT_X) {
    const hw = (x === 100 ? T.blvd : T.std).width / 2;
    ROAD_RECTS.push({ x0: x - hw, x1: x + hw, z0: 600, z1: PORT_ROWS[PORT_ROWS.length - 1] + 6 });
  }
  for (const z of PORT_ROWS) ROAD_RECTS.push({ x0: PORT_X[0], x1: PORT_X[PORT_X.length - 1], z0: z - 6, z1: z + 6 });
})();
export { ROAD_RECTS };

export function isLand(x, z) {
  return (
    (x >= MAINLAND.x0 && x <= MAINLAND.x1 && z >= MAINLAND.z0 && z <= MAINLAND.z1) ||
    (x >= ISLAND.x0 && x <= ISLAND.x1 && z >= ISLAND.z0 && z <= ISLAND.z1) ||
    (x >= PORT.x0 && x <= PORT.x1 && z >= PORT.z0 && z <= PORT.z1)
  );
}

// Rampenhöhe an einer Stelle (0 außerhalb)
export function rampAt(x, z) {
  for (const r of RAMPS) {
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    const t = r.dir === 'x' ? (x - r.x0) / (r.x1 - r.x0) : r.dir === '-x' ? (r.x1 - x) / (r.x1 - r.x0) : r.dir === 'z' ? (z - r.z0) / (r.z1 - r.z0) : (r.z1 - z) / (r.z1 - r.z0);
    return r.h * t;
  }
  return 0;
}

export function onRoad(x, z) {
  for (let i = 0; i < ROAD_RECTS.length; i++) {
    const r = ROAD_RECTS[i];
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  }
  return null;
}

// Bodenhöhe an einer Position (Straße 0, Bordstein/Gehweg 0.15, Brückenbogen, Wasser)
export function heightAt(x, z) {
  for (const b of BRIDGES) {
    if (x > b.a0 && x < b.a1 && Math.abs(z - b.z) < BRIDGE_HALF + 0.5) return bridgeProfile(b, x);
  }
  if (!isLand(x, z)) return WATER_FLOOR;
  if (z > PORT.z0 - 10) {
    const r = rampAt(x, z);
    if (r > 0) return Math.max(r, CURB);
  }
  return onRoad(x, z) ? 0 : CURB;
}

// ---------------------------------------------------------------------------
// Baublöcke (Flächen zwischen den Straßen) mit Stadtteil-Typ

function cellsBetween(xBounds, zBounds, typeFn) {
  const cells = [];
  for (let i = 0; i < xBounds.length - 1; i++) {
    for (let j = 0; j < zBounds.length - 1; j++) {
      const a = xBounds[i];
      const b = xBounds[i + 1];
      const c = zBounds[j];
      const d = zBounds[j + 1];
      const rect = { x0: a.v + a.hw, x1: b.v - b.hw, z0: c.v + c.hw, z1: d.v - d.hw };
      if (rect.x1 - rect.x0 < 4 || rect.z1 - rect.z0 < 4) continue;
      rect.edges = { w: a.road, e: b.road, n: c.road, s: d.road };
      rect.type = typeFn(rect, i, j);
      cells.push(rect);
    }
  }
  return cells;
}

const bnd = (v, hw, road = hw > 0) => ({ v, hw, road });

export function buildBlocks() {
  const blocks = [];
  // Festland – Hauptraster
  const mx = [bnd(-650, 10), bnd(-500, 6), bnd(-350, 6), bnd(-200, 6), bnd(-50, 6), bnd(100, 7)];
  const mz = ROWS_Z.map((z) => bnd(z, 6));
  blocks.push(
    ...cellsBetween(mx, mz, (r) => {
      const cx = (r.x0 + r.x1) / 2;
      if (cx > -50) return 'downtown';
      if (cx > -200) return 'uptown';
      if (cx > -500) return 'midrise';
      return 'suburb';
    }),
  );
  // Festland – Randstreifen
  blocks.push(...cellsBetween([bnd(-720, 0), bnd(-650, 10)], [bnd(-700, 0), bnd(700, 0)], () => 'suburb'));
  blocks.push(
    ...cellsBetween([bnd(-660, 0), bnd(107, 0)], [bnd(-700, 0), bnd(-600, 6)], (r) => (r.x0 > -300 ? 'uptown' : 'suburb')),
  );
  blocks.push(
    ...cellsBetween([bnd(-660, 0), bnd(-350, 6), bnd(-50, 6), bnd(100, 7)], [bnd(600, 6), bnd(700, 0)], (r) => (r.x0 > -300 ? 'uptown' : 'suburb')),
  );
  // Hafen: Containerlager, Lagerhallen, Kai
  blocks.push(
    ...cellsBetween(
      [bnd(PORT.x0, 0), bnd(-350, 6), bnd(-50, 6), bnd(100, 7), bnd(PORT.x1, 0)],
      [bnd(PORT.z0, 0), bnd(800, 6), bnd(1000, 6), bnd(PORT.z1, 0)],
      (r) => (r.x0 > 100 || r.z0 > 1000 ? 'quay' : 'port'),
    ),
  );
  // Bayfront-Park am Festland (durch Brücken geteilt)
  blocks.push(
    ...cellsBetween([bnd(107, 0), bnd(150, 0)], [bnd(-700, 0), bnd(-400, 7), bnd(0, 7), bnd(700, 0)], () => 'bayfront'),
  );
  // Insel – Innenblöcke zwischen Bay Road, Collins Avenue und Ocean Drive
  const ix = [bnd(360, 6), bnd(470, 6), bnd(580, 7)];
  blocks.push(...cellsBetween(ix, ROWS_Z.map((z) => bnd(z, 6)), () => 'deco'));
  // Insel – Bayfront-Streifen westlich der Bay Road (nur an den Brücken geteilt)
  blocks.push(
    ...cellsBetween([bnd(330, 0), bnd(360, 6)], [bnd(-606, 0), bnd(-400, 7), bnd(0, 7), bnd(606, 0)], () => 'bayfront'),
  );
  // Insel – Nord- und Südende
  blocks.push(...cellsBetween([bnd(330, 0), bnd(587, 0)], [bnd(-700, 0), bnd(-606, 0)], () => 'deco'));
  blocks.push(...cellsBetween([bnd(330, 0), bnd(587, 0)], [bnd(606, 0), bnd(700, 0)], () => 'deco'));
  // Streifen zwischen Ocean Drive und Strand (Lummus-Park-Stil)
  blocks.push({ x0: 587, x1: ISLAND.x1, z0: -700, z1: 700, type: 'beachpark', edges: { w: true } });
  return blocks;
}

// Unsichtbare Kaimauern (Wasserkante) mit Lücken für die Brücken
export function seawallBoxes() {
  const boxes = [];
  const t = 2;
  const gapZ = BRIDGES.map((b) => [b.z - BRIDGE_HALF, b.z + BRIDGE_HALF]);
  const vWall = (x, z0, z1) => {
    let cur = z0;
    for (const [g0, g1] of gapZ.sort((a, b) => a[0] - b[0])) {
      if (g1 < z0 || g0 > z1) continue;
      boxes.push({ x0: x - t / 2, x1: x + t / 2, z0: cur, z1: g0 });
      cur = g1;
    }
    boxes.push({ x0: x - t / 2, x1: x + t / 2, z0: cur, z1: z1 });
  };
  // Festland
  boxes.push({ x0: MAINLAND.x0 - t, x1: MAINLAND.x0, z0: MAINLAND.z0, z1: MAINLAND.z1 });
  boxes.push({ x0: MAINLAND.x0, x1: MAINLAND.x1, z0: MAINLAND.z0 - t, z1: MAINLAND.z0 });
  boxes.push({ x0: MAINLAND.x0, x1: PORT.x0, z0: MAINLAND.z1, z1: MAINLAND.z1 + t });
  // Hafen
  boxes.push({ x0: PORT.x0 - t, x1: PORT.x0, z0: PORT.z0, z1: PORT.z1 });
  boxes.push({ x0: PORT.x0, x1: PORT.x1, z0: PORT.z1, z1: PORT.z1 + t });
  boxes.push({ x0: PORT.x1, x1: PORT.x1 + t, z0: PORT.z0, z1: PORT.z1 });
  vWall(MAINLAND.x1 + t / 2, MAINLAND.z0, MAINLAND.z1);
  // Insel
  vWall(ISLAND.x0 - t / 2, ISLAND.z0, ISLAND.z1);
  boxes.push({ x0: ISLAND.x1, x1: ISLAND.x1 + t, z0: ISLAND.z0, z1: ISLAND.z1 });
  boxes.push({ x0: ISLAND.x0, x1: ISLAND.x1, z0: ISLAND.z0 - t, z1: ISLAND.z0 });
  boxes.push({ x0: ISLAND.x0, x1: ISLAND.x1, z0: ISLAND.z1, z1: ISLAND.z1 + t });
  // Brückengeländer
  for (const b of BRIDGES) {
    boxes.push({ x0: b.a0, x1: b.a1, z0: b.z - BRIDGE_HALF - 0.6, z1: b.z - BRIDGE_HALF, h: 200 });
    boxes.push({ x0: b.a0, x1: b.a1, z0: b.z + BRIDGE_HALF, z1: b.z + BRIDGE_HALF + 0.6, h: 200 });
  }
  return boxes.map((b) => ({ h: 3, ...b }));
}
