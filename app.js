/* Sudoku UI kontroler. */
(() => {
  "use strict";

  const STORAGE_KEY = "sudoku-game-v2";
  const DIFF_LABELS = { normal: "Normal", hard: "Hard" };
  const VARIANT_LABELS = { classic: "", x: "Diagonal" };

  // Dijagonale za X-Sudoku (glavna r===c, sporedna r+c===8).
  const onMainDiag = (i) => Math.floor(i / 9) === i % 9;
  const onAntiDiag = (i) => Math.floor(i / 9) + (i % 9) === 8;

  // Varijanta trenutno odabrana u meniju (dok se ne pokrene nova igra).
  let menuVariant = "classic";

  // --- Stanje ---
  let state = null;
  // state = {
  //   puzzle: [81] (givens, 0 prazno),
  //   solution: [81],
  //   values: [81] (trenutni unosi igrača, 0 prazno),
  //   notes: [81] od Set-ova (kao polje brojeva u JSON-u),
  //   difficulty, variant ("classic"|"x"), selected (idx|null),
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

  // Paleta boja za color mode: 6 boja + brisač (0).
  function buildPalette() {
    paletteEl.innerHTML = "";
    for (const c of [1, 2, 3, 4, 5, 6, 0]) {
      const btn = document.createElement("button");
      btn.className = "swatch";
      btn.dataset.color = c;
      btn.setAttribute("aria-label", c === 0 ? "Clear color" : "Color " + c);
      if (c === 0) btn.textContent = "⌫";
      btn.addEventListener("click", () => setActiveColor(c));
      paletteEl.appendChild(btn);
    }
  }

  // --- Nova igra ---
  function newGame(difficulty, variant) {
    variant = variant === "x" ? "x" : "classic";
    loadingOverlay.classList.remove("hidden");
    // Odgoda da se spinner stigne iscrtati prije sinkronog generiranja.
    setTimeout(() => {
      const { puzzle, solution, techniques } = Sudoku.generate(difficulty, variant);
      state = {
        puzzle,
        solution,
        values: puzzle.slice(),
        notes: Array.from({ length: 81 }, () => []),
        colors: new Array(81).fill(0),
        difficulty,
        variant,
        techniques: techniques || [],
        selected: null,
        multi: [],
        notesMode: false,
        activeNote: null,
        colorMode: false,
        activeColor: 1,
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
      if (!state.colors || state.colors.length !== 81) state.colors = new Array(81).fill(0);
      if (state.colorMode === undefined) state.colorMode = false;
      if (state.activeColor === undefined) state.activeColor = 1;
      if (state.variant !== "x") state.variant = "classic";
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
    if (state.variant === "x") {
      if (onMainDiag(idx)) for (let i = 0; i < 9; i++) targets.add(i * 9 + i);
      if (onAntiDiag(idx)) for (let i = 0; i < 9; i++) targets.add(i * 9 + (8 - i));
    }
    for (const t of targets) {
      const p = state.notes[t].indexOf(n);
      if (p !== -1) state.notes[t].splice(p, 1);
    }
  }

  function erase() {
    if (!state || state.solved) return;
    const toClear = selectedCells().filter(
      (i) => state.puzzle[i] === 0 && (state.values[i] !== 0 || state.notes[i].length > 0)
    );
    if (!toClear.length) return;
    clearHint();
    pushHistory();
    for (const idx of toClear) {
      state.values[idx] = 0;
      state.notes[idx] = [];
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

  function setActiveColor(c) {
    if (!state) return;
    state.activeColor = c;
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

    // Color mod: povlačenje boji ćelije (i givens i prazne). Smjer poteza određuje
    // sidro: ako sidro već ima aktivnu boju -> potez briše, inače maže. Brisač
    // (activeColor 0) uvijek briše.
    if (state.colorMode) {
      e.preventDefault();
      clearHint();
      pushHistory();
      drag.active = true;
      drag.mode =
        state.activeColor === 0 || state.colors[idx] === state.activeColor
          ? "color-remove"
          : "color-add";
      drag.painted = new Set();
      applyColorBrush(idx);
      return;
    }

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
    } else if (drag.mode === "color-add" || drag.mode === "color-remove") {
      applyColorBrush(idx);
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

  // Bojanje ćelije tijekom povlačenja (svaka ćelija jednom po potezu).
  function applyColorBrush(idx) {
    if (!drag.active || drag.painted.has(idx)) return;
    drag.painted.add(idx);
    const target = drag.mode === "color-remove" ? 0 : state.activeColor;
    if (state.colors[idx] !== target) {
      state.colors[idx] = target;
      render();
    }
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

    const res = Solver.explainNext(state.values, state.notes, state.solution, state.variant);
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
      colors: state.colors.slice(),
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
    const vl = VARIANT_LABELS[state.variant] || "";
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
    const xMode = state.variant === "x";
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
    paletteEl.querySelectorAll(".swatch").forEach((s) => {
      s.classList.toggle("active", Number(s.dataset.color) === state.activeColor);
    });

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
      // Ručno obojana ćelija (zaseban ::after sloj, ne dira highlight)
      if (state.colors[i]) cell.classList.add("color-" + state.colors[i]);

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
    selectCell(idx);
  }

  // --- Menu ---
  function syncVariantButtons() {
    document.querySelectorAll(".variant-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.variant === menuVariant);
    });
  }
  function openMenu() {
    if (state && state.variant) menuVariant = state.variant;
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
        menuVariant = btn.dataset.variant === "x" ? "x" : "classic";
        syncVariantButtons();
      });
    });
    document.querySelectorAll(".diff-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        closeMenu();
        winOverlay.classList.add("hidden");
        newGame(btn.dataset.diff, menuVariant);
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
