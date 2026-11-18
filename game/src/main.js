// Marisol Heat: an open-world crime game in one small city on a bay.
// This module is the conductor — it owns the game state (title, play, pause,
// busted, wasted), runs the fixed-step loop, feeds input to the player, the
// traffic, the crowds and the police, turns their collisions into crime and
// cash, and hands every frame to the renderer.

import { SoundEngine } from './audio.js';
import { generateCity, groundAt } from './city.js';
import { PLAYER, POLICE, WORLD_SIZE } from './config.js';
import { Input } from './input.js';
import { GIVER, MISSIONS, MissionRunner, makeCourierJob } from './missions.js';
import { Particles } from './particles.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Police, WantedSystem } from './police.js';
import { makeRng, clamp, distance } from './random.js';
import { Renderer, SCREEN_BUSTED, SCREEN_PAUSE, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { clearSave, loadSave, storeSave } from './save.js';
import { stageShot } from './shots.js';
import { Traffic } from './traffic.js';
import { collideCars, makeCar, stepCar } from './vehicles.js';

const CITY_SEED = 20261117;
const STEP = 1 / 60;

class Game {
  constructor(canvas) {
    const query = new URLSearchParams(window.location.search);
    this.seed = Number(query.get('seed') || 1) || 1;
    this.rng = makeRng(9000 + this.seed);
    this.city = generateCity(CITY_SEED);
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.sound = new SoundEngine();
    this.particles = new Particles();
    this.missions = new MissionRunner();
    this.wanted = new WantedSystem();
    this.police = new Police(this.rng);
    this.giverSpot = GIVER.spot;

    this.state = SCREEN_TITLE;
    this.time = 0;
    this.accumulator = 0;
    this.lastStamp = 0;
    this.frozen = false;
    this.banner = null;
    this.crimeCooldown = 0;
    this.hurtCooldown = 0;
    this.missionCar = null;
    this.nearestPolice = Infinity;
    this.nearCar = null;

    const save = loadSave();
    this.hasSave = save !== null;
    this.savedRun = save;
    this.resetRun(save);
    this.traffic = new Traffic(this.city, makeRng(4000 + this.seed));
    this.pedestrians = new Pedestrians(makeRng(7000 + this.seed));

    const shot = query.get('shot');
    if (shot) {
      stageShot(this, shot);
      this.frozen = true;
    }
    window.__shotReady = false;
    window.__marisol = this; // a handle for the maker's own play-tests

    const unlock = () => this.sound.unlock();
    window.addEventListener('keydown', unlock);
    window.addEventListener('mousedown', unlock);
    requestAnimationFrame((stamp) => this.frame(stamp));
  }

  resetRun(save) {
    this.cash = save ? save.cash : 50;
    this.missionIndex = save ? save.missionIndex : 0;
    this.jobsDone = save ? save.jobsDone : 0;
    this.storyDone = save ? Boolean(save.storyDone) : false;
    this.player = new Player(this.giverSpot.x - 60, this.giverSpot.y - 40);
    this.wanted.clear();
    this.police.reset();
    this.missions.abandon();
    this.missionCar = null;
  }

  persist() {
    storeSave({
      cash: this.cash,
      missionIndex: this.missionIndex,
      jobsDone: this.jobsDone,
      storyDone: this.storyDone,
    });
    this.hasSave = true;
  }

  get objectiveText() {
    if (this.missions.active) return this.missions.objectiveText();
    if (this.storyDone) return 'Free roam — see Zara at the boardwalk for courier work';
    return 'See Madame Zara at the boardwalk, south-west shore';
  }

  get missionTitle() {
    if (!this.missions.active) return '';
    return `${this.missions.mission.title} · $${this.missions.mission.reward}`;
  }

  get showHints() {
    return this.jobsDone === 0;
  }

  frame(stamp) {
    requestAnimationFrame((next) => this.frame(next));
    const dt = Math.min(0.1, (stamp - this.lastStamp) / 1000 || 0);
    this.lastStamp = stamp;
    if (!this.frozen) {
      this.accumulator += dt;
      while (this.accumulator >= STEP) {
        this.update(STEP);
        this.accumulator -= STEP;
      }
    }
    this.renderer.render(this);
    window.__shotReady = true;
    this.input.endFrame();
  }

  update(dt) {
    this.time += dt;
    if (this.banner) {
      this.banner.age += dt;
      if (this.banner.age >= this.banner.duration) this.banner = null;
    }
    if (this.input.justPressed('KeyM')) this.sound.toggleMute();

    if (this.state === SCREEN_TITLE) {
      this.renderer.camX = 1750 + Math.sin(this.time * 0.07) * 560;
      this.renderer.camY = 1500 + Math.cos(this.time * 0.05) * 420;
      this.traffic.update(this.city, dt, null, this.particles);
      this.pedestrians.update(dt, []);
      this.particles.update(dt);
      if (this.input.justPressed('Enter')) this.startPlay(false);
      if (this.input.justPressed('KeyN')) {
        clearSave();
        this.hasSave = false;
        this.startPlay(true);
      }
      return;
    }
    if (this.state === SCREEN_BUSTED || this.state === SCREEN_WASTED) {
      this.particles.update(dt);
      if (this.input.justPressed('KeyR', 'Enter')) this.respawnAfterEnd();
      return;
    }
    if (this.input.justPressed('KeyP', 'Escape')) {
      this.state = this.state === SCREEN_PAUSE ? SCREEN_PLAY : SCREEN_PAUSE;
    }
    if (this.state === SCREEN_PAUSE) return;

    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    this.updatePlayer(dt);
    this.traffic.update(this.city, dt, this.player.inCar, this.particles);
    this.updateCarCollisions(dt);
    this.updatePedestrians(dt);
    const policeResult = this.police.update(this.city, dt, this.player, this.wanted, this.particles);
    this.nearestPolice = policeResult.nearest;
    this.wanted.update(dt, this.nearestPolice < POLICE.sightRange);
    this.updateMissions(dt);
    this.particles.update(dt);
    this.updateAudio(dt);

    if (policeResult.busted) return this.endRun(SCREEN_BUSTED);
    if (this.player.health <= 0) return this.endRun(SCREEN_WASTED);
    if (this.wanted.stars === 0) this.player.heal(dt);
    this.renderer.follow(this.player.inCar || this.player, dt);
    return undefined;
  }

  startPlay(fresh) {
    if (fresh) this.resetRun(null);
    else if (this.savedRun) this.resetRun(this.savedRun);
    this.traffic = new Traffic(this.city, makeRng(4000 + this.seed));
    this.pedestrians = new Pedestrians(makeRng(7000 + this.seed));
    this.state = SCREEN_PLAY;
    this.syncCamera();
    this.showBanner('PORT MARISOL', ['Your patch of shore, Nico. Zara pays cash and asks nothing.'], '#37e0d8', 4.2);
  }

  respawnAfterEnd() {
    const wasBusted = this.state === SCREEN_BUSTED;
    const fine = wasBusted ? Math.min(this.cash, 150 + Math.floor(this.cash * 0.12)) : Math.floor(this.cash * 0.1);
    this.cash = Math.max(0, this.cash - fine);
    this.wanted.clear();
    this.police.reset();
    this.missions.abandon();
    this.missionCar = null;
    const spot = wasBusted ? { x: 1330, y: 1290 } : { x: 2080, y: 470 };
    this.player.respawn(spot.x, spot.y);
    this.state = SCREEN_PLAY;
    this.persist();
    this.syncCamera();
  }

  endRun(state) {
    this.state = state;
    if (state === SCREEN_BUSTED) this.sound.busted();
    else this.sound.missionFailed();
    this.sound.setEngine(null);
    this.sound.setSiren(0, 0);
  }

  updatePlayer(dt) {
    const player = this.player;
    const input = this.input;
    if (player.inCar) {
      const car = player.inCar;
      const controls = {
        throttle: (input.down('KeyW', 'ArrowUp') ? 1 : 0) - (input.down('KeyS', 'ArrowDown') ? 1 : 0),
        steer: (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0),
        handbrake: input.down('Space'),
      };
      const impact = stepCar(this.city, car, controls, dt);
      if (impact > 150) {
        this.sound.crash(Math.min(1, impact / 320));
        this.particles.burst(car.x, car.y, 'spark', 6, 90);
        if (impact > 265) player.hurt((impact - 265) * 0.06);
      }
      if (Math.abs(car.speed) > 130 && groundAt(car.x, car.y) === 'sand') {
        this.particles.spawn(car.x - Math.cos(car.angle) * 18, car.y - Math.sin(car.angle) * 18, 'dust');
      }
      if (car.health < 45 && this.rng.chance(dt * 7)) {
        this.particles.spawn(car.x, car.y - 8, 'smoke');
      }
      this.syncPlayerToCar();
      if (input.justPressed('KeyF')) {
        player.exitCar();
        this.sound.doorSlam();
      }
      return;
    }
    const axes = input.axes();
    player.updateOnFoot(this.city, dt, axes, input.down('ShiftLeft', 'ShiftRight'));
    this.nearCar = player.carInReach([...this.traffic.cars, ...this.police.cars]);
    if (input.justPressed('KeyF') && this.nearCar) {
      const car = this.nearCar;
      if (Math.abs(car.speed) < 40) {
        const result = player.enterCar(car);
        this.sound.doorSlam();
        // Zara's own job cars are handed over, not stolen; any other car is.
        if (result === 'stolen' && car !== this.missionCar) this.commitCrime(1);
      }
    }
    if (input.justPressed('KeyJ') || input.mouseClicked) {
      const arc = player.punch();
      if (arc) {
        this.sound.punch();
        for (const ped of this.pedestrians.list) {
          if (ped.down <= 0 && distance(ped.x, ped.y, arc.x, arc.y) < arc.range) {
            this.pedestrians.knockDown(ped);
            this.particles.burst(ped.x, ped.y - 6, 'spark', 4, 60);
            this.commitCrime(1);
          }
        }
      }
    }
  }

  updateCarCollisions(dt) {
    void dt;
    const cars = [...this.traffic.cars, ...this.police.cars];
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        if (Math.abs(a.x - b.x) > 60 || Math.abs(a.y - b.y) > 60) continue;
        const impact = collideCars(a, b);
        if (impact > 130) {
          const involvesPlayer = a.driver === 'player' || b.driver === 'player';
          if (involvesPlayer) {
            this.sound.crash(Math.min(1, impact / 330));
            this.particles.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 'spark', 7, 110);
            if (impact > 215) this.commitCrime(1);
          }
        }
      }
    }
    // Cars versus the player on foot: getting run down hurts.
    if (!this.player.inCar && this.hurtCooldown <= 0) {
      for (const car of cars) {
        if (Math.abs(car.speed) < 55) continue;
        if (distance(car.x, car.y, this.player.x, this.player.y) < 27) {
          this.player.hurt(car.kind === 'police' ? 20 : 14);
          const away = Math.atan2(this.player.y - car.y, this.player.x - car.x);
          this.player.vx = Math.cos(away) * 260;
          this.player.vy = Math.sin(away) * 260;
          this.hurtCooldown = 0.9;
          this.sound.crash(0.4);
          break;
        }
      }
    }
  }

  updatePedestrians(dt) {
    const threats = [];
    for (const car of [...this.traffic.cars, ...this.police.cars]) {
      threats.push({ x: car.x, y: car.y, fast: Math.abs(car.speed) > 34, car });
    }
    if (this.player.punchTimer > 0) {
      threats.push({ x: this.player.x, y: this.player.y, fast: true, car: null });
    }
    const events = this.pedestrians.update(dt, threats);
    for (const ped of events.hit) {
      this.sound.crash(0.35);
      const culprit = this.player.inCar;
      if (culprit && distance(ped.x, ped.y, culprit.x, culprit.y) < 40) {
        this.commitCrime(2);
        this.player.hurt(2);
      }
    }
  }

  updateMissions(dt) {
    const runner = this.missions;
    if (!runner.active) {
      // Standing at Zara's kiosk starts the next job (with a breath after
      // the last one, so its banner can be read first).
      this.giverCooldown = Math.max(0, (this.giverCooldown || 0) - dt);
      if (this.giverCooldown <= 0
        && distance(this.player.x, this.player.y, this.giverSpot.x, this.giverSpot.y) < 52) {
        this.beginNextMission();
      }
      return;
    }
    this.giverCooldown = Math.max(0, (this.giverCooldown || 0) - dt);
    const event = runner.update(dt, {
      x: this.player.x,
      y: this.player.y,
      inCar: Boolean(this.player.inCar),
      wantedStars: this.wanted.stars,
    });
    if (!event) return;
    if (event === 'checkpoint') {
      this.sound.pickup();
      const target = runner.target();
      if (target) this.particles.burst(target.x, target.y, 'sparkle', 8, 50);
      if (runner.checkpointIndex === 1 && runner.step && runner.step.crimeOnStart) {
        this.wanted.commitCrime(runner.step.crimeOnStart);
      }
    } else if (event === 'step') {
      this.sound.pickup();
    } else if (event === 'crime') {
      this.sound.pickup();
      if (runner.step && runner.step.crimeOnStart) this.wanted.commitCrime(runner.step.crimeOnStart);
    } else if (event === 'complete') {
      const mission = runner.completedMission;
      this.cash += mission ? mission.reward : 0;
      this.jobsDone += 1;
      if (mission && mission.id !== 'courier') {
        this.missionIndex = Math.min(MISSIONS.length, this.missionIndex + 1);
        if (mission.id === 'final-score') this.storyDone = true;
      }
      this.sound.missionComplete();
      this.showBanner(
        'JOB DONE',
        [`${mission ? mission.title : 'Courier Run'} complete — $${mission ? mission.reward : 0} in your pocket.`],
        '#ffc94d',
        4,
      );
      if (this.storyDone && mission && mission.id === 'final-score') {
        this.showBanner('STORY COMPLETE', ['Zara: "The shore is yours now, Nico. Courier work whenever you want it."'], '#ff5da2', 6);
      }
      this.missionCar = null;
      this.giverCooldown = 2.6;
      this.persist();
    } else if (event === 'failed') {
      this.sound.missionFailed();
      this.showBanner('JOB FAILED', ['Out of time. Zara shrugs — the job will still be there.'], '#ff5d5d', 3.6);
      this.missionCar = null;
      this.giverCooldown = 2.6;
    }
  }

  beginNextMission() {
    let mission;
    if (this.missionIndex < MISSIONS.length) {
      mission = MISSIONS[this.missionIndex];
    } else {
      mission = makeCourierJob(this.rng, this.city.landmarks, this.player);
    }
    this.missions.start(mission);
    // Story jobs with a named car get that car, parked where the brief says.
    if (mission.id === 'first-wheels') {
      this.missionCar = makeCar(300, 486, Math.PI / 2, '#2ec4b6', 'parked');
      this.traffic.cars.push(this.missionCar);
    } else if (mission.id === 'the-drop') {
      this.missionCar = makeCar(2180, 1752, -Math.PI / 2, '#f7d154', 'parked');
      this.traffic.cars.push(this.missionCar);
    }
    this.sound.cashRegister();
    this.showBanner(mission.title.toUpperCase(), wrapText(mission.intro, 74), '#37e0d8', 6.5);
  }

  commitCrime(severity) {
    if (severity <= 0 || this.crimeCooldown > 0) return;
    this.wanted.commitCrime(severity);
    this.crimeCooldown = 1.4;
  }

  updateAudio(dt) {
    const car = this.player.inCar;
    this.sound.setEngine(car ? Math.abs(car.speed) / 355 : null);
    const closeness = this.nearestPolice === Infinity ? 0 : clamp(1 - this.nearestPolice / 620, 0, 1);
    this.sound.setSiren(this.wanted.stars > 0 ? closeness : 0, this.time);
    this.sound.updateMusic(dt, this.state === SCREEN_PLAY);
  }

  showBanner(title, lines, color, duration) {
    this.banner = { title, lines, color, age: 0, duration };
  }

  syncCamera() {
    this.renderer.camX = clamp(this.player.x, 0, WORLD_SIZE);
    this.renderer.camY = clamp(this.player.y, 0, WORLD_SIZE);
  }

  syncPlayerToCar() {
    const car = this.player.inCar;
    if (!car) return;
    this.player.x = car.x;
    this.player.y = car.y;
    this.player.vx = car.vx;
    this.player.vy = car.vy;
  }
}

function wrapText(text, width) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

const canvas = document.getElementById('game');
new Game(canvas);
