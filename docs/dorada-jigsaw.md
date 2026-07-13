# Dorada: Jigsaw varijanta - implementacijski spec

Spec za implementaciju. Pisan tako da se može implementirati bez dodatnog
konteksta - uz [dorada-varijante.md](dorada-varijante.md) (arhitektura varijanti)
i CLAUDE.md (verzioniranje, lint).

## Cilj

Jigsaw (nepravilni) Sudoku: devet 3×3 kvadrata zamjenjuje devet **nepravilnih,
ortogonalno povezanih regija od po 9 ćelija**. Redovi i stupci ostaju. Varijanta
ulazi u postojeći kombinabilni skup (`state.variants`), id `"jigsaw"`, i smije se
kombinirati s ostalima (cap od 2 u meniju ostaje netaknut).

## Zašto je Jigsaw drugačiji od svega dosad (pročitati prije koda)

Sve postojeće varijante su **aditivne**: klasični row/col/box uvijek postoje, a
varijanta samo dodaje units (x, hyper) ili peers (antiknight, antiking) - i ta je
geometrija **statična** (ista za svaku partiju). Jigsaw krši obje pretpostavke:

1. **Zamjenjuje boxove.** `baseUnits = [rows, cols, boxes]` više ne vrijedi -
   kad je jigsaw aktivan, box-units su regije. To dira i locked candidates
   (pointing/claiming radi nad box↔row/col presjecima) i imena jedinica u hintu.
2. **Geometrija je per-puzzle podatak.** Raspored regija se generira uz slagalicu,
   putuje kroz worker, sprema u state/localStorage i crta na ploči. Zato se
   solver-kontekst za jigsaw **ne smije cacheirati po variant-ključu** (dvije
   jigsaw partije imaju različite regije, a isti ključ).

## Podatkovni model

- `regions`: polje od 81 broja, `regions[idx] = id regije 0-8`. Jedini
  serijalizirani oblik (state, localStorage, worker poruka, solver API).
- Invarijante: svaki id ima točno 9 ćelija; svaka regija je ortogonalno povezana.
- **Kanonsko numeriranje**: nakon generiranja preimenovati id-eve po redoslijedu
  prvog pojavljivanja pri skeniranju idx 0..80 (regija ćelije 0 postaje 0, itd.).
  Time "region 1..9" u hintu ima stabilan, čitljiv redoslijed.
- Za non-jigsaw partije `state.regions = null`; stari saveovi nemaju polje -
  migracija nije potrebna (jigsaw se u starim saveovima ne može pojaviti).
- Gdje treba brzi lookup ćelija regije, iz `regions` se izvede
  `regionCells` (polje 9 polja) - lokalno, ne serijalizira se.

## 1) `sudoku.js` - generiranje regija + provođenje kroz generator

### 1a) `generateRegions()`

Perturbacija klasičnih boxova nasumičnim **transferima parova** preko granice
regija. Uvijek završi (nema backtrackinga), veličine 9 su invarijanta.

```
function generateRegions():
  regions[i] = klasični boxOf(i)                  // start: 3×3 kvadrati
  uspješnih = 0
  for (tries = 0; tries < 3000 && uspješnih < 60; tries++):
    a  = random ćelija koja ima ortogonalnog susjeda u drugoj regiji
    A  = regions[a];  B = regija tog susjeda
    regions[a] = B                                // A ima 8, B ima 10
    kandidati = ćelije regije B (bez a) koje su ortogonalno
                susjedne barem jednoj ćeliji regije A
    if kandidati prazni: revert regions[a]; continue
    b = random iz kandidata;  regions[b] = A      // veličine opet 9/9
    if connected(A) && connected(B): uspješnih++
    else: revert oba
  kanonski renumeriraj (first-occurrence scan)
  return regions
```

- `connected(id)`: BFS/DFS po ortogonalnim susjedima unutar regije od bilo koje
  njene ćelije; povezana ⇔ posjećeno 9.
- VAŽNO: transfer je **par ne nužno susjednih ćelija** (a iz A u B, pa neka b iz
  B u A). Zamjena dviju _susjednih_ ćelija ne radi - s ravne granice takva
  zamjena uvijek odsiječe ćeliju (obje bi bile odbijene) i regije se nikad ne bi
  pomakle.
- Trošak zanemariv (~60 uspješnih transfera, BFS nad 9 ćelija); zove se jednom
  po pokušaju generiranja.

### 1b) Provođenje kroz generator

