// Ambient traffic: cars that cruise the road grid forever, turning at
// intersections, slowing for the car ahead and stopping (briefly, angrily)
// when the player cuts them up. Each traffic car rides one road line at a
// time — a vertical or horizontal centre line with a lane offset — which
// keeps two-way traffic orderly without any pathfinding.

import { CAR_COLORS, GRID, TRAFFIC } from './config.js';
import { roadCenterX, roadCenterY } from './city.js';
import { makeCar, stepCar } from './vehicles.js';

const LANE = GRID.road / 4;

export class Traffic {
  constructor(city, rng) {
    this.cars = [];
    this.rng = rng;
    // Moving traffic on random road lines.
    for (let n = 0; n < TRAFFIC.count; n += 1) {
      const vertical = rng.chance(0.5);
      const line = rng.int(0, vertical ? GRID.cols : GRID.rows);
      const along = rng.range(60, (vertical ? GRID.rows : GRID.cols) * GRID.pitch);
      const dir = rng.chance(0.5) ? 1 : -1;
      const car = this.spawnOnLine(vertical, line, along, dir);
      this.cars.push(car);
    }
    // Parked cars in the parking lots and along a few kerbs.
    for (const lot of city.lots) {
      for (const spot of lot.spots) {
        const car = makeCar(spot.x, spot.y, spot.angle, rng.pick(CAR_COLORS), 'parked');
        car.driver = null;
        this.cars.push(car);
      }
    }
    let parked = this.cars.filter((c) => c.kind === 'parked').length;
    for (let n = 0; parked < TRAFFIC.parkedCount && n < 60; n += 1) {
      const vertical = rng.chance(0.5);
      const line = rng.int(0, vertical ? GRID.cols : GRID.rows);
      const along = rng.range(80, (vertical ? GRID.rows : GRID.cols) * GRID.pitch - 80);
      const dir = rng.chance(0.5) ? 1 : -1;
      const car = this.spawnOnLine(vertical, line, along, dir);
      car.kind = 'parked';
      car.speed = 0;
      car.vx = 0;
      car.vy = 0;
      car.parkedOnRoad = true;
      this.cars.push(car);
      parked += 1;
    }
  }

  spawnOnLine(vertical, line, along, dir) {
    // Right-hand traffic: the lane sits to the right of the direction of travel.
    let x;
    let y;
    let angle;
    if (vertical) {
      x = roadCenterX(line) + (dir > 0 ? LANE : -LANE);
      y = along;
      angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = along;
      y = roadCenterY(line) + (dir > 0 ? -LANE : LANE);
      angle = dir > 0 ? 0 : Math.PI;
    }
    const car = makeCar(x, y, angle, this.rng.pick(CAR_COLORS), 'traffic');
    car.driver = 'traffic';
    car.road = { vertical, line, dir };
    return car;
  }

  /** The intersection index the car is approaching, and its distance to it. */
  nextCrossing(car) {
    const { vertical, dir } = car.road;
    const pos = vertical ? car.y : car.x;
    const pitch = GRID.pitch;
    const k = dir > 0 ? Math.floor(pos / pitch) + 1 : Math.ceil(pos / pitch) - 1;
    const at = k * pitch + GRID.road / 2;
    return { index: k, distance: Math.abs(at - pos) };
  }

