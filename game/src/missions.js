// The story of Marisol Heat, in five jobs for the fixer Madame Zara, plus the
// repeatable courier runs that keep the money coming after the story ends.
// A mission is a list of steps; each step is one drive-or-walk-to-the-marker
// objective with its own brief line, and some steps carry trouble: a timer,
// a wanted level the job itself stirs up, or a package that must survive.

export const GIVER = {
  name: 'Madame Zara',
  spot: { x: 290, y: 2760 }, // the boardwalk kiosk where every job begins
};

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    intro: 'Zara: "Nico. A client left a turquoise coupe at the North Docks. Bring it to me at the boardwalk — and try not to dent it."',
    reward: 150,
    steps: [
      { kind: 'goto', x: 300, y: 486, text: 'Pick up the coupe at the North Docks', radius: 54 },
      { kind: 'goto', x: 290, y: 2760, text: 'Deliver the coupe to Zara at the boardwalk', radius: 56, needsCar: true },
    ],
  },
  {
    id: 'hot-package',
    title: 'Hot Package',
    intro: 'Zara: "A parcel waits at Marina del Sol. Take it to the Hotel Azul, fast — the marina cameras know your face now."',
    reward: 300,
    steps: [
      { kind: 'goto', x: 2450, y: 2450, text: 'Pick up the parcel at Marina del Sol', radius: 54 },
      { kind: 'goto', x: 2180, y: 420, text: 'Deliver it to the Hotel Azul', radius: 56, crimeOnStart: 1 },
    ],
  },
  {
    id: 'beach-run',
    title: 'Beach Run',
    intro: 'Zara: "My racers marked the shore road. Hit every flare before the timer dies and the beach is yours."',
    reward: 250,
    steps: [
      { kind: 'checkpoints', points: [[2679, 400], [2679, 1000], [2679, 1600], [2679, 2200], [2620, 2760]], text: 'Hit the shore flares', radius: 62, timeLimit: 95 },
    ],
  },
  {
    id: 'the-drop',
    title: 'The Drop',
    intro: 'Zara: "That gold sedan outside Club Neon is evidence. Lose the police and leave it with Marisol Motors."',
    reward: 500,
    steps: [
      { kind: 'goto', x: 2180, y: 1740, text: 'Take the gold sedan at Club Neon', radius: 50 },
      { kind: 'escape', text: 'Lose the police', radius: 0, crimeOnStart: 2 },
      { kind: 'goto', x: 700, y: 2180, text: 'Drop the sedan at Marisol Motors', radius: 58, needsCar: true },
    ],
  },
  {
    id: 'final-score',
    title: 'The Final Score',
    intro: 'Zara: "Three cash bags, three rooftops\' worth of trouble. Collect them all and meet me where the shore ends."',
    reward: 1000,
    steps: [
      { kind: 'checkpoints', points: [[420, 420], [1400, 1400], [2180, 2180]], text: 'Collect the cash bags', radius: 58, crimeOnStart: 1 },
      { kind: 'goto', x: 2500, y: 290, text: 'Meet Zara at the north shore', radius: 60 },
    ],
  },
];

/** A repeatable free-roam courier job between two random landmarks. */
export function makeCourierJob(rng, landmarks, from) {
  const targets = landmarks.filter((lm) => !from || Math.hypot(lm.x - from.x, lm.y - from.y) > 700);
  const target = rng.pick(targets.length ? targets : landmarks);
  const distancePx = from ? Math.hypot(target.x - from.x, target.y - from.y) : 1200;
  return {
    id: 'courier',
    title: 'Courier Run',
    intro: `Zara: "One more parcel, this time for ${target.name}. The meter is running."`,
    reward: Math.round(60 + distancePx / 9),
    steps: [
      { kind: 'goto', x: target.x, y: target.y, text: `Deliver to ${target.name}`, radius: 58 },
    ],
  };
}

/**
 * Tracks the active mission: which step, how long the step has, whether its
 * checkpoints are falling. The game feeds it positions; it answers events.
 */
export class MissionRunner {
  constructor() {
    this.mission = null;
    this.completedMission = null;
    this.stepIndex = 0;
    this.checkpointIndex = 0;
    this.stepTime = 0;
    this.failed = false;
  }

  start(mission) {
    this.mission = mission;
    this.stepIndex = 0;
    this.checkpointIndex = 0;
    this.stepTime = 0;
    this.failed = false;
  }

  get step() {
    return this.mission ? this.mission.steps[this.stepIndex] : null;
  }

  get active() {
    return this.mission !== null;
  }

  /** The world point the HUD arrow and minimap should point at, if any. */
  target() {
    const step = this.step;
    if (!step) return null;
    if (step.kind === 'checkpoints') {
      const point = step.points[this.checkpointIndex];
      return point ? { x: point[0], y: point[1] } : null;
    }
    if (step.kind === 'escape') return null;
    return { x: step.x, y: step.y };
  }

  objectiveText() {
    const step = this.step;
    if (!step) return '';
    if (step.kind === 'checkpoints') {
      return `${step.text} (${this.checkpointIndex}/${step.points.length})`;
    }
    return step.text;
  }

  timeLeft() {
    const step = this.step;
    if (!step || !step.timeLimit) return null;
    return Math.max(0, step.timeLimit - this.stepTime);
  }

  /**
   * Advance. context: {x, y, inCar, wantedStars}.
   * Returns 'step' | 'complete' | 'failed' | 'crime' | null — 'crime' means
   * the step that just began stirs up the wanted level by crimeOnStart.
   */
  update(dt, context) {
    const step = this.step;
    if (!step) return null;
    this.stepTime += dt;

    if (step.timeLimit && this.stepTime > step.timeLimit) {
      this.failed = true;
      this.mission = null;
      return 'failed';
    }

    if (step.kind === 'escape') {
      if (context.wantedStars === 0) return this.advance();
      return null;
    }

    const target = this.target();
    if (!target) return null;
    const d = Math.hypot(context.x - target.x, context.y - target.y);
    if (d > step.radius) return null;
    if (step.needsCar && !context.inCar) return null;

    if (step.kind === 'checkpoints') {
      this.checkpointIndex += 1;
      if (this.checkpointIndex >= step.points.length) return this.advance();
      return 'checkpoint';
    }
    return this.advance();
  }

  advance() {
    this.stepIndex += 1;
    this.checkpointIndex = 0;
    this.stepTime = 0;
    if (this.stepIndex >= this.mission.steps.length) {
      this.completedMission = this.mission;
      this.mission = null;
      return 'complete';
    }
    const next = this.step;
    if (next && next.crimeOnStart) return 'crime';
    return 'step';
  }

  abandon() {
    this.mission = null;
    this.failed = false;
  }
}
