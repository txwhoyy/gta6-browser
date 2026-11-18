// A tiny particle pool for the life of the street: exhaust and wreck smoke,
// crash sparks, skid dust on the sand, and the golden sparkle of a pickup.
// Particles are plain data; the renderer draws them, this module only ages
// them, so effects never cost the simulation anything when idle.

const KINDS = {
  smoke: { life: 1.15, rise: -26, grow: 9, drag: 0.4 },
  spark: { life: 0.4, rise: 30, grow: -2, drag: 2.2 },
  dust: { life: 0.6, rise: -8, grow: 6, drag: 1.4 },
  sparkle: { life: 0.7, rise: -44, grow: 0, drag: 0.6 },
  ring: { life: 0.45, rise: 0, grow: 90, drag: 0 },
};

export class Particles {
  constructor() {
    this.list = [];
  }

  spawn(x, y, kind, vx, vy) {
    if (this.list.length > 420) this.list.shift();
    this.list.push({
      x,
      y,
      vx: vx || 0,
      vy: vy || 0,
      kind,
      age: 0,
      life: KINDS[kind].life,
      seed: Math.random() * 10,
    });
  }

  burst(x, y, kind, count, speed) {
    for (let n = 0; n < count; n += 1) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.spawn(x, y, kind, Math.cos(angle) * v, Math.sin(angle) * v);
    }
  }

  update(dt) {
    for (const p of this.list) {
      const spec = KINDS[p.kind];
      p.age += dt;
      p.vy += spec.rise * dt;
      p.vx -= p.vx * spec.drag * dt;
      p.vy -= p.vy * spec.drag * dt * 0.4;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.list = this.list.filter((p) => p.age < p.life);
  }

  /** Radius and fade of a particle, for the renderer. */
  static shape(p) {
    const spec = KINDS[p.kind];
    const t = p.age / p.life;
    return { radius: Math.max(1, 3 + spec.grow * p.age), alpha: (1 - t) * 0.55, t };
  }
}
