// Staged scenes for the entry's screenshots, reached with ?shot=<name>&seed=<n>.
// Each scene builds the real game state — a live mission, real traffic, real
// police — and freezes it, so a screenshot is an honest frame of the game as
// it plays, never a mock-up. The scenes are: title, foot, drive, chase.

import { PALETTE } from './config.js';
import { MISSIONS } from './missions.js';
import { makeCar } from './vehicles.js';

export function stageShot(game, name) {
  game.frozen = true;
  if (name === 'foot') return stageFoot(game);
  if (name === 'drive') return stageDrive(game);
  if (name === 'chase') return stageChase(game);
  return stageTitle(game);
}

function stageTitle(game) {
  game.state = 'title';
  game.renderer.camX = 1980;
  game.renderer.camY = 1560;
  game.time = 2.4;
}

function stageFoot(game) {
  game.state = 'play';
  game.cash = 250;
  game.missions.start(MISSIONS[0]);
  game.player.x = 1330;
  game.player.y = 1520;
  game.player.angle = -0.7;
  game.syncCamera();
  game.time = 3.1;
}

function stageDrive(game) {
  game.state = 'play';
  game.cash = 900;
  game.jobsDone = 2;
  const mission = MISSIONS[2];
  game.missions.start(mission);
  game.missions.checkpointIndex = 1;
  const car = makeCar(2679, 1980, -Math.PI / 2, '#e94f64', 'traffic');
  car.vy = -268;
  car.speed = 268;
  game.traffic.cars.push(car);
  game.player.enterCar(car);
  game.syncPlayerToCar();
  game.syncCamera();
  game.time = 4.2;
}

function stageChase(game) {
  game.state = 'play';
  game.cash = 1450;
  game.jobsDone = 3;
  game.missions.start(MISSIONS[3]);
  game.missions.stepIndex = 1; // the escape step, sirens already earned
  game.wanted.stars = 3;
  game.wanted.heat = 0;
  const sedan = makeCar(1900, 1623, Math.PI, '#f7d154', 'traffic');
  sedan.vx = -252;
  sedan.speed = 252;
  game.traffic.cars.push(sedan);
  game.player.enterCar(sedan);
  const copA = makeCar(2075, 1605, Math.PI, PALETTE.policeBody, 'police');
  copA.driver = 'police';
  copA.vx = -238;
  const copB = makeCar(2170, 1648, Math.PI, PALETTE.policeBody, 'police');
  copB.driver = 'police';
  copB.vx = -226;
  game.police.cars.push(copA, copB);
  game.syncPlayerToCar();
  game.syncCamera();
  game.time = 5.6;
}
