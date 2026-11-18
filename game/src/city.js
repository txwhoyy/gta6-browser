// City generation for Port Marisol: a grid of streets and blocks on a bay, with
// the sea along the east edge. Buildings are solid boxes with a style and a
// window pattern; some blocks are parks, parking lots or landmarks instead.
// The same seed always builds the same city, and the road graph the module
// exposes is what traffic drives on and police pathfind across.

import { BEACH, BUILDING_STYLES, GRID, PALETTE, WORLD_SIZE } from './config.js';
import { clamp, makeRng } from './random.js';

/** Centre line of the i-th vertical road (roads run along the grid edges). */
export function roadCenterX(i) {
  return GRID.road / 2 + i * GRID.pitch;
}

/** Centre line of the j-th horizontal road. */
export function roadCenterY(j) {
  return GRID.road / 2 + j * GRID.pitch;
}

/** The block square between roads i..i+1 and j..j+1 (its inside, off the road). */
export function blockRect(i, j) {
  const x = GRID.road + i * GRID.pitch;
  const y = GRID.road + j * GRID.pitch;
  const size = GRID.pitch - GRID.road;
  return { x, y, w: size, h: size };
}

const LANDMARKS = [
  { i: 8, j: 1, kind: 'hotel', name: 'Hotel Azul', color: '#3f8fd2' },
  { i: 2, j: 8, kind: 'garage', name: 'Marisol Motors', color: '#e2703a' },
  { i: 9, j: 9, kind: 'marina', name: 'Marina del Sol', color: '#2fa8c9' },
  { i: 1, j: 1, kind: 'depot', name: 'North Docks', color: '#8a6b45' },
  { i: 5, j: 5, kind: 'plaza', name: 'Plaza Coral', color: '#ff5da2' },
  { i: 8, j: 6, kind: 'club', name: 'Club Neon', color: '#7a5fd0' },
];

export function generateCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const parks = [];
  const lots = [];
  const landmarks = [];

  for (let i = 0; i < GRID.cols; i += 1) {
    for (let j = 0; j < GRID.rows; j += 1) {
      const block = blockRect(i, j);
      const landmark = LANDMARKS.find((entry) => entry.i === i && entry.j === j);
      if (block.x > BEACH.sandStart - 40) continue; // the beach blocks stay open sand
      if (landmark) {
        const pad = 16;
        const rect = { x: block.x + pad, y: block.y + pad, w: block.w - pad * 2, h: block.h - pad * 2 };
        buildings.push(makeBuilding(rng, rect, landmark.color, landmark.kind));
        landmarks.push({ ...landmark, x: block.x + block.w / 2, y: block.y + block.h / 2, rect });
        continue;
      }
      const roll = rng.next();
      if (roll < 0.14) {
        parks.push(makePark(rng, block));
        continue;
      }
      if (roll < 0.24) {
        lots.push({ ...block, spots: makeLotSpots(rng, block) });
        continue;
      }
      // One or two buildings share the block, with a sidewalk margin all round.
      const margin = rng.range(14, 26);
      const split = rng.chance(0.35);
      if (split) {
        const half = (block.w - margin * 2 - 12) / 2;
        buildings.push(makeBuilding(rng, { x: block.x + margin, y: block.y + margin, w: half, h: block.h - margin * 2 }));
        buildings.push(makeBuilding(rng, { x: block.x + margin + half + 12, y: block.y + margin, w: half, h: block.h - margin * 2 }));
      } else {
        buildings.push(makeBuilding(rng, {
          x: block.x + margin,
          y: block.y + margin,
          w: block.w - margin * 2,
          h: block.h - margin * 2,
        }));
      }
    }
  }

  return { buildings, parks, lots, landmarks, seed };
}

function makeBuilding(rng, rect, colorOverride, kind) {
  const style = rng.pick(BUILDING_STYLES);
  const floors = rng.int(2, 7);
  const windowsAcross = Math.max(2, Math.floor(rect.w / 26));
  const lit = [];
  for (let n = 0; n < windowsAcross * floors; n += 1) lit.push(rng.chance(0.55));
  return {
    ...rect,
    style,
    color: colorOverride || style.wall,
    floors,
    windowsAcross,
    lit,
    kind: kind || 'block',
    height: floors * 9,
  };
}

function makePark(rng, block) {
  const palms = [];
  const count = rng.int(4, 8);
  for (let n = 0; n < count; n += 1) {
    palms.push({
      x: block.x + rng.range(18, block.w - 18),
      y: block.y + rng.range(18, block.h - 18),
      lean: rng.range(-0.25, 0.25),
      size: rng.range(0.8, 1.25),
    });
  }
  return { ...block, palms };
}

