// The player on foot: Nico, a courier with quick feet and quicker hands.
// Walks and runs in eight directions, throws a punch that drops a pedestrian
// (a crime, if anyone's counting), and gets in and out of cars. In a car the
// vehicle module owns the motion and this module just remembers whose it is.

import { PLAYER } from './config.js';
import { collideCircle } from './city.js';
import { clamp, distance } from './random.js';

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2;
    this.health = PLAYER.health;
    this.inCar = null; // the car object being driven, or null
    this.lastCar = null; // the car most recently driven (yours, no second theft)
    this.punchTimer = 0;
    this.punchCooldown = 0;
    this.walkPhase = 0;
    this.hurtFlash = 0;
  }

  get speedNow() {
    return Math.hypot(this.vx, this.vy);
  }

  /** Move on foot. axes: {x, y} from input; run: sprint held. */
  updateOnFoot(city, dt, axes, run) {
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const len = Math.hypot(axes.x, axes.y) || 1;
    const targetVx = (axes.x / len) * speed * (axes.x || axes.y ? 1 : 0);
    const targetVy = (axes.y / len) * speed * (axes.x || axes.y ? 1 : 0);
    const blend = Math.min(1, dt * 14);
    this.vx += (targetVx - this.vx) * blend;
    this.vy += (targetVy - this.vy) * blend;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (axes.x || axes.y) this.angle = Math.atan2(axes.y, axes.x);
    this.walkPhase += this.speedNow * dt * 0.055;
    collideCircle(city, this, PLAYER.radius);
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.4);
  }

  /** Throw a punch; returns the arc centre for the game to test hits against. */
  punch() {
    if (this.punchCooldown > 0 || this.inCar) return null;
    this.punchCooldown = 0.38;
    this.punchTimer = 0.18;
    return {
      x: this.x + Math.cos(this.angle) * PLAYER.punchRange,
      y: this.y + Math.sin(this.angle) * PLAYER.punchRange,
      range: 24,
    };
  }

  /** The nearest car the player could get into, or null. */
  carInReach(cars) {
    let best = null;
    let bestDist = 44;
    for (const car of cars) {
      if (car.driver === 'police' || car.health <= 0) continue;
      const d = distance(this.x, this.y, car.x, car.y);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  /** Get into a car. Returns 'stolen' when it was not already the player's. */
  enterCar(car) {
    const wasMine = this.lastCar === car;
    this.inCar = car;
    this.lastCar = car;
    car.driver = 'player';
    car.kind = car.kind === 'police' ? 'traffic' : car.kind;
    return wasMine ? 'mine' : 'stolen';
  }

  /** Get out, stepping to the car's left side. */
  exitCar() {
    const car = this.inCar;
    if (!car) return;
    const sideX = Math.cos(car.angle - Math.PI / 2);
    const sideY = Math.sin(car.angle - Math.PI / 2);
    this.x = car.x + sideX * 30;
    this.y = car.y + sideY * 30;
    this.vx = car.vx * 0.3;
    this.vy = car.vy * 0.3;
    car.driver = null;
    this.inCar = null;
  }

  hurt(amount) {
    this.health = clamp(this.health - amount, 0, PLAYER.health);
    this.hurtFlash = 1;
  }

  heal(dt) {
    this.health = clamp(this.health + dt * 2.2, 0, PLAYER.health);
  }

  respawn(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.health = PLAYER.health;
    this.inCar = null;
  }
}
