// Car physics shared by the player's car, traffic and the police: an arcade
// model with a heading, a signed speed along it, steering that bites harder
// the faster you go, a handbrake that loosens the rear, and a health pool
// that crashes eat into. Cars are circles for collision, which keeps city
// impacts cheap and predictable.

import { CAR } from './config.js';
import { collideCircle } from './city.js';
import { angleDelta, clamp } from './random.js';

let nextCarId = 1;

export function makeCar(x, y, angle, color, kind) {
  const car = {
    id: nextCarId,
    x,
    y,
    vx: 0,
    vy: 0,
    angle,
    speed: 0,
    color,
    kind, // 'traffic' | 'parked' | 'police'
    health: CAR.health,
    driver: null, // 'player' | 'traffic' | 'police' | null
    stolen: false,
    smoke: 0,
  };
  nextCarId += 1;
  return car;
}

/**
 * Advance one car by dt. controls: {throttle -1..1, steer -1..1, handbrake}.
 * Returns the hardest impact speed this step (for damage and sound).
 */
export function stepCar(city, car, controls, dt) {
  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  const along = car.vx * forwardX + car.vy * forwardY;

  if (controls.throttle > 0) {
    const room = Math.max(0, CAR.maxSpeed - along);
    car.vx += forwardX * Math.min(CAR.accel * dt, room * dt * 3);
    car.vy += forwardY * Math.min(CAR.accel * dt, room * dt * 3);
  } else if (controls.throttle < 0) {
    if (along > 12) {
      car.vx -= forwardX * CAR.brake * dt;
      car.vy -= forwardY * CAR.brake * dt;
    } else {
      const room = Math.max(0, CAR.maxReverse + along);
      car.vx -= forwardX * Math.min(CAR.accel * 0.6 * dt, room * dt * 3);
      car.vy -= forwardY * Math.min(CAR.accel * 0.6 * dt, room * dt * 3);
    }
  }

  // Rolling drag and lateral grip: velocity sideways to the heading dies fast
  // unless the handbrake is held, which is what makes drifts possible.
  const sideX = -forwardY;
  const sideY = forwardX;
  let sideSpeed = car.vx * sideX + car.vy * sideY;
  const grip = controls.handbrake ? 2.2 : 11;
  sideSpeed -= sideSpeed * Math.min(1, grip * dt);
  let alongSpeed = car.vx * forwardX + car.vy * forwardY;
  alongSpeed -= alongSpeed * CAR.drag * dt * (controls.throttle !== 0 ? 0.35 : 1);
  car.vx = forwardX * alongSpeed + sideX * sideSpeed;
  car.vy = forwardY * alongSpeed + sideY * sideSpeed;

  const steerAuthority = clamp(Math.abs(alongSpeed) / 60, 0, 1) * (alongSpeed < 0 ? -1 : 1);
  car.angle += controls.steer * CAR.gripTurn * steerAuthority * dt * (controls.handbrake ? 1.35 : 1);

  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speed = alongSpeed;

  const impact = collideCircle(city, car, CAR.radius);
  if (impact > 130) {
    car.health = Math.max(0, car.health - (impact - 120) * 0.09);
  }
  car.smoke = car.health < 45 ? Math.min(1, car.smoke + dt * 2) : Math.max(0, car.smoke - dt);
  return impact;
}

/** Circle push-apart between two cars; returns impact speed along the join. */
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const min = CAR.radius * 2 - 2;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const overlap = (min - d) / 2;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;
  const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (relative < 0) {
    const impulse = -relative * 0.72;
    a.vx -= nx * impulse;
    a.vy -= ny * impulse;
    b.vx += nx * impulse;
    b.vy += ny * impulse;
    const damage = Math.max(0, (-relative - 110) * 0.07);
    a.health = Math.max(0, a.health - damage);
    b.health = Math.max(0, b.health - damage);
    return -relative;
  }
  return 0;
}

/** Steer a car toward a point: returns controls for stepCar. */
export function steerToward(car, targetX, targetY, dt, opts) {
  const options = opts || {};
  const want = Math.atan2(targetY - car.y, targetX - car.x);
  const delta = angleDelta(car.angle, want);
  const steer = clamp(delta * 2.4, -1, 1);
  const dist = Math.hypot(targetX - car.x, targetY - car.y);
  let throttle = 1;
  if (Math.abs(delta) > 2.2) throttle = -0.6; // badly turned around: back up
  else if (Math.abs(delta) > 1.1) throttle = 0.35;
  if (options.slowNear && dist < 90) throttle = Math.min(throttle, 0.25);
  if (options.stopAt && dist < 26) throttle = along(car) > 8 ? -0.7 : 0;
  return { throttle, steer, handbrake: Math.abs(delta) > 1.5 && Math.abs(car.speed) > 150 };
}

function along(car) {
  return car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
}

export function carIsWrecked(car) {
  return car.health <= 0;
}
