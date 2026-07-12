/* Web Worker: generira slagalicu izvan glavne niti. Time spinner ostaje živ i
   generiranje se može prekinuti (glavni thread radi worker.terminate()).
   importScripts dijeli globalni `Sudoku`/`Solver` (isto kao <script> tagovi). */
importScripts("solver.js", "sudoku.js");

onmessage = (e) => {
  const { difficulty, variants } = e.data;
  postMessage(Sudoku.generate(difficulty, variants));
};
