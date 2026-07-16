/* Sudoku UI kontroler. */
(() => {
  "use strict";

  const STORAGE_KEY = "sudoku-game-v2";
  const DIFF_LABELS = { normal: "Normal", hard: "Hard" };
  // Regijske varijante mogu se kombinirati. Aktivni skup = polje id-eva (prazno =
  // classic). Redoslijed kanonski, za stabilne labele i usporedbe.
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
  const VARIANT_LABELS = {
    antiking: "Antiking",
    antiknight: "Antiknight",
    x: "Diagonal",
    hyper: "Hyper",
    jigsaw: "Jigsaw",
    evenodd: "Even/Odd",
    kropki: "Kropki",
    xv: "XV",
    thermo: "Thermo",
  };
  const normVariants = (v) => {
    if (typeof v === "string") v = v === "classic" ? [] : [v];
    if (!Array.isArray(v)) return [];
    return REGION_VARIANTS.filter((k) => v.includes(k));
  };
  // Ljudska labela aktivnog skupa: "Diagonal + Hyper", "" za classic.
  const variantLabel = (variants) =>
    normVariants(variants)
      .map((v) => VARIANT_LABELS[v])
      .join(" + ");

  // Paleta za bojanje ćelija (9 boja, 1-9). Jedini izvor istine - iz nje se grade
  // i gumbi palete i pruge na ploči. Vrijednosti su RGB trojke; alpha se dodaje
  // po sloju (jače na gumbu, translucentnije na ploči da broj ostane čitljiv).
  const PALETTE = [
    null, // 0 = bez boje (indeks se ne koristi)
    "239, 68, 68", // 1 crvena
    "245, 158, 66", // 2 narančasta
    "235, 200, 70", // 3 žuta
    "150, 205, 80", // 4 limeta
    "52, 199, 120", // 5 zelena
    "45, 199, 197", // 6 tirkizna
    "80, 150, 245", // 7 plava
    "167, 129, 244", // 8 ljubičasta
    "236, 110, 190", // 9 roza
  ];
  const SWATCH_ALPHA = 0.9;
  const MAX_COLORS = 4; // najviše boja po ćeliji

  // Očisti/migriraj colors iz spremljene igre: prazne arraye za novi/nevaljan
  // oblik; stari v1.8.0 format (jedan broj po ćeliji) omota u array; postojeće
  // arraye filtriraj na valjane 1-9, bez duplikata, najviše MAX_COLORS.
  function normalizeColors(raw) {
    const fresh = () => Array.from({ length: 81 }, () => []);
    if (!Array.isArray(raw) || raw.length !== 81) return fresh();
    return raw.map((c) => {
      const arr = Array.isArray(c) ? c : c ? [c] : [];
      const out = [];
      for (const v of arr) {
        if (Number.isInteger(v) && v >= 1 && v <= 9 && !out.includes(v) && out.length < MAX_COLORS)
          out.push(v);
      }
      return out;
    });
  }

  // CSS background za obojenu ćeliju, jednaki omjeri po broju boja:
  //   1 = puna ispuna, 2 = dva stupca, 3 = Y (tri 120° sektora), 4 = 2×2 kvadrata.
  // Boje su NEPROZIRNE; prozirnost daje jedna `opacity` na ::after sloju (CSS).
  // Zato preklop kod kvadranata ne udvostručuje alphu (nema tamne crte na spoju),
  // a sitni preklop ujedno sprječava tanku prazninu.
  function colorBackground(cols) {
    const parts = cols.slice().sort((a, b) => a - b);
    const rgb = (c) => `rgb(${PALETTE[c]})`;
    const n = parts.length;
    if (n === 1) return rgb(parts[0]);
    if (n === 2) {
      return `linear-gradient(to right, ${rgb(parts[0])} 0 50%, ${rgb(parts[1])} 50% 100%)`;
    }
    if (n === 3) {
      // Y: granice na -60°/60°/180° (dvije ruke prema gornjim kutovima, noga dolje).
      // Sektori: gornji, donji-desni, donji-lijevi.
      return (
        `conic-gradient(from -60deg, ${rgb(parts[0])} 0deg 120deg, ` +
        `${rgb(parts[1])} 120deg 240deg, ${rgb(parts[2])} 240deg 360deg)`
      );
    }
    // n === 4: četiri kvadranta (2×2), svaki zaseban sloj boje u svom kutu.
    const sz = "calc(50% + 0.5px)";
    const quad = (c, pos) => `linear-gradient(${rgb(c)}, ${rgb(c)}) ${pos} / ${sz} ${sz} no-repeat`;
    return [
      quad(parts[0], "0 0"),
      quad(parts[1], "100% 0"),
      quad(parts[2], "0 100%"),
      quad(parts[3], "100% 100%"),
    ].join(", ");
  }

  // Dijagonale za X-Sudoku (glavna r===c, sporedna r+c===8).
  const onMainDiag = (i) => Math.floor(i / 9) === i % 9;
  const onAntiDiag = (i) => Math.floor(i / 9) + (i % 9) === 8;

  // Hyper/Windoku: 4 dodatna 3×3 prozora (redovi 2-4/6-8, stupci 2-4/6-8).
  const hyperWindows = [];
  for (const wr of [1, 5])
    for (const wc of [1, 5]) {
      const cells = [];
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++) cells.push((wr + dr) * 9 + (wc + dc));
      hyperWindows.push(cells);
    }
  // Indeks prozora (0-3) kojem ćelija pripada, ili -1 ako nije ni u jednom.
  function hyperWindowOf(idx) {
    const r = Math.floor(idx / 9),
      c = idx % 9;
    const wr = r >= 1 && r <= 3 ? 0 : r >= 5 && r <= 7 ? 1 : -1;
    const wc = c >= 1 && c <= 3 ? 0 : c >= 5 && c <= 7 ? 1 : -1;
    return wr === -1 || wc === -1 ? -1 : wr * 2 + wc;
  }

  // Antiknight: ćelije na potezu šahovskog konja (za peer-highlight i čišćenje
  // bilješki). Nema trajne dekoracije ploče - ograničenje se vidi kroz highlight.
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

  // Antiking: ćelije na dijagonalnom potezu kralja (za peer-highlight i čišćenje
  // bilješki). Ortogonalne susjede ne trebamo - njih već hvata red/stupac. Kao
  // antiknight, nema trajne dekoracije ploče - ograničenje se vidi kroz highlight.
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

  // Jigsaw: geometrija regija je per-puzzle podatak (state.regions, 81-polje
  // id-eva 0-8). Validacija oblika (za odbacivanje korumpiranog spremljenog savea).
  function validRegions(regions) {
    if (!Array.isArray(regions) || regions.length !== 81) return false;
    const counts = new Array(9).fill(0);
    for (const r of regions) {
      if (!Number.isInteger(r) || r < 0 || r > 8) return false;
      counts[r]++;
    }
    return counts.every((c) => c === 9);
  }
  // Even/Odd: parity maska je per-puzzle podatak (state.parity, 81-polje 0/1/2).
  function validParity(parity) {
    if (!Array.isArray(parity) || parity.length !== 81) return false;
    for (const p of parity) if (p !== 0 && p !== 1 && p !== 2) return false;
    return true;
  }
  // Kropki/XV: brid-oznake su per-puzzle podatak (state.edges = { h, v }, 81-polja
  // 0 nema / 1 bijela točka / 2 crna točka / 3 V (zbroj 5) / 4 X (zbroj 10)).
  function validEdges(edges) {
    if (!edges || !Array.isArray(edges.h) || !Array.isArray(edges.v)) return false;
    if (edges.h.length !== 81 || edges.v.length !== 81) return false;
    for (let i = 0; i < 81; i++) {
      if (![0, 1, 2, 3, 4].includes(edges.h[i]) || ![0, 1, 2, 3, 4].includes(edges.v[i]))
        return false;
    }
    return true;
  }
  // Thermo: tube su per-puzzle podatak (state.thermos = polje putova ćelija, bulb
  // prvi, susjedi po potezu kralja). Preklop se odbija - render crta najviše jedan
  // segment po smjeru i računa s jednim termometrom po ćeliji.
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
  // Regija ćelije: jigsaw -> state.regions[idx], inače klasični 3×3 kvadrat.
  function regionOf(idx) {
    if (state.variants.includes("jigsaw") && Array.isArray(state.regions))
      return state.regions[idx];
    return Math.floor(Math.floor(idx / 9) / 3) * 3 + Math.floor((idx % 9) / 3);
  }

  // Varijanta trenutno odabrana u meniju (dok se ne pokrene nova igra).
  let menuVariants = [];

  // --- Stanje ---
  let state = null;
  // state = {
  //   puzzle: [81] (givens, 0 prazno),
  //   solution: [81],
  //   values: [81] (trenutni unosi igrača, 0 prazno),
  //   notes: [81] od Set-ova (kao polje brojeva u JSON-u),
  //   difficulty, variants (npr. ["x","hyper"], prazno = classic), selected (idx|null),
  //   notesMode (bool), solved (bool)
  // }

  let history = []; // za undo
  // Stanje povlačenja (pencil brush ili grupna selekcija)
  let drag = { active: false, mode: "add", painted: null, anchor: -1 };

  // --- DOM ---
  const boardEl = document.getElementById("board");
  const numpadEl = document.getElementById("numpad");
  const paletteEl = document.getElementById("palette");
  const diffLabelEl = document.getElementById("difficulty-label");
  const techniqueHintEl = document.getElementById("technique-hint");
  const notesStateEl = document.getElementById("notes-state");
  const winOverlay = document.getElementById("win-overlay");
  const winStats = document.getElementById("win-stats");
  const menuOverlay = document.getElementById("menu-overlay");
  const loadingOverlay = document.getElementById("loading-overlay");
  const hintBanner = document.getElementById("hint-banner");
  const hintTextEl = document.getElementById("hint-text");

  // Efemerno stanje pomoći (ne sprema se): step 1 = nagovještaj, 2 = rješenje.
  let hintUi = { step: 0, sig: "", focus: [], targets: [] };

  // --- Inicijalizacija ploče (jednom kreiramo 81 ćeliju) ---
  const cells = [];
  function buildBoard() {
    boardEl.innerHTML = "";
    cells.length = 0;
    for (let i = 0; i < 81; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const row = Math.floor(i / 9);
      const col = i % 9;
      if (col % 3 === 2 && col !== 8) cell.classList.add("br");
      if (row % 3 === 2 && row !== 8) cell.classList.add("bb");
      cell.dataset.idx = i;
      boardEl.appendChild(cell);
      cells.push(cell);
    }
  }

  function buildNumpad() {
    numpadEl.innerHTML = "";
    for (let n = 1; n <= 9; n++) {
      const btn = document.createElement("button");
      btn.className = "num-btn";
      btn.innerHTML = `<span class="num">${n}</span><span class="num-count" data-n="${n}"></span>`;
      btn.addEventListener("click", () => onNumpad(n));
      numpadEl.appendChild(btn);
    }
  }

  // Paleta boja za color mode: 9 boja (unos kao brojevi - prvo odaberi ćelije,
  // pa stisni boju). Bez zasebnog brisača: isti klik na već postojeću boju je
  // miče, a Erase/Delete čisti cijelu ćeliju.
  function buildPalette() {
    paletteEl.innerHTML = "";
    for (let c = 1; c <= 9; c++) {
      const btn = document.createElement("button");
      btn.className = "swatch";
      btn.dataset.color = c;
      btn.setAttribute("aria-label", "Color " + c);
      btn.style.backgroundColor = `rgba(${PALETTE[c]}, ${SWATCH_ALPHA})`;
      btn.addEventListener("click", () => inputColor(c));
      paletteEl.appendChild(btn);
    }
  }

  // --- Metrike ---
  // Anoniman event tracking (metrics.js). No-op dok METRICS_URL nije postavljen, a
  // ovdje je dodatno zaštićen: ako se metrics.js ne učita, igra radi normalno dalje.
  const track = (event, payload) => {
    try {
      if (window.Metrics) window.Metrics.track(event, payload);
    } catch (e) {
      /* tracking nikad ne smije srušiti igru */
    }
  };
  const newGameId = () => {
    try {
      return window.Metrics ? window.Metrics.uuid() : "";
    } catch (e) {
      return "";
    }
  };
  // Ono što opisuje partiju u svakom eventu. `gameId` veže game_started↔game_solved
  // (completion rate po partiji, ne samo agregatno) i preživi reload jer živi u
  // state-u; `variants` je polje pa pokriva i pojedinačne varijante i kombinacije.
  const gameFacts = () => ({
    gameId: state.gameId || "",
    difficulty: state.difficulty,
    variants: state.variants,
  });
  // Uz solve ide i koliko je partija koštala: je li Normal trivijalan, je li Hard
  // neprolazan. `playMs` je igrano vrijeme, ne vrijeme od početka (vidi sat ispod).
  const solveFacts = () => ({
    ...gameFacts(),
    playMs: state.playMs || 0,
    moves: state.moves || 0,
    hints: state.hints || 0,
  });

  // Sat igranog vremena: broji samo dok je kartica vidljiva. Partija ostavljena
  // otvorena preko noći inače bi dala besmislenih 10 sati. Akumulira se u
  // `state.playMs` (preživi reload), `activeSince` je efemeran.
  let activeSince = null;
  function clockStart() {
    if (activeSince === null && state && !state.solved) activeSince = Date.now();
  }
  function clockStop() {
    if (activeSince === null) return;
    if (state) state.playMs = (state.playMs || 0) + (Date.now() - activeSince);
    activeSince = null;
  }

  // --- Nova igra ---
  // Generiranje ide u Web Worker: glavna nit ostaje slobodna (spinner živi, a
  // gumb Cancel je klikabilan). Prekid = worker.terminate(). Fallback na sinkrono
  // ako okruženje nema Worker.
  let genWorker = null;
  // Što se trenutno generira (i otkad) - da Cancel može javiti od čega je korisnik
  // odustao i koliko je čekao. Čisti se čim ploča sjedne.
  let pendingGen = null;

  function buildState(
    difficulty,
    variants,
    puzzle,
    solution,
    techniques,
    regions,
    parity,
    edges,
    thermos
  ) {
    state = {
      puzzle,
      solution,
      values: puzzle.slice(),
      notes: Array.from({ length: 81 }, () => []),
      colors: Array.from({ length: 81 }, () => []),
      difficulty,
      variants,
      regions: regions || null,
      parity: parity || null,
      edges: edges || null,
      thermos: thermos || null,
      techniques: techniques || [],
      gameId: newGameId(),
      playMs: 0,
      moves: 0,
      hints: 0,
      selected: null,
      multi: [],
      notesMode: false,
      activeNote: null,
      colorMode: false,
      solved: false,
    };
    history = [];
    clearHint();
    save();
    render();
    loadingOverlay.classList.add("hidden");
    pendingGen = null;
    activeSince = null;
    clockStart();
    // Start se broji tek kad ploča stvarno postoji - generiranje koje korisnik
    // prekine Cancelom nije odigrana partija i ne smije razvodniti completion rate.
    track("game_started", gameFacts());
  }

  function generateSync(difficulty, variants) {
    // Odgoda da se spinner stigne iscrtati prije sinkronog generiranja.
    setTimeout(() => {
      const { puzzle, solution, techniques, regions, parity, edges, thermos } = Sudoku.generate(
        difficulty,
        variants
      );
      buildState(
        difficulty,
        variants,
        puzzle,
        solution,
        techniques,
        regions,
        parity,
        edges,
        thermos
      );
    }, 30);
  }

  function newGame(difficulty, variants) {
    variants = normVariants(variants);
    pendingGen = { difficulty, variants, at: Date.now() };
    loadingOverlay.classList.remove("hidden");
    if (genWorker) {
      genWorker.terminate();
      genWorker = null;
    }
    if (typeof Worker !== "undefined") {
      try {
        genWorker = new Worker("gen-worker.js");
        genWorker.onmessage = (e) => {
          genWorker.terminate();
          genWorker = null;
          const { puzzle, solution, techniques, regions, parity, edges, thermos } = e.data;
          buildState(
            difficulty,
            variants,
            puzzle,
            solution,
            techniques,
            regions,
            parity,
            edges,
            thermos
          );
        };
        genWorker.onerror = () => {
          // Worker pao (npr. blokiran importScripts) - padni na sinkrono.
          genWorker.terminate();
          genWorker = null;
          generateSync(difficulty, variants);
        };
        genWorker.postMessage({ difficulty, variants });
        return;
      } catch (e) {
        genWorker = null;
      }
    }
    generateSync(difficulty, variants);
  }

  // Prekid generiranja: ubij worker i vrati korisnika u meni da odabere lakšu
  // kombinaciju (npr. manje varijanti ili nižu težinu).
  function cancelGeneration() {
    if (genWorker) {
      genWorker.terminate();
      genWorker = null;
    }
    loadingOverlay.classList.add("hidden");
    // Odustajanje od generiranja je jedini signal za sporu HARD generaciju varijanti:
    // bez njega čovjek koji je odustao izgleda isto kao onaj koji nikad nije ni došao.
    if (pendingGen) {
      track("game_cancelled", {
        difficulty: pendingGen.difficulty,
        variants: pendingGen.variants,
        waitedMs: Date.now() - pendingGen.at,
      });
      pendingGen = null;
    }
    openMenu();
  }

  // --- Spremanje / učitavanje ---
  function save() {
    if (!state) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* ignoriraj */
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s.puzzle || !s.solution || !s.values) return false;
      state = s;
      if (!state.notes) state.notes = Array.from({ length: 81 }, () => []);
      if (state.activeNote === undefined) state.activeNote = null;
      if (!state.multi) state.multi = [];
      // Igre spremljene prije metrika nemaju gameId - njihov solve ostaje bez veze
      // na start (prazan gameId), ne izmišljamo novi jer start nikad nije poslan.
      if (!state.gameId) state.gameId = "";
      // Brojači uvedeni s metrikama - stare spremljene igre kreću od nule.
      if (typeof state.playMs !== "number") state.playMs = 0;
      if (typeof state.moves !== "number") state.moves = 0;
      if (typeof state.hints !== "number") state.hints = 0;
      state.colors = normalizeColors(state.colors);
      if (state.colorMode === undefined) state.colorMode = false;
      // Migracija: stare spremljene igre imaju string `variant`, nove `variants`.
      state.variants = normVariants(state.variants !== undefined ? state.variants : state.variant);
      delete state.variant;
      // Jigsaw: regions mora biti valjan (81, id-evi 0-8, svaki 9x). Korumpiran
      // save s jigsaw variants odbaci (solver bi tiho sudio krivo). Non-jigsaw = null.
      if (state.variants.includes("jigsaw")) {
        if (!validRegions(state.regions)) return false;
      } else {
        state.regions = null;
      }
      // Even/Odd: parity maska mora biti valjana (81-polje 0/1/2). Isto kao jigsaw -
      // korumpiran save odbaci; non-evenodd = null.
      if (state.variants.includes("evenodd")) {
        if (!validParity(state.parity)) return false;
      } else {
        state.parity = null;
      }
      // Migracija: Kropki partije spremljene prije XV-a nose `dots` (tipovi 0-2);
      // `edges` je isti oblik s proširenim tipovima pa se preuzima kakav jest.
      if (state.dots && !state.edges) state.edges = state.dots;
      delete state.dots;
      // Kropki/XV: brid-oznake moraju biti valjane ({ h, v } 81-polja 0-4); inače
      // odbaci (solver bi tiho sudio krivo). Bez tih varijanti = null.
      if (state.variants.includes("kropki") || state.variants.includes("xv")) {
        if (!validEdges(state.edges)) return false;
      } else {
        state.edges = null;
      }
      // Thermo: tube moraju biti valjane (putovi susjednih ćelija, bez preklopa);
      // inače odbaci (solver bi tiho sudio krivo). Bez thermo varijante = null.
      if (state.variants.includes("thermo")) {
        if (!validThermos(state.thermos)) return false;
      } else {
        state.thermos = null;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- Odabir ćelije(a) ---
  // state.selected = sidro (jedna ćelija; tipkovnica/pomoć/highlight).
  // state.multi = grupa (2+ ćelija); prazno kad je odabir jednostruk.
  function setSelection(list, anchor) {
    const uniq = [...new Set(list)].filter((i) => i >= 0 && i < 81);
    state.multi = uniq.length > 1 ? uniq : [];
    state.selected = uniq.length
      ? anchor != null && uniq.includes(anchor)
        ? anchor
        : uniq[uniq.length - 1]
      : null;
    render();
  }

  function selectCell(idx) {
    if (!state || state.solved) return;
    setSelection([idx], idx);
  }

  // Sve trenutno odabrane ćelije (grupa, ili sidro, ili prazno).
  function selectedCells() {
    if (state.multi && state.multi.length) return state.multi;
    return state.selected !== null ? [state.selected] : [];
  }

  function toggleInSelection(idx) {
    const cur = selectedCells().slice();
    const pos = cur.indexOf(idx);
    if (pos === -1) cur.push(idx);
    else cur.splice(pos, 1);
    setSelection(cur, idx);
  }

  function rectBetween(a, b) {
    const rlo = Math.min(Math.floor(a / 9), Math.floor(b / 9));
    const rhi = Math.max(Math.floor(a / 9), Math.floor(b / 9));
    const clo = Math.min(a % 9, b % 9);
    const chi = Math.max(a % 9, b % 9);
    const out = [];
    for (let r = rlo; r <= rhi; r++) for (let c = clo; c <= chi; c++) out.push(r * 9 + c);
    return out;
  }

  // Upiši/toggle broj u jednu ćeliju (bez save/render - poziva grupni ili
  // jednostruki unos). Vraća true ako je nešto promijenjeno.
  function applyNumber(idx, n) {
    if (state.puzzle[idx] !== 0) return false; // given, ne dira se
    if (state.notesMode) {
      const notes = state.notes[idx];
      const pos = notes.indexOf(n);
      if (pos === -1) notes.push(n);
      else notes.splice(pos, 1);
      state.values[idx] = 0;
      return true;
    }
    // Potez = unos broja (i njegovo poništavanje ponovnim istim brojem). Bilješke,
    // boje i Erase se ne broje - mjerimo koliko je unosa trebalo do rješenja.
    state.moves = (state.moves || 0) + 1;
    if (state.values[idx] === n) {
      state.values[idx] = 0; // ponovni isti broj briše
      return true;
    }
    state.values[idx] = n;
    state.notes[idx] = [];
    if (n === state.solution[idx]) clearNotesAround(idx, n);
    return true;
  }

  // --- Unos broja ---
  function inputNumber(n) {
    if (!state || state.solved) return;
    const targets = selectedCells();
    if (!targets.length) return;

    if (targets.length === 1) {
      // Jednostruk odabir zadržava toggle-off ponašanje.
      if (state.puzzle[targets[0]] !== 0) return;
      clearHint();
      pushHistory();
      applyNumber(targets[0], n);
      save();
      render();
      checkWin();
      return;
    }

    // Grupa (2+): broj UVIJEK radi pencil marks (kandidate), neovisno o notes
    // modu. Grupni toggle: ako sve prazne odabrane već imaju n -> makni iz svih,
    // inače dodaj u sve gdje ga nema. Pencil marks idu samo na prazne ćelije.
    const editable = targets.filter((i) => state.puzzle[i] === 0 && state.values[i] === 0);
    if (!editable.length) return;
    const allHave = editable.every((i) => state.notes[i].includes(n));
    clearHint();
    pushHistory();
    for (const idx of editable) {
      const notes = state.notes[idx];
      const pos = notes.indexOf(n);
      if (allHave) {
        if (pos !== -1) notes.splice(pos, 1);
      } else if (pos === -1) {
        notes.push(n);
      }
    }
    save();
    render();
  }

  function clearNotesAround(idx, n) {
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    const targets = new Set();
    for (let i = 0; i < 9; i++) {
      targets.add(row * 9 + i);
      targets.add(i * 9 + col);
    }
    // Box/regija: jigsaw čisti cijelu regiju ćelije, inače klasični 3×3 kvadrat.
    if (state.variants.includes("jigsaw") && Array.isArray(state.regions)) {
      const rid = state.regions[idx];
      for (let t = 0; t < 81; t++) if (state.regions[t] === rid) targets.add(t);
    } else {
      const boxRow = Math.floor(row / 3) * 3;
      const boxCol = Math.floor(col / 3) * 3;
      for (let i = 0; i < 9; i++)
        targets.add((boxRow + Math.floor(i / 3)) * 9 + (boxCol + (i % 3)));
    }
    if (state.variants.includes("x")) {
      if (onMainDiag(idx)) for (let i = 0; i < 9; i++) targets.add(i * 9 + i);
      if (onAntiDiag(idx)) for (let i = 0; i < 9; i++) targets.add(i * 9 + (8 - i));
    }
    if (state.variants.includes("hyper")) {
      const w = hyperWindowOf(idx);
      if (w !== -1) for (const t of hyperWindows[w]) targets.add(t);
    }
    if (state.variants.includes("antiknight")) {
      for (const t of knightPeers[idx]) targets.add(t);
    }
    if (state.variants.includes("antiking")) {
      for (const t of kingPeers[idx]) targets.add(t);
    }
    for (const t of targets) {
      const p = state.notes[t].indexOf(n);
      if (p !== -1) state.notes[t].splice(p, 1);
    }
  }

  function erase() {
    if (!state || state.solved) return;
    // Erase ovisi o modu: Color -> samo boje, Bilješke -> samo bilješke, inače
    // -> sve (boje + vrijednost/bilješke na ne-given ćelijama). Undo vraća sve.
    const mode = state.colorMode ? "colors" : state.notesMode ? "notes" : "all";
    const has = (i) => {
      if (mode === "colors") return state.colors[i].length > 0;
      if (mode === "notes") return state.notes[i].length > 0;
      return (
        state.colors[i].length > 0 ||
        (state.puzzle[i] === 0 && (state.values[i] !== 0 || state.notes[i].length > 0))
      );
    };
    const toClear = selectedCells().filter(has);
    if (!toClear.length) return;
    clearHint();
    pushHistory();
    for (const idx of toClear) {
      if (mode === "colors") {
        state.colors[idx] = [];
      } else if (mode === "notes") {
        state.notes[idx] = [];
      } else {
        state.colors[idx] = [];
        if (state.puzzle[idx] === 0) {
          state.values[idx] = 0;
          state.notes[idx] = [];
        }
      }
    }
    save();
    render();
  }

  // --- Numpad (klik) ---
  function onNumpad(n) {
    // U notes modu numpad bira "kist" (broj koji se maže); inače unosi vrijednost.
    if (state && state.notesMode) setActiveNote(n);
    else inputNumber(n);
  }

  function setActiveNote(n) {
    if (!state) return;
    state.activeNote = state.activeNote === n ? null : n;
    render();
  }

  // Boja se unosi kao broj: primijeni na trenutno odabrane ćelije. Toggle po
  // grupi (kao pencil): ako sve odabrane već imaju boju c -> makni je iz svih;
  // inače dodaj u sve gdje je nema (dok ćelija ima manje od MAX_COLORS). Boja
  // ide na bilo koju ćeliju (i given i s upisanim brojem).
  function inputColor(c) {
    if (!state || state.solved) return;
    const targets = selectedCells();
    if (!targets.length) return;
    clearHint();
    pushHistory();
    const allHave = targets.every((i) => state.colors[i].includes(c));
    for (const idx of targets) {
      const arr = state.colors[idx];
      const pos = arr.indexOf(c);
      if (allHave) {
        if (pos !== -1) arr.splice(pos, 1);
      } else if (pos === -1 && arr.length < MAX_COLORS) {
        arr.push(c);
      }
    }
    save();
    render();
  }

  // --- Pencil brush (povlačenje kandidata) ---
  // Bilješke prima samo prazna ne-given ćelija.
  function isPaintable(idx) {
    return state.puzzle[idx] === 0 && state.values[idx] === 0;
  }

  function onBoardPointerDown(e) {
    if (!state || state.solved) return;
    const cellEl = e.target.closest && e.target.closest(".cell");
    if (!cellEl || !boardEl.contains(cellEl)) return;
    const idx = Number(cellEl.dataset.idx);

    // Kist se maže samo u notes modu, s odabranim brojem, na praznoj ćeliji.
    // Inače povlačenje pomiče selekciju (drag = select) - radi i mišem i dodirom.
    const brushing = state.notesMode && state.activeNote !== null && isPaintable(idx);
    if (!brushing) {
      e.preventDefault();
      // Ctrl/Cmd klik: dodaj/makni pojedinačnu ćeliju iz grupe (bez povlačenja).
      if (e.ctrlKey || e.metaKey) {
        toggleInSelection(idx);
        return;
      }
      // Shift klik: pravokutnik od sidra do ove ćelije.
      if (e.shiftKey && state.selected !== null) {
        setSelection(rectBetween(state.selected, idx), state.selected);
        return;
      }
      // Obični pritisak: kreni novu grupnu drag-selekciju (povlačenjem raste).
      clearHint();
      drag.active = true;
      drag.mode = "select";
      drag.anchor = idx;
      drag.painted = new Set([idx]);
      setSelection([idx], idx);
      return;
    }

    // Smjer poteza određuje početna ćelija: ima li već tu bilješku -> potez briše,
    // inače potez dodaje. Tako jedan potez ne miješa dodavanje i brisanje
    // (povlačenjem ne gaziš ono što si maloprije upisao).
    e.preventDefault();
    clearHint();
    pushHistory();
    drag.active = true;
    drag.mode = state.notes[idx].includes(state.activeNote) ? "remove" : "add";
    drag.painted = new Set();
    state.selected = idx;
    state.multi = [];
    applyBrush(idx);
  }

  function onBoardPointerMove(e) {
    if (!drag.active) return;
    e.preventDefault();
    // Ciljnu ćeliju tražimo preko elementFromPoint (radi i s mišem i s dodirom;
    // touch implicitno "hvata" pointer na početnu ćeliju).
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cellEl = el && el.closest && el.closest(".cell");
    if (!cellEl || !boardEl.contains(cellEl)) return;
    const idx = Number(cellEl.dataset.idx);
    if (drag.mode === "select") {
      if (!drag.painted.has(idx)) {
        drag.painted.add(idx);
        setSelection([...drag.painted], drag.anchor);
      }
    } else {
      applyBrush(idx);
    }
  }

  function onBoardPointerUp() {
    if (!drag.active) return;
    drag.active = false;
    drag.painted = null;
    save();
    render();
  }

  function applyBrush(idx) {
    if (!drag.active || drag.painted.has(idx) || !isPaintable(idx)) return;
    drag.painted.add(idx);
    const notes = state.notes[idx];
    const pos = notes.indexOf(state.activeNote);
    if (drag.mode === "add") {
      if (pos === -1) notes.push(state.activeNote);
    } else if (pos !== -1) {
      notes.splice(pos, 1);
    }
    render();
  }

  // --- Pomoć: objasni sljedeći potez ---
  function cellName(idx) {
    return `row ${Math.floor(idx / 9) + 1}, column ${(idx % 9) + 1}`;
  }

  function showHint(text) {
    hintTextEl.textContent = text;
    hintBanner.classList.remove("hidden");
  }

  function clearHint() {
    hintUi.step = 0;
    hintUi.sig = "";
    hintUi.focus = [];
    hintUi.targets = [];
    hintBanner.classList.add("hidden");
  }

  function hint() {
    if (!state || state.solved) return;
    // Svaki zahtjev za pomoć se broji (i onaj koji samo javi "imaš krivih polja") -
    // mjera je koliko je puta korisnik zapeo, ne koliko mu je logike servirano.
    state.hints = (state.hints || 0) + 1;
    save();

    // 1) Krivi unosi prvo - logika na pogrešnoj ploči je besmislena.
    const wrong = [];
    for (let i = 0; i < 81; i++) {
      if (state.puzzle[i] === 0 && state.values[i] !== 0 && state.values[i] !== state.solution[i])
        wrong.push(i);
    }
    if (wrong.length) {
      hintUi.step = 0;
      hintUi.focus = [];
      hintUi.targets = wrong;
      showHint(
        `You have ${wrong.length} ${wrong.length === 1 ? "wrong cell" : "wrong cells"} (red). Fix that before looking for the next move.`
      );
      render();
      return;
    }

    const res = Solver.explainNext(
      state.values,
      state.notes,
      state.solution,
      state.variants,
      state.regions,
      state.parity,
      state.edges,
      state.thermos
    );
    if (!res || res.done) {
      clearHint();
      showHint("Everything is already solved.");
      return;
    }
    if (res.contradiction) {
      clearHint();
      showHint("The board is in contradiction - check your entries.");
      return;
    }
    if (!res.reason) {
      clearHint();
      showHint("No clean logical move from here.");
      return;
    }

    const reason = res.reason,
      a = res.action;
    const sig = state.values.join(",") + "|" + state.notes.map((n) => n.join("")).join(",");
    // Drugi tap na istoj ploči eskalira nagovještaj u rješenje.
    hintUi.step = hintUi.sig === sig && hintUi.step === 1 ? 2 : 1;
    hintUi.sig = sig;
    hintUi.focus = reason.focus.slice();

    if (hintUi.step === 1) {
      hintUi.targets = [];
      showHint(`Next move: ${reason.technique}. Tap Hint again for the solution.`);
      render();
      return;
    }

    // Korak 2: puno objašnjenje tehnike + njena IZRAVNA akcija.
    if (a.kind === "place") {
      hintUi.targets = [a.target];
      state.selected = a.target;
      state.multi = [];
      showHint(`${reason.technique}: ${reason.note}. Enter ${a.value} in ${cellName(a.target)}.`);
    } else if (a.kind === "eliminate-then-place") {
      hintUi.focus = reason.focus.concat(a.targets);
      hintUi.targets = [a.place.target];
      state.selected = a.place.target;
      state.multi = [];
      const where = a.place.unitName ? `in ${a.place.unitName} ` : "";
      showHint(
        `${reason.technique}: ${reason.note}, so ${where}the number ${a.place.value} can go in only one more cell. Enter ${a.place.value} in ${cellName(a.place.target)}.`
      );
    } else {
      // eliminate
      hintUi.targets = a.targets.slice();
      showHint(
        `${reason.technique}: ${reason.note}. Remove the note ${a.removeVals.join(", ")} from the highlighted cells.`
      );
    }
    render();
  }

  function toggleNotes() {
    if (!state) return;
    state.notesMode = !state.notesMode;
    if (state.notesMode) state.colorMode = false;
    render();
  }

  function toggleColorMode() {
    if (!state) return;
    state.colorMode = !state.colorMode;
    if (state.colorMode) state.notesMode = false;
    render();
  }

  // --- Undo ---
  function pushHistory() {
    history.push({
      values: state.values.slice(),
      notes: state.notes.map((a) => a.slice()),
      colors: state.colors.map((a) => a.slice()),
    });
    if (history.length > 100) history.shift();
  }

  function undo() {
    if (!state || history.length === 0) return;
    clearHint();
    const prev = history.pop();
    state.values = prev.values;
    state.notes = prev.notes;
    if (prev.colors) state.colors = prev.colors;
    save();
    render();
  }

  // --- Pobjeda ---
  function checkWin() {
    if (!state || state.solved) return;
    for (let i = 0; i < 81; i++) {
      if (state.values[i] !== state.solution[i]) return;
    }
    state.solved = true;
    clockStop();
    save();
    track("game_solved", solveFacts());
    winStats.textContent = winStatsText();
    winOverlay.classList.remove("hidden");
  }

  function statusLabel() {
    const vl = variantLabel(state.variants);
    const dl = DIFF_LABELS[state.difficulty] || "";
    return vl ? `${vl} · ${dl}` : dl;
  }

  function winStatsText() {
    let t = statusLabel();
    if (state.techniques && state.techniques.length) t += ` · ${state.techniques.join(", ")}`;
    return t;
  }

  // --- Render ---
  function render() {
    if (!state) return;
    diffLabelEl.textContent = statusLabel();
    const xMode = state.variants.includes("x");
    const hyperMode = state.variants.includes("hyper");
    const antiknightMode = state.variants.includes("antiknight");
    const antikingMode = state.variants.includes("antiking");
    const jigsawMode = state.variants.includes("jigsaw") && Array.isArray(state.regions);
    if (state.techniques && state.techniques.length) {
      techniqueHintEl.textContent = "Hardest: " + state.techniques.join(", ");
      techniqueHintEl.classList.remove("hidden");
    } else {
      techniqueHintEl.classList.add("hidden");
    }
    notesStateEl.textContent = state.notesMode ? "On" : "Off";
    document.getElementById("notes-btn").classList.toggle("active", state.notesMode);
    document.getElementById("color-btn").classList.toggle("active", state.colorMode);
    paletteEl.classList.toggle("hidden", !state.colorMode);
    numpadEl.classList.toggle("hidden", state.colorMode);
    // Jigsaw: ploča dobiva klasu za deblje/svjetlije granice regija (vidi CSS).
    boardEl.classList.toggle("jigsaw", jigsawMode);

    // Thermo: indeks ćelija -> { path, pos } za ovaj render. Tube su nepromjenjive
    // tijekom partije, ali render se zove na svaki potez - 81 unosa je jeftinije od
    // pretrage po putovima za svaku ćeliju.
    const thermoAt = new Array(81).fill(null);
    if (Array.isArray(state.thermos))
      for (const path of state.thermos)
        for (let p = 0; p < path.length; p++) thermoAt[path[p]] = { path, pos: p };

    const sel = state.selected;
    const selList = state.multi && state.multi.length ? state.multi : sel !== null ? [sel] : [];
    const selSet = new Set(selList);
    const groupSel = selList.length > 1;
    const selVal = sel !== null ? state.values[sel] || 0 : 0;
    const selRow = sel !== null ? Math.floor(sel / 9) : -1;
    const selCol = sel !== null ? sel % 9 : -1;
    const selRegion = sel !== null ? regionOf(sel) : -1;

    for (let i = 0; i < 81; i++) {
      const cell = cells[i];
      const v = state.values[i];
      const isGiven = state.puzzle[i] !== 0;
      cell.className = "cell";
      const col = i % 9;
      const row = Math.floor(i / 9);
      // Granice regija: jigsaw crta rub gdje susjedna ćelija pripada drugoj regiji,
      // inače klasične granice 3×3 kvadrata. Isti .br/.bb mehanizam (2px linija).
      if (
        jigsawMode
          ? col !== 8 && state.regions[i] !== state.regions[i + 1]
          : col % 3 === 2 && col !== 8
      )
        cell.classList.add("br");
      if (
        jigsawMode
          ? row !== 8 && state.regions[i] !== state.regions[i + 9]
          : row % 3 === 2 && row !== 8
      )
        cell.classList.add("bb");
      // Dijagonalna crta (X-Sudoku) crta se u POZADINI ćelije pa upisani broj
      // (tekst) uvijek ostaje iznad nje.
      if (xMode) {
        if (onMainDiag(i)) cell.classList.add("diag-main");
        if (onAntiDiag(i)) cell.classList.add("diag-anti");
      }
      // Hyper/Windoku: 4 prozora se sjenčaju translucentnim tintom (background-
      // image, kao dijagonala) da highlight i upisani broj ostanu iznad.
      if (hyperMode && hyperWindowOf(i) !== -1) cell.classList.add("window");
      // Ručno obojane ćelije: do 4 boje kao okomite pruge u zasebnom ::after
      // sloju (ne dira highlight; upisani broj ostaje iznad). Boja se postavlja
      // inline preko --cc jer je kombinacija dinamična.
      if (state.colors[i].length) {
        cell.classList.add("colored");
        cell.style.setProperty("--cc", colorBackground(state.colors[i]));
      } else {
        cell.style.removeProperty("--cc");
      }
      // Even/Odd: oznaka parnosti u ::before sloju (kvadrat = parno, krug = neparno).
      // Skrivena na zadanim ćelijama - upisani broj već pokazuje parnost.
      if (state.parity && state.parity[i] && !isGiven) {
        cell.classList.add(state.parity[i] === 1 ? "even" : "odd");
      }

      // Highlight odabranih ćelija (grupa ili sidro)
      if (selSet.has(i)) cell.classList.add("selected");
      // Peer/isti-broj samo kod jednostrukog odabira (kod grupe bi bilo prešaroliko)
      if (sel !== null && !groupSel) {
        let isPeer = row === selRow || col === selCol || regionOf(i) === selRegion;
        if (xMode) {
          if (onMainDiag(sel) && onMainDiag(i)) isPeer = true;
          if (onAntiDiag(sel) && onAntiDiag(i)) isPeer = true;
        }
        if (hyperMode) {
          const sw = hyperWindowOf(sel);
          if (sw !== -1 && sw === hyperWindowOf(i)) isPeer = true;
        }
        if (antiknightMode && knightPeers[sel].includes(i)) isPeer = true;
        if (antikingMode && kingPeers[sel].includes(i)) isPeer = true;
        if (isPeer) cell.classList.add("peer");
        if (selVal !== 0 && v === selVal) cell.classList.add("same");
      }

      // Sadržaj
      if (v !== 0) {
        cell.textContent = v;
        cell.classList.add(isGiven ? "given" : "user");
        if (!isGiven && v !== state.solution[i]) cell.classList.add("wrong");
      } else if (state.notes[i] && state.notes[i].length > 0) {
        cell.textContent = "";
        const grid = document.createElement("div");
        grid.className = "notes";
        for (let n = 1; n <= 9; n++) {
          const span = document.createElement("span");
          if (state.notes[i].includes(n)) {
            span.textContent = n;
            if (selVal !== 0 && n === selVal) span.classList.add("note-match");
          }
          grid.appendChild(span);
        }
        cell.appendChild(grid);
      } else {
        cell.textContent = "";
      }

      // Thermo: tuba. Prva oznaka koja NE stane u ćeliju - ide u zasebne spanove sa
      // z-indexom -1 (isti sloj kao parity ::before: iznad boje/highlighta ćelije,
      // ispod znamenke). Jedan board-level SVG preko ploče bi bio čišći, ali ne ide:
      // ćelije imaju neprozirnu pozadinu pa bi ih SVG ispod bio nevidljiv, a iznad
      // bi prekrio znamenke.
      //
      // Zato svaka ćelija crta SVOJU polovicu svakog segmenta - od svog središta
      // prema susjedu na tubi, s prelaskom od 3px preko granice. Dvije polovice se
      // preklope u razmaku (i na debeloj granici bloka, gdje je razmak 3px) pa je
      // tuba neprekinuta bez računanja točnih razmaka. Prelazak ne smije biti veći:
      // ćelija se cijela iscrtava iznad ranije iscrtanih susjeda, pa bi dulji
      // segment prekrio susjedovu znamenku. Na 3px dohvati samo njegov rub.
      if (thermoAt[i]) {
        const { path, pos } = thermoAt[i];
        // Kuglica = dno tube (najmanji broj). Crta se preko početka segmenta.
        if (pos === 0) {
          const bulb = document.createElement("span");
          bulb.className = "thermo-bulb";
          cell.appendChild(bulb);
        }
        for (const q of [pos - 1, pos + 1]) {
          if (q < 0 || q >= path.length) continue;
          const j = path[q];
          const seg = document.createElement("span");
          seg.className = "thermo-seg";
          const dr = Math.floor(j / 9) - row;
          const dc = (j % 9) - col;
          // Kut prema susjedu; dijagonalni segment je za faktor √2 dulji.
          seg.style.setProperty("--a", `${(Math.atan2(dr, dc) * 180) / Math.PI}deg`);
          if (dr && dc) seg.classList.add("diag");
          cell.appendChild(seg);
        }
      }

      // Kropki/XV: oznake na bridovima. Vežemo ih uz KASNIJE iscrtanu ćeliju (ovu, i) na
      // lijevom/gornjem bridu prema ranijem susjedu (i-1 / i-9) - tako oznaka leži iznad
      // susjeda (siblinzi se crtaju po DOM redu). ::before/::after su zauzeti pa zaseban
      // span; textContent gore ih pobriše svaki render pa se čisto ponovno postave.
      // Oznaka između DVIJE zadane ćelije je šum (oba broja poznata od početka) - skrij ju.
      // Na granici bloka (deblja linija) razmak je širi pa oznaka dobiva `thick` offset.
      if (state.edges) {
        const given = (j) => state.puzzle[j] !== 0;
        // Zajednička klasa `emark` nosi poziciju na bridu; kdot/xmark samo izgled.
        const mark = (t, axis, thick) => {
          const el = document.createElement("span");
          el.className =
            "emark " +
            axis +
            (t <= 2 ? " kdot " + (t === 1 ? "white" : "black") : " xmark") +
            (thick ? " thick" : "");
          if (t >= 3) el.textContent = t === 3 ? "V" : "X";
          cell.appendChild(el);
        };
        if (col > 0 && state.edges.h[i - 1] && !(given(i) && given(i - 1))) {
          const thick = jigsawMode
            ? state.regions[i] !== state.regions[i - 1]
            : col === 3 || col === 6;
          mark(state.edges.h[i - 1], "h", thick);
        }
        if (row > 0 && state.edges.v[i - 9] && !(given(i) && given(i - 9))) {
          const thick = jigsawMode
            ? state.regions[i] !== state.regions[i - 9]
            : row === 3 || row === 6;
          mark(state.edges.v[i - 9], "v", thick);
        }
      }
    }

    // Highlight pomoći (žuto): regija/uzorak slabije, ciljno polje jače.
    for (const i of hintUi.focus) cells[i].classList.add("hint-focus");
    for (const i of hintUi.targets) cells[i].classList.add("hint-target");

    updateNumCounts();
  }

  // Broji koliko je svakog broja ostalo (9 - postavljeni točni/uneseni)
  function updateNumCounts() {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 81; i++) {
      const v = state.values[i];
      if (v !== 0) counts[v]++;
    }
    for (let n = 1; n <= 9; n++) {
      const el = numpadEl.querySelector(`.num-count[data-n="${n}"]`);
      if (el) {
        const left = 9 - counts[n];
        el.textContent = left > 0 ? left : "";
        const btn = el.closest(".num-btn");
        btn.classList.toggle("depleted", left <= 0);
        btn.classList.toggle("brush-active", state.notesMode && state.activeNote === n);
      }
    }
  }

  // --- Tipkovnica (desktop test) ---
  function onKey(e) {
    if (!state) return;
    if (e.key >= "1" && e.key <= "9") {
      inputNumber(parseInt(e.key, 10));
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      erase();
      return;
    }
    if (e.key === "n" || e.key === "N") {
      toggleNotes();
      return;
    }
    if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
      undo();
      return;
    }
    if (state.selected === null) return;
    let idx = state.selected;
    if (e.key === "ArrowUp" && idx >= 9) idx -= 9;
    else if (e.key === "ArrowDown" && idx < 72) idx += 9;
    else if (e.key === "ArrowLeft" && idx % 9 !== 0) idx -= 1;
    else if (e.key === "ArrowRight" && idx % 9 !== 8) idx += 1;
    else return;
    e.preventDefault();
    if (e.shiftKey) {
      // Shift + strelica: proširi odabir dodajući ćelije usput (kao povlačenje
      // mišem - freeform, ne pravokutnik). Kurzor je uvijek zadnja dodana ćelija.
      if (state.solved) return;
      setSelection([...selectedCells(), idx], idx);
    } else {
      selectCell(idx);
    }
  }

  // --- Menu ---
  // Varijante su multi-select toggle-i; prazan skup = Classic. "active" redak =
  // varijanta je u skupu. Najviše 2 odjednom: kombinacija 3+ digne generaciju
  // (i na Normal) do neupotrebljivosti. Cap je UI - jezgra podržava bilo koliko.
  const MAX_VARIANTS = 2;
  function syncVariantButtons() {
    const full = menuVariants.length >= MAX_VARIANTS;
    document.querySelectorAll(".variant-row").forEach((b) => {
      const on = menuVariants.includes(b.dataset.variant);
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      // Kad su dvije aktivne, onemogući dodavanje treće (zatamni neaktivne retke).
      b.disabled = full && !on;
    });
    // Napomena o sporijoj Hard generaciji - relevantna tek uz aktivnu varijantu,
    // crvena kad je odabrano više od jedne (tad generacija naglo poraste).
    const hint = document.getElementById("variant-hint");
    if (hint) {
      hint.classList.toggle("hidden", menuVariants.length === 0);
      hint.classList.toggle("warn", menuVariants.length > 1);
    }
  }
  function openMenu() {
    if (state && state.variants) menuVariants = normVariants(state.variants);
    syncVariantButtons();
    menuOverlay.classList.remove("hidden");
  }
  function closeMenu() {
    menuOverlay.classList.add("hidden");
  }

  // --- Event vezivanje ---
  function bind() {
    document.getElementById("new-btn").addEventListener("click", openMenu);
    document.getElementById("menu-cancel").addEventListener("click", closeMenu);
    document.getElementById("undo-btn").addEventListener("click", undo);
    document.getElementById("erase-btn").addEventListener("click", erase);
    document.getElementById("notes-btn").addEventListener("click", toggleNotes);
    document.getElementById("color-btn").addEventListener("click", toggleColorMode);
    document.getElementById("hint-btn").addEventListener("click", hint);
    document.getElementById("hint-close").addEventListener("click", () => {
      clearHint();
      render();
    });
    document.getElementById("gen-cancel").addEventListener("click", cancelGeneration);
    document.getElementById("win-new-btn").addEventListener("click", () => {
      winOverlay.classList.add("hidden");
      openMenu();
    });
    document.querySelectorAll(".variant-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.variant;
        if (menuVariants.includes(v)) {
          menuVariants = menuVariants.filter((k) => k !== v);
        } else if (menuVariants.length < MAX_VARIANTS) {
          menuVariants = normVariants([...menuVariants, v]);
        }
        syncVariantButtons();
      });
    });
    document.querySelectorAll(".diff-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        closeMenu();
        winOverlay.classList.add("hidden");
        newGame(btn.dataset.diff, menuVariants);
      });
    });
    menuOverlay.addEventListener("click", (e) => {
      if (e.target === menuOverlay) closeMenu();
    });
    document.addEventListener("keydown", onKey);
    // Pencil brush: pointerdown na ploči, move/up globalno (drag može izaći van ćelije)
    boardEl.addEventListener("pointerdown", onBoardPointerDown);
    window.addEventListener("pointermove", onBoardPointerMove);
    window.addEventListener("pointerup", onBoardPointerUp);
    window.addEventListener("pointercancel", onBoardPointerUp);
    // Spremi kad app ode u pozadinu; sat igranog vremena staje s njim.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        clockStop();
        save();
      } else {
        clockStart();
      }
    });
  }

  // Verzija se čita iz package.json (jedini izvor istine, isti koji enforcea
  // version guard) - prikaz nikad ne odluta od stvarne verzije.
  function showVersion() {
    const el = document.getElementById("app-version");
    if (!el) return;
    fetch("./package.json")
      .then((r) => r.json())
      .then((p) => {
        if (p && p.version) el.textContent = "v" + p.version;
      })
      .catch(() => {});
  }

  // --- Start ---
  function init() {
    buildBoard();
    buildNumpad();
    buildPalette();
    bind();
    showVersion();
    // app_opened je jedini event koji hvata povratnika: tko nastavi spremljenu
    // partiju ne generira novu ploču, pa bez ovoga ne proizvede baš nikakav trag.
    if (load() && !allSolved()) {
      render();
      clockStart();
      track("app_opened", { resumed: true, ...gameFacts(), solved: !!state.solved });
      if (state.solved) {
        winStats.textContent = winStatsText();
        winOverlay.classList.remove("hidden");
      }
    } else {
      track("app_opened", { resumed: false });
      newGame("normal");
    }
  }

  function allSolved() {
    return false;
  }

  init();
})();
