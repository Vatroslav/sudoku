/* Logički solver koji oponaša ljudsko rješavanje.
   Primjenjuje tehnike od najlakše prema najtežoj i ocjenjuje slagalicu
   po NAJTEŽOJ tehnici koju je morao upotrijebiti.

   Tier 1 = singles (skeniranje)             -> Normalno
   Tier 2 = locked candidates, parovi/trojke -> Teško
   Tier 3 = X-Wing, XY-Wing (napredno)       -> iznad Teško, ne generira se  */

const Solver = (() => {
  "use strict";

  // --- Pretkomputirane jedinice (9 redova, 9 stupaca, 9 kvadrata) ---
  const rows = [],
    cols = [],
    boxes = [];
  for (let i = 0; i < 9; i++) {
    rows.push([]);
    cols.push([]);
    boxes.push([]);
  }
  for (let idx = 0; idx < 81; idx++) {
    const r = Math.floor(idx / 9),
      c = idx % 9;
    const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    rows[r].push(idx);
    cols[c].push(idx);
    boxes[b].push(idx);
  }
  const boxOf = (idx) => Math.floor(Math.floor(idx / 9) / 3) * 3 + Math.floor((idx % 9) / 3);

  // Dvije dijagonale (X-Sudoku): glavna r===c, sporedna r+c===8.
  const diagMain = [],
    diagAnti = [];
  for (let i = 0; i < 9; i++) {
    diagMain.push(i * 9 + i);
    diagAnti.push(i * 9 + (8 - i));
  }

  // Hyper/Windoku: 4 dodatna 3×3 prozora (redovi 2-4/6-8, stupci 2-4/6-8).
  const hyperWindows = [];
  for (const wr of [1, 5])
    for (const wc of [1, 5]) {
      const cells = [];
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++) cells.push((wr + dr) * 9 + (wc + dc));
      hyperWindows.push(cells);
    }
  const HYPER_NAMES = [
    "top-left window",
    "top-right window",
    "bottom-left window",
    "bottom-right window",
  ];

  // Disjoint Groups: ćelije na ISTOJ poziciji unutar svoje kutije čine jedinicu
  // (svih 9 gornjih-lijevih uglova nose 1-9, itd.) - 9 dodatnih units. Pozicija je
  // (redak u kutiji, stupac u kutiji), pa su grupe raspoređene kao pravilna rešetka
  // koraka 3. Statične su kao hyper prozori; jedina varijanta koja NE vrijedi uz
  // jigsaw (nepravilna regija nema "poziciju u kutiji") - vidi INCOMPATIBLE u app.js.
  const disjointPos = (idx) => (Math.floor(idx / 9) % 3) * 3 + ((idx % 9) % 3);
  const disjointGroups = Array.from({ length: 9 }, () => []);
  for (let i = 0; i < 81; i++) disjointGroups[disjointPos(i)].push(i);

  // Antiknight: isti broj zabranjen na potezu šahovskog konja - dodatni peers
  // (nije unit; ne dodaje regiju gdje svih 9 brojeva ide jednom).
  const knightPeers = [];
  for (let idx = 0; idx < 81; idx++) {
    const r = Math.floor(idx / 9),
      c = idx % 9;
    const list = [];
    for (const [dr, dc] of [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ]) {
      const nr = r + dr,
        nc = c + dc;
      if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) list.push(nr * 9 + nc);
    }
    knightPeers.push(list);
  }

  // Antiking: isti broj zabranjen na potezu šahovskog kralja - dodatni peers.
  // Enkodiramo samo 4 DIJAGONALNA susjeda; ortogonalni potezi kralja već su
  // pokriveni redom/stupcem, pa bi bili suvišni.
  const kingPeers = [];
  for (let idx = 0; idx < 81; idx++) {
    const r = Math.floor(idx / 9),
      c = idx % 9;
    const list = [];
    for (const [dr, dc] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]) {
      const nr = r + dr,
        nc = c + dc;
      if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) list.push(nr * 9 + nc);
    }
    kingPeers.push(list);
  }

  // Peerovi iz proizvoljnog skupa jedinica (svaka ćelija vidi ostale u istoj jedinici).
  function buildPeers(units) {
    const p = [];
    for (let i = 0; i < 81; i++) p.push(new Set());
    for (const u of units) for (const a of u) for (const b of u) if (a !== b) p[a].add(b);
    return p;
  }
  // Dodatne jedinice po regijskoj varijanti (uz uvijek prisutne row/col/box).
  // Aktivni skup varijanti kombinira ove - kontekst se gradi kao unija.
  // Antiknight nema svoje units (samo peers), pa mu je unos prazan. Jigsaw ZAMJENJUJE
  // box-units regijama (kroz ctxFor), pa mu je EXTRA_UNITS unos isto prazan.
  const REGION_VARIANTS = ["antiking", "antiknight", "x", "hyper", "jigsaw", "disjoint"];
  const EXTRA_UNITS = {
    antiking: [],
    antiknight: [],
    x: [diagMain, diagAnti],
    hyper: hyperWindows,
    jigsaw: [],
    disjoint: disjointGroups,
  };
  // Dodatni peers po varijanti (idx -> polje "isti-broj-zabranjen" ćelija).
  const EXTRA_PEERS = { antiknight: knightPeers, antiking: kingPeers };

  // Jigsaw regije -> 9 polja ćelija (indeks = id regije). Uz validaciju oblika
  // (81 elemenata, id-evi 0-8, svaki točno 9 puta) - nevaljano se tretira klasično.
  function regionUnits(regions) {
    const cells = Array.from({ length: 9 }, () => []);
    for (let i = 0; i < 81; i++) cells[regions[i]].push(i);
    return cells;
  }
  function validRegions(regions) {
    if (!Array.isArray(regions) || regions.length !== 81) return false;
    const counts = new Array(9).fill(0);
    for (const r of regions) {
      if (!Number.isInteger(r) || r < 0 || r > 8) return false;
      counts[r]++;
    }
    return counts.every((c) => c === 9);
  }

  // Even/Odd parity maska: 81-polje s 0 (bez oznake) / 1 (parno) / 2 (neparno).
  function validParity(parity) {
    if (!Array.isArray(parity) || parity.length !== 81) return false;
    for (const p of parity) if (p !== 0 && p !== 1 && p !== 2) return false;
    return true;
  }

  // Brid-oznake (Kropki + XV): { h, v } gdje su h/v 81-polja s 0 (nema) / 1 (bijela
  // točka) / 2 (crna točka) / 3 (V = zbroj 5) / 4 (X = zbroj 10).
  function validEdges(edges) {
    if (!edges || !Array.isArray(edges.h) || !Array.isArray(edges.v)) return false;
    if (edges.h.length !== 81 || edges.v.length !== 81) return false;
    for (let i = 0; i < 81; i++) {
      if (![0, 1, 2, 3, 4].includes(edges.h[i]) || ![0, 1, 2, 3, 4].includes(edges.v[i]))
        return false;
    }
    return true;
  }
  // Thermo: polje putova (bulb prvi), svaki put = ćelije koje se dodiruju potezom
  // kralja. Iz spremljene igre dolazi neprovjeren, pa se validira kao regions/edges.
  // Preklop tuba se odbija - generator ga ne radi, a render i thermoRange računaju
  // s najviše jednim termometrom po ćeliji.
  function validThermos(thermos) {
    if (!Array.isArray(thermos)) return false;
    const seen = new Set();
    for (const path of thermos) {
      if (!Array.isArray(path) || path.length < 2 || path.length > 9) return false;
      for (let p = 0; p < path.length; p++) {
        const i = path[p];
        if (!Number.isInteger(i) || i < 0 || i > 80 || seen.has(i)) return false;
        seen.add(i);
        if (p === 0) continue;
        const a = path[p - 1];
        if (Math.abs(Math.floor(i / 9) - Math.floor(a / 9)) > 1 || Math.abs((i % 9) - (a % 9)) > 1)
          return false;
      }
    }
    return true;
  }
  // Indeks ćelija -> { path, pos } (najviše jedan termometar po ćeliji).
  function prepThermos(thermos) {
    const at = new Array(81).fill(null);
    for (const path of thermos)
      for (let p = 0; p < path.length; p++) at[path[p]] = { path, pos: p };
    return at;
  }
  // Palindrome: linije čije se vrijednosti čitaju isto u oba smjera. Oblik je isti kao
  // kod tuba (put ćelija po potezu kralja, bez preklopa) pa dijele validaciju.
  const validPalindromes = validThermos;
  // German Whispers: isti oblik (put po potezu kralja) pa i ista validacija i isti
  // izvedeni indeks. Odnos je drugi - vidi whisperOk.
  const validWhispers = validThermos;
  const prepWhispers = prepThermos;
  // Renban: ista geometrija (put po potezu kralja, bez preklopa) pa i ista validacija.
  // Izvedeni oblik je { cells } jer odnos gleda cijelu liniju odjednom, ne poziciju.
  const validRenbans = validThermos;
  // Zipper: ista geometrija; izvedeni oblik je { path, pos } jer pozicija JEST odnos
  // (partner je zrcalni indeks, sredina referenca). Duljina mora biti NEPARNA - bez
  // sredine pravilo ne postoji, a spremljena partija dolazi neprovjerena.
  const validZippers = (z) =>
    validThermos(z) && z.every((p) => p.length % 2 === 1 && p.length >= 3);
  const prepZippers = prepThermos;
  function prepRenbans(renbans) {
    const at = new Array(81).fill(null);
    for (const path of renbans) for (const i of path) at[i] = { cells: path };
    return at;
  }
  // Clone: parovi regija istog oblika ([[a...],[b...]], odnos je po indeksu). Oblik
  // regije se ne provjerava - solver iz njega čita samo parove, a render skup ćelija.
  function validClones(clones) {
    if (!Array.isArray(clones)) return false;
    const seen = new Set();
    for (const pair of clones) {
      if (!Array.isArray(pair) || pair.length !== 2) return false;
      const [a, b] = pair;
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length)
        return false;
      for (const i of [...a, ...b]) {
        if (!Number.isInteger(i) || i < 0 || i > 80 || seen.has(i)) return false;
        seen.add(i);
      }
    }
    return true;
  }
  // Indeks ćelija -> partner koji mora nositi ISTU vrijednost (-1 = nema ga). Palindrome
  // i Clone su dva izvora istog odnosa - vidi sudoku.js prepMates.
  function prepMates(pals, clones) {
    const mate = new Array(81).fill(-1);
    if (pals)
      for (const path of pals)
        for (let p = 0; p < path.length; p++) {
          const q = path.length - 1 - p;
          if (q !== p) mate[path[p]] = path[q];
        }
    if (clones)
      for (const [a, b] of clones)
        for (let p = 0; p < a.length; p++) {
          mate[a[p]] = b[p];
          mate[b[p]] = a[p];
        }
    return mate;
  }
  // Killer: kavezi ({ cells, sum }) se ne preklapaju i ne dijele ćeliju s drugim
  // oznakama. Zbroj mora biti dostižan skupom različitih znamenki te veličine -
  // spremljena partija s besmislenim zbrojem ne smije srušiti solver.
  function validCages(cages) {
    if (!Array.isArray(cages)) return false;
    const seen = new Set();
    for (const cage of cages) {
      if (!cage || !Array.isArray(cage.cells) || !cage.cells.length) return false;
      const n = cage.cells.length;
      if (n > 9 || !Number.isInteger(cage.sum)) return false;
      if (cage.sum < MIN_SUM[n] || cage.sum > MAX_SUM[n]) return false;
      for (const i of cage.cells) {
        if (!Number.isInteger(i) || i < 0 || i > 80 || seen.has(i)) return false;
        seen.add(i);
      }
    }
    return true;
  }
  // Indeks ćelija -> { cells, sum } (najviše jedan kavez po ćeliji).
  function prepCages(cages) {
    const at = new Array(81).fill(null);
    for (const cage of cages) for (const i of cage.cells) at[i] = cage;
    return at;
  }
  // Raspon [lo,hi] dopušten ćeliji u kavezu. Mora se poklapati sa sudoku.js cageRange
  // (generator i solver dijele definiciju odnosa).
  const MIN_SUM = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45];
  const MAX_SUM = [0, 9, 17, 24, 30, 35, 39, 42, 44, 45];
  function cageRange(grid, cells, sum, idx) {
    let rest = sum,
      k = 0;
    for (const j of cells) {
      if (j === idx) continue;
      if (grid[j]) rest -= grid[j];
      else k++;
    }
    return [Math.max(1, rest - MAX_SUM[k]), Math.min(9, rest - MIN_SUM[k])];
  }

  // Raspon [lo,hi] dopušten na poziciji p termometra. Mora se poklapati sa sudoku.js
  // thermoRange (generator i solver dijele definiciju odnosa).
  function thermoRange(grid, path, p) {
    let lo = p + 1,
      hi = 9 - (path.length - 1 - p);
    for (let q = 0; q < path.length; q++) {
      const b = grid[path[q]];
      if (!b || q === p) continue;
      if (q < p) lo = Math.max(lo, b + (p - q));
      else hi = Math.min(hi, b - (q - p));
    }
    return [lo, hi];
  }

  // Zadovoljava li par a,b prikazanu oznaku tipa t. Mora se poklapati sa sudoku.js
  // edgeOk (generator i solver dijele definiciju odnosa).
  // German Whispers: susjedi na liniji razlikuju se za barem 5. Mora se poklapati sa
  // sudoku.js whisperOk (generator i solver dijele definiciju odnosa, kao edgeOk).
  const whisperOk = (a, b) => Math.abs(a - b) >= 5;
  const WHISPER_BAN = 5; // |5-x| >= 5 nema rješenja u 1-9, pa 5 ne stoji na liniji

  // Renban: uzastopan skup duljine L koji sadrži m i M mora stati u prozor od L, pa
  // svaka vrijednost leži u [M-L+1, m+L-1]. Mora se poklapati sa sudoku.js
  // renbanRange (generator i solver dijele definiciju, kao thermoRange i cageRange).
  // Zipper: raspon dopušten na poziciji pos. Mora se poklapati sa sudoku.js
  // zipperRange (generator i solver dijele definiciju odnosa).
  const ZIPPER_MID_MIN = 3;
  function zipperRange(grid, path, pos) {
    const len = path.length;
    const mid = (len - 1) / 2;
    const C = grid[path[mid]];
    if (pos === mid) {
      for (let p = 0; p < mid; p++) {
        const a = grid[path[p]],
          b = grid[path[len - 1 - p]];
        if (a && b) return [a + b, a + b];
      }
      return [ZIPPER_MID_MIN, 9];
    }
    const partner = grid[path[len - 1 - pos]];
    if (C) return partner ? [C - partner, C - partner] : [1, C - 1];
    return partner ? [1, 9 - partner] : [1, 8];
  }

  function renbanRange(grid, cells) {
    let m = 10,
      M = 0;
    for (const j of cells) {
      const b = grid[j];
      if (!b) continue;
      if (b < m) m = b;
      if (b > M) M = b;
    }
    if (M === 0) return [1, 9];
    const L = cells.length;
    return [Math.max(1, M - L + 1), Math.min(9, m + L - 1)];
  }

  function edgeOk(a, b, t) {
    const hi = Math.max(a, b),
      lo = Math.min(a, b);
    if (t === 1) return hi - lo === 1;
    if (t === 2) return hi === 2 * lo;
    if (t === 3) return a + b === 5;
    if (t === 4) return a + b === 10;
    return true;
  }

  // Kanonski ključ aktivnog skupa (npr. "x+hyper"), "classic" ako je prazan.
  function variantKey(variants) {
    if (typeof variants === "string") variants = variants === "classic" ? [] : [variants];
    if (!Array.isArray(variants)) variants = [];
    const active = REGION_VARIANTS.filter((k) => variants.includes(k));
    return active.length ? active.join("+") : "classic";
  }

  // Gradi kontekst jedinica/peerova iz aktivnih varijanti i danih box-jedinica
  // (statični kvadrati ili jigsaw regije). Vraća i `boxes` (aktivne box-units).
  function buildCtx(active, boxUnits) {
    const units = [...rows, ...cols, ...boxUnits, ...active.flatMap((v) => EXTRA_UNITS[v])];
    const peers = buildPeers(units);
    // Peer-varijante (antiknight/antiking): dodaj im susjede uz one iz units.
    for (const v of active) {
      const ep = EXTRA_PEERS[v];
      if (ep) for (let i = 0; i < 81; i++) for (const j of ep[i]) peers[i].add(j);
    }
    return { allUnits: units, peers, boxes: boxUnits };
  }

  // Kontekst jedinica/peerova za aktivni skup. Klasik/aditivne varijante se lijeno
  // grade i cacheiraju po ključu; JIGSAW nosi per-puzzle geometriju pa se NE
  // cacheira (isti ključ, različite regije - cache bi podmetnuo tuđe regije).
  const unitCtx = {};
  function ctxFor(variants, regions) {
    const key = variantKey(variants);
    const active = key === "classic" ? [] : key.split("+");
    if (active.includes("jigsaw") && validRegions(regions)) {
      return buildCtx(active, regionUnits(regions));
    }
    if (!unitCtx[key]) unitCtx[key] = buildCtx(active, boxes);
    return unitCtx[key];
  }
  let allUnits = ctxFor([]).allUnits;
  let peers = ctxFor([]).peers;
  // Aktivne box-jedinice i njihova pripadnost/naziv (jigsaw ih preusmjeri na regije).
  let curBoxes = boxes;
  let curBoxOf = boxOf;
  let curBoxLabel = (b) => `box ${BOX_NAMES[b]}`;
  // Even/Odd: per-puzzle parity maska (0 bez oznake, 1 parno, 2 neparno) ili null.
  // computeCandidates iz označenih praznih ćelija makne kandidate krive parnosti.
  let curParity = null;
  // Kropki/XV: per-puzzle brid-oznake ({ h, v }) ili null. Oznake se propagiraju kroz
  // sužavanje kandidata (ovdje prema popunjenim susjedima, i u place() pri svakom
  // upisu) - nema zasebne tehnike, klasične dovrše. Samo pozitivno (odsutnost ne
  // ograničava).
  let curEdges = null;
  // Thermo: per-puzzle indeks ćelija -> { path, pos } ili null. Kao Kropki/XV nema
  // zasebne tehnike - tuba samo steže kandidate (computeCandidates iz pozicije i
  // popunjenih članova, place() pri svakom upisu), klasične tehnike dovrše.
  let curThermos = null;
  // Palindrome/Clone: per-puzzle 81-polje partnera koji nosi ISTU vrijednost (-1 gdje
  // ga nema) ili null. Obje varijante su isti odnos pa dijele polje (vidi prepMates).
  // Dva mjesta propagacije, oba bez zasebne tehnike (kao Thermo/Kropki):
  //   computeCandidates - popunjen partner fiksira vrijednost, a par praznih PRESIJECA
  //     kandidate (par leži u različitim jedinicama pa presjek stvarno reže),
  //   place - upis fiksira partnera.
  let curMate = null;
  // Killer: per-puzzle indeks ćelija -> { cells, sum } ili null. Kao Thermo, bez
  // zasebne tehnike - kavez samo steže kandidate (raspon zbroja i zabrana ponavljanja
  // unutar kaveza), klasične tehnike dovrše.
  let curCages = null;
  // German Whispers: per-puzzle indeks ćelija -> { path, pos } ili null. Kao Kropki
  // nema zasebne tehnike, ali za razliku od njega reže i na PRAZNOJ ploči: 5 ne stoji
  // nigdje na liniji, pa svaka whisper ćelija odmah gubi kandidata bez ijednog
  // popunjenog susjeda. Ostatak ide kroz susjede (computeCandidates i place).
  let curWhispers = null;
  // Renban: per-puzzle indeks ćelija -> { cells } ili null. Ponaša se kao kavez (odnos
  // veže cijelu liniju), pa je i propagacija ista: upis potroši vrijednost i stegne
  // raspon SVIH praznih članova linije, ne samo susjednih.
  let curRenbans = null;
  // Zipper: per-puzzle indeks ćelija -> { path, pos } ili null. Najjača propagacija u
  // repou ide odavde: kad su sredina i jedan član para poznati, partner je FIKSIRAN
  // (C - a), a ne samo sužen.
  let curZippers = null;
  // Susjedni bridovi ćelije s prikazanom oznakom: [susjed, tip]. h[i]=i↔i+1, v[i]=i↔i+9.
  function markedEdges(idx) {
    const out = [];
    if (!curEdges) return out;
    const r = Math.floor(idx / 9),
      c = idx % 9;
    if (c < 8 && curEdges.h[idx]) out.push([idx + 1, curEdges.h[idx]]);
    if (c > 0 && curEdges.h[idx - 1]) out.push([idx - 1, curEdges.h[idx - 1]]);
    if (r < 8 && curEdges.v[idx]) out.push([idx + 9, curEdges.v[idx]]);
    if (r > 0 && curEdges.v[idx - 9]) out.push([idx - 9, curEdges.v[idx - 9]]);
    return out;
  }

  const T_SINGLE = 1,
    T_INTER = 2,
    T_ADVANCED = 3;

  function computeCandidates(grid) {
    const cand = new Array(81).fill(null);
    for (let idx = 0; idx < 81; idx++) {
      if (grid[idx] !== 0) continue;
      const s = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      for (const p of peers[idx]) s.delete(grid[p]);
      if (curParity && curParity[idx]) {
        const wantEven = curParity[idx] === 1;
        for (const v of [...s]) if ((v % 2 === 0) !== wantEven) s.delete(v);
      }
      // Kropki/XV: prema svakom POPUNJENOM susjedu s oznakom, zadrži samo vrijednosti
      // koje zadovoljavaju odnos. (Prazan-prazan par riješi place() kad se jedan upiše.)
      for (const [nb, t] of markedEdges(idx)) {
        if (grid[nb] !== 0) for (const v of [...s]) if (!edgeOk(v, grid[nb], t)) s.delete(v);
      }
      // Thermo: pozicija na tubi sama reže kandidate i na praznoj ploči (3. ćelija
      // termometra duljine 4 ne može biti manja od 3 ni veća od 8), a popunjeni
      // članovi tube raspon dodatno stegnu.
      if (curThermos && curThermos[idx]) {
        const { path, pos } = curThermos[idx];
        const [lo, hi] = thermoRange(grid, path, pos);
        for (const v of [...s]) if (v < lo || v > hi) s.delete(v);
      }
      // Killer: unutar kaveza znamenka se ne ponavlja (kavez nije jedinica pa ga peers
      // ne pokrivaju), a preostali zbroj reže raspon - vidi cageRange.
      if (curCages && curCages[idx]) {
        const { cells, sum } = curCages[idx];
        for (const j of cells) if (j !== idx && grid[j]) s.delete(grid[j]);
        const [lo, hi] = cageRange(grid, cells, sum, idx);
        for (const v of [...s]) if (v < lo || v > hi) s.delete(v);
      }
      // German Whispers: 5 otpada bez ikakvog konteksta, a svaki POPUNJEN susjed na
      // liniji ostavlja samo drugi kraj skale (uz 3 prolaze 8-9, uz 7 samo 1-2).
      if (curWhispers && curWhispers[idx]) {
        s.delete(WHISPER_BAN);
        const { path, pos } = curWhispers[idx];
        for (const q of [pos - 1, pos + 1]) {
          if (q < 0 || q >= path.length) continue;
          const b = grid[path[q]];
          if (b) for (const v of [...s]) if (!whisperOk(v, b)) s.delete(v);
        }
      }
      // Zipper: raspon nosi cijeli odnos (partner + sredina, ili potpuni parovi ako
      // smo sredina) - vidi zipperRange. Kad su sredina i partner poznati, raspon je
      // jedna vrijednost i ćelija ispadne naked single bez ijedne klasične tehnike.
      if (curZippers && curZippers[idx]) {
        const { path, pos } = curZippers[idx];
        const [lo, hi] = zipperRange(grid, path, pos);
        for (const v of [...s]) if (v < lo || v > hi) s.delete(v);
      }
      // Renban: znamenke na liniji su različite (linija nije jedinica pa ju peers ne
      // pokrivaju), a raspon steže prozor od L uzastopnih - vidi renbanRange.
      if (curRenbans && curRenbans[idx]) {
        const { cells } = curRenbans[idx];
        for (const j of cells) if (j !== idx && grid[j]) s.delete(grid[j]);
        const [lo, hi] = renbanRange(grid, cells);
        for (const v of [...s]) if (v < lo || v > hi) s.delete(v);
      }
      // Palindrome/Clone: popunjen partner fiksira vrijednost. (Par praznih se presijeca
      // niže - tek kad su OBA skupa izračunata.)
      if (curMate && curMate[idx] >= 0 && grid[curMate[idx]] !== 0) {
        const m = grid[curMate[idx]];
        for (const v of [...s]) if (v !== m) s.delete(v);
      }
      cand[idx] = s;
    }
    // Palindrome/Clone: dvije prazne ćelije u paru nose istu vrijednost, pa svaka smije
    // zadržati samo ono što obje dopuštaju. Presjek stvarno reže jer par leži u
    // različitim redovima/stupcima/kutijama (inače ne bi mogao biti jednak).
    if (curMate)
      for (let idx = 0; idx < 81; idx++) {
        const j = curMate[idx];
        if (j <= idx || !cand[idx] || !cand[j]) continue; // svaki par jednom
        const both = [...cand[idx]].filter((v) => cand[j].has(v));
        cand[idx] = new Set(both);
        cand[j] = new Set(both);
      }
    return cand;
  }

  function place(grid, cand, idx, val) {
    grid[idx] = val;
    cand[idx] = null;
    for (const p of peers[idx]) if (cand[p]) cand[p].delete(val);
    // Kropki/XV: propagiraj upisanu vrijednost na prazne susjede s oznakom (zadrži samo
    // one koji zadovoljavaju odnos) - dovodi do naked singlea koje klasične uhvate.
    for (const [nb, t] of markedEdges(idx)) {
      if (cand[nb]) for (const u of [...cand[nb]]) if (!edgeOk(val, u, t)) cand[nb].delete(u);
    }
    // Thermo: upis stegne raspon svih praznih ćelija SVOJE tube, ne samo susjednih -
    // svaki korak duž tube vrijedi barem 1, pa 7 na poziciji 2 ostavlja poziciji 0
    // najviše 5. Ta udaljena posljedica je ono što tubi daje snagu.
    if (curThermos && curThermos[idx]) {
      const { path } = curThermos[idx];
      for (let q = 0; q < path.length; q++) {
        const j = path[q];
        if (!cand[j]) continue;
        const [lo, hi] = thermoRange(grid, path, q);
        for (const u of [...cand[j]]) if (u < lo || u > hi) cand[j].delete(u);
      }
    }
    // German Whispers: upis steže samo SUSJEDE na liniji, ne cijelu liniju - odnos je
    // lokalan (kao Kropki), za razliku od tube i kaveza gdje jedan upis nosi posljedicu
    // do kraja puta. Dalji članovi se stegnu kad na njih dođe red.
    if (curWhispers && curWhispers[idx]) {
      const { path, pos } = curWhispers[idx];
      for (const q of [pos - 1, pos + 1]) {
        if (q < 0 || q >= path.length) continue;
        const j = path[q];
        if (cand[j]) for (const u of [...cand[j]]) if (!whisperOk(val, u)) cand[j].delete(u);
      }
    }
    // Zipper: upis stegne CIJELU liniju, ne samo partnera - upisana sredina odmah
    // ograniči svaki član (svi < C), a upisan član para fiksira svog partnera čim je
    // sredina poznata. Zato prolaz ide po cijelom putu, kao kod tube.
    if (curZippers && curZippers[idx]) {
      const { path } = curZippers[idx];
      for (let q = 0; q < path.length; q++) {
        const j = path[q];
        if (!cand[j]) continue;
        const [lo, hi] = zipperRange(grid, path, q);
        for (const u of [...cand[j]]) if (u < lo || u > hi) cand[j].delete(u);
      }
    }
    // Renban: kao kavez, upis stegne CIJELU liniju - potroši vrijednost i pomakne
    // prozor od L uzastopnih. Jedan broj na liniji duljine 3 ostavlja ostalima samo
    // 5 mogućnosti, pa je ta udaljena posljedica ono odakle Renban vuče snagu.
    if (curRenbans && curRenbans[idx]) {
      const { cells } = curRenbans[idx];
      const [lo, hi] = renbanRange(grid, cells);
      for (const j of cells) {
        if (!cand[j]) continue;
        cand[j].delete(val);
        for (const u of [...cand[j]]) if (u < lo || u > hi) cand[j].delete(u);
      }
    }
    // Killer: upis stegne SVE prazne ćelije svog kaveza, ne samo susjedne - potroši i
    // vrijednost (nema ponavljanja) i dio zbroja. Ta udaljena posljedica je ono što
    // kavezu daje snagu, isto kao kod tube.
    if (curCages && curCages[idx]) {
      const { cells, sum } = curCages[idx];
      for (const j of cells) {
        if (!cand[j]) continue;
        cand[j].delete(val);
        const [lo, hi] = cageRange(grid, cells, sum, j);
        for (const u of [...cand[j]]) if (u < lo || u > hi) cand[j].delete(u);
      }
    }
    // Palindrome/Clone: upis fiksira partnera na istu vrijednost - naked single koji
    // klasične tehnike odmah pokupe.
    if (curMate && curMate[idx] >= 0) {
      const j = curMate[idx];
      if (cand[j]) for (const u of [...cand[j]]) if (u !== val) cand[j].delete(u);
    }
  }

  // --- Tehnike: svaka vraća true nakon PRVOG napretka (da grading uvijek
  //     prvo proba lakše tehnike) ---

  function nakedSingle(grid, cand) {
    for (let idx = 0; idx < 81; idx++) {
      if (cand[idx] && cand[idx].size === 1) {
        place(grid, cand, idx, [...cand[idx]][0]);
        return true;
      }
    }
    return false;
  }

  function hiddenSingle(grid, cand) {
    for (const unit of allUnits) {
      for (let v = 1; v <= 9; v++) {
        let spot = -1,
          count = 0;
        for (const idx of unit) {
          if (cand[idx] && cand[idx].has(v)) {
            count++;
            spot = idx;
            if (count > 1) break;
          }
        }
        if (count === 1) {
          place(grid, cand, spot, v);
          return true;
        }
      }
    }
    return false;
  }

  function lockedCandidates(grid, cand) {
    // Pointing: kandidat u kvadratu/regiji zaključan na jedan red/stupac
    for (const box of curBoxes) {
      for (let v = 1; v <= 9; v++) {
        const cells = box.filter((idx) => cand[idx] && cand[idx].has(v));
        if (cells.length < 2) continue;
        const r0 = Math.floor(cells[0] / 9),
          c0 = cells[0] % 9;
        if (cells.every((idx) => Math.floor(idx / 9) === r0)) {
          for (const idx of rows[r0]) {
            if (!box.includes(idx) && cand[idx] && cand[idx].has(v)) {
              cand[idx].delete(v);
              return true;
            }
          }
        }
        if (cells.every((idx) => idx % 9 === c0)) {
          for (const idx of cols[c0]) {
            if (!box.includes(idx) && cand[idx] && cand[idx].has(v)) {
              cand[idx].delete(v);
              return true;
            }
          }
        }
      }
    }
    // Claiming: kandidat u redu/stupcu zaključan na jedan kvadrat/regiju
    for (const line of [...rows, ...cols]) {
      for (let v = 1; v <= 9; v++) {
        const cells = line.filter((idx) => cand[idx] && cand[idx].has(v));
        if (cells.length < 2) continue;
        const b0 = curBoxOf(cells[0]);
        if (cells.every((idx) => curBoxOf(idx) === b0)) {
          for (const idx of curBoxes[b0]) {
            if (!line.includes(idx) && cand[idx] && cand[idx].has(v)) {
              cand[idx].delete(v);
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  function nakedPair(grid, cand) {
    for (const unit of allUnits) {
      const twos = unit.filter((idx) => cand[idx] && cand[idx].size === 2);
      for (let i = 0; i < twos.length; i++) {
        for (let j = i + 1; j < twos.length; j++) {
          const a = cand[twos[i]],
            b = cand[twos[j]];
          if ([...a].every((x) => b.has(x))) {
            const vals = [...a];
            for (const idx of unit) {
              if (idx !== twos[i] && idx !== twos[j] && cand[idx]) {
                for (const v of vals)
                  if (cand[idx].has(v)) {
                    cand[idx].delete(v);
                    return true;
                  }
              }
            }
          }
        }
      }
    }
    return false;
  }

  function nakedTriple(grid, cand) {
    for (const unit of allUnits) {
      const cells = unit.filter((idx) => cand[idx] && cand[idx].size >= 2 && cand[idx].size <= 3);
      const n = cells.length;
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
          for (let k = j + 1; k < n; k++) {
            const union = new Set([...cand[cells[i]], ...cand[cells[j]], ...cand[cells[k]]]);
            if (union.size === 3) {
              const trip = [cells[i], cells[j], cells[k]];
              for (const idx of unit) {
                if (!trip.includes(idx) && cand[idx]) {
                  for (const v of union)
                    if (cand[idx].has(v)) {
                      cand[idx].delete(v);
                      return true;
                    }
                }
              }
            }
          }
    }
    return false;
  }

  function hiddenPair(grid, cand) {
    for (const unit of allUnits) {
      const pos = {};
      for (let v = 1; v <= 9; v++) pos[v] = unit.filter((idx) => cand[idx] && cand[idx].has(v));
      for (let v1 = 1; v1 <= 9; v1++) {
        if (pos[v1].length !== 2) continue;
        for (let v2 = v1 + 1; v2 <= 9; v2++) {
          if (pos[v2].length !== 2) continue;
          if (pos[v1][0] === pos[v2][0] && pos[v1][1] === pos[v2][1]) {
            for (const idx of pos[v1]) {
              for (const v of [...cand[idx]]) {
                if (v !== v1 && v !== v2) {
                  cand[idx].delete(v);
                  return true;
                }
              }
            }
          }
        }
      }
    }
    return false;
  }

  function xWing(grid, cand) {
    for (let v = 1; v <= 9; v++) {
      // Bazirano na redovima
      const rowPos = [];
      for (let r = 0; r < 9; r++) {
        const cs = [];
        for (let c = 0; c < 9; c++) {
          const idx = r * 9 + c;
          if (cand[idx] && cand[idx].has(v)) cs.push(c);
        }
        if (cs.length === 2) rowPos.push({ r, cs });
      }
      for (let i = 0; i < rowPos.length; i++)
        for (let j = i + 1; j < rowPos.length; j++) {
          if (rowPos[i].cs[0] === rowPos[j].cs[0] && rowPos[i].cs[1] === rowPos[j].cs[1]) {
            const [c1, c2] = rowPos[i].cs,
              r1 = rowPos[i].r,
              r2 = rowPos[j].r;
            for (let r = 0; r < 9; r++) {
              if (r === r1 || r === r2) continue;
              for (const c of [c1, c2]) {
                const idx = r * 9 + c;
                if (cand[idx] && cand[idx].has(v)) {
                  cand[idx].delete(v);
                  return true;
                }
              }
            }
          }
        }
      // Bazirano na stupcima
      const colPos = [];
      for (let c = 0; c < 9; c++) {
        const rs = [];
        for (let r = 0; r < 9; r++) {
          const idx = r * 9 + c;
          if (cand[idx] && cand[idx].has(v)) rs.push(r);
        }
        if (rs.length === 2) colPos.push({ c, rs });
      }
      for (let i = 0; i < colPos.length; i++)
        for (let j = i + 1; j < colPos.length; j++) {
          if (colPos[i].rs[0] === colPos[j].rs[0] && colPos[i].rs[1] === colPos[j].rs[1]) {
            const [r1, r2] = colPos[i].rs,
              c1 = colPos[i].c,
              c2 = colPos[j].c;
            for (let c = 0; c < 9; c++) {
              if (c === c1 || c === c2) continue;
              for (const r of [r1, r2]) {
                const idx = r * 9 + c;
                if (cand[idx] && cand[idx].has(v)) {
                  cand[idx].delete(v);
                  return true;
                }
              }
            }
          }
        }
    }
    return false;
  }

  function xyWing(grid, cand) {
    const bivalue = [];
    for (let idx = 0; idx < 81; idx++) if (cand[idx] && cand[idx].size === 2) bivalue.push(idx);
    for (const p of bivalue) {
      const [x, y] = [...cand[p]];
      const pincers = bivalue.filter((q) => q !== p && peers[p].has(q));
      for (const a of pincers) {
        if (!cand[a].has(x)) continue; // pincer A = {x, z}
        const z = [...cand[a]].find((v) => v !== x);
        if (z === undefined || z === y) continue; // z mora biti različit od x i y
        for (const b of pincers) {
          if (b === a) continue;
          if (cand[b].size === 2 && cand[b].has(y) && cand[b].has(z) && !cand[b].has(x)) {
            for (let idx = 0; idx < 81; idx++) {
              if (idx === a || idx === b || idx === p) continue;
              if (cand[idx] && cand[idx].has(z) && peers[a].has(idx) && peers[b].has(idx)) {
                cand[idx].delete(z);
                return true;
              }
            }
          }
        }
      }
    }
    return false;
  }

  // ===== Hint: objašnjenje sljedećeg poteza =====
  // Zasebne "find" funkcije koje vraćaju opis poteza (ne mutiraju ulaz).
  // Namjerno odvojene od gornjih bool-tehnika da grading ostane netaknut.

  const BOX_NAMES = [
    "top-left",
    "top-center",
    "top-right",
    "center-left",
    "center",
    "center-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
  ];
  // Imenovane linije (rows/cols) su statične; box-jedinice ovise o jigsawu pa se
  // grade zasebno (klasični kvadrati ili regije s nazivom "region N").
  const namedLines = [];
  for (let r = 0; r < 9; r++) namedLines.push({ cells: rows[r], name: `row ${r + 1}` });
  for (let c = 0; c < 9; c++) namedLines.push({ cells: cols[c], name: `column ${c + 1}` });
  const namedBoxes = [];
  for (let b = 0; b < 9; b++) namedBoxes.push({ cells: boxes[b], name: `box ${BOX_NAMES[b]}` });
  // Imenovane dodatne jedinice po varijanti (za tekst hinta). Isti aktivni skup
  // kao EXTRA_UNITS, samo s ljudskim nazivima. Jigsaw je prazan (regije se
  // ubacuju kao box-jedinice u namedFor, ne ovdje).
  const EXTRA_NAMED = {
    // Antiknight/Antiking nemaju imenovanih jedinica (samo peers) - eliminacije se
    // odražavaju kroz kandidate (naked single), ali nema hidden-single "u jedinici" hinta.
    antiking: [],
    antiknight: [],
    x: [
      { cells: diagMain, name: "main diagonal" },
      { cells: diagAnti, name: "anti-diagonal" },
    ],
    hyper: hyperWindows.map((cells, i) => ({ cells, name: HYPER_NAMES[i] })),
    jigsaw: [],
    // Naziv je pozicija u kutiji, ista imena kao kutije ("top-left cells").
    disjoint: disjointGroups.map((cells, p) => ({ cells, name: `${BOX_NAMES[p]} cells` })),
  };
  const namedCtx = {};
  function namedFor(variants, regions) {
    const key = variantKey(variants);
    const active = key === "classic" ? [] : key.split("+");
    // Jigsaw: box-jedinice su regije ("region N"), ne cacheira se (per-puzzle).
    if (active.includes("jigsaw") && validRegions(regions)) {
      const boxUnits = regionUnits(regions).map((cells, b) => ({ cells, name: `region ${b + 1}` }));
      return [...namedLines, ...boxUnits, ...active.flatMap((v) => EXTRA_NAMED[v])];
    }
    if (!namedCtx[key]) {
      namedCtx[key] = [...namedLines, ...namedBoxes, ...active.flatMap((v) => EXTRA_NAMED[v])];
    }
    return namedCtx[key];
  }
  let namedUnits = namedFor([]);
  const cellName = (idx) => `row ${Math.floor(idx / 9) + 1}, column ${(idx % 9) + 1}`;

  // Postavi aktivni kontekst jedinica prije grading-a / pomoći. Prima polje (ili
  // legacy string) aktivnih varijanti; nepoznato => klasik (unatražna
  // kompatibilnost sa spremljenim igrama). clues = per-puzzle podaci (wire oblik,
  // vidi Sudoku.prepClues), svi opcionalni; solver si brze oblike gradi sam:
  //   regions - jigsaw geometrija (81-polje); nevaljano => klasični kvadrati.
  //   parity  - Even/Odd maska (81-polje 0/1/2); nevaljano se ignorira.
  //   edges   - Kropki/XV brid-oznake ({ h, v }); nevaljano se ignorira.
  //   thermos - Thermo tube (polje putova); nevaljano se ignorira.
  //   palindromes - Palindrome linije (polje putova); nevaljano se ignorira.
  //   clones - Clone parovi regija (polje parova putova); nevaljano se ignorira.
  //   cages  - Killer kavezi (polje { cells, sum }); nevaljano se ignorira.
  //   whispers - German Whispers linije (polje putova); nevaljano se ignorira.
  //   renbans - Renban linije (polje putova); nevaljano se ignorira.
  //   zippers - Zipper linije (polje putova neparne duljine); nevaljano se ignorira.
  // Nevaljano se svugdje ignorira umjesto da baci - spremljena partija iz starije
  // verzije ne smije srušiti solver.
  function useVariant(variants, clues) {
    const {
      regions,
      parity,
      edges,
      thermos,
      palindromes,
      clones,
      cages,
      whispers,
      renbans,
      zippers,
    } = clues || {};
    const ctx = ctxFor(variants, regions);
    allUnits = ctx.allUnits;
    peers = ctx.peers;
    curParity = validParity(parity) ? parity : null;
    curEdges = validEdges(edges) ? edges : null;
    curThermos = validThermos(thermos) ? prepThermos(thermos) : null;
    const okPal = validPalindromes(palindromes) && palindromes.length;
    const okClone = validClones(clones) && clones.length;
    curMate =
      okPal || okClone ? prepMates(okPal ? palindromes : null, okClone ? clones : null) : null;
    curCages = validCages(cages) && cages.length ? prepCages(cages) : null;
    curWhispers = validWhispers(whispers) && whispers.length ? prepWhispers(whispers) : null;
    curRenbans = validRenbans(renbans) && renbans.length ? prepRenbans(renbans) : null;
    curZippers = validZippers(zippers) && zippers.length ? prepZippers(zippers) : null;
    const active = variantKey(variants);
    const jig =
      active !== "classic" && active.split("+").includes("jigsaw") && validRegions(regions);
    if (jig) {
      curBoxes = ctx.boxes;
      curBoxOf = (i) => regions[i];
      curBoxLabel = (b) => `region ${b + 1}`;
    } else {
      curBoxes = boxes;
      curBoxOf = boxOf;
      curBoxLabel = (b) => `box ${BOX_NAMES[b]}`;
    }
    namedUnits = namedFor(variants, regions);
  }

  function hNakedSingle(cand) {
    for (let idx = 0; idx < 81; idx++) {
      if (cand[idx] && cand[idx].size === 1) {
        return {
          technique: "Naked Single",
          tier: T_SINGLE,
          type: "placement",
          value: [...cand[idx]][0],
          target: idx,
          focus: [idx],
          note: "this cell has only one possible number",
        };
      }
    }
    return null;
  }

  function hHiddenSingle(cand) {
    for (const u of namedUnits) {
      for (let v = 1; v <= 9; v++) {
        let spot = -1,
          count = 0;
        for (const idx of u.cells) {
          if (cand[idx] && cand[idx].has(v)) {
            count++;
            spot = idx;
            if (count > 1) break;
          }
        }
        if (count === 1) {
          return {
            technique: "Hidden Single",
            tier: T_SINGLE,
            type: "placement",
            value: v,
            target: spot,
            focus: u.cells.slice(),
            note: `in ${u.name} the number ${v} fits in only one cell`,
          };
        }
      }
    }
    return null;
  }

  function hLocked(cand) {
    for (let b = 0; b < 9; b++) {
      const box = curBoxes[b];
      for (let v = 1; v <= 9; v++) {
        const cs = box.filter((i) => cand[i] && cand[i].has(v));
        if (cs.length < 2) continue;
        const r0 = Math.floor(cs[0] / 9),
          c0 = cs[0] % 9;
        if (cs.every((i) => Math.floor(i / 9) === r0)) {
          const elim = rows[r0].filter((i) => !box.includes(i) && cand[i] && cand[i].has(v));
          if (elim.length)
            return {
              technique: "Locked Candidates",
              tier: T_INTER,
              type: "elimination",
              removeVals: [v],
              targets: elim,
              base: cs,
              focus: cs.concat(elim),
              note: `in ${curBoxLabel(b)} the number ${v} can only be in row ${r0 + 1}, so it is removed from the rest of that row`,
            };
        }
        if (cs.every((i) => i % 9 === c0)) {
          const elim = cols[c0].filter((i) => !box.includes(i) && cand[i] && cand[i].has(v));
          if (elim.length)
            return {
              technique: "Locked Candidates",
              tier: T_INTER,
              type: "elimination",
              removeVals: [v],
              targets: elim,
              base: cs,
              focus: cs.concat(elim),
              note: `in ${curBoxLabel(b)} the number ${v} can only be in column ${c0 + 1}, so it is removed from the rest of that column`,
            };
        }
      }
    }
    for (const line of [...rows, ...cols]) {
      for (let v = 1; v <= 9; v++) {
        const cs = line.filter((i) => cand[i] && cand[i].has(v));
        if (cs.length < 2) continue;
        const b0 = curBoxOf(cs[0]);
        if (cs.every((i) => curBoxOf(i) === b0)) {
          const elim = curBoxes[b0].filter((i) => !line.includes(i) && cand[i] && cand[i].has(v));
          if (elim.length)
            return {
              technique: "Locked Candidates",
              tier: T_INTER,
              type: "elimination",
              removeVals: [v],
              targets: elim,
              base: cs,
              focus: cs.concat(elim),
              note: `the number ${v} in that line lies only within ${curBoxLabel(b0)}, so it is removed from the rest of that box`,
            };
        }
      }
    }
    return null;
  }

  function hNakedPair(cand) {
    for (const u of namedUnits) {
      const twos = u.cells.filter((i) => cand[i] && cand[i].size === 2);
      for (let i = 0; i < twos.length; i++)
        for (let j = i + 1; j < twos.length; j++) {
          const a = cand[twos[i]],
            b = cand[twos[j]];
          if ([...a].every((x) => b.has(x))) {
            const vals = [...a];
            const elim = u.cells.filter(
              (idx) =>
                idx !== twos[i] &&
                idx !== twos[j] &&
                cand[idx] &&
                vals.some((v) => cand[idx].has(v))
            );
            if (elim.length)
              return {
                technique: "Naked Pair",
                tier: T_INTER,
                type: "elimination",
                removeVals: vals,
                targets: elim,
                base: [twos[i], twos[j]],
                focus: [twos[i], twos[j]].concat(elim),
                note: `two cells in ${u.name} share only the numbers ${vals[0]} and ${vals[1]}, so those numbers are eliminated from the other cells of that unit`,
              };
          }
        }
    }
    return null;
  }

  function hHiddenPair(cand) {
    for (const u of namedUnits) {
      const pos = {};
      for (let v = 1; v <= 9; v++) pos[v] = u.cells.filter((i) => cand[i] && cand[i].has(v));
      for (let v1 = 1; v1 <= 9; v1++) {
        if (pos[v1].length !== 2) continue;
        for (let v2 = v1 + 1; v2 <= 9; v2++) {
          if (pos[v2].length !== 2) continue;
          if (pos[v1][0] === pos[v2][0] && pos[v1][1] === pos[v2][1]) {
            const pair = pos[v1];
            const elim = pair.filter((idx) => [...cand[idx]].some((v) => v !== v1 && v !== v2));
            if (elim.length) {
              const removeVals = [];
              for (const idx of elim)
                for (const v of cand[idx]) {
                  if (v !== v1 && v !== v2 && !removeVals.includes(v)) removeVals.push(v);
                }
              return {
                technique: "Hidden Pair",
                tier: T_INTER,
                type: "elimination",
                removeVals,
                targets: elim,
                base: pair,
                focus: pair.slice(),
                note: `the numbers ${v1} and ${v2} in ${u.name} fit only in those two cells, so all other numbers are eliminated from them`,
              };
            }
          }
        }
      }
    }
    return null;
  }

  function hNakedTriple(cand) {
    for (const u of namedUnits) {
      const cells = u.cells.filter((i) => cand[i] && cand[i].size >= 2 && cand[i].size <= 3);
      const n = cells.length;
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
          for (let k = j + 1; k < n; k++) {
            const union = new Set([...cand[cells[i]], ...cand[cells[j]], ...cand[cells[k]]]);
            if (union.size === 3) {
              const trip = [cells[i], cells[j], cells[k]];
              const vals = [...union];
              const elim = u.cells.filter(
                (idx) => !trip.includes(idx) && cand[idx] && vals.some((v) => cand[idx].has(v))
              );
              if (elim.length)
                return {
                  technique: "Naked Triple",
                  tier: T_INTER,
                  type: "elimination",
                  removeVals: vals,
                  targets: elim,
                  base: trip,
                  focus: trip.concat(elim),
                  note: `three cells in ${u.name} together use only the numbers ${vals.join(", ")}, so those numbers are eliminated from the other cells of that unit`,
                };
            }
          }
    }
    return null;
  }

  function hXWing(cand) {
    for (let v = 1; v <= 9; v++) {
      const rowPos = [];
      for (let r = 0; r < 9; r++) {
        const cs = [];
        for (let c = 0; c < 9; c++) {
          const idx = r * 9 + c;
          if (cand[idx] && cand[idx].has(v)) cs.push(c);
        }
        if (cs.length === 2) rowPos.push({ r, cs });
      }
      for (let i = 0; i < rowPos.length; i++)
        for (let j = i + 1; j < rowPos.length; j++) {
          if (rowPos[i].cs[0] === rowPos[j].cs[0] && rowPos[i].cs[1] === rowPos[j].cs[1]) {
            const [c1, c2] = rowPos[i].cs,
              r1 = rowPos[i].r,
              r2 = rowPos[j].r;
            const base = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
            const elim = [];
            for (let r = 0; r < 9; r++) {
              if (r === r1 || r === r2) continue;
              for (const c of [c1, c2]) {
                const idx = r * 9 + c;
                if (cand[idx] && cand[idx].has(v)) elim.push(idx);
              }
            }
            if (elim.length)
              return {
                technique: "X-Wing",
                tier: T_ADVANCED,
                type: "elimination",
                removeVals: [v],
                targets: elim,
                base,
                focus: base.concat(elim),
                note: `the number ${v} forms an X-Wing in columns ${c1 + 1} and ${c2 + 1} (rows ${r1 + 1} and ${r2 + 1}), so it is eliminated from those columns everywhere else`,
              };
          }
        }
      const colP = [];
      for (let c = 0; c < 9; c++) {
        const rs = [];
        for (let r = 0; r < 9; r++) {
          const idx = r * 9 + c;
          if (cand[idx] && cand[idx].has(v)) rs.push(r);
        }
        if (rs.length === 2) colP.push({ c, rs });
      }
      for (let i = 0; i < colP.length; i++)
        for (let j = i + 1; j < colP.length; j++) {
          if (colP[i].rs[0] === colP[j].rs[0] && colP[i].rs[1] === colP[j].rs[1]) {
            const [r1, r2] = colP[i].rs,
              c1 = colP[i].c,
              c2 = colP[j].c;
            const base = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
            const elim = [];
            for (let c = 0; c < 9; c++) {
              if (c === c1 || c === c2) continue;
              for (const r of [r1, r2]) {
                const idx = r * 9 + c;
                if (cand[idx] && cand[idx].has(v)) elim.push(idx);
              }
            }
            if (elim.length)
              return {
                technique: "X-Wing",
                tier: T_ADVANCED,
                type: "elimination",
                removeVals: [v],
                targets: elim,
                base,
                focus: base.concat(elim),
                note: `the number ${v} forms an X-Wing in rows ${r1 + 1} and ${r2 + 1} (columns ${c1 + 1} and ${c2 + 1}), so it is eliminated from those rows everywhere else`,
              };
          }
        }
    }
    return null;
  }

  function hXYWing(cand) {
    const bivalue = [];
    for (let idx = 0; idx < 81; idx++) if (cand[idx] && cand[idx].size === 2) bivalue.push(idx);
    for (const p of bivalue) {
      const [x, y] = [...cand[p]];
      const pincers = bivalue.filter((q) => q !== p && peers[p].has(q));
      for (const a of pincers) {
        if (!cand[a].has(x)) continue;
        const z = [...cand[a]].find((v) => v !== x);
        if (z === undefined || z === y) continue;
        for (const b of pincers) {
          if (b === a) continue;
          if (cand[b].size === 2 && cand[b].has(y) && cand[b].has(z) && !cand[b].has(x)) {
            const elim = [];
            for (let idx = 0; idx < 81; idx++) {
              if (idx === a || idx === b || idx === p) continue;
              if (cand[idx] && cand[idx].has(z) && peers[a].has(idx) && peers[b].has(idx))
                elim.push(idx);
            }
            if (elim.length)
              return {
                technique: "XY-Wing",
                tier: T_ADVANCED,
                type: "elimination",
                removeVals: [z],
                targets: elim,
                base: [p, a, b],
                focus: [p, a, b].concat(elim),
                pivot: p,
                pincers: [a, b],
                shared: z,
                note: `the pivot in ${cellName(p)} is ${x} or ${y}, and the wings in ${cellName(a)} and ${cellName(b)} both contain ${z}; one of the wings is definitely ${z}, so ${z} is eliminated from every cell that sees both wings`,
              };
          }
        }
      }
    }
    return null;
  }

  const H_FINDERS = [
    hNakedSingle,
    hHiddenSingle,
    hLocked,
    hNakedPair,
    hHiddenPair,
    hNakedTriple,
    hXWing,
    hXYWing,
  ];

  // Kandidati svjesni igračevih bilješki: krećemo od onoga što proizlazi iz
  // upisanih brojeva, pa SUŽAVAMO na bilješke ondje gdje ih igrač ima. Nikad ne
  // dodajemo kandidat kojeg upisani brojevi ne dopuštaju (obrana od krivih
  // bilješki), a već odrađene pencilmark-eliminacije se time ne ponavljaju.
  function candidatesFor(values, notes) {
    const cand = computeCandidates(values);
    if (!notes) return cand;
    for (let i = 0; i < 81; i++) {
      if (!cand[i] || !notes[i] || notes[i].length === 0) continue;
      const narrowed = new Set(notes[i].filter((v) => cand[i].has(v)));
      if (narrowed.size > 0) cand[i] = narrowed; // prazan presjek = kontradiktorne bilješke -> zadrži računati skup
    }
    return cand;
  }

  function unitsTouching(cells) {
    const set = new Set(cells);
    return namedUnits.filter((u) => u.cells.some((i) => set.has(i)));
  }

  // Vodi li dano stanje kandidata ODMAH (u jedinicama koje je eliminacija
  // dirnula) do jedinstvenog upisa? Vraća { target, value, unitName } ili null.
  function immediateSingle(cand, changed) {
    for (const i of changed) {
      if (cand[i] && cand[i].size === 1)
        return { target: i, value: [...cand[i]][0], unitName: null };
    }
    for (const u of unitsTouching(changed)) {
      for (let v = 1; v <= 9; v++) {
        const spots = u.cells.filter((i) => cand[i] && cand[i].has(v));
        if (spots.length === 1) return { target: spots[0], value: v, unitName: u.name };
      }
    }
    return null;
  }

  // Prvi atomski korak: par (tehnika, akcija) gdje je akcija IZRAVNA i jedina
  // posljedica te tehnike. Upis se nadovezuje na eliminaciju samo kad je
  // NEPOSREDNA posljedica iste tehnike. solution (ako je dano) je sigurnosni
  // filtar - nikad ne predloži potez koji proturječi stvarnom rješenju.
  function findStep(cand, solution) {
    for (const f of H_FINDERS) {
      const r = f(cand);
      if (!r) continue;

      if (r.type === "placement") {
        if (solution && r.value !== solution[r.target]) continue;
        return { reason: r, action: { kind: "place", target: r.target, value: r.value } };
      }

      // (A) Zadrži samo ciljeve gdje kandidat STVARNO još postoji - inače je
      //     taj korak već odrađen i ne smije se prikazati kao sljedeći potez.
      const targets = r.targets.filter((i) => r.removeVals.some((v) => cand[i] && cand[i].has(v)));
      if (targets.length === 0) continue;
      if (solution && targets.some((i) => r.removeVals.includes(solution[i]))) continue; // ne briši pravi kandidat

      // (C) Vodi li OVA eliminacija odmah do jedinstvenog upisa?
      const after = cand.map((s) => (s ? new Set(s) : s));
      for (const i of targets) for (const v of r.removeVals) after[i].delete(v);
      const single = immediateSingle(after, targets);
      if (single && (!solution || single.value === solution[single.target])) {
        return {
          reason: r,
          action: {
            kind: "eliminate-then-place",
            targets,
            removeVals: r.removeVals,
            place: single,
          },
        };
      }
      return { reason: r, action: { kind: "eliminate", targets, removeVals: r.removeVals } };
    }
    return null;
  }

  // Objašnjenje sljedećeg poteza za trenutno stanje.
  //   values   = givens + igračevi unosi (0 = prazno)
  //   notes    = igračeve bilješke po polju (polje brojeva), za preskakanje već odrađenog
  //   solution = puno rješenje, sigurnosni filtar (opcionalno)
  // Vrati { reason, action } | { contradiction } | { done } | { reason: null }.
  // action.kind: "place" | "eliminate" | "eliminate-then-place".
  function explainNext(values, notes, solution, variants, clues) {
    useVariant(variants, clues);
    const raw = computeCandidates(values);
    for (let i = 0; i < 81; i++)
      if (values[i] === 0 && raw[i].size === 0) return { contradiction: true };
    if (!values.includes(0)) return { done: true };
    // Prvo na stanju svjesnom bilješki (preskoči već odrađeno); ako bilješke
    // ništa ne daju (krive/nepotpune), padni na čisto računate kandidate.
    return (
      findStep(candidatesFor(values, notes), solution) ||
      findStep(raw, solution) || { reason: null }
    );
  }

  const STEPS = [
    [nakedSingle, T_SINGLE, "Naked Single"],
    [hiddenSingle, T_SINGLE, "Hidden Single"],
    [lockedCandidates, T_INTER, "Locked Candidates"],
    [nakedPair, T_INTER, "Naked Pair"],
    [hiddenPair, T_INTER, "Hidden Pair"],
    [nakedTriple, T_INTER, "Naked Triple"],
    [xWing, T_ADVANCED, "X-Wing"],
    [xyWing, T_ADVANCED, "XY-Wing"],
  ];

  // Vrati { solved, tier, techniques } - tier je najteža potrebna tehnika.
  // clues = per-puzzle podaci ili null/izostavljeno = klasik (vidi useVariant).
  function solveAndGrade(puzzle, variants, clues) {
    useVariant(variants, clues);
    const grid = puzzle.slice();
    const cand = computeCandidates(grid);
    let maxTier = 0;
    const advUsed = new Set();
    let progress = true;
    while (progress) {
      if (!grid.includes(0)) break;
      progress = false;
      for (const [fn, tier, name] of STEPS) {
        if (fn(grid, cand)) {
          maxTier = Math.max(maxTier, tier);
          if (tier === T_ADVANCED) advUsed.add(name);
          progress = true;
          break;
        }
      }
    }
    if (grid.includes(0)) return { solved: false };
    return { solved: true, tier: maxTier, techniques: [...advUsed], grid };
  }

  return { solveAndGrade, explainNext, T_SINGLE, T_INTER, T_ADVANCED };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Solver;
