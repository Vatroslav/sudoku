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

  // Thermo: tuba se grana po potezu kralja (8 susjeda) - smije skretati i dijagonalno.
  const thermoNeighbors = [];
  for (let idx = 0; idx < 81; idx++) {
    const r = Math.floor(idx / 9),
      c = idx % 9;
    const list = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr,
          nc = c + dc;
        if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) list.push(nr * 9 + nc);
      }
    thermoNeighbors.push(list);
  }

  // Thermo: raspon [lo,hi] dopušten na poziciji p termometra. Dva izvora, oba nužna:
  //   1. POZICIJA sama - ispod p je p strogo manjih, iznad njega path.length-1-p
  //      strogo većih, pa vrijednost ne može biti bilo koja (bulb duljine 4 je <= 6).
  //      Vrijedi i na praznoj ploči - odatle Thermo vuče najveći dio snage.
  //   2. Svaki POPUNJEN član tube - svaki korak duž nje vrijedi barem 1.
  // Zajedno su ekvivalent "strogo raste", samo izraženo kao granice (solver tako
  // može odmah rezati kandidate umjesto da provjerava par po par).
  function thermoRange(board, path, p) {
    let lo = p + 1,
      hi = 9 - (path.length - 1 - p);
    for (let q = 0; q < path.length; q++) {
      const b = board[path[q]];
      if (!b || q === p) continue;
      if (q < p) lo = Math.max(lo, b + (p - q));
      else hi = Math.min(hi, b - (q - p));
    }
    return [lo, hi];
  }

  // Indeks ćelija -> { path, pos }. Termometri se ne preklapaju pa je po ćeliji
  // najviše jedan. Predizračunato jer ga isValid zove u vrućoj petlji - isti odnos
  // kao regions -> jig.
  function prepThermos(thermos) {
    if (!thermos || !thermos.length) return null;
    const at = new Array(81).fill(null);
    for (const path of thermos)
      for (let p = 0; p < path.length; p++) at[path[p]] = { path, pos: p };
    return at;
  }

  // clues = SVI per-puzzle podaci u jednom objektu (za razliku od `variants`, koji
  // vrijedi za cijelu partiju). Prije je svaki od njih bio zaseban parametar pa je
  // isValid narastao na 8; svaka nova derivacijska varijanta dodavala je još jedan
  // kroz cijeli lanac (isValid -> countSolutions -> dig -> solveAndGrade -> explainNext).
  // Ovako ih dodaje NULA - novo polje putuje samo po sebi.
  //
  // Dvije vrste polja i zato ih gradi jedno mjesto:
  //   - wire (regions/parity/edges/thermos) - ono što ide u state i localStorage,
  //   - izvedeno (jig/thm) - brzi oblici koje isValid gleda u vrućoj petlji.
  // Izvedeno se NE sprema; prepClues ga svaki put složi iz wire polja.
  function prepClues(c) {
    const regions = (c && c.regions) || null;
    const thermos = (c && c.thermos) || null;
    return {
      regions,
      parity: (c && c.parity) || null,
      edges: (c && c.edges) || null,
      thermos,
      // jig se drži uz regions: isValid ne smije po ćeliji tražiti tko je u kojoj regiji.
      jig: regions ? { map: regions, cells: regionsToCells(regions) } : null,
      thm: prepThermos(thermos),
    };
  }
  const EMPTY_CLUES = prepClues({}); // klasik: nema nijedne per-puzzle oznake

  // Poznate varijante koje se mogu kombinirati. Aktivni skup = polje ovih id-eva
  // (prazno = classic). Redoslijed je kanonski (za stabilne cache-ključeve i labele).
  // Većina su regijske (šire units/peers); "evenodd" (parity maska), "kropki" i
  // "xv" (oznake na bridovima) te "thermo" (termometri) su iznimke - ne diraju
  // units/peers, nose per-puzzle podatak koji provjerava isValid (kao jigsaw regions).
  const REGION_VARIANTS = [
    "antiking",
    "antiknight",
    "x",
    "hyper",
    "jigsaw",
    "evenodd",
    "kropki",
    "xv",
    "thermo",
  ];
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

  // --- Brid-oznake (Kropki + XV dijele isti prostor) ---
  // Tip oznake na bridu: 1 bijela točka (uzastopni), 2 crna točka (omjer 2),
  // 3 slovo V (zbroj 5), 4 slovo X (zbroj 10). 0 = brid bez oznake.
  // Jedan brid nosi najviše jednu oznaku - i fizički (točka i slovo bi se
  // preklopili) i logički (deriveEdges ne dira zauzet brid).

  // Kropki tip para a,b: omjer 2 se provjeri prvo pa 1-2 dobije crnu.
  function dotType(a, b) {
    const hi = Math.max(a, b),
      lo = Math.min(a, b);
    if (hi === 2 * lo) return 2;
    if (hi - lo === 1) return 1;
    return 0;
  }
  // XV tip para a,b: V = zbroj 5, X = zbroj 10 (par ne može biti oboje).
  function xvType(a, b) {
    if (a + b === 5) return 3;
    if (a + b === 10) return 4;
    return 0;
  }
  // Zadovoljava li par a,b prikazanu oznaku tipa t. Neovisno o dotType tiebreaku -
  // 1-2 zadovoljava i bijelu i crnu.
  function edgeOk(a, b, t) {
    const hi = Math.max(a, b),
      lo = Math.min(a, b);
    if (t === 1) return hi - lo === 1;
    if (t === 2) return hi === 2 * lo;
    if (t === 3) return a + b === 5;
    if (t === 4) return a + b === 10;
    return true;
  }

  // variants = normalizirano polje aktivnih regijskih varijanti (vidi normVariants).
  // clues = per-puzzle podaci (vidi prepClues); ovdje se čitaju:
  //   jig - kad je postavljen, box-provjeru zamjenjuje regija ćelije (row/col ostaju).
  //   parity - 81-polje (0 bez oznake, 1 parno, 2 neparno), Even/Odd maska.
  //   edges - { h, v } 81-polja Kropki/XV oznaka na bridovima (h[i] = brid i↔i+1,
  //     v[i] = brid i↔i+9; tipovi kao u edgeOk). Samo pozitivno: prikazana oznaka
  //     mora vrijediti, odsutnost ne ograničava ništa.
  //   thm - 81-polje { path, pos } (vidi prepThermos), Thermo tube.
  function isValid(board, idx, val, variants, clues = EMPTY_CLUES) {
    const { jig, parity, edges, thm } = clues;
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
    if (parity && parity[idx]) {
      const even = val % 2 === 0;
      if (parity[idx] === 1 ? !even : even) return false; // 1 = parno, 2 = neparno
    }
    if (edges) {
      // Provjeri samo popunjene ortogonalne susjede s prikazanom oznakom.
      if (col < 8 && edges.h[idx] && board[idx + 1] && !edgeOk(val, board[idx + 1], edges.h[idx]))
        return false;
      if (
        col > 0 &&
        edges.h[idx - 1] &&
        board[idx - 1] &&
        !edgeOk(val, board[idx - 1], edges.h[idx - 1])
      )
        return false;
      if (row < 8 && edges.v[idx] && board[idx + 9] && !edgeOk(val, board[idx + 9], edges.v[idx]))
        return false;
      if (
        row > 0 &&
        edges.v[idx - 9] &&
        board[idx - 9] &&
        !edgeOk(val, board[idx - 9], edges.v[idx - 9])
      )
        return false;
    }
    if (thm && thm[idx]) {
      const { path, pos } = thm[idx];
      const [lo, hi] = thermoRange(board, path, pos);
      if (val < lo || val > hi) return false;
    }
    return true;
  }

  // budget = { n } brojač rekurzivnih poziva; iznad ~300k odustani (nepravilne
  // jigsaw regije teoretski mogu potjerati backtracking predugo). Klasik i
  // postojeće varijante budžet nikad ne dosegnu.
  // clues ovdje nosi SAMO geometriju (regions/jig): rješenja još nema, a parity/edges/
  // thermos se tek iz njega izvode.
  function fillBoard(board, variants, clues, budget) {
    if (budget && ++budget.n > 300000) return false;
    const idx = board.indexOf(0);
    if (idx === -1) return true;
    for (const val of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (isValid(board, idx, val, variants, clues)) {
        board[idx] = val;
        if (fillBoard(board, variants, clues, budget)) return true;
        board[idx] = 0;
      }
    }
    return false;
  }

  // Vrati rješenje ili null ako fillBoard probije budžet (pozivatelj tada uzme
  // svježe regije i pokuša ponovno).
  function generateSolution(variants, clues) {
    const board = new Array(81).fill(0);
    if (!fillBoard(board, variants, clues, { n: 0 })) return null;
    return board;
  }

  // Broji rješenja (staje na 'limit'). MRV: bira praznu ćeliju s najmanje
  // kandidata -> drastično brže od first-empty backtrackinga.
  function countSolutions(board, limit, variants, clues) {
    let bestIdx = -1,
      bestCands = null;
    for (let idx = 0; idx < 81; idx++) {
      if (board[idx] !== 0) continue;
      const cands = [];
      for (let v = 1; v <= 9; v++) if (isValid(board, idx, v, variants, clues)) cands.push(v);
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
      count += countSolutions(board, limit, variants, clues);
      board[bestIdx] = 0;
      if (count >= limit) return count;
    }
    return count;
  }

  // Briše ćelije (bez simetrije, za maksimalan izazov) dok čuva jedinstveno
  // rješenje, do otprilike 'target' zadanih ćelija.
  function dig(solution, target, variants, clues) {
    const puzzle = solution.slice();
    let givens = 81;
    for (const idx of shuffle([...Array(81).keys()])) {
      if (givens <= target) break;
      if (puzzle[idx] === 0) continue;
      const backup = puzzle[idx];
      puzzle[idx] = 0;
      if (countSolutions(puzzle.slice(), 2, variants, clues) !== 1) puzzle[idx] = backup;
      else givens--;
    }
    return puzzle;
  }

  // Gustoća oznaka prati broj zadanih brojeva: informacija mora doći odnekud.
  // `boost` je 0 kad ploča ima pun broj zadanih (oznake rijetke, bazni raspon) do
  // 1 kad je ploča na dnu raspona (sve kvalificirane oznake prikazane). Bez toga
  // niski targeti ne bi bili rješivi - izmjereno: XV s baznom gustoćom ne ide
  // ispod ~22 zadanih, s punom do ~18, a Kropki+XV s punom do ~4.
  function scaled(base, boost) {
    return {
      min: base.min + (1 - base.min) * boost,
      max: base.max + (1 - base.max) * boost,
    };
  }
  const pickDensity = (d) => d.min + Math.random() * (d.max - d.min);

  // Even/Odd: djelić ćelija nosi oznaku parnosti izvedenu iz rješenja (kvadrat =
  // parno, krug = neparno u UI-ju). Oznake su aktivne u countSolutions/dig pa daju
  // logičku snagu (smiju se maknuti dodatni zadani brojevi uz jedinstvenost).
  // PARITY_DENSITY je bazni raspon (knob): gustoća se nasumično bira po generaciji
  // da slagalice variraju. Više oznaka = lakše, premalo = ne osjeti se.
  const PARITY_DENSITY = { min: 0.24, max: 0.38 };
  function deriveParity(solution, boost = 0) {
    const parity = new Array(81).fill(0);
    const idxs = shuffle([...Array(81).keys()]);
    const count = Math.round(81 * pickDensity(scaled(PARITY_DENSITY, boost)));
    for (let k = 0; k < count; k++) {
      const i = idxs[k];
      parity[i] = solution[i] % 2 === 0 ? 1 : 2; // 1 = parno, 2 = neparno
    }
    return parity;
  }

  // Kropki i XV (casual): prikaži podskup oznaka izvedenih iz rješenja. Skupi sve
  // bridove gdje odnos postoji, pa otkrij njihov djelić. Samo pozitivno - odsutnost
  // oznake ne znači ništa. *_DENSITY je raspon (knob, udio kvalificiranih bridova):
  // gustoća se nasumično bira po generaciji da slagalice variraju. XV ima veći raspon
  // jer manje parova kvalificira (zbroj 5/10 = 6 parova, Kropki 11) pa bi ista gustoća
  // dala premalo oznaka.
  const KROPKI_DENSITY = { min: 0.35, max: 0.55 };
  const XV_DENSITY = { min: 0.45, max: 0.65 };

  // Bridovi gdje typeFn nalazi odnos, kao [os, i, tip]. h[i] = i↔i+1, v[i] = i↔i+9.
  function edgeCands(solution, typeFn) {
    const out = [];
    for (let i = 0; i < 81; i++) {
      const c = i % 9,
        r = Math.floor(i / 9);
      if (c < 8) {
        const t = typeFn(solution[i], solution[i + 1]);
        if (t) out.push(["h", i, t]);
      }
      if (r < 8) {
        const t = typeFn(solution[i], solution[i + 9]);
        if (t) out.push(["v", i, t]);
      }
    }
    return out;
  }

  // Kropki i XV se natječu za iste bridove (jedini par koji kvalificira za obje je
  // 2-3: uzastopni I zbroj 5). Kropki bira prvi, XV puni samo slobodne bridove -
  // casual semantika to podnosi: izgubljena oznaka je oznaka koja se ne prikazuje,
  // a odsutnost ionako ne znači ništa.
  function deriveEdges(solution, useKropki, useXv, boost = 0) {
    const h = new Array(81).fill(0),
      v = new Array(81).fill(0);
    const reveal = (cands, base) => {
      const free = cands.filter(([axis, i]) => (axis === "h" ? h[i] : v[i]) === 0);
      shuffle(free);
      const count = Math.round(free.length * pickDensity(scaled(base, boost)));
      for (let k = 0; k < count; k++) {
        const [axis, i, t] = free[k];
        if (axis === "h") h[i] = t;
        else v[i] = t;
      }
    };
    if (useKropki) reveal(edgeCands(solution, dotType), KROPKI_DENSITY);
    if (useXv) reveal(edgeCands(solution, xvType), XV_DENSITY);
    return { h, v };
  }

  // Thermo: termometar je put ćelija (bulb prvi) duž kojeg vrijednosti STROGO rastu.
  //
  // Doc (dorada-varijante.md) Thermo svrstava u "geometrija-first, najteže" jer
  // pretpostavlja setup() koji složi tube PRIJE rješenja - tada moraš naći rješenje
  // koje ih zadovoljava. Ovdje ide obrnuto, isto kao Kropki/XV/Even-Odd: rješenje
  // prvo, tuba se IZVEDE iz njega. Šetnja koja uvijek korača na susjeda veće
  // vrijednosti ne može proizvesti nemoguć termometar, pa generator ostaje netaknut.
  // Klasifikacija u docu je starija od derive pipelinea.
  //
  // Šetnja prirodno kreće iz niskih vrijednosti (iz 9 se nema kamo) - to je točno
  // ono što treba, bulb je najmanji. Startovi koji ne dogurju do THERMO_LEN.min se
  // odbace.
  const THERMO_LEN = { min: 3, max: 5 };
  // Gustoća je udio od MAX_THERMOS (ostale varijante broje udio kvalificiranih
  // ćelija/bridova; kod tube je prirodna jedinica sam termometar).
  const MAX_THERMOS = 12;
  const THERMO_DENSITY = { min: 0.3, max: 0.5 };
  // Najmanje tuba koje prune smije ostaviti. Bez toga ploča na VRHU Hard raspona
  // (28 zadanih, boost 0) ostane s 1-2 termometra - izmjereno 12/30 ploča: klasika
  // ju s toliko brojeva nosi gotovo cijelu, pa prune ispravno zaključi da je skoro
  // svaka tuba suvišna. Formalno je ploča i dalje Thermo (variantNeeded jamči da
  // barem jedna nešto radi), ali s jednom cijevi ne IZGLEDA tako.
  //
  // Isti argument kojim doc isključuje prune na Normalu ("ploča s dva X-a ne izgleda
  // kao XV slagalica"), samo primijenjen na vrh raspona umjesto na težinu. Kod tube
  // je oštriji nego kod točke: termometar je strukturni objekt i jedan usamljen se
  // čita kao greška, a ne kao rijetka oznaka. Cijena je nešto suvišnih tuba na
  // pločama s puno zadanih - na dnu raspona (gdje tube nose rješenje) granica se ne
  // dosegne pa prune tamo radi puni posao.
  const THERMO_KEEP_MIN = 4;
  function deriveThermos(solution, boost = 0) {
    const want = Math.round(MAX_THERMOS * pickDensity(scaled(THERMO_DENSITY, boost)));
    // Termometri se NE preklapaju: dvije tube kroz istu ćeliju su i za oko i za
    // render (segment po ćeliji) nered, a dobiju se i bez toga.
    const used = new Array(81).fill(false);
    const thermos = [];
    for (const start of shuffle([...Array(81).keys()])) {
      if (thermos.length >= want) break;
      if (used[start]) continue;
      const maxLen =
        THERMO_LEN.min + Math.floor(Math.random() * (THERMO_LEN.max - THERMO_LEN.min + 1));
      const path = [start];
      let cur = start;
      while (path.length < maxLen) {
        // Strogi rast jamči da se ćelija ne može ponoviti (vrijednost bi morala biti
        // veća od same sebe) - zato provjera samo protiv tuđih tuba.
        const up = shuffle(
          thermoNeighbors[cur].filter((n) => !used[n] && solution[n] > solution[cur])
        );
        if (!up.length) break;
        cur = up[0];
        path.push(cur);
      }
      if (path.length < THERMO_LEN.min) continue;
      for (const i of path) used[i] = true;
      thermos.push(path);
    }
    return thermos;
  }

  const TARGET = { normal: 34, hard: 28 };
  const REQ_TIER = { normal: Solver.T_SINGLE, hard: Solver.T_INTER };
  const MAX_ATTEMPTS = { normal: 120, hard: 200 };

  // Hard s varijantama: broj zadanih brojeva se bira po pokušaju iz raspona, umjesto
  // fiksnih 28 - tako partije variraju (nekad ploča s 28 brojeva i rijetkim oznakama,
  // nekad s 12 i gusto posuta). Classic nema oznaka koje bi manjak brojeva
  // nadoknadile (i dokazano ne postoji ispod 17 zadanih) - ostaje na fiksnih 28.
  //
  // Dno raspona MORA biti po varijanti, ne jedinstveno: ispod svog minimuma
  // varijanta ne da rješivu ploču, a `dig` to otkrije tek nakon što iskopa do zida
  // jedinstvenosti - najskuplja operacija koju imamo. S jedinstvenim dnom od 8 XV
  // je trošio 23s po partiji (pola pokušaja bačeno), umjesto 0.2s.
  //
  // STRENGTH = koliko varijanta "vrijedi" u zadanim brojevima: izmjereni minimum
  // za varijantu samu, oduzet od 28 (Kropki sam ~10 zadanih -> vrijedi 18).
  // Kombinacija zbraja snage. Gruba aproksimacija - izmjereno odstupa ±2-4 - ali
  // ovo je samo donja granica raspona, pa preciznost nije bitna: ako je dno malo
  // prenisko, poneki pokušaj propadne; ako je previsoko, izgubi se dio raspona.
  const STRENGTH = {
    kropki: 18,
    evenodd: 15,
    thermo: 12,
    xv: 10,
    hyper: 8,
    antiknight: 6,
    jigsaw: 6,
    x: 2,
    antiking: 2,
  };
  const FLOOR_MIN = 4;
  function floorFor(variants, top) {
    const s = variants.reduce((a, v) => a + (STRENGTH[v] || 0), 0);
    return Math.max(FLOOR_MIN, top - s);
  }

  // Za jigsaw partiju: svježe regije po pokušaju (raznolikost i bijeg iz eventualno
  // lošeg rasporeda). Non-jigsaw -> clues bez geometrije.
  function newRegionClues(useJig) {
    return prepClues({ regions: useJig ? generateRegions() : null });
  }

  // Suvišne oznake: gustoća raste kako broj zadanih pada, pa ploča na dnu raspona
  // prikaže SVE što odnos dopušta - ali igraču dobar dio toga ne treba (izmjereno:
  // 68-80% oznaka se može maknuti a da se ploča i dalje riješi; Even/Odd je znao
  // isporučiti 64 oznake gdje ih 12 nosi cijeli posao). Isti postupak koji `dig`
  // radi s brojevima: probaj maknuti svaku, vrati onu bez koje ploča stane.
  //
  // Solver rješava deduktivno (tehnike ne pogađaju), pa "rješivo + točno rješenje"
  // ujedno znači da je rješenje ostalo jedinstveno - zaseban countSolutions ne treba.
  // Zove se JEDNOM na gotovoj ploči (ne u generacijskoj petlji), zato si smije
  // priuštiti poziv solvera po oznaci.
  function pruneMarks(puzzle, solution, variants, clues, maxTier) {
    const { parity, edges, thermos } = clues;
    const cands = [];
    if (edges)
      for (let i = 0; i < 81; i++) {
        if (edges.h[i]) cands.push(["h", i]);
        if (edges.v[i]) cands.push(["v", i]);
      }
    if (parity) for (let i = 0; i < 81; i++) if (parity[i]) cands.push(["p", i]);
    // Thermo: jedinica je CIJELA tuba. Skraćivanje termometra nije micanje oznake
    // nego druga slagalica - pozicijski raspon svake ćelije ovisi o duljini tube
    // (vidi thermoRange), pa kraća tuba mijenja i ono što je ostalo.
    if (thermos) for (const t of thermos) cands.push(["t", t]);
    if (!cands.length) return;
    const stoji = () => {
      const r = Solver.solveAndGrade(puzzle, variants, clues);
      return r.solved && r.tier <= maxTier && r.grid.every((v, i) => v === solution[i]);
    };
    for (const [kind, ref] of shuffle(cands)) {
      if (kind === "t") {
        if (thermos.length <= THERMO_KEEP_MIN) continue; // vidi THERMO_KEEP_MIN
        const k = thermos.indexOf(ref);
        thermos.splice(k, 1);
        if (!stoji()) thermos.splice(k, 0, ref); // bez nje ploča stane -> treba ju
        // thermos je wire polje; izvedeni thm bi inače ostao na staroj listi tuba.
        clues.thm = prepThermos(thermos);
        continue;
      }
      const src = kind === "p" ? parity : edges[kind];
      const backup = src[ref];
      src[ref] = 0;
      if (!stoji()) src[ref] = backup; // bez nje ploča stane -> treba ju
    }
  }

  // Očisti suvišne oznake i složi gotovu slagalicu. Tehnike se čitaju NAKON prunea:
  // ploča bez suvišnih oznaka može tražiti drugu tehniku nego prije (chip u UI-ju
  // inače prijavljuje tehniku slagalice koja se više ne isporučuje).
  //
  // Prune ide SAMO na Hard s varijantama. Na Normalu ploča ima 34 zadana broja pa ju
  // klasika nosi gotovo cijelu - prune tamo ispravno zaključi da je skoro svaka
  // oznaka suvišna i ostavi ih 2. Formalno točno (varijanta je i dalje nužna), ali
  // ploča s dva X-a ne izgleda kao XV slagalica. Normal zato drži baznu gustoću:
  // tamo su oznake dodatak, na Hardu nose rješenje.
  function finish(puzzle, solution, difficulty, variants, clues, maxTier, prune) {
    if (prune) pruneMarks(puzzle, solution, variants, clues, maxTier);
    const res = Solver.solveAndGrade(puzzle, variants, clues);
    return {
      puzzle,
      solution,
      difficulty,
      variants,
      techniques: res.techniques || [],
      // Samo wire polja - izvedeno (jig/thm) se ne isporučuje ni ne sprema.
      clues: {
        regions: clues.regions,
        parity: clues.parity,
        edges: clues.edges,
        thermos: clues.thermos,
      },
    };
  }

  // Je li varijanta NUŽNA za ovu slagalicu? Ako je ploča jedinstveno rješiva i kao
  // čisti klasik, varijantna pravila/oznake su dekoracija - igrač ih smije potpuno
  // ignorirati i svejedno doći do istog rješenja. Aditivne varijante samo SUŽAVAJU
  // skup rješenja, pa je klasično rješenje (kad je jedinstveno) nužno ono isto:
  // >1 klasično rješenje znači da varijanta stvarno bira između njih.
  // Jigsaw je iznimka - ZAMJENJUJE box-jedinice, pa "klasična" verzija te ploče
  // rješava drugi problem i usporedba nema smisla.
  function variantNeeded(puzzle, variants, useJig) {
    if (useJig || !variants.length) return true;
    return countSolutions(puzzle.slice(), 2, [], EMPTY_CLUES) > 1;
  }

  // Generira slagalicu tražene težine. Ako u zadanom broju pokušaja ne nađe
  // točan tier, vraća najbliži pronađeni (uvijek nešto rješivo logikom).
  // variants: polje (ili legacy string) aktivnih regijskih varijanti - prazno =
  // classic, "jigsaw" (9 nepravilnih regija umjesto kvadrata), "x" (dvije
  // dijagonale 1-9), "hyper" (4 prozora 1-9), "antiknight" (isti broj zabranjen
  // na skoku konja), "antiking" (isti broj zabranjen na dijagonalnom susjedu),
  // "evenodd" (djelić ćelija označen parno/neparno), "kropki" (točke na bridovima),
  // "xv" (slova X/V na bridovima), ili kombinacija. Rezultat nosi `regions` (81-polje
  // id-eva regije) kad je jigsaw aktivan inače `null`, `parity` (81-polje 0/1/2) kad
  // je evenodd aktivan inače `null`, te `edges` ({ h, v } 81-polja) kad je kropki
  // i/ili xv aktivan inače `null`, te `thermos` (polje putova ćelija, bulb prvi)
  // kad je thermo aktivan inače `null`.
  function generate(difficulty, variants) {
    variants = normVariants(variants);
    const reqTier = REQ_TIER[difficulty] || Solver.T_SINGLE;
    const topTarget = TARGET[difficulty] || 34;
    const attempts = MAX_ATTEMPTS[difficulty] || 150;
    const useJig = variants.includes("jigsaw");
    const useEven = variants.includes("evenodd");
    const useKropki = variants.includes("kropki");
    const useXv = variants.includes("xv");
    const useEdges = useKropki || useXv;
    const useThermo = variants.includes("thermo");
    // Raspon zadanih brojeva vrijedi samo za Hard s varijantama - Normal drži
    // svoju razinu, a Classic nema oznaka koje bi manjak brojeva nadoknadile.
    const spread = difficulty === "hard" && variants.length > 0;
    const floor = spread ? floorFor(variants, topTarget) : topTarget;
    let best = null;

    for (let a = 0; a < attempts; a++) {
      // Novi target po pokušaju - tako partije variraju umjesto da svaka ima isti
      // broj zadanih. Pokušaj koji ipak propadne sljedeći put izvuče drugi broj.
      const target = spread
        ? floor + Math.floor(Math.random() * (topTarget - floor + 1))
        : topTarget;
      // Što manje zadanih brojeva, to gušće oznake (0 na vrhu raspona, 1 na dnu).
      const boost = spread && topTarget > floor ? (topTarget - target) / (topTarget - floor) : 0;
      const geom = newRegionClues(useJig);
      const solution = generateSolution(variants, geom);
      if (!solution) continue; // probijen budžet (loše regije) -> novi pokušaj
      // Parity/edges/thermos se izvode iz rješenja (uvijek konzistentni) pa su aktivni u dig/solveAndGrade.
      const clues = prepClues({
        regions: geom.regions,
        parity: useEven ? deriveParity(solution, boost) : null,
        edges: useEdges ? deriveEdges(solution, useKropki, useXv, boost) : null,
        thermos: useThermo ? deriveThermos(solution, boost) : null,
      });
      const puzzle = dig(solution, target, variants, clues);
      // Varijanta mora nešto raditi - ploču koju klasika sama jedinstveno rješava
      // odbaci (provjeri prije gradinga, countSolutions je jeftiniji od solvera).
      if (!variantNeeded(puzzle, variants, useJig)) continue;
      const res = Solver.solveAndGrade(puzzle, variants, clues);
      if (!res.solved) continue; // traži tehniku koju nemamo -> preskoči
      if (res.grid.some((v, i) => v !== solution[i])) continue; // sigurnosna provjera ispravnosti

      // Ploča s malo zadanih brojeva rješava se pretežno oznakama, pa joj klasične
      // tehnike ispadnu trivijalne (tier-1) - traži li se TOČAN tier, takva se ploča
      // baca kao "prelagana" iako je najviše varijantna. Zato je za Hard s
      // varijantama tier samo gornja granica (bez X-Winga, Vatrina definicija), a
      // težinu nosi broj zadanih brojeva. Classic zadržava točan tier - tamo je
      // tehnika jedina os težine.
      if (spread ? res.tier <= reqTier : res.tier === reqTier)
        return finish(puzzle, solution, difficulty, variants, clues, reqTier, spread);
      if (!best || Math.abs(res.tier - reqTier) < Math.abs(best.tier - reqTier)) {
        best = {
          puzzle,
          solution,
          difficulty,
          techniques: res.techniques,
          tier: res.tier,
          clues,
        };
      }
    }

    // Nema ploče traženog tiera - vrati najbližu nađenu. Prune smije do njenog
    // tiera (ne do reqTier): ploča je već izabrana kao najbliža, ne pogoršavaj ju.
    if (best)
      return finish(
        best.puzzle,
        best.solution,
        difficulty,
        variants,
        best.clues,
        Math.max(reqTier, best.tier),
        spread
      );
    // Krajnji fallback - bilo što rješivo (nove regije za jigsaw, ne recikliraj).
    // Ide na vrh raspona (najviše zadanih, bazna gustoća): ovo je zadnja linija
    // obrane, tu se ne riskira ploča koju igrač ne može riješiti.
    let geom, solution;
    do {
      geom = newRegionClues(useJig);
      solution = generateSolution(variants, geom);
    } while (!solution);
    const clues = prepClues({
      regions: geom.regions,
      parity: useEven ? deriveParity(solution) : null,
      edges: useEdges ? deriveEdges(solution, useKropki, useXv) : null,
      thermos: useThermo ? deriveThermos(solution) : null,
    });
    const puzzle = dig(solution, topTarget, variants, clues);
    // Ovdje ploča nije prošla grading, pa prune ide s najvišim dopuštenim tierom.
    // Ako ni tako nije rješiva, `stoji()` je uvijek false i nijedna oznaka ne pada.
    return finish(puzzle, solution, difficulty, variants, clues, Solver.T_ADVANCED, spread);
  }

  return { generate, isValid, normVariants, generateRegions };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Sudoku;