function makeLotSpots(rng, block) {
  const spots = [];
  const perRow = 4;
  for (let row = 0; row < 2; row += 1) {
    for (let n = 0; n < perRow; n += 1) {
      if (rng.chance(0.35)) continue;
      spots.push({
        x: block.x + 26 + n * ((block.w - 52) / perRow) + (block.w - 52) / perRow / 2,
        y: block.y + 40 + row * (block.h - 80),
        angle: (row === 0 ? Math.PI / 2 : -Math.PI / 2) + rng.range(-0.05, 0.05),
      });
    }
  }
  return spots;
}

/** Is the point on sand or in the sea? 'land' | 'sand' | 'water'. */
export function groundAt(x, y) {
  if (x >= BEACH.waterStart) return 'water';
  if (x >= BEACH.sandStart) return 'sand';
  return 'land';
}

/** Is the point on a road (either direction of the grid)? */
export function onRoad(x, y) {
  const inVertical = ((x % GRID.pitch) + GRID.pitch) % GRID.pitch < GRID.road;
  const inHorizontal = ((y % GRID.pitch) + GRID.pitch) % GRID.pitch < GRID.road;
  return inVertical || inHorizontal;
}

/**
 * Push a circle out of every building it overlaps and out of the sea.
 * Returns the impact speed into a wall (0 when it moved freely), which the
 * caller turns into crash damage and noise.
 */
export function collideCircle(city, body, radius) {
  let impact = 0;
  for (const b of city.buildings) {
    const nearX = clamp(body.x, b.x, b.x + b.w);
    const nearY = clamp(body.y, b.y, b.y + b.h);
    const dx = body.x - nearX;
    const dy = body.y - nearY;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = radius - d;
      const vx = body.vx || 0;
      const vy = body.vy || 0;
      impact = Math.max(impact, Math.abs(vx * (dx / d) + vy * (dy / d)));
      body.x += (dx / d) * push;
      body.y += (dy / d) * push;
      // Kill the velocity component that points into the wall.
      const into = vx * (dx / d) + vy * (dy / d);
      if (into < 0) {
        body.vx -= into * (dx / d);
        body.vy -= into * (dy / d);
      }
    } else {
      // Centre inside the box: push out through the nearest face.
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const top = body.y - b.y;
      const bottom = b.y + b.h - body.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) body.x = b.x - radius;
      else if (min === right) body.x = b.x + b.w + radius;
      else if (min === top) body.y = b.y - radius;
      else body.y = b.y + b.h + radius;
      impact = Math.max(impact, Math.hypot(body.vx || 0, body.vy || 0));
      body.vx = 0;
      body.vy = 0;
    }
  }
  // The sea is a wall for everything that cannot swim.
  if (body.x > BEACH.waterStart - radius) {
    impact = Math.max(impact, Math.abs(body.vx || 0));
    body.x = BEACH.waterStart - radius;
    if (body.vx > 0) body.vx = 0;
  }
  body.x = clamp(body.x, radius, WORLD_SIZE - radius);
  body.y = clamp(body.y, radius, WORLD_SIZE - radius);
  return impact;
}

/**
 * Shortest route between two intersections of the road grid, as a list of
 * world points. Police use it to cross town; traffic uses single legs of it.
 * Nodes are (i, j) with i, j in 0..cols / 0..rows at the road centre lines.
 */
export function routeBetween(fromX, fromY, toX, toY) {
  const start = nearestNode(fromX, fromY);
  const goal = nearestNode(toX, toY);
  const key = (i, j) => i * 100 + j;
  const cameFrom = new Map();
  const seen = new Set([key(start.i, start.j)]);
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node.i === goal.i && node.j === goal.j) break;
    const neighbours = [
      { i: node.i + 1, j: node.j },
      { i: node.i - 1, j: node.j },
      { i: node.i, j: node.j + 1 },
      { i: node.i, j: node.j - 1 },
    ];
    for (const next of neighbours) {
      if (next.i < 0 || next.j < 0 || next.i > GRID.cols || next.j > GRID.rows) continue;
      const k = key(next.i, next.j);
      if (seen.has(k)) continue;
      seen.add(k);
      cameFrom.set(k, node);
      queue.push(next);
    }
  }
  const points = [];
  let node = goal;
  while (node) {
    points.unshift({ x: roadCenterX(node.i), y: roadCenterY(node.j) });
    node = cameFrom.get(key(node.i, node.j));
  }
  points.push({ x: toX, y: toY });
  return points;
}

function nearestNode(x, y) {
  return {
    i: clamp(Math.round((x - GRID.road / 2) / GRID.pitch), 0, GRID.cols),
    j: clamp(Math.round((y - GRID.road / 2) / GRID.pitch), 0, GRID.rows),
  };
}

export { PALETTE };