- `REGION_VARIANTS`: dodati `"jigsaw"` **na početak** liste:
  `["jigsaw", "x", "hyper", "antiknight", "antiking"]`. Ista promjena u
  **sve tri** kopije liste (`sudoku.js`, `solver.js`, `app.js`) - moraju ostati
  identične (kanonski redoslijed određuje variant-ključ i labelu).
- `isValid(board, idx, val, variants, jig)` - novi zadnji parametar
  `jig = null | { map: regions, cells: regionCells }`. Kad je `jig` postavljen,
  box-dio provjere zamijeniti petljom po `jig.cells[jig.map[idx]]`; row/col dio
  ostaje. (U kombiniranoj petlji `for i < 9` box-grana se preskače uz `!jig`.)
- `fillBoard`, `generateSolution`, `countSolutions`, `dig`: provući `jig` kao
  zadnji parametar do svakog `isValid` poziva.
- **Sigurnosni budžet u `fillBoard`**: nepravilan raspored teoretski može
  natjerati backtracking na dugo vrtenje. Dodati brojač rekurzivnih poziva
  (mutable `{ n: 0 }` provučen kroz rekurziju); iznad ~300k poziva odustati
  (return false do `generateSolution`, koji tada vrati `null`). Klasik i
  postojeće varijante budžet nikad ne dosegnu, a `generate()` na `null` samo
  prelazi na sljedeći pokušaj sa **svježim regijama**.
- `generate(difficulty, variants)`:
  - Kad je jigsaw aktivan: **na svakom pokušaju** novi `regions = generateRegions()`
    i `jig` iz njega (raznolikost + bijeg iz eventualno lošeg rasporeda).
  - Grade: `Solver.solveAndGrade(puzzle, variants, regions)`.
  - Rezultat dobiva `regions` (za non-jigsaw `null`) - i to u **sva tri** povratna
    puta: točan tier, `best` fallback (spremiti `regions` u `best` objekt!) i
    krajnji fallback (koji generira novo rješenje pa mora generirati i **svoje
    nove** regije, ne reciklirati zadnje).
- Na dno datoteke dodati Node-guard (za testni harness, u browseru no-op):
  `if (typeof module !== "undefined" && module.exports) module.exports = Sudoku;`

Očekivanje za brzinu: jigsaw ne dodaje units (broj jedinica isti kao klasik), pa
Normal/Hard generacija treba biti u rangu klasika - nema potrebe za novim
napomenama u meniju povrh postojeće.

## 2) `solver.js` - regije umjesto boxova

### 2a) Kontekst jedinica

- `ctxFor(variants, regions)` - novi parametar. Kad aktivni skup sadrži
  `"jigsaw"` i `regions` je valjano 81-polje:
  - box-units = 9 regija izvedenih iz `regions` (umjesto statičnih `boxes`);
  - `units = [rows, cols, regijski boxovi, ...EXTRA_UNITS aktivnih]`,
    peers preko `buildPeers` + `EXTRA_PEERS` kao dosad;
  - **NE spremati u `unitCtx` cache** (ključ ne razlikuje rasporede regija;
    cacheiranje bi drugoj jigsaw partiji podmetnulo regije prve). Klasični/
    aditivni put ostaje cacheiran kao dosad.
  - Defenzivno: `"jigsaw"` aktivan ali `regions` nevaljan/izostao → ponašati se
    kao klasik (statični boxovi), bez rušenja.
- `EXTRA_UNITS.jigsaw = []` i `EXTRA_NAMED.jigsaw = []` (da flatMap ne pukne);
  stvarna zamjena boxova ide kroz `ctxFor`, ne kroz EXTRA mehanizam.
- `useVariant(variants, regions)`: uz `allUnits`/`peers`/`namedUnits` postaviti i
  nova modulska stanja:
  - `curBoxes` - aktivne box-jedinice (statični `boxes` ili regije),
  - `curBoxOf(idx)` - klasična formula ili `(i) => regions[i]`,
  - `curBoxLabel(b)` - `"box top-left"` (BOX_NAMES) ili `"region 3"` (b+1).
- `solveAndGrade(puzzle, variants, regions)` i
  `explainNext(values, notes, solution, variants, regions)` - novi zadnji
  parametar, samo se prosljeđuje u `useVariant`. Stari pozivi bez njega
  (spremljene klasične igre) rade nepromijenjeno.

### 2b) Mjesta koja danas hardkodiraju statične boxove (kritično!)

Ako se ovo preskoči, jigsaw grading i hint tiho računaju s fantomskim 3×3
kvadratima → **pogrešne eliminacije i pogrešni hintovi**. Zamijeniti:

