/* Sudoku logika: generiranje, rješavanje, provjera jedinstvenosti.
   Ploča je polje od 81 broja (0 = prazno), indeks = red * 9 + stupac. */

const Sudoku = (() => {
  "use strict";

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Smije li se 'val' staviti na poziciju idx u zadanoj ploči?
  function isValid(board, idx, val) {
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let i = 0; i < 9; i++) {
      if (board[row * 9 + i] === val) return false;
      if (board[i * 9 + col] === val) return false;
      const r = boxRow + Math.floor(i / 3);
      const c = boxCol + (i % 3);
      if (board[r * 9 + c] === val) return false;
    }
    return true;
  }

  // Popuni praznu ploču validnim potpunim rješenjem (backtracking, randomiziran).
  function fillBoard(board) {
    const idx = board.indexOf(0);
    if (idx === -1) return true;
    const candidates = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const val of candidates) {
      if (isValid(board, idx, val)) {
        board[idx] = val;
        if (fillBoard(board)) return true;
        board[idx] = 0;
      }
    }
    return false;
  }

  function generateSolution() {
    const board = new Array(81).fill(0);
    fillBoard(board);
    return board;
  }

  // Broji rješenja ali staje čim ih nađe više od 'limit' (za provjeru jedinstvenosti).
  function countSolutions(board, limit) {
    const idx = board.indexOf(0);
    if (idx === -1) return 1;
    let count = 0;
    for (let val = 1; val <= 9; val++) {
      if (isValid(board, idx, val)) {
        board[idx] = val;
        count += countSolutions(board, limit);
        board[idx] = 0;
        if (count >= limit) return count;
      }
    }
    return count;
  }

  // Koliko ćelija ostaje popunjeno (givens) po težini.
  const GIVENS = { easy: 44, medium: 36, hard: 30, expert: 25 };

  // Generira slagalicu: vraća { puzzle, solution }.
  function generate(difficulty) {
    const solution = generateSolution();
    const puzzle = solution.slice();
    const target = GIVENS[difficulty] || GIVENS.medium;

    // Redoslijed brisanja - nasumičan. Simetrija (par + zrcalo) za ljepši izgled.
    const order = shuffle([...Array(81).keys()]);
    let filled = 81;

    for (const idx of order) {
      if (filled <= target) break;
      const mirror = 80 - idx;
      const backup1 = puzzle[idx];
      const backup2 = puzzle[mirror];
      if (backup1 === 0) continue;

      puzzle[idx] = 0;
      let removed = 1;
      if (mirror !== idx && puzzle[mirror] !== 0) {
        puzzle[mirror] = 0;
        removed = 2;
      }

      // Provjeri da rješenje ostaje jedinstveno.
      const copy = puzzle.slice();
      if (countSolutions(copy, 2) !== 1) {
        puzzle[idx] = backup1;
        puzzle[mirror] = backup2;
      } else {
        filled -= removed;
      }
    }

    return { puzzle, solution };
  }

  return { generate, isValid };
})();
