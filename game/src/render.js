// Everything the player sees: the sunlit city from above with its neon trim,
// the cars and crowds, and the HUD — cash, wanted stars, health, the mission
// objective with its guiding arrow, and the minimap. Screens (title, pause,
// busted, wasted) are drawn here too, over the world, so a screenshot of any
// moment shows the whole game at once.

import { BEACH, CAR, GRID, PALETTE, VIEW_HEIGHT, VIEW_WIDTH, WORLD_SIZE } from './config.js';
import { blockRect, groundAt, roadCenterX, roadCenterY } from './city.js';
import { clamp, lerp } from './random.js';
import { Particles } from './particles.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camX = WORLD_SIZE / 2;
    this.camY = WORLD_SIZE / 2;
    this.time = 0;
  }

  /** Camera follows the target, leaning into its velocity. */
  follow(target, dt) {
    const lookX = target.x + (target.vx || 0) * 0.42;
    const lookY = target.y + (target.vy || 0) * 0.42;
    const blend = Math.min(1, dt * 4.2);
    this.camX += (lookX - this.camX) * blend;
    this.camY += (lookY - this.camY) * blend;
    const halfW = VIEW_WIDTH / 2;
    const halfH = VIEW_HEIGHT / 2;
    this.camX = clamp(this.camX, halfW - 200, WORLD_SIZE - halfW + 420);
    this.camY = clamp(this.camY, halfH - 200, WORLD_SIZE - halfH + 200);
  }

  viewRect() {
    return {
      x: this.camX - VIEW_WIDTH / 2,
      y: this.camY - VIEW_HEIGHT / 2,
      w: VIEW_WIDTH,
      h: VIEW_HEIGHT,
    };
  }

  render(game) {
    const { ctx } = this;
    this.time = game.time;
    ctx.save();
    ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    this.drawWorld(game);
    this.drawEntities(game);
    ctx.restore();
    if (game.state === SCREEN_PLAY || game.state === SCREEN_PAUSE) this.drawHud(game);
    if (game.state === SCREEN_TITLE) this.drawTitle(game);
    if (game.state === SCREEN_PAUSE) this.drawPause(game);
    if (game.state === SCREEN_BUSTED) this.drawEndScreen(game, 'BUSTED', 'The Marisol PD made the collar stick.', '#3f8fd2');
    if (game.state === SCREEN_WASTED) this.drawEndScreen(game, 'WASTED', 'You woke up at St. Coral Hospital. The bill ate some cash.', '#e94f64');
    if (game.banner) this.drawBanner(game);
    if (game.player.hurtFlash > 0.05 && game.state === SCREEN_PLAY) {
      ctx.fillStyle = `rgba(233, 40, 60, ${game.player.hurtFlash * 0.18})`;
      ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    }
  }

  // ---------------------------------------------------------------- world

  drawWorld(game) {
    const { ctx } = this;
    const view = this.viewRect();
    ctx.translate(-view.x, -view.y);
    const city = game.city;

    // Base land, then sand, then the sea with slow moving shine lines.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(view.x - 40, view.y - 40, view.w + 80, view.h + 80);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(BEACH.sandStart, view.y - 40, BEACH.waterStart - BEACH.sandStart, view.h + 80);
    const waterGrad = ctx.createLinearGradient(BEACH.waterStart, 0, WORLD_SIZE + 200, 0);
    waterGrad.addColorStop(0, PALETTE.water);
    waterGrad.addColorStop(1, PALETTE.waterDeep);
    ctx.fillStyle = waterGrad;
    ctx.fillRect(BEACH.waterStart, view.y - 40, WORLD_SIZE - BEACH.waterStart + 480, view.h + 80);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let n = 0; n < 7; n += 1) {
      const y = view.y - (view.y % 90) + n * 90 + Math.sin(this.time * 0.7 + n) * 4;
      const x = BEACH.waterStart + 26 + ((n * 67) % 120);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 54, y);
    }
    ctx.stroke();
    // Foam line where the sea meets the sand.
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(BEACH.waterStart + Math.sin(this.time * 0.9) * 3, view.y - 40);
    ctx.lineTo(BEACH.waterStart + Math.cos(this.time * 0.8) * 3, view.y + view.h + 40);
    ctx.stroke();

    this.drawRoads(view);
    this.drawBlocks(game, view);

    // The mission beacon, tall enough to spot across town.
    const target = game.missions.target();
    if (target && game.state !== SCREEN_TITLE) this.drawBeacon(target.x, target.y);
    void city;
  }

  drawRoads(view) {
    const { ctx } = this;
    ctx.fillStyle = PALETTE.asphalt;
    for (let i = 0; i <= GRID.cols; i += 1) {
      const x = roadCenterX(i) - GRID.road / 2;
      if (x + GRID.road < view.x || x > view.x + view.w) continue;
      ctx.fillRect(x, view.y - 40, GRID.road, view.h + 80);
    }
    for (let j = 0; j <= GRID.rows; j += 1) {
      const y = roadCenterY(j) - GRID.road / 2;
      if (y + GRID.road < view.y || y > view.y + view.h) continue;
      ctx.fillRect(view.x - 40, y, view.w + 80, GRID.road);
    }
    // Centre dashes.
    ctx.strokeStyle = PALETTE.laneMark;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    ctx.beginPath();
    for (let i = 0; i <= GRID.cols; i += 1) {
      const x = roadCenterX(i);
      if (x < view.x - 20 || x > view.x + view.w + 20) continue;
      ctx.moveTo(x, view.y - 40);
      ctx.lineTo(x, view.y + view.h + 40);
    }
    for (let j = 0; j <= GRID.rows; j += 1) {
      const y = roadCenterY(j);
      if (y < view.y - 20 || y > view.y + view.h + 20) continue;
      ctx.moveTo(view.x - 40, y);
      ctx.lineTo(view.x + view.w + 40, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawBlocks(game, view) {
    const { ctx } = this;
    const city = game.city;
    // Sidewalk slabs under everything.
    ctx.fillStyle = PALETTE.sidewalk;
    for (let i = 0; i < GRID.cols; i += 1) {
      for (let j = 0; j < GRID.rows; j += 1) {
        const b = blockRect(i, j);
        if (!this.inView(b, view, 30)) continue;
        if (groundAt(b.x + b.w / 2, b.y + b.h / 2) !== 'land') continue;
        ctx.fillRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
      }
    }
    for (const park of city.parks) {
      if (!this.inView(park, view, 30)) continue;
      ctx.fillStyle = '#4c9450';
      ctx.fillRect(park.x, park.y, park.w, park.h);
      for (const palm of park.palms) this.drawPalm(palm.x, palm.y, palm.lean, palm.size);
    }
    for (const lot of city.lots) {
      if (!this.inView(lot, view, 30)) continue;
      ctx.fillStyle = '#55525e';
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      for (const spot of lot.spots) {
        ctx.save();
        ctx.translate(spot.x, spot.y);
        ctx.rotate(spot.angle);
        ctx.strokeRect(-11, -20, 22, 40);
        ctx.restore();
      }
    }
    const sorted = [...city.buildings].sort((a, b) => a.y - b.y);
    for (const building of sorted) {
      if (this.inView(building, view, 90)) this.drawBuilding(building);
    }
    // Landmark name plates.
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const lm of city.landmarks) {
      if (!this.inView(lm.rect, view, 90)) continue;
      ctx.fillStyle = 'rgba(16,10,24,0.55)';
      const w = ctx.measureText(lm.name).width + 16;
      ctx.fillRect(lm.x - w / 2, lm.rect.y - 30, w, 20);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(lm.name, lm.x, lm.rect.y - 16);
    }
    // Palms along the beach.
    ctx.fillStyle = PALETTE.palmLeaf;
    for (let y = 120; y < WORLD_SIZE - 60; y += 210) {
      this.drawPalm(BEACH.sandStart + 42, y + ((y * 7) % 60), 0.16, 1.15);
    }
  }

  drawBuilding(b) {
    const { ctx } = this;
    const lift = b.height;
    // Shadow, then the wall face, then the roof slab raised by the height.
    ctx.fillStyle = 'rgba(20, 12, 20, 0.28)';
    ctx.fillRect(b.x + 10, b.y + 14, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.style.trim;
    ctx.fillRect(b.x, b.y + b.h - 12, b.w, 12);
    ctx.fillStyle = b.style.roof;
    ctx.fillRect(b.x + 7, b.y + 7 - lift * 0.32, b.w - 14, b.h - 14);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 7, b.y + 7 - lift * 0.32, b.w - 14, b.h - 14);
    // Lit windows on the wall band.
    const rows = b.floors;
    const cols = b.windowsAcross;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const lit = b.lit[r * cols + c];
        ctx.fillStyle = lit ? 'rgba(255, 214, 120, 0.95)' : 'rgba(40, 44, 66, 0.55)';
        const wx = b.x + 10 + c * ((b.w - 20) / cols);
        const wy = b.y + b.h - 26 - r * ((b.h - 44) / Math.max(1, rows));
        if (wy < b.y + 8) continue;
        ctx.fillRect(wx, wy, 9, 7);
      }
    }
    if (b.kind !== 'block') {
      ctx.fillStyle = PALETTE.neonGold;
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.kind.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 - lift * 0.3);
    }
  }

  drawPalm(x, y, lean, size) {
    const { ctx } = this;
    ctx.strokeStyle = PALETTE.palmTrunk;
    ctx.lineWidth = 4 * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 20, y - 12 * size, x + lean * 34, y - 22 * size);
    ctx.stroke();
    const topX = x + lean * 34;
    const topY = y - 22 * size;
    ctx.strokeStyle = PALETTE.palmLeaf;
    ctx.lineWidth = 3 * size;
    for (let n = 0; n < 6; n += 1) {
      const a = (n / 6) * Math.PI * 2 + lean;
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(
        topX + Math.cos(a) * 13 * size,
        topY + Math.sin(a) * 8 * size - 4,
        topX + Math.cos(a) * 20 * size,
        topY + Math.sin(a) * 13 * size + 5,
      );
      ctx.stroke();
    }
  }

  drawBeacon(x, y) {
    const { ctx } = this;
    const pulse = 0.72 + Math.sin(this.time * 4.4) * 0.28;
    const grad = ctx.createLinearGradient(0, y - 340, 0, y);
    grad.addColorStop(0, 'rgba(255, 201, 77, 0)');
    grad.addColorStop(1, `rgba(255, 201, 77, ${0.5 * pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(x - 13, y - 340, 26, 340);
    ctx.strokeStyle = PALETTE.neonGold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y, 30 * pulse + 12, 13 * pulse + 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.neonGold;
    const bob = Math.sin(this.time * 3.2) * 5;
    ctx.beginPath();
    ctx.moveTo(x - 11, y - 66 + bob);
    ctx.lineTo(x + 11, y - 66 + bob);
    ctx.lineTo(x, y - 48 + bob);
    ctx.closePath();
    ctx.fill();
  }

  // -------------------------------------------------------------- entities

  drawEntities(game) {
    const { ctx } = this;
    const view = this.viewRect();
    void ctx;
    // Particles under the actors.
    this.drawParticles(game, view);
    for (const ped of game.pedestrians.list) {
      if (this.inView({ x: ped.x - 16, y: ped.y - 16, w: 32, h: 32 }, view, 10)) {
        this.drawPedestrian(ped);
      }
    }
    const cars = [...game.traffic.cars, ...game.police.cars];
    cars.sort((a, b) => a.y - b.y);
    for (const car of cars) {
      if (this.inView({ x: car.x - 40, y: car.y - 40, w: 80, h: 80 }, view, 10)) {
        this.drawCar(car, car.kind === 'police');
      }
    }
    if (!game.player.inCar) this.drawPlayer(game.player);
    // The giver marker at the boardwalk kiosk.
    if (!game.missions.active && game.state === SCREEN_PLAY) {
      this.drawBeacon(game.giverSpot.x, game.giverSpot.y);
    }
  }

  drawParticles(game, view) {
    const { ctx } = this;
    for (const p of game.particles.list) {
      if (p.x < view.x - 30 || p.x > view.x + view.w + 30 || p.y < view.y - 30 || p.y > view.y + view.h + 30) continue;
      const shape = Particles.shape(p);
      if (p.kind === 'smoke') ctx.fillStyle = `rgba(70, 66, 74, ${shape.alpha})`;
      else if (p.kind === 'spark') ctx.fillStyle = `rgba(255, 170, 60, ${shape.alpha + 0.2})`;
      else if (p.kind === 'dust') ctx.fillStyle = `rgba(232, 205, 150, ${shape.alpha})`;
      else if (p.kind === 'sparkle') ctx.fillStyle = `rgba(255, 215, 90, ${shape.alpha + 0.25})`;
      else ctx.strokeStyle = `rgba(255, 215, 90, ${shape.alpha})`;
      if (p.kind === 'ring') {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, shape.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, shape.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawCar(car, isPolice) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow and body.
    ctx.fillStyle = 'rgba(20, 12, 20, 0.3)';
    roundRect(ctx, -CAR.length / 2 + 3, -CAR.width / 2 + 5, CAR.length, CAR.width, 7);
    ctx.fill();
    ctx.fillStyle = car.color;
    roundRect(ctx, -CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (isPolice) {
      ctx.fillStyle = PALETTE.policeTrim;
      ctx.fillRect(-8, -CAR.width / 2 + 1, 17, CAR.width - 2);
      // Light bar: red and blue halves trading flashes.
      const flash = Math.sin(this.time * 11) > 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#7a1610';
      ctx.fillRect(-6, -8, 12, 7);
      ctx.fillStyle = flash ? '#1650c8' : '#3b82f6';
      ctx.fillRect(-6, 1, 12, 7);
    }
    // Cabin: windshield, roof, rear window.
    ctx.fillStyle = 'rgba(24, 30, 44, 0.88)';
    roundRect(ctx, 2, -CAR.width / 2 + 4, 9, CAR.width - 8, 3);
    ctx.fill();
    ctx.fillStyle = isPolice ? PALETTE.policeTrim : shade(car.color, -18);
    roundRect(ctx, -11, -CAR.width / 2 + 3.5, 13, CAR.width - 7, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(24, 30, 44, 0.75)';
    roundRect(ctx, -17, -CAR.width / 2 + 4.5, 5, CAR.width - 9, 2);
    ctx.fill();
    // Lights.
    ctx.fillStyle = '#fff6c9';
    ctx.fillRect(CAR.length / 2 - 3, -CAR.width / 2 + 3, 3, 5);
    ctx.fillRect(CAR.length / 2 - 3, CAR.width / 2 - 8, 3, 5);
    ctx.fillStyle = '#ff4040';
    ctx.fillRect(-CAR.length / 2, -CAR.width / 2 + 3, 3, 5);
    ctx.fillRect(-CAR.length / 2, CAR.width / 2 - 8, 3, 5);
    // Damage dents.
    if (car.health < 55) {
      ctx.fillStyle = 'rgba(30, 26, 30, 0.5)';
      ctx.beginPath();
      ctx.arc(8, -6, 5, 0, Math.PI * 2);
      ctx.arc(-13, 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawPedestrian(ped) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.down > 0) {
      ctx.rotate(Math.PI / 2.3);
      ctx.fillStyle = ped.shirt;
      roundRect(ctx, -11, -5, 22, 10, 5);
      ctx.fill();
      ctx.fillStyle = '#c98d64';
      ctx.beginPath();
      ctx.arc(14, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const step = Math.sin(ped.walkPhase) * 4;
    ctx.strokeStyle = '#33404f';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(step, 9);
    ctx.moveTo(0, 2);
    ctx.lineTo(-step, 9);
    ctx.stroke();
    ctx.fillStyle = ped.shirt;
    roundRect(ctx, -5.5, -6, 11, 11, 5);
    ctx.fill();
    ctx.fillStyle = '#c98d64';
    ctx.beginPath();
    ctx.arc(0, -8.5, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPlayer(player) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(player.x, player.y);
    // A soft ring so the player always reads at a glance.
    ctx.strokeStyle = 'rgba(255, 93, 143, 0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 3, 13, 0, Math.PI * 2);
    ctx.stroke();
    const step = Math.sin(player.walkPhase) * 4.4;
    ctx.strokeStyle = PALETTE.playerPants;
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(step, 10);
    ctx.moveTo(0, 2);
    ctx.lineTo(-step, 10);
    ctx.stroke();
    ctx.fillStyle = PALETTE.playerShirt;
    roundRect(ctx, -6, -7, 12, 12, 5);
    ctx.fill();
    // The punching arm.
    if (player.punchTimer > 0) {
      const reach = 13 + (0.18 - player.punchTimer) * 60;
      ctx.strokeStyle = PALETTE.skin;
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(Math.cos(player.angle) * reach, Math.sin(player.angle) * reach);
      ctx.stroke();
    }
    ctx.fillStyle = PALETTE.skin;
    ctx.beginPath();
    ctx.arc(0, -9.5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20304f';
    ctx.beginPath();
    ctx.arc(0, -11, 5, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------------ HUD

  drawHud(game) {
    const { ctx } = this;
    const player = game.player;
    this.drawMinimap(game);
    // Cash and wanted, top right.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.hudShade;
    roundRect(ctx, VIEW_WIDTH - 218, 14, 204, 66, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.neonGold;
    ctx.font = '700 27px system-ui, sans-serif';
    ctx.fillText(`$${game.cash.toLocaleString('en-US')}`, VIEW_WIDTH - 28, 50);
    this.drawStars(game.wanted.stars, VIEW_WIDTH - 28, 62);
    // Objective, top left.
    const objective = game.objectiveText;
    if (objective) {
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.hudShade;
      const w = Math.min(470, 26 + ctx.measureText(objective).width * 0.62 + 60);
      roundRect(ctx, 14, 14, Math.max(250, w), game.missionTitle ? 64 : 44, 10);
      ctx.fill();
      if (game.missionTitle) {
        ctx.fillStyle = PALETTE.neonCyan;
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.fillText(game.missionTitle.toUpperCase(), 28, 38);
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 15.5px system-ui, sans-serif';
      ctx.fillText(objective, 28, game.missionTitle ? 62 : 44);
      const timeLeft = game.missions.timeLeft();
      if (timeLeft !== null) {
        ctx.fillStyle = timeLeft < 15 ? '#ff5d5d' : PALETTE.neonGold;
        ctx.font = '700 17px system-ui, sans-serif';
        ctx.fillText(`${Math.ceil(timeLeft)}s`, 28, 88);
      }
      // Direction arrow at the player's screen position toward the target.
      const target = game.missions.target();
      if (target) this.drawTargetArrow(game, target);
    }
    // Lay-low hint while the heat cools.
    if (game.wanted.stars > 0 && game.wanted.heat > 11 && game.nearestPolice > 300) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.fillText('LAY LOW — the heat is cooling', VIEW_WIDTH / 2, 34);
    }
    // Bust meter.
    if (game.police.bustMeter > 0.02) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff4040';
      ctx.font = '800 21px system-ui, sans-serif';
      ctx.fillText('BUSTED?', VIEW_WIDTH / 2, 84);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(VIEW_WIDTH / 2 - 90, 92, 180, 9);
      ctx.fillStyle = '#ff4040';
      ctx.fillRect(VIEW_WIDTH / 2 - 90, 92, 180 * clamp(game.police.bustMeter, 0, 1), 9);
    }
    // Health and, when driving, speed and the car's health: bottom right.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.hudShade;
    roundRect(ctx, VIEW_WIDTH - 218, VIEW_HEIGHT - 86, 204, 72, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('HEALTH', VIEW_WIDTH - 202, VIEW_HEIGHT - 62);
    this.drawBar(VIEW_WIDTH - 202, VIEW_HEIGHT - 56, 120, 9, player.health / 100, '#57d977');
    if (player.inCar) {
      const kmh = Math.round(Math.abs(player.inCar.speed) * 0.62);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 25px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${kmh}`, VIEW_WIDTH - 30, VIEW_HEIGHT - 52);
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText('km/h', VIEW_WIDTH - 30, VIEW_HEIGHT - 36);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText('CAR', VIEW_WIDTH - 202, VIEW_HEIGHT - 30);
      this.drawBar(VIEW_WIDTH - 202, VIEW_HEIGHT - 24, 120, 8, player.inCar.health / 100, '#f7d154');
    } else if (game.nearCar) {
      ctx.fillStyle = PALETTE.neonCyan;
      ctx.font = '600 13.5px system-ui, sans-serif';
      ctx.fillText('Press F to drive', VIEW_WIDTH - 202, VIEW_HEIGHT - 28);
    }
    // Controls reminder, bottom centre, until the first mission is done.
    if (game.showHints) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.66)';
      ctx.font = '500 13px system-ui, sans-serif';
      ctx.fillText('WASD drive & walk · F enter/exit car · J or click punch · Shift run · P pause · M mute', VIEW_WIDTH / 2, VIEW_HEIGHT - 14);
    }
  }

  drawStars(stars, rightX, topY) {
    const { ctx } = this;
    for (let n = 0; n < 5; n += 1) {
      const cx = rightX - n * 24 - 10;
      const cy = topY + 10;
      ctx.fillStyle = n < stars ? PALETTE.neonGold : 'rgba(255,255,255,0.25)';
      star(ctx, cx, cy, 9);
    }
  }

  drawBar(x, y, w, h, ratio, color) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(ratio, 0, 1), h);
  }

  drawTargetArrow(game, target) {
    const { ctx } = this;
    const view = this.viewRect();
    const sx = target.x - view.x;
    const sy = target.y - view.y;
    if (sx > -20 && sx < VIEW_WIDTH + 20 && sy > -20 && sy < VIEW_HEIGHT + 20) return;
    const cx = clamp(sx, 44, VIEW_WIDTH - 44);
    const cy = clamp(sy, 110, VIEW_HEIGHT - 120);
    const angle = Math.atan2(sy - cy, sx - cx);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = PALETTE.neonGold;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-9, -10);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const dist = Math.round(Math.hypot(target.x - game.player.x, target.y - game.player.y) / 10);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${dist}m`, cx, cy + 26);
  }

  drawMinimap(game) {
    const { ctx } = this;
    const size = 178;
    const x0 = 14;
    const y0 = VIEW_HEIGHT - size - 14;
    const scale = size / WORLD_SIZE;
    ctx.fillStyle = 'rgba(24, 32, 40, 0.82)';
    roundRect(ctx, x0 - 4, y0 - 4, size + 8, size + 8, 10);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, size, size);
    ctx.clip();
    ctx.fillStyle = '#3f7a44';
    ctx.fillRect(x0, y0, size, size);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(x0 + BEACH.sandStart * scale, y0, (BEACH.waterStart - BEACH.sandStart) * scale, size);
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(x0 + BEACH.waterStart * scale, y0, (WORLD_SIZE - BEACH.waterStart) * scale + 20, size);
    ctx.strokeStyle = 'rgba(240, 240, 230, 0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= GRID.cols; i += 1) {
      const x = x0 + roadCenterX(i) * scale;
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + size);
    }
    for (let j = 0; j <= GRID.rows; j += 1) {
      const y = y0 + roadCenterY(j) * scale;
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + size, y);
    }
    ctx.stroke();
    const dot = (wx, wy, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x0 + wx * scale, y0 + wy * scale, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const lm of game.city.landmarks) dot(lm.x, lm.y, 'rgba(255,255,255,0.5)', 2);
    for (const car of game.police.cars) dot(car.x, car.y, Math.sin(this.time * 9) > 0 ? '#ff4040' : '#3b82f6', 3);
    const target = game.missions.target();
    if (target) dot(target.x, target.y, PALETTE.neonGold, 3.6 + Math.sin(this.time * 5) * 1.1);
    if (!game.missions.active) dot(game.giverSpot.x, game.giverSpot.y, PALETTE.neonPink, 3.4);
    // Player arrow.
    const px = x0 + game.player.x * scale;
    const py = y0 + game.player.y * scale;
    const heading = game.player.inCar ? game.player.inCar.angle : game.player.angle;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4.4, -4);
    ctx.lineTo(-4.4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 10.5px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PORT MARISOL', x0 + 4, y0 - 9);
  }

  // --------------------------------------------------------------- screens

  drawTitle(game) {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
    grad.addColorStop(0, 'rgba(30, 8, 44, 0.42)');
    grad.addColorStop(0.62, 'rgba(30, 8, 44, 0.18)');
    grad.addColorStop(1, 'rgba(16, 6, 26, 0.66)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.neonPink;
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.fillText('P O R T   M A R I S O L', VIEW_WIDTH / 2, 148);
    ctx.font = '900 96px system-ui, sans-serif';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(20, 4, 30, 0.65)';
    ctx.strokeText('MARISOL HEAT', VIEW_WIDTH / 2, 236);
    const titleGrad = ctx.createLinearGradient(0, 160, 0, 250);
    titleGrad.addColorStop(0, '#ffe259');
    titleGrad.addColorStop(0.55, '#ff7518');
    titleGrad.addColorStop(1, '#ff5da2');
    ctx.fillStyle = titleGrad;
    ctx.fillText('MARISOL HEAT', VIEW_WIDTH / 2, 236);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 19px system-ui, sans-serif';
    ctx.fillText('Steal cars. Run jobs. Outrun the law. Own the shore.', VIEW_WIDTH / 2, 282);
    ctx.font = '600 17px system-ui, sans-serif';
    const options = game.hasSave
      ? ['ENTER  —  continue your run', 'N  —  new game', 'Walk to Madame Zara\'s pink beacon to take a job']
      : ['ENTER  —  start your run', 'Walk to Madame Zara\'s pink beacon to take a job'];
    options.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? PALETTE.neonGold : 'rgba(255,255,255,0.85)';
      ctx.fillText(line, VIEW_WIDTH / 2, 356 + i * 32);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '500 14px system-ui, sans-serif';
    ctx.fillText('WASD / arrows · F car · J punch · Shift run · P pause · M sound', VIEW_WIDTH / 2, VIEW_HEIGHT - 36);
  }

  drawPause(game) {
    const { ctx } = this;
    void game;
    ctx.fillStyle = 'rgba(12, 6, 20, 0.55)';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 44px system-ui, sans-serif';
    ctx.fillText('PAUSED', VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 10);
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('P or Esc to keep playing', VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 28);
  }

  drawEndScreen(game, word, line, color) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(10, 4, 14, 0.62)';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = '900 92px system-ui, sans-serif';
    ctx.fillText(word, VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillText(line, VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 18);
    ctx.fillStyle = PALETTE.neonGold;
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.fillText(`Cash on hand: $${game.cash.toLocaleString('en-US')} · Jobs done: ${game.jobsDone}`, VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 58);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText('Press R to get back on the street', VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 96);
  }

  drawBanner(game) {
    const { ctx } = this;
    const banner = game.banner;
    const alpha = clamp(Math.min(banner.age * 3, (banner.duration - banner.age) * 2.2), 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    const y = 118;
    ctx.fillStyle = 'rgba(14, 8, 22, 0.78)';
    const lines = banner.lines;
    const width = Math.min(760, 60 + Math.max(...lines.map((l) => l.length)) * 9.4);
    roundRect(ctx, VIEW_WIDTH / 2 - width / 2, y - 40, width, 52 + lines.length * 24, 12);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = banner.color || PALETTE.neonGold;
    ctx.font = '800 23px system-ui, sans-serif';
    ctx.fillText(banner.title, VIEW_WIDTH / 2, y);
    ctx.fillStyle = '#ffffff';
    ctx.font = '500 15.5px system-ui, sans-serif';
    lines.forEach((line, i) => {
      wrapLine(ctx, line, VIEW_WIDTH / 2, y + 30 + i * 24, 700);
    });
    ctx.restore();
  }

  inView(rect, view, pad) {
    return rect.x + rect.w > view.x - pad && rect.x < view.x + view.w + pad
      && rect.y + rect.h > view.y - pad && rect.y < view.y + view.h + pad;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let n = 0; n < 10; n += 1) {
    const angle = -Math.PI / 2 + (n * Math.PI) / 5;
    const rad = n % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (n === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/** Darken or lighten a #rrggbb colour by an amount (-100..100). */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => clamp(v + amount, 0, 255);
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r}, ${g}, ${b})`;
}

function wrapLine(ctx, line, cx, y, maxWidth) {
  if (ctx.measureText(line).width <= maxWidth) {
    ctx.fillText(line, cx, y);
    return;
  }
  const words = line.split(' ');
  let current = '';
  let row = 0;
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && current) {
      ctx.fillText(current, cx, y + row * 22);
      row += 1;
      current = word;
    } else {
      current = trial;
    }
  }
  if (current) ctx.fillText(current, cx, y + row * 22);
}
