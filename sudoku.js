/* Sudoku generiranje. Ploča = polje od 81 broja (0 = prazno), indeks = red*9 + stupac.
   Težina se ocjenjuje preko Solver.solveAndGrade (najteža potrebna tehnika). */

const Sudoku = (() => {
  "use strict";

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Hyper/Windoku: 4 dodatna 3×3 prozora (redovi 2-4/6-8, stupci 2-4/6-8 - 1-indeksirano).
  const hyperWindows = [];
  for (const wr of [1, 5])
    for (const wc of [1, 5]) {
      const cells = [];
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++) cells.push((wr + dr) * 9 + (wc + dc));
      hyperWindows.push(cells);
    }
  function hyperWindowOf(idx) {
    const r = Math.floor(idx / 9),
      c = idx % 9;
    const wr = r >= 1 && r <= 3 ? 0 : r >= 5 && r <= 7 ? 1 : -1;
    const wc = c >= 1 && c <= 3 ? 0 : c >= 5 && c <= 7 ? 1 : -1;
    return wr === -1 || wc === -1 ? -1 : wr * 2 + wc;
  }

  // Antiknight: isti broj zabranjen na potezu šahovskog konja (8 L-skokova).
  // Predizračunato po ćeliji - koristi se u vrućoj petlji generatora.
  const KNIGHT_OFFSETS = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];
  const knightPeers = [];
  for (let idx = 0; idx < 81; idx++) {
    const r = Math.floor(idx / 9),
      c = idx % 9;
    const list = [];
    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const nr = r + dr,
        nc = c + dc;
      if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) list.push(nr * 9 + nc);
    }
    knightPeers.push(list);
  }

  // Antiking: isti broj zabranjen na potezu šahovskog kralja. Samo 4 dijagonalna
  // susjeda - ortogonalni potezi su već pokriveni redom/stupcem.
  const KING_OFFSETS = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  const kingPeers = [];
  for (let idx = 0; idx < 81; idx++) {
    const r = Math.floor(idx / 9),
      c = idx % 9;
    const list = [];
    for (const [dr, dc] of KING_OFFSETS) {
      const nr = r + dr,
        nc = c + dc;
      if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) list.push(nr * 9 + nc);
    }
    kingPeers.push(list);
  }

  // Regijske varijante koje se mogu kombinirati. Aktivni skup = polje ovih id-eva
  // (prazno = classic). Redoslijed je kanonski (za stabilne cache-ključeve i labele).
  const REGION_VARIANTS = ["x", "hyper", "antiknight", "antiking"];
  function normVariants(v) {
    if (typeof v === "string") v = v === "classic" ? [] : [v];
    if (!Array.isArray(v)) return [];
    return REGION_VARIANTS.filter((k) => v.includes(k));
  }

  // variants = normalizirano polje aktivnih regijskih varijanti (vidi normVariants).
  function isValid(board, idx, val, variants) {
    const row = Math.floor(idx / 9),
      col = idx % 9;
    const boxRow = Math.floor(row / 3) * 3,
      boxCol = Math.floor(col / 3) * 3;
    for (let i = 0; i < 9; i++) {
      if (board[row * 9 + i] === val) return false;
      if (board[i * 9 + col] === val) return false;
      if (board[(boxRow + Math.floor(i / 3)) * 9 + (boxCol + (i % 3))] === val) return false;
    }
    if (variants.includes("x")) {
      if (row === col) for (let i = 0; i < 9; i++) if (board[i * 9 + i] === val) return false;
      if (row + col === 8)
        for (let i = 0; i < 9; i++) if (board[i * 9 + (8 - i)] === val) return false;
    }
    if (variants.includes("hyper")) {
      const w = hyperWindowOf(idx);
      if (w !== -1) for (const j of hyperWindows[w]) if (board[j] === val) return false;
    }
    if (variants.includes("antiknight")) {
      for (const j of knightPeers[idx]) if (board[j] === val) return false;
    }
    if (variants.includes("antiking")) {
      for (const j of kingPeers[idx]) if (board[j] === val) return false;
    }
    return true;
  }

  function fillBoard(board, variants) {
    const idx = board.indexOf(0);
    if (idx === -1) return true;
    for (const val of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (isValid(board, idx, val, variants)) {
        board[idx] = val;
        if (fillBoard(board, variants)) return true;
        board[idx] = 0;
      }
    }
    return false;
  }

  function generateSolution(variants) {
    const board = new Array(81).fill(0);
    fillBoard(board, variants);
    return board;
  }

  // Broji rješenja (staje na 'limit'). MRV: bira praznu ćeliju s najmanje
  // kandidata -> drastično brže od first-empty backtrackinga.
  function countSolutions(board, limit, variants) {
    let bestIdx = -1,
      bestCands = null;
    for (let idx = 0; idx < 81; idx++) {
      if (board[idx] !== 0) continue;
      const cands = [];
      for (let v = 1; v <= 9; v++) if (isValid(board, idx, v, variants)) cands.push(v);
      if (cands.length === 0) return 0;
      if (bestCands === null || cands.length < bestCands.length) {
        bestIdx = idx;
        bestCands = cands;
        if (cands.length === 1) break;
      }
    }
    if (bestIdx === -1) return 1;
    let count = 0;
    for (const v of bestCands) {
      board[bestIdx] = v;
      count += countSolutions(board, limit, variants);
      board[bestIdx] = 0;
      if (count >= limit) return count;
    }
    return count;
  }

  // Briše ćelije (bez simetrije, za maksimalan izazov) dok čuva jedinstveno
  // rješenje, do otprilike 'target' zadanih ćelija.
  function dig(solution, target, variants) {
    const puzzle = solution.slice();
    let givens = 81;
    for (const idx of shuffle([...Array(81).keys()])) {
      if (givens <= target) break;
      if (puzzle[idx] === 0) continue;
      const backup = puzzle[idx];
      puzzle[idx] = 0;
      if (countSolutions(puzzle.slice(), 2, variants) !== 1) puzzle[idx] = backup;
      else givens--;
    }
    return puzzle;
  }

  const TARGET = { normal: 34, hard: 28 };
  const REQ_TIER = { normal: Solver.T_SINGLE, hard: Solver.T_INTER };
  const MAX_ATTEMPTS = { normal: 120, hard: 200 };

  // Generira slagalicu tražene težine. Ako u zadanom broju pokušaja ne nađe
  // točan tier, vraća najbliži pronađeni (uvijek nešto rješivo logikom).
  // variants: polje (ili legacy string) aktivnih regijskih varijanti - prazno =
  // classic, "x" (dvije dijagonale 1-9), "hyper" (4 prozora 1-9), "antiknight"
  // (isti broj zabranjen na skoku konja), "antiking" (isti broj zabranjen na
  // dijagonalnom susjedu), ili kombinacija.
  function generate(difficulty, variants) {
    variants = normVariants(variants);
    const reqTier = REQ_TIER[difficulty] || Solver.T_SINGLE;
    const target = TARGET[difficulty] || 34;
    const attempts = MAX_ATTEMPTS[difficulty] || 150;
    let best = null;

    for (let a = 0; a < attempts; a++) {
      const solution = generateSolution(variants);
      const puzzle = dig(solution, target, variants);
      const res = Solver.solveAndGrade(puzzle, variants);
      if (!res.solved) continue; // traži tehniku koju nemamo -> preskoči
      if (res.grid.some((v, i) => v !== solution[i])) continue; // sigurnosna provjera ispravnosti

      if (res.tier === reqTier) {
        return { puzzle, solution, difficulty, variants, techniques: res.techniques };
      }
      if (!best || Math.abs(res.tier - reqTier) < Math.abs(best.tier - reqTier)) {
        best = { puzzle, solution, difficulty, techniques: res.techniques, tier: res.tier };
      }
    }

    if (best)
      return {
        puzzle: best.puzzle,
        solution: best.solution,
        difficulty,
        variants,
        techniques: best.techniques,
      };
    // Krajnji fallback - bilo što rješivo
    const solution = generateSolution(variants);
    return {
      puzzle: dig(solution, target, variants),
      solution,
      difficulty,
      variants,
      techniques: [],
    };
  }

  return { generate, isValid, normVariants };
})();
