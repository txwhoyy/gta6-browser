// Marisol Heat — the handover program for the gta6-01 entry (Node 22, standard
// library only). The game itself is the static site under game/ (open
// game/index.html in a desktop browser and play; no build step, no network).
// This program copies game/ and screenshots/ into the output directory and
// writes dossier.json there with the vendored make.fun library, exactly the
// summary the competition's judge reads.
//
// Run it the way the grader does, with MAKEFUN_OUTPUT_DIR standing in for
// /output when you try it yourself:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });

const shotsDir = join(repoRoot, 'screenshots');
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own (its gate reference): the dossier text is
// capped, screenshots are at most 4 files of at most 256 KiB, and game/ is
// at most 993 entries and 48 MiB with no path over 1,000 bytes.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
