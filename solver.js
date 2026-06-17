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

  // ===== Hint: objašnjenje sljedećeg poteza =====
  // Zasebne "find" funkcije koje vraćaju opis poteza (ne mutiraju ulaz).
  // Namjerno odvojene od gornjih bool-tehnika da grading ostane netaknut.

  const BOX_NAMES = [
    "gore lijevo", "gore u sredini", "gore desno",
    "u sredini lijevo", "u sredini", "u sredini desno",
    "dolje lijevo", "dolje u sredini", "dolje desno",
  ];
  const namedUnits = [];
  for (let r = 0; r < 9; r++) namedUnits.push({ cells: rows[r], name: `retku ${r + 1}` });
  for (let c = 0; c < 9; c++) namedUnits.push({ cells: cols[c], name: `stupcu ${c + 1}` });
  for (let b = 0; b < 9; b++) namedUnits.push({ cells: boxes[b], name: `kvadratu ${BOX_NAMES[b]}` });
  const cellName = (idx) => `retku ${Math.floor(idx / 9) + 1}, stupcu ${(idx % 9) + 1}`;

  function hNakedSingle(cand) {
    for (let idx = 0; idx < 81; idx++) {
      if (cand[idx] && cand[idx].size === 1) {
        return {
          technique: "Goli jedinac", tier: T_SINGLE, type: "placement",
          value: [...cand[idx]][0], target: idx, focus: [idx],
          note: "to polje ima samo jedan mogući broj",
        };
      }
    }
    return null;
  }

  function hHiddenSingle(cand) {
    for (const u of namedUnits) {
      for (let v = 1; v <= 9; v++) {
        let spot = -1, count = 0;
        for (const idx of u.cells) {
          if (cand[idx] && cand[idx].has(v)) { count++; spot = idx; if (count > 1) break; }
        }
        if (count === 1) {
          return {
            technique: "Skriveni jedinac", tier: T_SINGLE, type: "placement",
            value: v, target: spot, focus: u.cells.slice(),
            note: `u ${u.name} broj ${v} stane samo u jedno polje`,
          };
        }
      }
    }
    return null;
  }

  function hLocked(cand) {
    for (let b = 0; b < 9; b++) {
      const box = boxes[b];
      for (let v = 1; v <= 9; v++) {
        const cs = box.filter((i) => cand[i] && cand[i].has(v));
        if (cs.length < 2) continue;
        const r0 = Math.floor(cs[0] / 9), c0 = cs[0] % 9;
        if (cs.every((i) => Math.floor(i / 9) === r0)) {
          const elim = rows[r0].filter((i) => !box.includes(i) && cand[i] && cand[i].has(v));
          if (elim.length) return {
            technique: "Zaključani kandidati", tier: T_INTER, type: "elimination",
            removeVals: [v], targets: elim, base: cs, focus: cs.concat(elim),
            note: `u kvadratu ${BOX_NAMES[b]} broj ${v} može stajati samo u retku ${r0 + 1}, pa se briše iz ostatka tog retka`,
          };
        }
        if (cs.every((i) => i % 9 === c0)) {
          const elim = cols[c0].filter((i) => !box.includes(i) && cand[i] && cand[i].has(v));
          if (elim.length) return {
            technique: "Zaključani kandidati", tier: T_INTER, type: "elimination",
            removeVals: [v], targets: elim, base: cs, focus: cs.concat(elim),
            note: `u kvadratu ${BOX_NAMES[b]} broj ${v} može stajati samo u stupcu ${c0 + 1}, pa se briše iz ostatka tog stupca`,
          };
        }
      }
    }
    for (const line of [...rows, ...cols]) {
      for (let v = 1; v <= 9; v++) {
        const cs = line.filter((i) => cand[i] && cand[i].has(v));
        if (cs.length < 2) continue;
        const b0 = boxOf(cs[0]);
        if (cs.every((i) => boxOf(i) === b0)) {
          const elim = boxes[b0].filter((i) => !line.includes(i) && cand[i] && cand[i].has(v));
          if (elim.length) return {
            technique: "Zaključani kandidati", tier: T_INTER, type: "elimination",
            removeVals: [v], targets: elim, base: cs, focus: cs.concat(elim),
            note: `broj ${v} u toj liniji leži samo unutar kvadrata ${BOX_NAMES[b0]}, pa se briše iz ostatka tog kvadrata`,
          };
        }
      }
    }
    return null;
  }

  function hNakedPair(cand) {
    for (const u of namedUnits) {
      const twos = u.cells.filter((i) => cand[i] && cand[i].size === 2);
      for (let i = 0; i < twos.length; i++) for (let j = i + 1; j < twos.length; j++) {
        const a = cand[twos[i]], b = cand[twos[j]];
        if ([...a].every((x) => b.has(x))) {
          const vals = [...a];
          const elim = u.cells.filter((idx) =>
            idx !== twos[i] && idx !== twos[j] && cand[idx] && vals.some((v) => cand[idx].has(v)));
          if (elim.length) return {
            technique: "Goli par", tier: T_INTER, type: "elimination",
            removeVals: vals, targets: elim, base: [twos[i], twos[j]], focus: [twos[i], twos[j]].concat(elim),
            note: `dva polja u ${u.name} dijele samo brojeve ${vals[0]} i ${vals[1]}, pa ti brojevi ispadaju iz ostalih polja te jedinice`,
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
              for (const idx of elim) for (const v of cand[idx]) {
                if (v !== v1 && v !== v2 && !removeVals.includes(v)) removeVals.push(v);
              }
              return {
                technique: "Skriveni par", tier: T_INTER, type: "elimination",
                removeVals, targets: elim, base: pair, focus: pair.slice(),
                note: `brojevi ${v1} i ${v2} u ${u.name} stanu samo u ta dva polja, pa iz njih ispadaju svi ostali brojevi`,
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
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
        const union = new Set([...cand[cells[i]], ...cand[cells[j]], ...cand[cells[k]]]);
        if (union.size === 3) {
          const trip = [cells[i], cells[j], cells[k]];
          const vals = [...union];
          const elim = u.cells.filter((idx) => !trip.includes(idx) && cand[idx] && vals.some((v) => cand[idx].has(v)));
          if (elim.length) return {
            technique: "Gola trojka", tier: T_INTER, type: "elimination",
            removeVals: vals, targets: elim, base: trip, focus: trip.concat(elim),
            note: `tri polja u ${u.name} zajedno koriste samo brojeve ${vals.join(", ")}, pa ti brojevi ispadaju iz ostalih polja te jedinice`,
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
        for (let c = 0; c < 9; c++) { const idx = r * 9 + c; if (cand[idx] && cand[idx].has(v)) cs.push(c); }
        if (cs.length === 2) rowPos.push({ r, cs });
      }
      for (let i = 0; i < rowPos.length; i++) for (let j = i + 1; j < rowPos.length; j++) {
        if (rowPos[i].cs[0] === rowPos[j].cs[0] && rowPos[i].cs[1] === rowPos[j].cs[1]) {
          const [c1, c2] = rowPos[i].cs, r1 = rowPos[i].r, r2 = rowPos[j].r;
          const base = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
          const elim = [];
          for (let r = 0; r < 9; r++) { if (r === r1 || r === r2) continue; for (const c of [c1, c2]) { const idx = r * 9 + c; if (cand[idx] && cand[idx].has(v)) elim.push(idx); } }
          if (elim.length) return {
            technique: "X-Wing", tier: T_ADVANCED, type: "elimination",
            removeVals: [v], targets: elim, base, focus: base.concat(elim),
            note: `broj ${v} tvori X-Wing u stupcima ${c1 + 1} i ${c2 + 1} (retci ${r1 + 1} i ${r2 + 1}), pa ispada iz tih stupaca igdje drugdje`,
          };
        }
      }
      const colP = [];
      for (let c = 0; c < 9; c++) {
        const rs = [];
        for (let r = 0; r < 9; r++) { const idx = r * 9 + c; if (cand[idx] && cand[idx].has(v)) rs.push(r); }
        if (rs.length === 2) colP.push({ c, rs });
      }
      for (let i = 0; i < colP.length; i++) for (let j = i + 1; j < colP.length; j++) {
        if (colP[i].rs[0] === colP[j].rs[0] && colP[i].rs[1] === colP[j].rs[1]) {
          const [r1, r2] = colP[i].rs, c1 = colP[i].c, c2 = colP[j].c;
          const base = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
          const elim = [];
          for (let c = 0; c < 9; c++) { if (c === c1 || c === c2) continue; for (const r of [r1, r2]) { const idx = r * 9 + c; if (cand[idx] && cand[idx].has(v)) elim.push(idx); } }
          if (elim.length) return {
            technique: "X-Wing", tier: T_ADVANCED, type: "elimination",
            removeVals: [v], targets: elim, base, focus: base.concat(elim),
            note: `broj ${v} tvori X-Wing u retcima ${r1 + 1} i ${r2 + 1} (stupci ${c1 + 1} i ${c2 + 1}), pa ispada iz tih redaka igdje drugdje`,
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
              if (cand[idx] && cand[idx].has(z) && peers[a].has(idx) && peers[b].has(idx)) elim.push(idx);
            }
            if (elim.length) return {
              technique: "XY-Wing", tier: T_ADVANCED, type: "elimination",
              removeVals: [z], targets: elim, base: [p, a, b], focus: [p, a, b].concat(elim),
              pivot: p, pincers: [a, b], shared: z,
              note: `zglob u ${cellName(p)} je ${x} ili ${y}, a kraci u ${cellName(a)} i u ${cellName(b)} oba sadrže ${z}; jedan od krakova je sigurno ${z}, pa ${z} ispada iz svakog polja koje vidi oba kraka`,
            };
          }
        }
      }
    }
    return null;
  }

  const H_FINDERS = [hNakedSingle, hHiddenSingle, hLocked, hNakedPair, hHiddenPair, hNakedTriple, hXWing, hXYWing];

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
      if (cand[i] && cand[i].size === 1) return { target: i, value: [...cand[i]][0], unitName: null };
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
        return { reason: r, action: { kind: "eliminate-then-place", targets, removeVals: r.removeVals, place: single } };
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
  function explainNext(values, notes, solution) {
    const raw = computeCandidates(values);
    for (let i = 0; i < 81; i++) if (values[i] === 0 && raw[i].size === 0) return { contradiction: true };
    if (!values.includes(0)) return { done: true };
    // Prvo na stanju svjesnom bilješki (preskoči već odrađeno); ako bilješke
    // ništa ne daju (krive/nepotpune), padni na čisto računate kandidate.
    return findStep(candidatesFor(values, notes), solution) || findStep(raw, solution) || { reason: null };
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

  return { solveAndGrade, explainNext, T_SINGLE, T_INTER, T_ADVANCED };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Solver;
