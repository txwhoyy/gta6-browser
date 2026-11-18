// Pedestrians: Port Marisol's walkers. They stroll the sidewalks around a
// block, cross at corners, chat in pairs, and scatter when a car bears down
// on them or a fist swings. A pedestrian who is hit goes down for a while;
// that is a crime, and the game (not this module) decides what it costs.

import { GRID, PEDS } from './config.js';
import { blockRect, groundAt } from './city.js';
import { clamp, distance } from './random.js';

const SHIRTS = ['#ffd166', '#06d6a0', '#ef476f', '#118ab2', '#f78c6b', '#c77dff', '#8ecae6', '#ffffff'];

export class Pedestrians {
  constructor(rng) {
    this.rng = rng;
    this.list = [];
    for (let n = 0; n < PEDS.count; n += 1) {
      const i = rng.int(0, GRID.cols - 1);
      const j = rng.int(0, GRID.rows - 1);
      const block = blockRect(i, j);
      if (groundAt(block.x + block.w / 2, block.y) !== 'land') continue;
      this.list.push(this.makeWalker(block));
    }
    // A few beach strollers on the sand.
    for (let n = 0; n < 6; n += 1) {
      this.list.push({
        x: rng.range(2560, 2740),
        y: rng.range(200, 2700),
        vx: 0,
        vy: 0,
        angle: rng.range(0, Math.PI * 2),
        shirt: rng.pick(SHIRTS),
        state: 'walk',
        timer: rng.range(1, 4),
        target: null,
        home: null,
        down: 0,
        walkPhase: rng.range(0, 6),
      });
    }
  }

  makeWalker(block) {
    const rng = this.rng;
    const inset = 8;
    const home = {
      x: block.x - inset,
      y: block.y - inset,
      w: block.w + inset * 2,
      h: block.h + inset * 2,
    };
    const t = rng.next();
    const pos = walkPerimeter(home, t);
    return {
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      angle: 0,
      shirt: rng.pick(SHIRTS),
      state: 'walk',
      timer: rng.range(0, 2),
      target: null,
      home,
      sideT: t,
      dirSign: rng.chance(0.5) ? 1 : -1,
      down: 0,
      walkPhase: rng.range(0, 6),
    };
  }

  /**
   * Advance everyone. Returns events the game cares about:
   * { hit: [peds run down this step], scared: count }.
   */
  update(dt, threats) {
    const events = { hit: [] };
    for (const ped of this.list) {
      if (ped.down > 0) {
        ped.down -= dt;
        ped.vx = 0;
        ped.vy = 0;
        continue;
      }
      ped.walkPhase += dt * (Math.abs(ped.vx) + Math.abs(ped.vy) > 4 ? 9 : 2);

      // Flee the nearest fast threat (a car under way, or the player swinging).
      let threat = null;
      let threatDist = Infinity;
      for (const t of threats) {
        const d = distance(ped.x, ped.y, t.x, t.y);
        if (d < threatDist) {
          threatDist = d;
          threat = t;
        }
      }
      if (threat && threatDist < 66 && threat.fast) {
        ped.state = 'flee';
        const away = Math.atan2(ped.y - threat.y, ped.x - threat.x);
        ped.vx = Math.cos(away) * 168;
        ped.vy = Math.sin(away) * 168;
        ped.angle = away;
        if (threatDist < 24 && threat.car) {
          ped.down = 5;
          ped.state = 'down';
          events.hit.push(ped);
        }
        continue;
      }
      if (ped.state === 'flee') ped.state = 'walk';

      if (ped.home) {
        // Stroll the block's perimeter, changing direction now and then.
        const speed = PEDS.walkSpeed;
        ped.sideT += (speed * dt) / (2 * (ped.home.w + ped.home.h)) * (ped.dirSign || 1);
        if (ped.sideT > 1) ped.sideT -= 1;
        if (ped.sideT < 0) ped.sideT += 1;
        if (this.rng.chance(dt * 0.05)) ped.dirSign = -(ped.dirSign || 1);
        const walk = walkPerimeter(ped.home, ped.sideT);
        ped.vx = (walk.x - ped.x) / Math.max(dt, 0.001) * 0.9;
        ped.vy = (walk.y - ped.y) / Math.max(dt, 0.001) * 0.9;
        ped.x = walk.x;
        ped.y = walk.y;
        if (Math.abs(ped.vx) + Math.abs(ped.vy) > 1) ped.angle = Math.atan2(ped.vy, ped.vx);
      } else {
        // Beach strollers wander and turn around at the water.
        ped.timer -= dt;
        if (ped.timer <= 0) {
          ped.timer = this.rng.range(2, 5);
          ped.angle = this.rng.range(0, Math.PI * 2);
        }
        const nx = ped.x + Math.cos(ped.angle) * PEDS.walkSpeed * 0.7 * dt;
        const ny = ped.y + Math.sin(ped.angle) * PEDS.walkSpeed * 0.7 * dt;
        if (groundAt(nx, ny) === 'sand') {
          ped.x = clamp(nx, 2540, 2760);
          ped.y = clamp(ny, 20, 2960);
          ped.vx = Math.cos(ped.angle) * 36;
          ped.vy = Math.sin(ped.angle) * 36;
        } else {
          ped.angle += Math.PI * 0.9;
        }
      }
    }
    return events;
  }

  /** Knock a pedestrian down (a punch landed). */
  knockDown(ped) {
    ped.down = 4;
    ped.state = 'down';
  }
}

/** Point at parameter t (0..1) around the whole perimeter of a rect. */
function walkPerimeter(rect, t) {
  const perimeter = 2 * (rect.w + rect.h);
  let d = ((t % 1) + 1) % 1 * perimeter;
  if (d < rect.w) return { x: rect.x + d, y: rect.y };
  d -= rect.w;
  if (d < rect.h) return { x: rect.x + rect.w, y: rect.y + d };
  d -= rect.h;
  if (d < rect.w) return { x: rect.x + rect.w - d, y: rect.y + rect.h };
  d -= rect.w;
  return { x: rect.x, y: rect.y + rect.h - d };
}
