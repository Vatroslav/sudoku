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

  // Poznate varijante koje se mogu kombinirati. Aktivni skup = polje ovih id-eva
  // (prazno = classic). Redoslijed je kanonski (za stabilne cache-ključeve i labele).
  // Većina su regijske (šire units/peers); "evenodd" (parity maska) te "kropki" i
  // "xv" (oznake na bridovima) su iznimke - ne diraju units/peers, nose per-puzzle
  // podatak koji provjerava isValid (kao jigsaw regions).
  const REGION_VARIANTS = [
    "antiking",
    "antiknight",
    "x",
    "hyper",
    "jigsaw",
    "evenodd",
    "kropki",
    "xv",
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
  // jig = null | { map: regions, cells: regionCells } - kad je postavljen,
  // box-provjeru zamjenjuje regija ćelije (row/col ostaju).
  // parity = null | 81-polje (0 bez oznake, 1 parno, 2 neparno) - Even/Odd maska.
  // edges = null | { h: 81-polje, v: 81-polje } - Kropki/XV oznake na bridovima
  // (h[i] = brid i↔i+1, v[i] = brid i↔i+9; tipovi kao u edgeOk). Samo pozitivno:
  // prikazana oznaka mora vrijediti; odsutnost ne ograničava ništa.
  function isValid(board, idx, val, variants, jig, parity, edges) {
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
  function countSolutions(board, limit, variants, jig, parity, edges) {
    let bestIdx = -1,
      bestCands = null;
    for (let idx = 0; idx < 81; idx++) {
      if (board[idx] !== 0) continue;
      const cands = [];
      for (let v = 1; v <= 9; v++)
        if (isValid(board, idx, v, variants, jig, parity, edges)) cands.push(v);
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
      count += countSolutions(board, limit, variants, jig, parity, edges);
      board[bestIdx] = 0;
      if (count >= limit) return count;
    }
    return count;
  }

  // Briše ćelije (bez simetrije, za maksimalan izazov) dok čuva jedinstveno
  // rješenje, do otprilike 'target' zadanih ćelija.
  function dig(solution, target, variants, jig, parity, edges) {
    const puzzle = solution.slice();
    let givens = 81;
    for (const idx of shuffle([...Array(81).keys()])) {
      if (givens <= target) break;
      if (puzzle[idx] === 0) continue;
      const backup = puzzle[idx];
      puzzle[idx] = 0;
      if (countSolutions(puzzle.slice(), 2, variants, jig, parity, edges) !== 1)
        puzzle[idx] = backup;
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

  // Za jigsaw partiju: svježe regije + jig kontekst po pokušaju (raznolikost i
  // bijeg iz eventualno lošeg rasporeda). Non-jigsaw -> { regions: null, jig: null }.
  function newRegionCtx(useJig) {
    if (!useJig) return { regions: null, jig: null };
    const regions = generateRegions();
    return { regions, jig: { map: regions, cells: regionsToCells(regions) } };
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
    return countSolutions(puzzle.slice(), 2, [], null, null, null) > 1;
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
  // i/ili xv aktivan inače `null`.
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
      const { regions, jig } = newRegionCtx(useJig);
      const solution = generateSolution(variants, jig);
      if (!solution) continue; // probijen budžet (loše regije) -> novi pokušaj
      // Parity/edges se izvode iz rješenja (uvijek konzistentni) pa su aktivni u dig/solveAndGrade.
      const parity = useEven ? deriveParity(solution, boost) : null;
      const edges = useEdges ? deriveEdges(solution, useKropki, useXv, boost) : null;
      const puzzle = dig(solution, target, variants, jig, parity, edges);
      // Varijanta mora nešto raditi - ploču koju klasika sama jedinstveno rješava
      // odbaci (provjeri prije gradinga, countSolutions je jeftiniji od solvera).
      if (!variantNeeded(puzzle, variants, useJig)) continue;
      const res = Solver.solveAndGrade(puzzle, variants, regions, parity, edges);
      if (!res.solved) continue; // traži tehniku koju nemamo -> preskoči
      if (res.grid.some((v, i) => v !== solution[i])) continue; // sigurnosna provjera ispravnosti

      // Ploča s malo zadanih brojeva rješava se pretežno oznakama, pa joj klasične
      // tehnike ispadnu trivijalne (tier-1) - traži li se TOČAN tier, takva se ploča
      // baca kao "prelagana" iako je najviše varijantna. Zato je za Hard s
      // varijantama tier samo gornja granica (bez X-Winga, Vatrina definicija), a
      // težinu nosi broj zadanih brojeva. Classic zadržava točan tier - tamo je
      // tehnika jedina os težine.
      if (spread ? res.tier <= reqTier : res.tier === reqTier) {
        return {
          puzzle,
          solution,
          difficulty,
          variants,
          techniques: res.techniques,
          regions,
          parity,
          edges,
        };
      }
      if (!best || Math.abs(res.tier - reqTier) < Math.abs(best.tier - reqTier)) {
        best = {
          puzzle,
          solution,
          difficulty,
          techniques: res.techniques,
          tier: res.tier,
          regions,
          parity,
          edges,
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
        parity: best.parity,
        edges: best.edges,
      };
    // Krajnji fallback - bilo što rješivo (nove regije za jigsaw, ne recikliraj).
    // Ide na vrh raspona (najviše zadanih, bazna gustoća): ovo je zadnja linija
    // obrane, tu se ne riskira ploča koju igrač ne može riješiti.
    let ctx, solution;
    do {
      ctx = newRegionCtx(useJig);
      solution = generateSolution(variants, ctx.jig);
    } while (!solution);
    const parity = useEven ? deriveParity(solution) : null;
    const edges = useEdges ? deriveEdges(solution, useKropki, useXv) : null;
    return {
      puzzle: dig(solution, topTarget, variants, ctx.jig, parity, edges),
      solution,
      difficulty,
      variants,
      techniques: [],
      regions: ctx.regions,
      parity,
      edges,
    };
  }

  return { generate, isValid, normVariants, generateRegions };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Sudoku;
