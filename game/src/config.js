// Central tuning for Marisol Heat: world size, road grid, speeds, prices of trouble.
// Everything the other modules need to agree on lives here so the city, the cars and
// the police all play by the same numbers.

export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;

/** The city is a square of blocks; one pitch is one road plus one block. */
export const GRID = {
  cols: 11,
  rows: 11,
  pitch: 264,
  road: 78,
};
export const WORLD_SIZE = GRID.cols * GRID.pitch + GRID.road;

/** The sea sits past this x; between beachStart and waterStart is sand. */
export const BEACH = {
  sandStart: WORLD_SIZE - 330,
  waterStart: WORLD_SIZE - 190,
};

export const PLAYER = {
  radius: 11,
  walkSpeed: 158,
  runSpeed: 238,
  health: 100,
  punchRange: 30,
  punchDamage: 34,
};

export const CAR = {
  radius: 17,
  length: 46,
  width: 24,
  maxSpeed: 355,
  maxReverse: 120,
  accel: 265,
  brake: 430,
  drag: 0.55,
  gripTurn: 2.9,
  health: 100,
};

export const TRAFFIC = {
  count: 26,
  speed: 96,
  parkedCount: 30,
};

export const PEDS = {
  count: 34,
  walkSpeed: 52,
};

export const POLICE = {
  maxCars: 6,
  speed: 372,
  bustRange: 40,
  bustSeconds: 1.25,
  sightRange: 300,
};

/** Wanted tuning: how fast heat cools when nobody is watching. */
export const WANTED = {
  max: 5,
  coolAfterSeconds: 11,
  starEverySeconds: 8,
};

/** Sun-soaked neon palette shared by the renderer and the HUD. */
export const PALETTE = {
  sky: '#ffd9a0',
  asphalt: '#3d3a44',
  asphaltEdge: '#33303b',
  laneMark: '#f7e8b0',
  sidewalk: '#9b8f83',
  curb: '#7c7268',
  grass: '#58a05c',
  sand: '#f2d492',
  water: '#2fa8c9',
  waterDeep: '#1d7fa8',
  palmTrunk: '#8a6b45',
  palmLeaf: '#3f9e4d',
  playerShirt: '#ff5d8f',
  playerPants: '#2b3a67',
  skin: '#c98d64',
  hudInk: '#ffffff',
  hudShade: 'rgba(16,10,24,0.55)',
  neonPink: '#ff5da2',
  neonCyan: '#37e0d8',
  neonGold: '#ffc94d',
  policeBody: '#20304f',
  policeTrim: '#eef2f5',
};

export const CAR_COLORS = [
  '#e94f64', '#f28c28', '#f7d154', '#57b25e', '#3f8fd2',
  '#7a5fd0', '#e8e4da', '#9aa3ad', '#ff7bac', '#2ec4b6',
  '#c94f30', '#5b8e7d',
];

export const BUILDING_STYLES = [
  { wall: '#f6c9a0', trim: '#e2703a', roof: '#c95d39' },
  { wall: '#f9e2c0', trim: '#3fa7a0', roof: '#2f7f78' },
  { wall: '#f3b8c6', trim: '#d64570', roof: '#a83a58' },
  { wall: '#cfe8ef', trim: '#3f8fd2', roof: '#2f6da3' },
  { wall: '#efe6cf', trim: '#8a6b45', roof: '#6e5436' },
  { wall: '#d9c7ec', trim: '#7a5fd0', roof: '#5a439e' },
  { wall: '#ffe9a8', trim: '#e2703a', roof: '#b95c2e' },
  { wall: '#bfe3c8', trim: '#3f9e4d', roof: '#2f7a3c' },
];