- `lockedCandidates(grid, cand)` (grading): `boxes` → `curBoxes`,
  `boxOf` → `curBoxOf`. Logika pointing/claiming je i za regije ispravna
  (presjek regija↔red/stupac), samo geometrija dolazi iz `curBoxes`.
- `hLocked(cand)` (hint): isto + tekst poruka: `box ${BOX_NAMES[b]}` →
  `${curBoxLabel(b)}` (label uključuje riječ box/region).
- `namedBase` sadrži statične box-unose → restrukturirati: statično zadržati
  samo rows/cols (+ klasične box-unose za ne-jigsaw put), a `namedFor(variants,
regions)` za jigsaw gradi box-unose iz regija s imenima `region 1..9` i
  **zaobilazi `namedCtx` cache** (isti razlog kao `unitCtx`).

Sve ostale tehnike (singles, parovi/trojke, X-Wing, XY-Wing) rade preko
`allUnits`/`peers` i ne diraju se. X-Wing namjerno ostaje row/col-baziran.

Napomena o tehnici **Law of Leftovers** (jigsaw-specifična ljudska tehnika): ne
implementira se. Generator izbacuje samo slagalice rješive postojećim tehnikama,
pa nikakav gap ne nastaje - LoL bi bio eventualni budući dodatak za bogatije
hintove, ne uvjet ispravnosti.

## 3) `gen-worker.js` - bez izmjena

`postMessage(Sudoku.generate(...))` već šalje cijeli rezultat, pa `regions`
automatski proputuje. Provjeriti samo da primatelj (onmessage u `app.js`)
destrukturira i `regions`.

## 4) `app.js` - state, render, interakcije

- `REGION_VARIANTS` + `VARIANT_LABELS`: dodati `jigsaw: "Jigsaw"` (lista u istom
  kanonskom redoslijedu kao u druge dvije datoteke).
- `buildState(difficulty, variants, puzzle, solution, techniques, regions)` -
  novi parametar, sprema se kao `state.regions` (`null` za non-jigsaw). Prosljeđuju
  ga **oba** puta: worker `onmessage` destrukturiranje **i** `generateSync`.
- `load()`: ako `state.variants` sadrži `"jigsaw"`, validirati `state.regions`:
  81-polje, svaki element cijeli broj 0-8, svaki id točno 9 puta. Nevaljano →
  `return false` (odbaci save, kreće nova igra). Inače `state.regions = null`
  ako polje ne postoji.
- **Granice regija na ploči**: postojeći `.br`/`.bb` mehanizam (margin +
  box-shadow, 2px linija) radi i za nepravilne granice, samo se uvjet računa iz
  regija umjesto formule. U `render()` petlji (koja svaki frame resetira
  className i ponovno dodaje br/bb) zamijeniti klasični uvjet helperom:
  - jigsaw: `br` ako `col !== 8 && regions[i] !== regions[i+1]`;
    `bb` ako `row !== 8 && regions[i] !== regions[i+9]`;
  - inače postojeća formula (`col % 3 === 2 && col !== 8`, analogno za red).
    `buildBoard()` može zadržati klasične granice (izvršava se jednom prije
    statea; prvi `render()` ih ionako pregazi). Nikakav novi CSS nije potreban.
- **Peer highlight** u `render()`: usporedbu `box === selBox` preusmjeriti na
  `regionOf(i) === regionOf(sel)` gdje je `regionOf(i)` = `state.regions[i]` za
  jigsaw, klasična formula inače.
- **`clearNotesAround(idx, n)`**: box-blok (petlja po boxRow/boxCol) za jigsaw
  zamijeniti dodavanjem svih `t` gdje je `state.regions[t] === state.regions[idx]`
  (linearni scan 81 ćelije je dovoljan). Row/col/ostale varijante nepromijenjene.
- **`hint()`**: poziv proširiti na
  `Solver.explainNext(state.values, state.notes, state.solution, state.variants, state.regions)`.
- Sve ostalo (undo, boje, multi-select, numpad, win check, statusLabel) radi bez
  izmjena - `regions` je nepromjenjiv tijekom partije pa ne ulazi u history.

## 5) `index.html` - red u meniju

Dodati kao **prvi** `variant-row` (poklapa se s kanonskim redoslijedom):

```html
<button class="variant-row" data-variant="jigsaw">
  <span class="variant-info">
    <span class="variant-name">Jigsaw</span>
    <span class="variant-desc">The 3×3 boxes are replaced by nine irregular regions.</span>
  </span>
  <span class="variant-toggle" aria-hidden="true"></span>
</button>
```

