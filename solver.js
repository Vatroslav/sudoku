/* Logički solver koji oponaša ljudsko rješavanje.
   Primjenjuje tehnike od najlakše prema najtežoj i ocjenjuje slagalicu
   po NAJTEŽOJ tehnici koju je morao upotrijebiti.

   Tier 1 = singles (skeniranje)        -> Normalno
   Tier 2 = locked candidates, parovi/trojke -> Teško
   Tier 3 = X-Wing, XY-Wing (napredno)  -> Ekspert  */

const Solver = (() => {
  "use strict";

  // --- Pretkomputirane jedinice (9 redova, 9 stupaca, 9 kvadrata) ---
  const rows = [], cols = [], boxes = [];
  for (let i = 0; i < 9; i++) { rows.push([]); cols.push([]); boxes.push([]); }
  for (let idx = 0; idx < 81; idx++) {
    const r = Math.floor(idx / 9), c = idx % 9;
    const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    rows[r].push(idx); cols[c].push(idx); boxes[b].push(idx);
  }
  const allUnits = [...rows, ...cols, ...boxes];
  const peers = [];
  for (let idx = 0; idx < 81; idx++) {
    const r = Math.floor(idx / 9), c = idx % 9;
    const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    const p = new Set();
    for (const u of [rows[r], cols[c], boxes[b]]) for (const x of u) if (x !== idx) p.add(x);
    peers.push(p);
  }
  const boxOf = (idx) => Math.floor(Math.floor(idx / 9) / 3) * 3 + Math.floor((idx % 9) / 3);

  const T_SINGLE = 1, T_INTER = 2, T_ADVANCED = 3;

  function computeCandidates(grid) {
    const cand = new Array(81).fill(null);
    for (let idx = 0; idx < 81; idx++) {
      if (grid[idx] !== 0) continue;
      const s = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      for (const p of peers[idx]) s.delete(grid[p]);
      cand[idx] = s;
    }
    return cand;
  }

  function place(grid, cand, idx, val) {
    grid[idx] = val;
    cand[idx] = null;
    for (const p of peers[idx]) if (cand[p]) cand[p].delete(val);
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
        let spot = -1, count = 0;
        for (const idx of unit) {
          if (cand[idx] && cand[idx].has(v)) { count++; spot = idx; if (count > 1) break; }
        }
        if (count === 1) { place(grid, cand, spot, v); return true; }
      }
    }
    return false;
  }

  function lockedCandidates(grid, cand) {
    // Pointing: kandidat u kvadratu zaključan na jedan red/stupac
    for (const box of boxes) {
      for (let v = 1; v <= 9; v++) {
        const cells = box.filter((idx) => cand[idx] && cand[idx].has(v));
        if (cells.length < 2) continue;
        const r0 = Math.floor(cells[0] / 9), c0 = cells[0] % 9;
        if (cells.every((idx) => Math.floor(idx / 9) === r0)) {
          for (const idx of rows[r0]) {
            if (!box.includes(idx) && cand[idx] && cand[idx].has(v)) { cand[idx].delete(v); return true; }
          }
        }
        if (cells.every((idx) => idx % 9 === c0)) {
          for (const idx of cols[c0]) {
            if (!box.includes(idx) && cand[idx] && cand[idx].has(v)) { cand[idx].delete(v); return true; }
          }
        }
      }
    }
    // Claiming: kandidat u redu/stupcu zaključan na jedan kvadrat
    for (const line of [...rows, ...cols]) {
      for (let v = 1; v <= 9; v++) {
        const cells = line.filter((idx) => cand[idx] && cand[idx].has(v));
        if (cells.length < 2) continue;
        const b0 = boxOf(cells[0]);
        if (cells.every((idx) => boxOf(idx) === b0)) {
          for (const idx of boxes[b0]) {
            if (!line.includes(idx) && cand[idx] && cand[idx].has(v)) { cand[idx].delete(v); return true; }
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
          const a = cand[twos[i]], b = cand[twos[j]];
          if ([...a].every((x) => b.has(x))) {
            const vals = [...a];
            for (const idx of unit) {
              if (idx !== twos[i] && idx !== twos[j] && cand[idx]) {
                for (const v of vals) if (cand[idx].has(v)) { cand[idx].delete(v); return true; }
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
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
        const union = new Set([...cand[cells[i]], ...cand[cells[j]], ...cand[cells[k]]]);
        if (union.size === 3) {
          const trip = [cells[i], cells[j], cells[k]];
          for (const idx of unit) {
            if (!trip.includes(idx) && cand[idx]) {
              for (const v of union) if (cand[idx].has(v)) { cand[idx].delete(v); return true; }
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
                if (v !== v1 && v !== v2) { cand[idx].delete(v); return true; }
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
        for (let c = 0; c < 9; c++) { const idx = r * 9 + c; if (cand[idx] && cand[idx].has(v)) cs.push(c); }
        if (cs.length === 2) rowPos.push({ r, cs });
      }
      for (let i = 0; i < rowPos.length; i++) for (let j = i + 1; j < rowPos.length; j++) {
        if (rowPos[i].cs[0] === rowPos[j].cs[0] && rowPos[i].cs[1] === rowPos[j].cs[1]) {
          const [c1, c2] = rowPos[i].cs, r1 = rowPos[i].r, r2 = rowPos[j].r;
          for (let r = 0; r < 9; r++) {
            if (r === r1 || r === r2) continue;
            for (const c of [c1, c2]) {
              const idx = r * 9 + c;
              if (cand[idx] && cand[idx].has(v)) { cand[idx].delete(v); return true; }
            }
          }
        }
      }
      // Bazirano na stupcima
      const colPos = [];
      for (let c = 0; c < 9; c++) {
        const rs = [];
        for (let r = 0; r < 9; r++) { const idx = r * 9 + c; if (cand[idx] && cand[idx].has(v)) rs.push(r); }
        if (rs.length === 2) colPos.push({ c, rs });
      }
      for (let i = 0; i < colPos.length; i++) for (let j = i + 1; j < colPos.length; j++) {
        if (colPos[i].rs[0] === colPos[j].rs[0] && colPos[i].rs[1] === colPos[j].rs[1]) {
          const [r1, r2] = colPos[i].rs, c1 = colPos[i].c, c2 = colPos[j].c;
          for (let c = 0; c < 9; c++) {
            if (c === c1 || c === c2) continue;
            for (const r of [r1, r2]) {
              const idx = r * 9 + c;
              if (cand[idx] && cand[idx].has(v)) { cand[idx].delete(v); return true; }
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
        if (!cand[a].has(x)) continue;            // pincer A = {x, z}
        const z = [...cand[a]].find((v) => v !== x);
        if (z === undefined || z === y) continue;  // z mora biti različit od x i y
        for (const b of pincers) {
          if (b === a) continue;
          if (cand[b].size === 2 && cand[b].has(y) && cand[b].has(z) && !cand[b].has(x)) {
            for (let idx = 0; idx < 81; idx++) {
              if (idx === a || idx === b || idx === p) continue;
              if (cand[idx] && cand[idx].has(z) && peers[a].has(idx) && peers[b].has(idx)) {
                cand[idx].delete(z); return true;
              }
            }
          }
        }
      }
    }
    return false;
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
  function solveAndGrade(puzzle) {
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

  return { solveAndGrade, T_SINGLE, T_INTER, T_ADVANCED };
})();
