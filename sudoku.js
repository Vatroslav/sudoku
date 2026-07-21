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

  // Disjoint Groups: ćelije na istoj poziciji unutar kutije čine jedinicu (9 grupa
  // po 9 ćelija). Mora se poklapati sa solver.js disjointGroups - generator i solver
  // dijele definiciju, kao kod hyper prozora.
  const disjointPos = (idx) => (Math.floor(idx / 9) % 3) * 3 + ((idx % 9) % 3);
  const disjointGroups = Array.from({ length: 9 }, () => []);
  for (let i = 0; i < 81; i++) disjointGroups[disjointPos(i)].push(i);

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

  // Linijske varijante (Thermo, Palindrome): linija korača po potezu kralja (8
  // susjeda) - smije skretati i dijagonalno. Dijele susjedstvo jer dijele i render.
  const lineNeighbors = [];
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
    lineNeighbors.push(list);
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

  // German Whispers: susjedi na liniji razlikuju se za BAREM 5. Mora se poklapati sa
  // solver.js whisperOk (generator i solver dijele definiciju odnosa, kao edgeOk).
  //
  // Geometrijom je linija (kao Thermo/Palindrome), ali LOGIKOM je bliži Kropkiju:
  // odnos veže samo susjedni PAR, ne poziciju u putu. Zato nema `whisperRange` -
  // dopušteni skup nije interval nego unija dva repa (uz susjeda 3 dopušteno je 8-9,
  // uz 7 samo 1-2), a to u [lo,hi] ne stane. Provjerava se par po par, kao edgeOk.
  const whisperOk = (a, b) => Math.abs(a - b) >= 5;
  // Peta znamenka ne može stajati NIGDJE na liniji: |5-x| >= 5 traži x <= 0 ili
  // x >= 10. Vrijedi na praznoj ploči, bez ijednog popunjenog susjeda - odatle
  // varijanta vuče najveći dio snage (isti odnos kao "pozicija sama" kod Thermo).
  const WHISPER_BAN = 5;

  // Renban: vrijednosti na liniji čine UZASTOPAN skup, u bilo kojem redoslijedu
  // ({4,6,5} je valjano). Mora se poklapati sa solver.js renbanRange.
  //
  // Odnos je treći tip u repou: ne veže poziciju (Thermo), ni susjedni par (Whispers,
  // Kropki), nego CIJELI skup ćelija odjednom - kao Killer, samo što kavez zadaje
  // zbroj a ovdje je zadan RASPON. Odatle i ista struktura granice.
  //
  // Uzastopan skup duljine L koji sadrži najmanju m i najveću M mora stati u prozor
  // od L: svaka vrijednost leži u [M-L+1, m+L-1]. Na praznoj liniji nema što stegnuti
  // (raspon je 1-9) - za razliku od Whispersa (5 otpada odmah) i Therma (pozicija).
  // Snaga dolazi tek s prvim upisom, ali onda naglo: jedan broj na liniji duljine 3
  // ostavlja samo 5 mogućnosti ostalima.
  function renbanRange(board, cells) {
    let m = 10,
      M = 0;
    for (const j of cells) {
      const b = board[j];
      if (!b) continue;
      if (b < m) m = b;
      if (b > M) M = b;
    }
    if (M === 0) return [1, 9]; // nijedan član nije popunjen
    const L = cells.length;
    return [Math.max(1, M - L + 1), Math.min(9, m + L - 1)];
  }

  // Killer: raspon [lo,hi] dopušten ćelija u kavezu zadanog zbroja. Isti oblik kao
  // thermoRange (granice, ne provjera para) pa solver može rezati kandidate odmah.
  //
  // Preostali zbroj (`rest`) dijeli se između ove ćelije i k ostalih praznih. Znamenke
  // u kavezu su RAZLIČITE, pa tih k ne mogu nositi bilo što: najmanje im je 1+2+…+k,
  // najviše 9+8+…, a iz tog raspona slijedi koliko smije ostati nama. Kavez od 3 sa
  // zbrojem 7 i jednom praznom uz nas: ostale dvije nose barem 1+2=3, pa mi ostaje
  // najviše 4.
  //
  // Granica je namjerno gruba - ne gleda KOJE su znamenke već potrošene, samo koliko
  // ih je. Točan skup bi tražio kombinatoriku po kavezu; ovako je jedan prolaz, a
  // ponavljanje unutar kaveza ionako hvata zasebna provjera (vidi isValid).
  const MIN_SUM = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45]; // k(k+1)/2
  const MAX_SUM = [0, 9, 17, 24, 30, 35, 39, 42, 44, 45]; // 9+8+…
  function cageRange(board, cells, sum, idx) {
    let rest = sum,
      k = 0;
    for (const j of cells) {
      if (j === idx) continue;
      if (board[j]) rest -= board[j];
      else k++;
    }
    return [Math.max(1, rest - MAX_SUM[k]), Math.min(9, rest - MIN_SUM[k])];
  }

  // Indeks ćelija -> { cells, sum }. Kavezi se ne preklapaju pa je po ćeliji najviše
  // jedan (isti odnos kao thermos -> thm).
  function prepCages(cages) {
    if (!cages || !cages.length) return null;
    const at = new Array(81).fill(null);
    for (const cage of cages) for (const i of cage.cells) at[i] = cage;
    return at;
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

  // Whispers: isti izvedeni oblik kao tube ({ path, pos } po ćeliji) - linije se ne
  // preklapaju pa je po ćeliji najviše jedna. Pozicija se ovdje ne koristi za raspon
  // nego samo da se nađu susjedi na liniji (path[pos±1]).
  const prepWhispers = prepThermos;
  // Renban: odnos gleda CIJELU liniju odjednom (kao kavez), pa je izvedeni oblik
  // { cells } - pozicija ne igra ulogu jer je redoslijed na liniji slobodan.
  function prepRenbans(renbans) {
    if (!renbans || !renbans.length) return null;
    const at = new Array(81).fill(null);
    for (const path of renbans) for (const i of path) at[i] = { cells: path };
    return at;
  }

  // Palindrome i Clone svode se na ISTI odnos - "ove dvije ćelije nose istu
  // vrijednost" - pa dijele izvedeni oblik: 81-polje indeksa partnera (-1 = nema ga).
  // Cijeli odnos ćelije staje u taj jedan broj: za razliku od termometra, gdje raspon
  // ovisi o poziciji i duljini cijele tube, ovdje ni isValid ni solver ne trebaju
  // znati put ni oblik regije. Zato Clone nije dodao nijednu novu granu u
  // isValid/computeCandidates/place - samo drugi izvor partnera.
  //
  // Jedan partner po ćeliji dovoljan je jer generator ne pušta dvije oznake kroz istu
  // ćeliju (deriveClones dobiva ćelije linija kao `blocked`). Kad bi se ipak sudarile,
  // klon bi pregazio palindrom - solver bi bio slabiji, nikad krivi: obje relacije
  // vrijede u rješenju, pa ispuštena znači samo nepotrošen trag.
  function prepMates(pals, clones) {
    const hasPal = !!(pals && pals.length),
      hasClone = !!(clones && clones.length);
    if (!hasPal && !hasClone) return null;
    const mate = new Array(81).fill(-1);
    // Palindrom: partner je zrcalna pozicija (sredina neparne linije nema partnera).
    if (hasPal)
      for (const path of pals)
        for (let p = 0; p < path.length; p++) {
          const q = path.length - 1 - p;
          if (q !== p) mate[path[p]] = path[q];
        }
    // Clone: partner je ćelija na ISTOJ poziciji u drugoj regiji para.
    if (hasClone)
      for (const [a, b] of clones)
        for (let p = 0; p < a.length; p++) {
          mate[a[p]] = b[p];
          mate[b[p]] = a[p];
        }
    return mate;
  }

  // clues = SVI per-puzzle podaci u jednom objektu (za razliku od `variants`, koji
  // vrijedi za cijelu partiju). Prije je svaki od njih bio zaseban parametar pa je
  // isValid narastao na 8; svaka nova derivacijska varijanta dodavala je još jedan
  // kroz cijeli lanac (isValid -> countSolutions -> dig -> solveAndGrade -> explainNext).
  // Ovako ih dodaje NULA - novo polje putuje samo po sebi.
  //
  // Dvije vrste polja i zato ih gradi jedno mjesto:
  //   - wire (regions/parity/edges/thermos/palindromes/clones) - ono što ide u state
  //     i localStorage,
  //   - izvedeno (jig/thm/mate) - brzi oblici koje isValid gleda u vrućoj petlji.
  // Izvedeno se NE sprema; prepClues ga svaki put složi iz wire polja.
  function prepClues(c) {
    const regions = (c && c.regions) || null;
    const thermos = (c && c.thermos) || null;
    const palindromes = (c && c.palindromes) || null;
    const clones = (c && c.clones) || null;
    const cages = (c && c.cages) || null;
    const whispers = (c && c.whispers) || null;
    const renbans = (c && c.renbans) || null;
    return {
      regions,
      parity: (c && c.parity) || null,
      edges: (c && c.edges) || null,
      thermos,
      palindromes,
      clones,
      cages,
      whispers,
      renbans,
      // jig se drži uz regions: isValid ne smije po ćeliji tražiti tko je u kojoj regiji.
      jig: regions ? { map: regions, cells: regionsToCells(regions) } : null,
      thm: prepThermos(thermos),
      whi: prepWhispers(whispers),
      rnb: prepRenbans(renbans),
      // Jedno polje partnera za obje varijante jednakosti - vidi prepMates.
      mate: prepMates(palindromes, clones),
      cag: prepCages(cages),
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
    "disjoint",
    "evenodd",
    "kropki",
    "xv",
    "thermo",
    "palindrome",
    "whisper",
    "renban",
    "clone",
    "killer",
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
  //   mate - 81-polje indeksa partnera koji mora nositi ISTU vrijednost (vidi
  //     prepMates); pune ga Palindrome linije i Clone regije.
  function isValid(board, idx, val, variants, clues = EMPTY_CLUES) {
    const { jig, parity, edges, thm, mate, cag, whi, rnb } = clues;
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
    if (variants.includes("disjoint")) {
      for (const j of disjointGroups[disjointPos(idx)]) if (board[j] === val) return false;
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
    // German Whispers: 5 nikad (vrijedi bez ijednog susjeda), inače provjeri samo
    // POPUNJENE susjede na liniji - drugi smjer stigne kad na njega dođe red, kao
    // kod brid-oznaka.
    if (whi && whi[idx]) {
      if (val === WHISPER_BAN) return false;
      const { path, pos } = whi[idx];
      for (const q of [pos - 1, pos + 1]) {
        if (q < 0 || q >= path.length) continue;
        const b = board[path[q]];
        if (b && !whisperOk(val, b)) return false;
      }
    }
    // Renban: znamenke na liniji su različite i moraju stati u prozor od L uzastopnih.
    // Ponavljanje se provjerava izravno (linija nije jedinica pa ju peers ne pokrivaju),
    // raspon kroz renbanRange - isti par provjera kao kod kaveza.
    if (rnb && rnb[idx]) {
      const { cells } = rnb[idx];
      for (const j of cells) if (j !== idx && board[j] === val) return false;
      const [lo, hi] = renbanRange(board, cells);
      if (val < lo || val > hi) return false;
    }
    // Palindrome/Clone: partner mora nositi ISTU vrijednost. Provjerava se samo kad
    // je popunjen - drugi smjer stigne kad na njega dođe red (kao kod brid-oznaka).
    if (mate && mate[idx] >= 0) {
      const m = board[mate[idx]];
      if (m && m !== val) return false;
    }
    // Killer: znamenke u kavezu su različite i moraju dati zadani zbroj. Ponavljanje
    // se provjerava izravno (kavez nije jedinica pa ga peers ne pokrivaju), zbroj kroz
    // raspon - vidi cageRange.
    if (cag && cag[idx]) {
      const { cells, sum } = cag[idx];
      for (const j of cells) if (j !== idx && board[j] === val) return false;
      const [lo, hi] = cageRange(board, cells, sum, idx);
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
  // blocked = 81-polje bool ćelija koje je već zauzela druga oznaka (Clone).
  function deriveThermos(solution, boost = 0, blocked = null) {
    const want = Math.round(MAX_THERMOS * pickDensity(scaled(THERMO_DENSITY, boost)));
    // Termometri se NE preklapaju: dvije tube kroz istu ćeliju su i za oko i za
    // render (segment po ćeliji) nered, a dobiju se i bez toga.
    const used = blocked ? blocked.slice() : new Array(81).fill(false);
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
          lineNeighbors[cur].filter((n) => !used[n] && solution[n] > solution[cur])
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

  // Palindrome: linija čije se vrijednosti čitaju isto u oba smjera (path[p] ===
  // path[len-1-p]).
  //
  // Doc ga, kao i Thermo, svrstava u "geometrija-first" - i tu je iz istog razloga u
  // krivu: derive pipeline izvodi liniju IZ gotovog rješenja. Razlika prema termometru
  // je u SMJERU rasta: Thermo je šetnja s jednog kraja (svaki korak gleda samo
  // prethodnika), a palindromski uvjet veže parove s OBA kraja - pa linija raste iz
  // sredine prema van, u parovima. Tako je svaki dodani par jednak po konstrukciji i
  // nemoguća linija se ne može proizvesti.
  //
  // Samo NEPARNE duljine (3/5/7): sredina je slobodna ćelija i sjeme je bilo koja
  // ćelija. Parna linija bi tražila sjeme od dva susjeda jednake vrijednosti - dodatan
  // slučaj za raspon koji neparne već pokrivaju.
  const PAL_LENS = [3, 5, 7];
  const MAX_PALINDROMES = 12;
  const PAL_DENSITY = { min: 0.3, max: 0.5 };
  // Kao THERMO_KEEP_MIN: linija je strukturni objekt i jedna usamljena se čita kao
  // greška, pa prune ne smije ispod ovoga (vidi komentar uz THERMO_KEEP_MIN).
  // Izmjereno bez granice (30 Hard ploča): 17/30 spuštenih na 3 linije - prune ih
  // reže do dna jer na vrhu raspona klasika nosi ploču gotovo cijelu. S granicom:
  // 4-8 linija (17-36 ćelija), isti red veličine kao Thermo (4-8 tuba, 12-29 ćelija).
  const PALINDROME_KEEP_MIN = 4;
  // blocked = 81-polje bool ćelija koje su već zauzete drugom linijskom varijantom
  // (Thermo). Preklop linija se ne radi: render crta segmente PO ĆELIJI, pa bi dvije
  // linije kroz istu ćeliju bile i nečitljive i dvosmislene.
  function derivePalindromes(solution, boost = 0, blocked = null) {
    const want = Math.round(MAX_PALINDROMES * pickDensity(scaled(PAL_DENSITY, boost)));
    const used = blocked ? blocked.slice() : new Array(81).fill(false);
    const pals = [];
    for (const seed of shuffle([...Array(81).keys()])) {
      if (pals.length >= want) break;
      if (used[seed]) continue;
      const maxLen = PAL_LENS[Math.floor(Math.random() * PAL_LENS.length)];
      let path = [seed];
      const mine = new Set([seed]); // vlastiti put; `used` pokriva tuđe linije
      while (path.length + 2 <= maxLen) {
        const free = (n) => !used[n] && !mine.has(n);
        const heads = shuffle(lineNeighbors[path[0]].filter(free));
        let grew = false;
        for (const a of heads) {
          const tails = shuffle(
            lineNeighbors[path[path.length - 1]].filter(
              (b) => b !== a && free(b) && solution[b] === solution[a]
            )
          );
          if (!tails.length) continue;
          path = [a, ...path, tails[0]];
          mine.add(a);
          mine.add(tails[0]);
          grew = true;
          break;
        }
        if (!grew) break;
      }
      if (path.length < PAL_LENS[0]) continue;
      for (const i of path) used[i] = true;
      pals.push(path);
    }
    return pals;
  }

  // German Whispers: linija duž koje se SUSJEDI razlikuju za barem 5.
  //
  // Derive je šetnja kao kod Thermo, samo s drugim uvjetom koraka - najbliže
  // copy-pasteu jezgre dosad. Dvije razlike koje nisu očite:
  //
  //  1. **Ponavljanje ćelije mora se provjeriti ručno.** Kod tube strogi rast to
  //     jamči besplatno (vrijednost bi morala biti veća od same sebe), pa
  //     deriveThermos gleda samo tuđe tube. Whisper odnos je simetričan - 1-7-1 je
  //     valjan niz - i put bi se rado vratio na sebe. Odatle `mine` (kao Palindrome).
  //  2. **Šetnja ne kreće iz niskih vrijednosti** (Thermo kreće, jer iz 9 nema kamo).
  //     Ovdje su i 1 i 9 jednako dobri startovi; jedino 5 nema nijednog partnera pa
  //     ispada sam od sebe, bez posebne provjere.
  const WHISPER_LEN = { min: 3, max: 6 };
  const MAX_WHISPERS = 12;
  const WHISPER_DENSITY = { min: 0.3, max: 0.5 };
  // Isti argument kao THERMO_KEEP_MIN/PALINDROME_KEEP_MIN - linija je strukturni
  // objekt i jedna usamljena se čita kao greška. Vrijednost je izmjerena, vidi todo.md.
  const WHISPER_KEEP_MIN = 4;
  // blocked = ćelije koje je zauzela druga oznaka (Clone/Thermo/Palindrome).
  function deriveWhispers(solution, boost = 0, blocked = null) {
    const want = Math.round(MAX_WHISPERS * pickDensity(scaled(WHISPER_DENSITY, boost)));
    const used = blocked ? blocked.slice() : new Array(81).fill(false);
    const whispers = [];
    for (const start of shuffle([...Array(81).keys()])) {
      if (whispers.length >= want) break;
      if (used[start]) continue;
      const maxLen =
        WHISPER_LEN.min + Math.floor(Math.random() * (WHISPER_LEN.max - WHISPER_LEN.min + 1));
      const path = [start];
      const mine = new Set([start]);
      let cur = start;
      while (path.length < maxLen) {
        const next = shuffle(
          lineNeighbors[cur].filter(
            (n) => !used[n] && !mine.has(n) && whisperOk(solution[n], solution[cur])
          )
        );
        if (!next.length) break;
        cur = next[0];
        path.push(cur);
        mine.add(cur);
      }
      if (path.length < WHISPER_LEN.min) continue;
      for (const i of path) used[i] = true;
      whispers.push(path);
    }
    return whispers;
  }

  // Renban: linija čije vrijednosti čine uzastopan skup, u bilo kojem redoslijedu.
  //
  // Derive je opet šetnja, ali s invariantom koju prethodne dvije nisu imale: skup
  // mora biti uzastopan U SVAKOM KORAKU, ne tek na kraju. Zato se smije dodati samo
  // susjed čija je vrijednost trenutni min-1 ili max+1 - tada je proširen skup nužno
  // opet uzastopan i nemoguća linija ne može nastati.
  //
  // Cijena te invariante je da neke valjane linije promaknu: put koji bi preko "rupe"
  // (npr. {4,6} pa kasnije 5) došao do uzastopnog skupa odbacuje se čim rupa nastane.
  // Ne popravlja se jer bi tražilo pretragu s vraćanjem umjesto šetnje, a mjereno ih i
  // ovako ima dovoljno (4-8 po ploči, isto kao tube i whisperi).
  //
  // Ponavljanje je nemoguće po konstrukciji (min-1 i max+1 nisu u skupu), pa `mine`
  // nije potreban - za razliku od Whispersa, gdje je odnos simetričan pa se put zna
  // vratiti na sebe.
  const RENBAN_LEN = { min: 3, max: 5 };
  const MAX_RENBANS = 12;
  const RENBAN_DENSITY = { min: 0.3, max: 0.5 };
  // Isti argument kao THERMO_KEEP_MIN/PALINDROME_KEEP_MIN/WHISPER_KEEP_MIN.
  const RENBAN_KEEP_MIN = 4;
  function deriveRenbans(solution, boost = 0, blocked = null) {
    const want = Math.round(MAX_RENBANS * pickDensity(scaled(RENBAN_DENSITY, boost)));
    const used = blocked ? blocked.slice() : new Array(81).fill(false);
    const renbans = [];
    for (const start of shuffle([...Array(81).keys()])) {
      if (renbans.length >= want) break;
      if (used[start]) continue;
      const maxLen =
        RENBAN_LEN.min + Math.floor(Math.random() * (RENBAN_LEN.max - RENBAN_LEN.min + 1));
      const path = [start];
      let lo = solution[start],
        hi = solution[start];
      let cur = start;
      while (path.length < maxLen) {
        const next = shuffle(
          lineNeighbors[cur].filter((n) => {
            if (used[n]) return false;
            const v = solution[n];
            return v === lo - 1 || v === hi + 1;
          })
        );
        if (!next.length) break;
        cur = next[0];
        const v = solution[cur];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        path.push(cur);
      }
      if (path.length < RENBAN_LEN.min) continue;
      for (const i of path) used[i] = true;
      renbans.push(path);
    }
    return renbans;
  }

  // Clone: dvije regije istog oblika nose iste znamenke u odgovarajućim ćelijama.
  // Wire oblik je par putova jednake duljine ([[a0,a1,...],[b0,b1,...]]) - odnos je
  // "po indeksu", pa se čita bez ikakve geometrije (vidi prepMates).
  //
  // Kopija je čista TRANSLACIJA (bez rotacije i zrcaljenja): igrač mora na prvi
  // pogled znati koja ćelija odgovara kojoj, a to nosi isti oblik u istoj
  // orijentaciji. Zato regiju definira jedan pomak (dr,dc) i skup ćelija.
  //
  // Oba pomaka moraju biti različita od nule: ćelije istog reda (ili stupca) ne mogu
  // nositi istu vrijednost, pa takav pomak ne bi dao nijedan par. Ostatak (isti blok,
  // preklop s dijagonalom kod X-a) ne treba filtrirati - traži se jednakost U
  // RJEŠENJU, pa nemoguć par jednostavno ne prođe.
  //
  // Kao i linije, regija raste iz sjemena, ali ORTOGONALNO (blob, ne put): oblik se
  // čita kao mrlja, a ne kao niz, pa je dijagonalni korak samo dodatna dvosmislenost.
  const CLONE_SIZE = { min: 3, max: 6 };
  const MAX_CLONES = 4;
  const CLONE_DENSITY = { min: 0.5, max: 1 };
  // Dno je 1 par, a ne 4 kao kod tube i linije (vidi KEEP_MIN). Dva razloga, oba
  // izmjerena:
  //   1. Prune ga jedva dira - bez ikakve granice samo 1/30 Hard ploča padne na jedan
  //      par (Thermo 12/30 na <=2 tube, Palindrome 17/30 na 3 linije). Jedinica je
  //      grublja: micanje para skida 3-6 jednakosti odjednom, pa ploča obično stane.
  //   2. Jedan par NIJE greška. Usamljen termometar se čita kao propust, ali klon je
  //      po definiciji "nešto i njegova kopija" - dvije obojane regije su minimalna
  //      ISPRAVNA slika varijante.
  //
  // Dno na 1 (umjesto nikakvog) jer se u kombinaciji ploča NE zaustavi: kad rješenje
  // nosi druga varijanta, prune pojede i zadnji par - Diagonal+Clone isporučio 4/20
  // Hard ploča bez ijedne obojane regije.
  //
  // blocked = 81-polje bool ćelija koje su već zauzete linijskom varijantom (Thermo,
  // Palindrome). Klon boji CIJELU ćeliju, pa bi ispod boje linija bila nečitljiva.
  function deriveClones(solution, boost = 0, blocked = null) {
    const want = Math.round(MAX_CLONES * pickDensity(scaled(CLONE_DENSITY, boost)));
    const used = blocked ? blocked.slice() : new Array(81).fill(false);
    const clones = [];
    const offsets = [];
    for (let dr = -8; dr <= 8; dr++)
      for (let dc = -8; dc <= 8; dc++) if (dr && dc) offsets.push([dr, dc]);

    // Svaki par dobiva SVOJ pomak: dva para s istim pomakom čitaju se kao jedna veća
    // (razlomljena) regija umjesto kao dva klona.
    for (const [dr, dc] of shuffle(offsets)) {
      if (clones.length >= want) break;
      const shift = (i) => {
        const r = Math.floor(i / 9) + dr,
          c = (i % 9) + dc;
        return r >= 0 && r < 9 && c >= 0 && c < 9 ? r * 9 + c : -1;
      };
      for (const seed of shuffle([...Array(81).keys()])) {
        const mine = new Set();
        // Ćelija ulazi u regiju samo ako i ona i njena kopija stoje slobodne i nose
        // istu vrijednost u rješenju. `mine` drži OBJE strane pa se regija i njena
        // kopija ne mogu preklopiti (bez toga bi mali pomak dao besmislen par).
        const ok = (n) => {
          if (used[n] || mine.has(n)) return false;
          const m = shift(n);
          return m >= 0 && !used[m] && !mine.has(m) && solution[n] === solution[m];
        };
        if (!ok(seed)) continue;
        const a = [seed],
          b = [shift(seed)];
        mine.add(seed);
        mine.add(b[0]);
        const maxLen =
          CLONE_SIZE.min + Math.floor(Math.random() * (CLONE_SIZE.max - CLONE_SIZE.min + 1));
        while (a.length < maxLen) {
          const next = shuffle([...new Set(a.flatMap(orthNeighbors))]).find(ok);
          if (next === undefined) break;
          a.push(next);
          b.push(shift(next));
          mine.add(next);
          mine.add(b[b.length - 1]);
        }
        if (a.length < CLONE_SIZE.min) continue;
        for (const i of mine) used[i] = true;
        clones.push([a, b]);
        break; // ovaj pomak je iskorišten - sljedeći par traži novi
      }
    }
    return clones;
  }

  // Killer: kavez je mrlja ćelija sa zadanim zbrojem, unutar koje se znamenka ne
  // ponavlja. Četvrta varijanta koju doc svrstava u "geometrija-first" i četvrti put
  // iz istog razloga u krivu: doc pretpostavlja setup() koji složi kaveze PRIJE
  // rješenja, pa bi trebalo naći rješenje koje im odgovara. Derive pipeline ide
  // obrnuto - mrlja slobodno raste, a zbroj se IZRAČUNA iz rješenja kad stane, pa
  // nemoguć kavez ne može nastati i generator ostaje netaknut.
  //
  // Rast je isti kao kod klona (ortogonalno, mrlja a ne put), samo bez podudaranja na
  // pomaku: ćelija ulazi ako je slobodna i njena vrijednost još nije u kavezu. Zato je
  // kavez NAJMANJE vezana oznaka koju imamo - i zato ide zadnji u derive nizu
  // (vidi deriveGeom).
  //
  // Gustoća je namjerno visoka i mjeri se u POKRIVENIM ĆELIJAMA, ne u broju kaveza:
  // Killer je jedina varijanta koju igrači prepoznaju po tome što kavezi pokrivaju
  // ploču. Pet kaveza razbacanih po ploči formalno je Killer, ali se ne čita kao
  // Killer - isti argument kao THERMO_KEEP_MIN, samo primijenjen na gustoću.
  const CAGE_SIZE = { min: 2, max: 5 };
  const CAGE_DENSITY = { min: 0.55, max: 0.75 };
  // Pokrivenost koju prune smije ostaviti (isti razlog kao THERMO_KEEP_MIN, samo
  // mjereno u ćelijama - vidi granu "g" u pruneMarks).
  //
  // RASPON, ne jedna vrijednost, i to je bitno: gustoća kaveza JEST nasumična po ploči
  // (CAGE_DENSITY daje 45-61 ćelija), ali s fiksnim dnom prune svaku ploču sveže na
  // isto - izmjereno 40-45 ćelija kad je Killer sam i 40-41 u kombinacijama, bez obzira
  // odakle je ploča krenula. Nasumičnost se tiho gubila u pruneu. S rasponom dno varira
  // po partiji (38-53 izmjereno), pa neka ploča ostane gusto pokrivena a neka
  // prozračna; kad dno ispadne više od izvedenog, prune kaveze ne dira.
  //
  // `min` je apsolutno dno i ono ide u KEEP_MIN.killer - marksThin njime odbacuje
  // pokušaj još u generaciji, dakle prije nego se za tu ploču izvuče dno prunea.
  const CAGE_KEEP_CELLS = { min: 38, max: 52 };
  // blocked = 81-polje bool ćelija koje je već zauzela druga oznaka (Clone, linije).
  function deriveCages(solution, boost = 0, blocked = null) {
    const want = Math.round(81 * pickDensity(scaled(CAGE_DENSITY, boost)));
    const used = blocked ? blocked.slice() : new Array(81).fill(false);
    const cages = [];
    let covered = 0;
    for (const seed of shuffle([...Array(81).keys()])) {
      if (covered >= want) break;
      if (used[seed]) continue;
      const cells = [seed];
      const vals = new Set([solution[seed]]);
      const maxLen =
        CAGE_SIZE.min + Math.floor(Math.random() * (CAGE_SIZE.max - CAGE_SIZE.min + 1));
      while (cells.length < maxLen) {
        const next = shuffle([...new Set(cells.flatMap(orthNeighbors))]).find(
          (n) => !used[n] && !cells.includes(n) && !vals.has(solution[n])
        );
        if (next === undefined) break;
        cells.push(next);
        vals.add(solution[next]);
      }
      // Kavez od jedne ćelije je zadani broj napisan sitno - ne oznaka.
      if (cells.length < CAGE_SIZE.min) continue;
      for (const i of cells) used[i] = true;
      covered += cells.length;
      cages.push({ cells, sum: cells.reduce((a, i) => a + solution[i], 0) });
    }
    return cages;
  }

  // 81-polje bool: ćelije kroz koje prolazi neka od danih linija (null ako ih nema).
  const lineCells = (paths) => {
    if (!paths || !paths.length) return null;
    const used = new Array(81).fill(false);
    for (const p of paths) for (const i of p) used[i] = true;
    return used;
  };

  const TARGET = { normal: 34, hard: 28 };
  const REQ_TIER = { normal: Solver.T_SINGLE, hard: Solver.T_INTER };
  const MAX_ATTEMPTS = { normal: 120, hard: 200 };
  // Koliko puta krajnji fallback smije ponoviti izvod tražeći dno oznaka prije nego
  // pusti i ploču bez njega (vidi KEEP_MIN). Ta petlja nema drugog izlaza - mora ga
  // imati ovdje, inače bi kombinacija kojoj izvod dno ne dosegne vrtjela zauvijek.
  const FALLBACK_TRIES = 40;

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
    killer: 16,
    kropki: 18,
    evenodd: 15,
    thermo: 12,
    // Whisper: pravilo iz v1.35.0 (mjeriti na kombinacijama) ovdje je bilo presudno,
    // i to oštrije nego kod Disjointa. Solo ploča ne primijeti razliku - sa 12 daje
    // 16-28 zadanih uz 10ms - ali whisper+clone tada skoči na **195s max** (prosjek
    // 10s). Sa 10 je isti par 155ms, dakle tisuću puta brže za dvije točke snage.
    // Uzeto 10, a ne 8: solo raspon je bolji (19-28 prema 20-28), a najgori rep ostaje
    // 2.5s (whisper+thermo) - u rangu zatečenog clone+thermo.
    whisper: 10,
    // Renban dijeli snagu s hyperom/disjointom. Mjereno po pravilu iz v1.35.0/v1.36.0
    // (na kombinacijama): sa 10 su renban+thermo i renban+killer imali repove od 30s
    // odnosno 29s, sa 8 su u sekundi. Solo raspon gubi točno jedan zadani broj
    // (20-28 prema 19-28) - jeftina zamjena.
    //
    // OPREZ, izmjereno i zabilježeno: renban+thermo ima rijedak ali dubok rep. Na 110
    // ploča medijan je 17ms i najgore 6.2s (1/80 iznad 5s), ali jedno ranije mjerenje
    // uhvatilo je pokušaj od ~374s koji se poslije nije ponovio. Rep je zato stvaran,
    // samo rijedak; nosi ga Cancel + worker (v1.17.0). Ako se ikad pokaže čestim, prvo
    // pogledati taj par.
    renban: 8,
    xv: 10,
    palindrome: 10,
    clone: 10,
    hyper: 8,
    // Disjoint dijeli snagu s hyperom (obje su unit-varijante sličnog obuhvata) i to
    // je mjereno, ne pretpostavljeno. Zid je NIŽI - sa 14 ploče idu do 18 zadanih, sa
    // 20 do 17 - ali dublje dno plaćaju KOMBINACIJE, ne solo ploča: sa 14 je
    // disjoint+thermo skočio na max 63s, a disjoint+clone sa 10 na 36s (zatečeno
    // najgore je clone+thermo, 14s). Sa 8 su oba u sekundi-dvije, uz solo raspon
    // 20-28 - isti kao hyper. Dobitak od 2 zadana ne vrijedi 30× sporije kombinacije.
    disjoint: 8,
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

  // Koliko VIDLJIVIH oznaka varijanta trenutno ima na ploči. Jedinica je ono što oko
  // čita kao jednu oznaku: kvadrat/krug (Even/Odd), točka (Kropki), slovo (XV), cijela
  // tuba/linija/par regija (Thermo/Palindrome/Clone). Regijske varijante (x, hyper,
  // jigsaw, antiknight, antiking) vraćaju null - one mijenjaju PRAVILA, pa su na ploči
  // i bez ijedne oznake i nema se što brojati.
  function markCount(v, clues) {
    const { parity, edges, thermos, palindromes, clones, cages, whispers, renbans } = clues;
    const edgesIn = (lo, hi) => {
      if (!edges) return 0;
      let n = 0;
      for (let i = 0; i < 81; i++) {
        if (edges.h[i] >= lo && edges.h[i] <= hi) n++;
        if (edges.v[i] >= lo && edges.v[i] <= hi) n++;
      }
      return n;
    };
    if (v === "evenodd") return parity ? parity.reduce((a, p) => a + (p ? 1 : 0), 0) : 0;
    if (v === "kropki") return edgesIn(1, 2); // tipovi 1-2 = točke
    if (v === "xv") return edgesIn(3, 4); // tipovi 3-4 = slova
    if (v === "thermo") return thermos ? thermos.length : 0;
    if (v === "palindrome") return palindromes ? palindromes.length : 0;
    if (v === "whisper") return whispers ? whispers.length : 0;
    if (v === "renban") return renbans ? renbans.length : 0;
    if (v === "clone") return clones ? clones.length : 0;
    // Killer je jedini kojem jedinica NIJE oznaka nego POKRIVENA ĆELIJA: kavez od 2 i
    // kavez od 5 ne nose isto, a ono što se čita kao Killer je pokrivenost ploče
    // (vidi CAGE_KEEP_CELLS). Zato mu `left` pada za cijeli kavez, a ne za 1.
    if (v === "killer") return cages ? cages.reduce((a, g) => a + g.cells.length, 0) : 0;
    return null;
  }

  // Najmanje oznaka koje odabrana varijanta MORA imati na isporučenoj ploči.
  //
  // Bez ovoga varijanta zna s ploče nestati do kraja. `variantNeeded` traži samo da
  // SKUP varijanti nešto radi, ne svaka pojedina - pa kad ploču nosi ona druga
  // (Diagonal sam jedinstveno rješava), prune ispravno zaključi da je suvišna svaka
  // oznaka one prve i pobriše ih sve. Izmjereno na 20 Hard ploča po kombinaciji:
  // Clone+Killer 6/20 bez ijednog klona, Antiknight+Even/Odd 5/20 bez ijedne oznake
  // parnosti, Diagonal+Clone 4/20, Diagonal+Kropki 3/20, Kropki+Killer i Hyper+Even/Odd
  // 2/20. Solo varijanta na nulu ne može (variantNeeded jamči da barem jedna oznaka nosi
  // rješenje) - rupa je isključivo u kombinacijama, i tim češća što je druga varijanta
  // jača (zato ju je Killer, najjača dosad, izbacio na površinu).
  //
  // Dno je namjerno VIDLJIVO, ne 1: ploča s jednom oznakom parnosti formalno jest
  // Even/Odd, ali se ne čita kao Even/Odd. Isti argument kojim THERMO_KEEP_MIN odbija
  // usamljenu tubu, samo proširen na sve oznakovne varijante.
  //
  // Dno vrijedi na OBA kraja: prune ispod njega ne reže, a izvod koji ga ne dosegne
  // odbacuje pokušaj (vidi marksThin). Cijena je nešto oznaka koje igraču ne trebaju -
  // isti trošak koji THERMO_KEEP_MIN već svjesno plaća.
  const KEEP_MIN = {
    // Točkaste oznake: dno je "vidi se da je to ta slagalica". Bazni izvod ih daje
    // 19-31 (Even/Odd) odnosno 14-25 (Kropki), pa dno rijetko i zagrebe.
    evenodd: 6,
    kropki: 6,
    xv: 5, // manje parova kvalificira (zbroj 5/10) pa je i prirodan broj niži
    thermo: THERMO_KEEP_MIN,
    palindrome: PALINDROME_KEEP_MIN,
    whisper: WHISPER_KEEP_MIN,
    renban: RENBAN_KEEP_MIN,
    clone: 1, // par regija je "nešto i njegova kopija" - jedan je ISPRAVNA slika
    killer: CAGE_KEEP_CELLS.min, // jedini mjeren u ĆELIJAMA - vidi markCount
  };

  // Je li ijedna odabrana varijanta ispod svog dna oznaka?
  const marksThin = (variants, clues) =>
    variants.some((v) => {
      const n = markCount(v, clues);
      return n !== null && n < (KEEP_MIN[v] || 0);
    });

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
    const { parity, edges, thermos, palindromes, clones, cages, whispers, renbans } = clues;
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
    // Palindrome: kao tuba, jedinica je CIJELA linija - skraćivanje bi premjestilo
    // sve zrcalne parove (partner ovisi o duljini), dakle druga slagalica.
    if (palindromes) for (const p of palindromes) cands.push(["l", p]);
    // Clone: jedinica je CIJELI par regija - jedna regija bez svoje kopije nije oznaka
    // nego obojana mrlja bez značenja.
    if (clones) for (const c of clones) cands.push(["c", c]);
    // Killer: jedinica je CIJELI kavez. Smanjivanje kaveza nije micanje oznake nego
    // drugi zbroj nad drugim ćelijama, dakle druga slagalica (kao tuba i linija).
    if (cages) for (const g of cages) cands.push(["g", g]);
    // Whispers: kao tuba i linija, jedinica je CIJELA linija. Ovdje je razlog čak
    // izravniji - odnos veže susjedne parove, pa skraćivanje raskida par koji je
    // možda jedini nosio informaciju.
    if (whispers) for (const w of whispers) cands.push(["w", w]);
    // Renban: kao ostale linije, jedinica je CIJELA linija - skraćivanje mijenja L, a
    // o L ovisi cijeli raspon (vidi renbanRange), dakle druga slagalica.
    if (renbans) for (const r of renbans) cands.push(["r", r]);
    if (!cands.length) return;
    // Živi broj oznaka po varijanti - pada kako prune miče. Ispod KEEP_MIN se ne ide,
    // pa odabrana varijanta ostane na ploči i kad joj kombinacija oduzme sav posao.
    const left = {};
    for (const v of variants) {
      const n = markCount(v, clues);
      if (n !== null) left[v] = n;
    }
    const mayDrop = (v) => (left[v] || 0) > (KEEP_MIN[v] || 0);
    // Killerovo dno se bira po ploči, iz raspona (vidi CAGE_KEEP_CELLS) - zato ovdje, a
    // ne u KEEP_MIN: prune se zove jednom pa je dno stabilno kroz cijeli prolaz. Random
    // se poziva SAMO kad kaveza ima; inače bi pomaknuo RNG niz i pločama bez Killera, pa
    // ista sjemenka više ne bi davala istu ploču (regresija to uhvati odmah).
    const keepCages = cages
      ? CAGE_KEEP_CELLS.min +
        Math.floor(Math.random() * (CAGE_KEEP_CELLS.max - CAGE_KEEP_CELLS.min + 1))
      : 0;
    const stoji = () => {
      const r = Solver.solveAndGrade(puzzle, variants, clues);
      return r.solved && r.tier <= maxTier && r.grid.every((v, i) => v === solution[i]);
    };
    for (const [kind, ref] of shuffle(cands)) {
      if (kind === "t") {
        if (!mayDrop("thermo")) continue;
        const k = thermos.indexOf(ref);
        thermos.splice(k, 1);
        if (stoji()) left.thermo--;
        else thermos.splice(k, 0, ref); // bez nje ploča stane -> treba ju
        // thermos je wire polje; izvedeni thm bi inače ostao na staroj listi tuba.
        clues.thm = prepThermos(thermos);
        continue;
      }
      if (kind === "r") {
        if (!mayDrop("renban")) continue;
        const k = renbans.indexOf(ref);
        renbans.splice(k, 1);
        if (stoji()) left.renban--;
        else renbans.splice(k, 0, ref); // bez nje ploča stane -> treba ju
        clues.rnb = prepRenbans(renbans); // wire lista se promijenila, osvježi izvedeno
        continue;
      }
      if (kind === "w") {
        if (!mayDrop("whisper")) continue;
        const k = whispers.indexOf(ref);
        whispers.splice(k, 1);
        if (stoji()) left.whisper--;
        else whispers.splice(k, 0, ref); // bez nje ploča stane -> treba ju
        // whispers je wire polje; izvedeni whi bi inače ostao na staroj listi linija
        // (ista zamka kao kod thm - vidi todo.md).
        clues.whi = prepWhispers(whispers);
        continue;
      }
      if (kind === "l") {
        if (!mayDrop("palindrome")) continue;
        const k = palindromes.indexOf(ref);
        palindromes.splice(k, 1);
        if (stoji()) left.palindrome--;
        else palindromes.splice(k, 0, ref); // bez nje ploča stane -> treba ju
        // palindromes je wire polje; izvedeni mate bi inače ostao na staroj listi linija.
        clues.mate = prepMates(palindromes, clones);
        continue;
      }
      if (kind === "c") {
        if (!mayDrop("clone")) continue;
        const k = clones.indexOf(ref);
        clones.splice(k, 1);
        if (stoji()) left.clone--;
        else clones.splice(k, 0, ref); // bez njega ploča stane -> treba ga
        // clones je wire polje; izvedeni mate bi inače ostao na staroj listi parova.
        clues.mate = prepMates(palindromes, clones);
        continue;
      }
      if (kind === "g") {
        // Jedini koji ne ide kroz `mayDrop`: granica je u POKRIVENIM ĆELIJAMA, pa se
        // ne gleda "ima li još iznad dna" nego "ostaje li iznad dna NAKON ovog kaveza"
        // - jedan kavez nosi 2-5 ćelija, ne jednu (vidi markCount).
        if ((left.killer || 0) - ref.cells.length < keepCages) continue;
        const k = cages.indexOf(ref);
        cages.splice(k, 1);
        if (stoji()) left.killer -= ref.cells.length;
        else cages.splice(k, 0, ref); // bez njega ploča stane -> treba ga
        // cages je wire polje; izvedeni cag bi inače ostao na staroj listi kaveza.
        clues.cag = prepCages(cages);
        continue;
      }
      const src = kind === "p" ? parity : edges[kind];
      const backup = src[ref];
      // Brid nosi ili točku (tip 1-2, Kropki) ili slovo (3-4, XV) - dvije varijante
      // dijele isto polje, pa se dno gleda po TIPU oznake, ne po polju.
      const v = kind === "p" ? "evenodd" : backup <= 2 ? "kropki" : "xv";
      if (!mayDrop(v)) continue;
      src[ref] = 0;
      if (stoji()) left[v]--;
      else src[ref] = backup; // bez nje ploča stane -> treba ju
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
      // Samo wire polja - izvedeno (jig/thm/mate) se ne isporučuje ni ne sprema.
      clues: {
        regions: clues.regions,
        parity: clues.parity,
        edges: clues.edges,
        thermos: clues.thermos,
        palindromes: clues.palindromes,
        clones: clues.clones,
        cages: clues.cages,
        whispers: clues.whispers,
        renbans: clues.renbans,
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
  //
  // Provjera je na SKUPU, ne po varijanti: kod kombinacije prolazi i ploča na kojoj
  // sav posao radi jedna, a druga je gola dekoracija. Za to je zadužen KEEP_MIN -
  // on jamči da se odabrana varijanta bar VIDI. Necessity po varijanti bi tražila
  // countSolutions po svakoj u svakom pokušaju i odbacivala većinu ploča; vidljivost
  // je ono što je igraču nedostajalo.
  function variantNeeded(puzzle, variants, useJig) {
    if (useJig || !variants.length) return true;
    return countSolutions(puzzle.slice(), 2, [], EMPTY_CLUES) > 1;
  }

  // Generira slagalicu tražene težine. Ako u zadanom broju pokušaja ne nađe
  // točan tier, vraća najbliži pronađeni (uvijek nešto rješivo logikom).
  // variants: polje (ili legacy string) aktivnih regijskih varijanti - prazno =
  // classic, "jigsaw" (9 nepravilnih regija umjesto kvadrata), "x" (dvije
  // dijagonale 1-9), "hyper" (4 prozora 1-9), "disjoint" (ista pozicija u kutiji
  // kroz svih 9 kutija = jedinica), "antiknight" (isti broj zabranjen
  // na skoku konja), "antiking" (isti broj zabranjen na dijagonalnom susjedu),
  // "evenodd" (djelić ćelija označen parno/neparno), "kropki" (točke na bridovima),
  // "xv" (slova X/V na bridovima), ili kombinacija. Rezultat nosi `regions` (81-polje
  // id-eva regije) kad je jigsaw aktivan inače `null`, `parity` (81-polje 0/1/2) kad
  // je evenodd aktivan inače `null`, te `edges` ({ h, v } 81-polja) kad je kropki
  // i/ili xv aktivan inače `null`, `thermos` (polje putova ćelija, bulb prvi)
  // kad je thermo aktivan inače `null`, te `palindromes` (polje putova ćelija) kad
  // je palindrome aktivan inače `null`, te `cages` (polje { cells, sum }) kad je
  // killer aktivan inače `null`.
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
    const usePal = variants.includes("palindrome");
    const useClone = variants.includes("clone");
    const useKiller = variants.includes("killer");
    const useWhisper = variants.includes("whisper");
    const useRenban = variants.includes("renban");
    // Oznake koje zauzimaju ĆELIJU (a ne brid) izvode se u nizu i svaka zaobilazi
    // ćelije prethodnih: dvije linije kroz istu ćeliju render crta preko sebe, a klon
    // boji cijelu ćeliju pa bi linija ispod njega nestala.
    //
    // KLON IDE PRVI jer je od svih najvezaniji: mrlja mora naći podudarne vrijednosti
    // na točnom pomaku, dok tuba i linija biraju bilo kojeg susjeda. Obrnut redoslijed
    // je izmjeren i bio je 11× skuplji na clone+thermo (5.5s prosjek, 15.4s max prema
    // 0.5s/1.6s): klonu je nakon tuba ostalo pola para regija, a floorFor mu svejedno
    // pripisuje punu snagu - pa je dig gonio ploču ispod dna koje ta kombinacija može
    // podnijeti.
    const deriveGeom = (solution, boost) => {
      const clones = useClone ? deriveClones(solution, boost) : null;
      const taken = (paths) => lineCells([...(clones ? clones.flat() : []), ...paths]);
      // Whisper ide odmah iza klona, PRIJE tube i linije: od svih linijskih oznaka
      // ima najmanje slobode. Tuba traži susjeda veće vrijednosti (u prosjeku pola
      // njih kvalificira), a whisper razliku od barem 5 - vrijednost 4 ima točno
      // jednog mogućeg partnera (9), a 5 nijednog. Isto pravilo kao kod klona
      // (v1.33.0): prva ide oznaka s najmanje slobode, ne zadnja dodana.
      //
      // Renban je od njih dvoje još vezaniji pa ide prvi: nastavak mora biti TOČNO
      // min-1 ili max+1 trenutnog skupa (uvijek 2 vrijednosti), dok whisper prima sve
      // na razlici >= 5 (1-4 vrijednosti, prosjek 2.2).
      const renbans = useRenban ? deriveRenbans(solution, boost, taken([])) : null;
      const whispers = useWhisper ? deriveWhispers(solution, boost, taken(renbans || [])) : null;
      const lineSoFar = () => [...(renbans || []), ...(whispers || [])];
      const thermos = useThermo ? deriveThermos(solution, boost, taken(lineSoFar())) : null;
      const palindromes = usePal
        ? derivePalindromes(solution, boost, taken([...lineSoFar(), ...(thermos || [])]))
        : null;
      return {
        clones,
        renbans,
        whispers,
        thermos,
        palindromes,
        // Kavez ide ZADNJI jer je najmanje vezan: mrlji treba samo da se vrijednost ne
        // ponovi, dok klon traži podudarnost na točnom pomaku, a tuba i linija odnos
        // sa susjedom. Ono što ostane nakon njih kavezu je i dalje dovoljno - obrnut
        // redoslijed bi im pojeo ploču (vidi mjerenje kod Clonea).
        cages: useKiller
          ? deriveCages(
              solution,
              boost,
              taken([...lineSoFar(), ...(thermos || []), ...(palindromes || [])])
            )
          : null,
      };
    };
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
      // Oznake se izvode iz rješenja (uvijek konzistentne) pa su aktivne u dig/solveAndGrade.
      const clues = prepClues({
        regions: geom.regions,
        parity: useEven ? deriveParity(solution, boost) : null,
        edges: useEdges ? deriveEdges(solution, useKropki, useXv, boost) : null,
        ...deriveGeom(solution, boost),
      });
      // Izvod koji nije dao ni dno oznaka (rijetko - tube/linije kojima je klon
      // pojeo ćelije): novi pokušaj. Ide PRIJE `dig`, najskupljeg koraka.
      if (marksThin(variants, clues)) continue;
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
    let geom, solution, clues;
    for (let a = 0; ; a++) {
      geom = newRegionClues(useJig);
      solution = generateSolution(variants, geom);
      if (!solution) continue;
      clues = prepClues({
        regions: geom.regions,
        parity: useEven ? deriveParity(solution) : null,
        edges: useEdges ? deriveEdges(solution, useKropki, useXv) : null,
        ...deriveGeom(solution, 0),
      });
      // Dno oznaka vrijedi i ovdje, ali s izlazom: ovo je zadnja linija obrane, pa
      // ploča sa slabom oznakom pobjeđuje nikakvu ploču.
      if (!marksThin(variants, clues) || a >= FALLBACK_TRIES) break;
    }
    const puzzle = dig(solution, topTarget, variants, clues);
    // Ovdje ploča nije prošla grading, pa prune ide s najvišim dopuštenim tierom.
    // Ako ni tako nije rješiva, `stoji()` je uvijek false i nijedna oznaka ne pada.
    return finish(puzzle, solution, difficulty, variants, clues, Solver.T_ADVANCED, spread);
  }

  return { generate, isValid, normVariants, generateRegions };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Sudoku;
