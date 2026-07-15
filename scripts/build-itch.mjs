/* Sastavi dist/ za itch.io deploy (html5). Nema bundlanja - PWA je vanilla JS,
   ovo je samo kopiranje runtime fajlova u čist folder da na itch ne odu
   node_modules/docs/metrics/.claude ni alatna konfiguracija.

   Allowlist (ne denylist) namjerno: eksplicitno je jasno što se isporučuje, a
   stray file ne može slučajno procuriti. Drži poravnato sa `sw.js` ASSETS +
   <script>/<link> tagovima u index.html. */
import { rmSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

// Runtime fajlovi koje igra stvarno dohvaća (index.html + sw.js ASSETS).
// package.json je tu jer app.js/metrics.js fetchaju ./package.json za verziju.
const FILES = [
  "index.html",
  "style.css",
  "solver.js",
  "sudoku.js",
  "gen-worker.js",
  "metrics.js",
  "app.js",
  "sw.js",
  "package.json",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-512-maskable.png",
];

rmSync(dist, { recursive: true, force: true });
for (const rel of FILES) {
  const to = join(dist, rel);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(join(root, rel), to);
}

console.log(`build-itch: kopirano ${FILES.length} fajlova u dist/`);
