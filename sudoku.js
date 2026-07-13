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
  const REGION_VARIANTS = ["antiking", "antiknight", "x", "hyper", "jigsaw"];
  function normVariants(v) {
    if (typeof v === "string") v = v === "classic" ? [] : [v];
    if (!Array.isArray(v)) return [];
    return REGION_VARIANTS.filter((k) => v.includes(k));
  }

  // --- Jigsaw: nepravilne regije ---
  // regions[idx] = id regije (0-8). Iz njega se izvede regionCells (9 polja).
  const orthNeighbors = (i) => {
    const r = Math.floor(i / 9),
      c = i % 9;
    const out = [];
    if (r > 0) out.push(i - 9);
    if (r < 8) out.push(i + 9);
    if (c > 0) out.push(i - 1);
    if (c < 8) out.push(i + 1);
    return out;
  };

  function regionsToCells(regions) {
    const cells = Array.from({ length: 9 }, () => []);
    for (let i = 0; i < 81; i++) cells[regions[i]].push(i);
    return cells;
  }

  // Generira 9 nepravilnih, ortogonalno povezanih regija od po 9 ćelija.
  // Perturbacija klasičnih 3×3 kvadrata nasumičnim transferima parova preko
  // granice regija: a iz A u B (A ima 8, B ima 10), pa neka b iz B natrag u A
  // (opet 9/9). Veličine su invarijanta, povezanost se provjerava i loši potez
  // se poništava. Nema backtrackinga - uvijek završi.
  function generateRegions() {
    const regions = new Array(81);
    for (let i = 0; i < 81; i++)
      regions[i] = Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3);

    const connected = (id) => {
      const members = [];
      for (let i = 0; i < 81; i++) if (regions[i] === id) members.push(i);
      if (members.length === 0) return true;
      const seen = new Set([members[0]]);
      const stack = [members[0]];
      while (stack.length) {
        const cur = stack.pop();
        for (const nb of orthNeighbors(cur))
          if (regions[nb] === id && !seen.has(nb)) {
            seen.add(nb);
            stack.push(nb);
          }
      }
      return seen.size === members.length;
    };

    let success = 0;
    for (let tries = 0; tries < 3000 && success < 60; tries++) {
      const a = Math.floor(Math.random() * 81);
      const A = regions[a];
      const cross = orthNeighbors(a).filter((nb) => regions[nb] !== A);
      if (cross.length === 0) continue;
      const B = regions[cross[Math.floor(Math.random() * cross.length)]];
      regions[a] = B; // A -> 8, B -> 10
      const candidates = [];
      for (let i = 0; i < 81; i++) {
        if (i === a || regions[i] !== B) continue;
        if (orthNeighbors(i).some((nb) => regions[nb] === A)) candidates.push(i);
      }
      if (candidates.length === 0) {
        regions[a] = A; // revert
        continue;
      }
      const b = candidates[Math.floor(Math.random() * candidates.length)];
      regions[b] = A; // B -> 9, A -> 9
      if (connected(A) && connected(B)) {
        success++;
      } else {
        regions[a] = A;
        regions[b] = B;
      }
    }

    // Kanonsko numeriranje: id-evi po redoslijedu prvog pojavljivanja (scan 0..80).
    const remap = new Map();
    let next = 0;
    for (let i = 0; i < 81; i++) if (!remap.has(regions[i])) remap.set(regions[i], next++);
    for (let i = 0; i < 81; i++) regions[i] = remap.get(regions[i]);
    return regions;
  }

  // variants = normalizirano polje aktivnih regijskih varijanti (vidi normVariants).
  // jig = null | { map: regions, cells: regionCells } - kad je postavljen,
  // box-provjeru zamjenjuje regija ćelije (row/col ostaju).
  function isValid(board, idx, val, variants, jig) {
    const row = Math.floor(idx / 9),
      col = idx % 9;
    const boxRow = Math.floor(row / 3) * 3,
      boxCol = Math.floor(col / 3) * 3;
    for (let i = 0; i < 9; i++) {
      if (board[row * 9 + i] === val) return false;
      if (board[i * 9 + col] === val) return false;
      if (!jig && board[(boxRow + Math.floor(i / 3)) * 9 + (boxCol + (i % 3))] === val)
        return false;
    }
    if (jig) {
      for (const j of jig.cells[jig.map[idx]]) if (board[j] === val) return false;
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

  // budget = { n } brojač rekurzivnih poziva; iznad ~300k odustani (nepravilne
  // jigsaw regije teoretski mogu potjerati backtracking predugo). Klasik i
  // postojeće varijante budžet nikad ne dosegnu.
  function fillBoard(board, variants, jig, budget) {
    if (budget && ++budget.n > 300000) return false;
    const idx = board.indexOf(0);
    if (idx === -1) return true;
    for (const val of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (isValid(board, idx, val, variants, jig)) {
        board[idx] = val;
        if (fillBoard(board, variants, jig, budget)) return true;
        board[idx] = 0;
      }
    }
    return false;
  }

  // Vrati rješenje ili null ako fillBoard probije budžet (pozivatelj tada uzme
  // svježe regije i pokuša ponovno).
  function generateSolution(variants, jig) {
    const board = new Array(81).fill(0);
    if (!fillBoard(board, variants, jig, { n: 0 })) return null;
    return board;
  }

  // Broji rješenja (staje na 'limit'). MRV: bira praznu ćeliju s najmanje
  // kandidata -> drastično brže od first-empty backtrackinga.
  function countSolutions(board, limit, variants, jig) {
    let bestIdx = -1,
      bestCands = null;
    for (let idx = 0; idx < 81; idx++) {
      if (board[idx] !== 0) continue;
      const cands = [];
      for (let v = 1; v <= 9; v++) if (isValid(board, idx, v, variants, jig)) cands.push(v);
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
      count += countSolutions(board, limit, variants, jig);
      board[bestIdx] = 0;
      if (count >= limit) return count;
    }
    return count;
  }

  // Briše ćelije (bez simetrije, za maksimalan izazov) dok čuva jedinstveno
  // rješenje, do otprilike 'target' zadanih ćelija.
  function dig(solution, target, variants, jig) {
    const puzzle = solution.slice();
    let givens = 81;
    for (const idx of shuffle([...Array(81).keys()])) {
      if (givens <= target) break;
      if (puzzle[idx] === 0) continue;
      const backup = puzzle[idx];
      puzzle[idx] = 0;
      if (countSolutions(puzzle.slice(), 2, variants, jig) !== 1) puzzle[idx] = backup;
      else givens--;
    }
    return puzzle;
  }

  const TARGET = { normal: 34, hard: 28 };
  const REQ_TIER = { normal: Solver.T_SINGLE, hard: Solver.T_INTER };
  const MAX_ATTEMPTS = { normal: 120, hard: 200 };

  // Za jigsaw partiju: svježe regije + jig kontekst po pokušaju (raznolikost i
  // bijeg iz eventualno lošeg rasporeda). Non-jigsaw -> { regions: null, jig: null }.
  function newRegionCtx(useJig) {
    if (!useJig) return { regions: null, jig: null };
    const regions = generateRegions();
    return { regions, jig: { map: regions, cells: regionsToCells(regions) } };
  }

  // Generira slagalicu tražene težine. Ako u zadanom broju pokušaja ne nađe
  // točan tier, vraća najbliži pronađeni (uvijek nešto rješivo logikom).
  // variants: polje (ili legacy string) aktivnih regijskih varijanti - prazno =
  // classic, "jigsaw" (9 nepravilnih regija umjesto kvadrata), "x" (dvije
  // dijagonale 1-9), "hyper" (4 prozora 1-9), "antiknight" (isti broj zabranjen
  // na skoku konja), "antiking" (isti broj zabranjen na dijagonalnom susjedu),
  // ili kombinacija. Rezultat nosi `regions` (81-polje id-eva regije) kad je
  // jigsaw aktivan, inače `null`.
  function generate(difficulty, variants) {
    variants = normVariants(variants);
    const reqTier = REQ_TIER[difficulty] || Solver.T_SINGLE;
    const target = TARGET[difficulty] || 34;
    const attempts = MAX_ATTEMPTS[difficulty] || 150;
    const useJig = variants.includes("jigsaw");
    let best = null;

    for (let a = 0; a < attempts; a++) {
      const { regions, jig } = newRegionCtx(useJig);
      const solution = generateSolution(variants, jig);
      if (!solution) continue; // probijen budžet (loše regije) -> novi pokušaj
      const puzzle = dig(solution, target, variants, jig);
      const res = Solver.solveAndGrade(puzzle, variants, regions);
      if (!res.solved) continue; // traži tehniku koju nemamo -> preskoči
      if (res.grid.some((v, i) => v !== solution[i])) continue; // sigurnosna provjera ispravnosti

      if (res.tier === reqTier) {
        return { puzzle, solution, difficulty, variants, techniques: res.techniques, regions };
      }
      if (!best || Math.abs(res.tier - reqTier) < Math.abs(best.tier - reqTier)) {
        best = {
          puzzle,
          solution,
          difficulty,
          techniques: res.techniques,
          tier: res.tier,
          regions,
        };
      }
    }

    if (best)
      return {
        puzzle: best.puzzle,
        solution: best.solution,
        difficulty,
        variants,
        techniques: best.techniques,
        regions: best.regions,
      };
    // Krajnji fallback - bilo što rješivo (nove regije za jigsaw, ne recikliraj).
    let ctx, solution;
    do {
      ctx = newRegionCtx(useJig);
      solution = generateSolution(variants, ctx.jig);
    } while (!solution);
    return {
      puzzle: dig(solution, target, variants, ctx.jig),
      solution,
      difficulty,
      variants,
      techniques: [],
      regions: ctx.regions,
    };
  }

  return { generate, isValid, normVariants, generateRegions };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Sudoku;