  update(city, dt, playerCar, particles) {
    for (const car of this.cars) {
      if (car.driver === 'player' || car.kind === 'parked') continue;
      if (car.health <= 0) continue; // wrecked traffic just sits and smokes
      const { vertical, dir } = car.road;

      // Slow for whatever is ahead in the same lane (traffic or the player).
      let throttle = 0.55;
      const ahead = this.carAhead(car, 74);
      if (ahead) throttle = ahead.gap < 40 ? -0.4 : 0.05;

      // Turn at intersections sometimes, and always at the map's edge roads
      // so nobody drives off the world; commit once the nose is in the box.
      const crossing = this.nextCrossing(car);
      if (crossing.distance < 14 && !car.turnCooldown) {
        car.turnCooldown = 1.4;
        const edgeCrossing = crossing.index <= 0 || crossing.index >= (car.road.vertical ? GRID.rows : GRID.cols);
        if (edgeCrossing || this.rng.chance(0.34)) {
          this.beginTurn(car, Math.max(0, Math.min(car.road.vertical ? GRID.rows : GRID.cols, crossing.index)));
        }
      }
      car.turnCooldown = Math.max(0, (car.turnCooldown || 0) - dt);

      let steer = 0;
      if (car.turning) {
        steer = this.steerThroughTurn(car);
      } else {
        // Hold the lane centre line.
        const target = vertical
          ? { x: roadCenterX(car.road.line) + (dir > 0 ? LANE : -LANE), y: car.y + dir * 60 }
          : { x: car.x + dir * 60, y: roadCenterY(car.road.line) + (dir > 0 ? -LANE : LANE) };
        const want = Math.atan2(target.y - car.y, target.x - car.x);
        let delta = want - car.angle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        steer = Math.max(-1, Math.min(1, delta * 2.2));
        // Cap traffic speed.
        if (Math.abs(car.speed) > TRAFFIC.speed) throttle = Math.min(throttle, 0);
        if (car.speed < -4) throttle = 0.6;
      }

      stepCar(city, car, { throttle, steer, handbrake: false }, dt);
      if (particles && car.health < 40 && this.rng.chance(dt * 6)) {
        particles.spawn(car.x, car.y - 6, 'smoke');
      }
    }
  }

  carAhead(car, range) {
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    let best = null;
    for (const other of this.cars) {
      if (other === car || other.driver === 'player') continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const forward = dx * fx + dy * fy;
      const side = Math.abs(dx * -fy + dy * fx);
      if (forward > 0 && forward < range && side < 20) {
        if (!best || forward < best.gap) best = { gap: forward, car: other };
      }
    }
    return best;
  }

  beginTurn(car, crossingIndex) {
    const { vertical, line } = car.road;
    // Turning swaps the axis of travel: the car leaves along the crossing
    // road. The new direction is random, except on an edge road, where it
    // must point back into the map.
    let dir = this.rng.chance(0.5) ? 1 : -1;
    if (vertical && line === 0) dir = 1;
    if (vertical && line === GRID.cols) dir = -1;
    if (!vertical && line === 0) dir = 1;
    if (!vertical && line === GRID.rows) dir = -1;
    car.turning = {
      vertical: !vertical,
      line: crossingIndex,
      dir,
      progress: 0,
      fromVertical: vertical,
    };
  }

  steerThroughTurn(car) {
    const turn = car.turning;
    // The pivot is the intersection centre; aim at the exit lane point.
    const cx = roadCenterX(turn.fromVertical ? car.road.line : turn.line);
    const cy = roadCenterY(turn.fromVertical ? turn.line : car.road.line);
    let exitX;
    let exitY;
    if (turn.fromVertical) {
      // Exiting horizontally from a vertical road at row `line`.
      const dirH = turn.dir;
      exitX = cx + dirH * 90;
      exitY = roadCenterY(turn.line) + (dirH > 0 ? -LANE : LANE);
    } else {
      const dirV = turn.dir;
      exitX = roadCenterX(turn.line) + (dirV > 0 ? LANE : -LANE);
      exitY = cy + dirV * 90;
    }
    const want = Math.atan2(exitY - car.y, exitX - car.x);
    let delta = want - car.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, delta * 2.6));
    turn.progress += Math.abs(car.speed) * 0.016;
    if (Math.hypot(exitX - car.x, exitY - car.y) < 30 || turn.progress > 2.4) {
      car.road = { vertical: turn.vertical, line: turn.line, dir: turn.dir };
      car.turning = null;
    }
    return steer;
  }
}
