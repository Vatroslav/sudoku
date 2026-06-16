/* Sudoku UI kontroler. */
(() => {
  "use strict";

  const STORAGE_KEY = "sudoku-game-v1";
  const DIFF_LABELS = { easy: "Lako", medium: "Srednje", hard: "Teško", expert: "Ekspert" };

  // --- Stanje ---
  let state = null;
  // state = {
  //   puzzle: [81] (givens, 0 prazno),
  //   solution: [81],
  //   values: [81] (trenutni unosi igrača, 0 prazno),
  //   notes: [81] od Set-ova (kao polje brojeva u JSON-u),
  //   difficulty, mistakes, selected (idx|null),
  //   notesMode (bool), solved (bool)
  // }

  let history = []; // za undo

  // --- DOM ---
  const boardEl = document.getElementById("board");
  const numpadEl = document.getElementById("numpad");
  const mistakesEl = document.getElementById("mistakes");
  const diffLabelEl = document.getElementById("difficulty-label");
  const notesStateEl = document.getElementById("notes-state");
  const winOverlay = document.getElementById("win-overlay");
  const winStats = document.getElementById("win-stats");
  const menuOverlay = document.getElementById("menu-overlay");

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
      cell.addEventListener("click", () => selectCell(i));
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
      btn.addEventListener("click", () => inputNumber(n));
      numpadEl.appendChild(btn);
    }
  }

  // --- Nova igra ---
  function newGame(difficulty) {
    const { puzzle, solution } = Sudoku.generate(difficulty);
    state = {
      puzzle,
      solution,
      values: puzzle.slice(),
      notes: Array.from({ length: 81 }, () => []),
      difficulty,
      mistakes: 0,
      selected: null,
      notesMode: false,
      solved: false,
    };
    history = [];
    save();
    render();
  }

  // --- Spremanje / učitavanje ---
  function save() {
    if (!state) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignoriraj */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s.puzzle || !s.solution || !s.values) return false;
      state = s;
      if (!state.notes) state.notes = Array.from({ length: 81 }, () => []);
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- Odabir ćelije ---
  function selectCell(idx) {
    if (!state || state.solved) return;
    state.selected = idx;
    render();
  }

  // --- Unos broja ---
  function inputNumber(n) {
    if (!state || state.solved || state.selected === null) return;
    const idx = state.selected;
    if (state.puzzle[idx] !== 0) return; // given, ne dira se

    pushHistory();

    if (state.notesMode) {
      // toggle bilješke
      const notes = state.notes[idx];
      const pos = notes.indexOf(n);
      if (pos === -1) notes.push(n);
      else notes.splice(pos, 1);
      state.values[idx] = 0;
    } else {
      if (state.values[idx] === n) {
        // ponovni klik istog broja briše
        state.values[idx] = 0;
      } else {
        state.values[idx] = n;
        state.notes[idx] = [];
        if (n !== state.solution[idx]) {
          state.mistakes++;
        } else {
          // ukloni ovaj broj iz bilješki u istom redu/stupcu/kvadratu
          clearNotesAround(idx, n);
        }
      }
    }

    save();
    render();
    checkWin();
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
    for (const t of targets) {
      const p = state.notes[t].indexOf(n);
      if (p !== -1) state.notes[t].splice(p, 1);
    }
  }

  function erase() {
    if (!state || state.solved || state.selected === null) return;
    const idx = state.selected;
    if (state.puzzle[idx] !== 0) return;
    if (state.values[idx] === 0 && state.notes[idx].length === 0) return;
    pushHistory();
    state.values[idx] = 0;
    state.notes[idx] = [];
    save();
    render();
  }

  function hint() {
    if (!state || state.solved || state.selected === null) return;
    const idx = state.selected;
    if (state.puzzle[idx] !== 0 || state.values[idx] === state.solution[idx]) return;
    pushHistory();
    state.values[idx] = state.solution[idx];
    state.notes[idx] = [];
    clearNotesAround(idx, state.solution[idx]);
    save();
    render();
    checkWin();
  }

  function toggleNotes() {
    if (!state) return;
    state.notesMode = !state.notesMode;
    render();
  }

  // --- Undo ---
  function pushHistory() {
    history.push({
      values: state.values.slice(),
      notes: state.notes.map((a) => a.slice()),
      mistakes: state.mistakes,
    });
    if (history.length > 100) history.shift();
  }

  function undo() {
    if (!state || history.length === 0) return;
    const prev = history.pop();
    state.values = prev.values;
    state.notes = prev.notes;
    state.mistakes = prev.mistakes;
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
    winStats.textContent = `${DIFF_LABELS[state.difficulty]} · greške: ${state.mistakes}`;
    winOverlay.classList.remove("hidden");
  }

  // --- Render ---
  function render() {
    if (!state) return;
    diffLabelEl.textContent = DIFF_LABELS[state.difficulty] || "";
    mistakesEl.textContent = state.mistakes;
    notesStateEl.textContent = state.notesMode ? "On" : "Off";
    document.getElementById("notes-btn").classList.toggle("active", state.notesMode);

    const sel = state.selected;
    const selVal = sel !== null ? (state.values[sel] || 0) : 0;
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

      // Highlight: red/stupac/kvadrat odabrane
      if (sel !== null) {
        const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
        if (row === selRow || col === selCol || box === selBox) {
          cell.classList.add("peer");
        }
        if (i === sel) cell.classList.add("selected");
        // isti broj
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
          span.textContent = state.notes[i].includes(n) ? n : "";
          grid.appendChild(span);
        }
        cell.appendChild(grid);
      } else {
        cell.textContent = "";
      }
    }

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
      }
    }
  }

  // --- Tipkovnica (desktop test) ---
  function onKey(e) {
    if (!state) return;
    if (e.key >= "1" && e.key <= "9") { inputNumber(parseInt(e.key, 10)); return; }
    if (e.key === "Backspace" || e.key === "Delete") { erase(); return; }
    if (e.key === "n" || e.key === "N") { toggleNotes(); return; }
    if (e.key === "z" && (e.ctrlKey || e.metaKey)) { undo(); return; }
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
  function openMenu() { menuOverlay.classList.remove("hidden"); }
  function closeMenu() { menuOverlay.classList.add("hidden"); }

  // --- Event vezivanje ---
  function bind() {
    document.getElementById("new-btn").addEventListener("click", openMenu);
    document.getElementById("menu-cancel").addEventListener("click", closeMenu);
    document.getElementById("undo-btn").addEventListener("click", undo);
    document.getElementById("erase-btn").addEventListener("click", erase);
    document.getElementById("notes-btn").addEventListener("click", toggleNotes);
    document.getElementById("hint-btn").addEventListener("click", hint);
    document.getElementById("win-new-btn").addEventListener("click", () => {
      winOverlay.classList.add("hidden");
      openMenu();
    });
    document.querySelectorAll(".diff-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        closeMenu();
        winOverlay.classList.add("hidden");
        newGame(btn.dataset.diff);
      });
    });
    menuOverlay.addEventListener("click", (e) => {
      if (e.target === menuOverlay) closeMenu();
    });
    document.addEventListener("keydown", onKey);
    // Spremi kad app ode u pozadinu
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) save();
    });
  }

  // --- Start ---
  function init() {
    buildBoard();
    buildNumpad();
    bind();
    if (load() && !allSolved()) {
      render();
      if (state.solved) {
        winStats.textContent = `${DIFF_LABELS[state.difficulty]} · greške: ${state.mistakes}`;
        winOverlay.classList.remove("hidden");
      }
    } else {
      newGame("medium");
    }
  }

  function allSolved() { return false; }

  init();
})();
