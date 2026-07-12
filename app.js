/* Sudoku UI kontroler. */
(() => {
  "use strict";

  const STORAGE_KEY = "sudoku-game-v2";
  const DIFF_LABELS = { normal: "Normal", hard: "Hard" };
  // Regijske varijante mogu se kombinirati. Aktivni skup = polje id-eva (prazno =
  // classic). Redoslijed kanonski, za stabilne labele i usporedbe.
  const REGION_VARIANTS = ["x", "hyper"];
  const VARIANT_LABELS = { x: "Diagonal", hyper: "Hyper" };
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

  // --- Nova igra ---
  function newGame(difficulty, variants) {
    variants = normVariants(variants);
    loadingOverlay.classList.remove("hidden");
    // Odgoda da se spinner stigne iscrtati prije sinkronog generiranja.
    setTimeout(() => {
      const { puzzle, solution, techniques } = Sudoku.generate(difficulty, variants);
      state = {
        puzzle,
        solution,
        values: puzzle.slice(),
        notes: Array.from({ length: 81 }, () => []),
        colors: Array.from({ length: 81 }, () => []),
        difficulty,
        variants,
        techniques: techniques || [],
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
    }, 30);
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
      state.colors = normalizeColors(state.colors);
      if (state.colorMode === undefined) state.colorMode = false;
      // Migracija: stare spremljene igre imaju string `variant`, nove `variants`.
      state.variants = normVariants(state.variants !== undefined ? state.variants : state.variant);
      delete state.variant;
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
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    const targets = new Set();
    for (let i = 0; i < 9; i++) {
      targets.add(row * 9 + i);
      targets.add(i * 9 + col);
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

    const res = Solver.explainNext(state.values, state.notes, state.solution, state.variants);
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
    save();
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

    const sel = state.selected;
    const selList = state.multi && state.multi.length ? state.multi : sel !== null ? [sel] : [];
    const selSet = new Set(selList);
    const groupSel = selList.length > 1;
    const selVal = sel !== null ? state.values[sel] || 0 : 0;
    const selRow = sel !== null ? Math.floor(sel / 9) : -1;
    const selCol = sel !== null ? sel % 9 : -1;
    const selBox = sel !== null ? Math.floor(selRow / 3) * 3 + Math.floor(selCol / 3) : -1;

    for (let i = 0; i < 81; i++) {
      const cell = cells[i];
      const v = state.values[i];
      const isGiven = state.puzzle[i] !== 0;
      cell.className = "cell";
      const col = i % 9;
      const row = Math.floor(i / 9);
      if (col % 3 === 2 && col !== 8) cell.classList.add("br");
      if (row % 3 === 2 && row !== 8) cell.classList.add("bb");
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

      // Highlight odabranih ćelija (grupa ili sidro)
      if (selSet.has(i)) cell.classList.add("selected");
      // Peer/isti-broj samo kod jednostrukog odabira (kod grupe bi bilo prešaroliko)
      if (sel !== null && !groupSel) {
        const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
        let isPeer = row === selRow || col === selCol || box === selBox;
        if (xMode) {
          if (onMainDiag(sel) && onMainDiag(i)) isPeer = true;
          if (onAntiDiag(sel) && onAntiDiag(i)) isPeer = true;
        }
        if (hyperMode) {
          const sw = hyperWindowOf(sel);
          if (sw !== -1 && sw === hyperWindowOf(i)) isPeer = true;
        }
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
  // Varijante su multi-select: Diagonal i Hyper su nezavisni toggle-i, Classic
  // znači "nijedna" (prazan skup). "active" gumb = varijanta je u skupu.
  function syncVariantButtons() {
    document.querySelectorAll(".variant-btn").forEach((b) => {
      const v = b.dataset.variant;
      const on = v === "classic" ? menuVariants.length === 0 : menuVariants.includes(v);
      b.classList.toggle("active", on);
    });
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
    document.getElementById("win-new-btn").addEventListener("click", () => {
      winOverlay.classList.add("hidden");
      openMenu();
    });
    document.querySelectorAll(".variant-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.variant;
        if (v === "classic") {
          menuVariants = [];
        } else if (menuVariants.includes(v)) {
          menuVariants = menuVariants.filter((k) => k !== v);
        } else {
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
    // Spremi kad app ode u pozadinu
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) save();
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
    if (load() && !allSolved()) {
      render();
      if (state.solved) {
        winStats.textContent = winStatsText();
        winOverlay.classList.remove("hidden");
      }
    } else {
      newGame("normal");
    }
  }

  function allSolved() {
    return false;
  }

  init();
})();