`MAX_VARIANTS = 2` i postojeća napomena o Hard generaciji ostaju netaknuti.

## Zamke - checklist prije završetka

1. **Cache poisoning**: `unitCtx` i `namedCtx` u solveru NE smiju spremati
   jigsaw kontekst. Test: dvije uzastopne jigsaw partije → hint u drugoj mora
   highlightati regije druge, ne prve.
2. **Fallback putevi u `generate()`**: `best` mora spremiti svoje `regions`;
   krajnji fallback mora generirati nove. Zaboravljeno → UI dobije
   `regions: undefined` uz jigsaw variants i ploča se crta klasično dok solver
   sudi po regijama (ili obratno).
3. **Dva puta do `buildState`**: worker onmessage I sync fallback - oba moraju
   proslijediti `regions`.
4. **`lockedCandidates`/`hLocked` statični `boxes`** - najgora klasa buga
   (pogrešan hint koji izgleda uvjerljivo). Obavezno `curBoxes`/`curBoxOf`.
5. **Susjedna zamjena u `generateRegions` ne radi** - koristiti transfer para
   ne nužno susjednih ćelija (vidi 1a).
6. **Tri kopije `REGION_VARIANTS`** (app/sudoku/solver) - identičan sadržaj i
   redoslijed, sve tri ažurirati.
7. **`load()` validacija** - korumpiran/ručno uređivan save s jigsaw variants i
   krivim regions ne smije proći (solver bi pukao ili tiho sudio krivo).
8. **Renumeriranje regija** - bez njega "region N" u hintu skače nasumično.

## Redoslijed implementacije i test plan

Faze redom; svaku verificirati prije sljedeće:

1. **`sudoku.js`**: `generateRegions` + jig-provođenje + module export guard.
2. **`solver.js`**: ctx/named plumbing, `curBoxes`/`curBoxOf`/`curBoxLabel`,
   potpisi `solveAndGrade`/`explainNext`.
3. **Node smoke-test** (skripta izvan repoa, npr. scratchpad;
   `global.Solver = require("./solver.js")` PRIJE `require("./sudoku.js")` jer
   se `REQ_TIER` evaluira pri učitavanju):
   - 20× `generateRegions`: 9 id-eva × 9 ćelija, svaka regija povezana (BFS),
     kanonski poredak (prvo pojavljivanje id-eva je rastuće).
   - `generate("normal", ["jigsaw"])`: `countSolutions(puzzle, 2, ..., jig) === 1`,
     `solveAndGrade(puzzle, ["jigsaw"], regions).solved === true`, grid == solution.
   - Regresija klasika: `generate("normal", [])` i `generate("hard", [])` i po
     jedna postojeća varijanta (npr. `["x"]`) - solvable, unikatno, tier logičan.
   - Cache-poisoning test: dva `solveAndGrade` s različitim `regions` zaredom pa
     jedan classic - svi točni.
4. **`app.js` + `index.html`**: UI dio.
5. **Ručna verifikacija u browseru** (dev server / otvoriti index.html):
   - Nova igra Jigsaw Normal: nepravilne 2px granice, bez klasičnih 3×3 linija.
   - Klik na ćeliju: peer highlight prati regiju, ne kvadrat.
   - Upis točnog broja: bilješke se čiste po regiji.
   - Hint na jigsaw ploči: spominje "region N", highlight pokriva tu regiju;
     drugi tap daje ispravan potez.
   - Reload stranice: partija se vraća s istim regijama.
   - Jigsaw + Diagonal kombinacija: obje dekoracije, generira se, hint radi.
   - Nova klasična partija nakon jigsawa: klasične granice i hintovi (cache test).
   - Cancel tijekom generiranja radi.
6. `npm run lint` čist.

## Verzioniranje i commit

- feat → minor: `1.19.0` (ili tekuća) → `1.20.0`, bump u `package.json` u istom
  commitu (hook to enforcea; koristiti `-m`, ne stdin).
- Poruka npr.: `feat: Jigsaw varijanta (9 nepravilnih regija umjesto 3×3 kvadrata)`.
- U istom commitu u `docs/todo.md` označiti Jigsaw checkbox kao `[x]` s kratkim
  opisom mehanizma (per-puzzle `regions`, zamjena box-units, referenca na ovaj doc).
- `sw.js` CACHE se ne dira (nije verzija aplikacije).
