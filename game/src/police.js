// The law in Port Marisol: a wanted level that rises with witnessed crime and
// cools when the player lies low, and patrol cars that pathfind across the
// road grid to reach the player, then ram and box them in. On foot, an
// officer who stays close while the player dawdles fills the bust meter;
// in a car the police settle for wrecking it.

import { PALETTE, POLICE, WANTED } from './config.js';
import { routeBetween } from './city.js';
import { clamp, distance } from './random.js';
import { makeCar, stepCar, steerToward } from './vehicles.js';

export class WantedSystem {
  constructor() {
    this.stars = 0;
    this.heat = 0; // seconds since the last witnessed crime
    this.coolProgress = 0;
  }

  /** Record a crime: severity 1 (theft, a shove) or 2 (violence, a hit-and-run). */
  commitCrime(severity) {
    this.stars = clamp(this.stars + severity, 0, WANTED.max);
    this.heat = 0;
    this.coolProgress = 0;
  }

  update(dt, anyOfficerNear) {
    this.heat += dt;
    if (this.stars === 0) return;
    if (this.heat > WANTED.coolAfterSeconds && !anyOfficerNear) {
      this.coolProgress += dt;
      if (this.coolProgress >= WANTED.starEverySeconds) {
        this.coolProgress = 0;
        this.stars -= 1;
        this.heat = 0;
      }
    } else {
      this.coolProgress = 0;
    }
  }

  clear() {
    this.stars = 0;
    this.heat = 0;
    this.coolProgress = 0;
  }
}

export class Police {
  constructor(rng) {
    this.rng = rng;
    this.cars = [];
    this.bustMeter = 0;
    this.spawnTimer = 0;
    this.repathTimer = 0;
  }

  /** How many patrol cars the current wanted level calls for. */
  desiredCount(stars) {
    if (stars <= 0) return 0;
    return Math.min(POLICE.maxCars, stars + 1);
  }

  update(city, dt, player, wanted, particles) {
    const targetCount = this.desiredCount(wanted.stars);
    this.spawnTimer -= dt;

    // When the heat reaches zero the chase is over: units still on screen
    // cruise off and are removed once they are gone or a few seconds pass.
    if (wanted.stars === 0) {
      this.bustMeter = 0;
      this.cars = this.cars.filter((car) => {
        if (car.leaving === undefined) car.leaving = 4;
        car.leaving -= dt;
        stepCar(city, car, { throttle: 0.35, steer: 0, handbrake: false }, dt);
        return car.leaving > 0 && distance(car.x, car.y, player.x, player.y) < 560;
      });
      return { nearest: Infinity, busted: false };
    }
    while (this.cars.length < targetCount && this.spawnTimer <= 0) {
      this.spawnTimer = 1.6;
      this.spawn(city, player);
    }
    if (this.cars.length > targetCount) {
      this.cars.length = targetCount;
    }

    this.repathTimer -= dt;
    const needPath = this.repathTimer <= 0;
    if (needPath) this.repathTimer = 1.1;

    let nearest = Infinity;
    for (const car of this.cars) {
      if (car.health <= 0) continue;
      const d = distance(car.x, car.y, player.x, player.y);
      nearest = Math.min(nearest, d);
      if (needPath || !car.route || car.route.length === 0) {
        car.route = routeBetween(car.x, car.y, player.x, player.y);
        car.routeIndex = 0;
      }
      // Follow the road route until close, then drive straight at the player.
      let aim = { x: player.x, y: player.y };
      if (d > 190 && car.route && car.routeIndex < car.route.length) {
        aim = car.route[car.routeIndex];
        if (distance(car.x, car.y, aim.x, aim.y) < 46) car.routeIndex += 1;
      }
      const controls = steerToward(car, aim.x, aim.y, dt, {});
      // Police drive at their own cap, a touch faster than traffic.
      stepCar(city, car, controls, dt);
      if (particles && this.rng.chance(dt * 2)) {
        particles.spawn(car.x - Math.cos(car.angle) * 18, car.y - Math.sin(car.angle) * 18, 'spark');
      }
    }

    // The bust meter: an officer close to a slow, on-foot player fills it.
    const playerSpeed = Math.hypot(player.vx || 0, player.vy || 0);
    const closeOfficer = this.cars.some(
      (car) => car.health > 0 && distance(car.x, car.y, player.x, player.y) < POLICE.bustRange,
    );
    if (!player.inCar && closeOfficer && playerSpeed < 60 && wanted.stars > 0) {
      this.bustMeter += dt / POLICE.bustSeconds;
    } else {
      this.bustMeter = Math.max(0, this.bustMeter - dt * 1.6);
    }
    return { nearest, busted: this.bustMeter >= 1 };
  }

  spawn(city, player) {
    // Come from a road near the map edge, at least a few blocks away.
    const rng = this.rng;
    const side = rng.int(0, 3);
    let x;
    let y;
    if (side === 0) { x = 60; y = rng.range(100, 2800); }
    else if (side === 1) { x = 2900; y = rng.range(100, 2800); }
    else if (side === 2) { x = rng.range(100, 2400); y = 60; }
    else { x = rng.range(100, 2400); y = 2900; }
    if (distance(x, y, player.x, player.y) < 420) {
      x = player.x < 1500 ? 2900 : 60;
    }
    const car = makeCar(x, y, rng.range(0, Math.PI * 2), PALETTE.policeBody, 'police');
    car.driver = 'police';
    car.route = routeBetween(x, y, player.x, player.y);
    car.routeIndex = 0;
    this.cars.push(car);
  }

  reset() {
    this.cars = [];
    this.bustMeter = 0;
  }
}
