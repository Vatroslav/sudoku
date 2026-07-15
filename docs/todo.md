# TODO

Otvoreni plan za Sudoku. Arhitektura i redoslijed dodavanja varijanti opisani su u
[dorada-varijante.md](dorada-varijante.md) (klasifikacija: regijske → derivacijske →
geometrija-first). Regijske varijante su složene kao **kombinabilan skup** aktivnih
varijanti (`state.variants`, npr. `["x","hyper"]`): `sudoku.js` (`isValid`) i `solver.js`
(`ctxFor`/`namedFor`) komponiraju units/peers preko aktivnog skupa. Nije puni Constraint
registry - kad broj varijanti naraste (ili kad zatreba `setup`/`deriveClues`), procijeniti
isplati li se Faza 0 refaktor iz doca.

## Metrike (blocker za launch na itch)

- [x] **Anonimni event tracking - klijent** (v1.21.0). `metrics.js` (`Metrics.track`),
      mehanizam kao u LRO (`~/github/left-right-onwards-web/src/core/metrics.ts`):
      anoniman per-browser id u localStorage (bez PII), fire-and-forget (`fetch` +
      `no-cors` + `keepalive`), sve u `try/catch`, **no-op dok `METRICS_URL` nije
      postavljen**. Eventi: `game_started` (u `buildState`, tek kad ploča stvarno
      postoji - generiranje prekinuto Cancelom NIJE partija) i `game_solved` (uz
      `state.solved = true`). Payload `{ gameId, difficulty, variants }`; `gameId`
      živi u `state` pa veže start↔solve i preživi reload. `env` je binaran kao
      LRO-ov `import.meta.env.DEV`: dev = localhost/`file://`, prod = svaka
      isporučena kopija (itch hostovi se namjerno ne nabrajaju - vidi
      [metrics/README.md](../metrics/README.md)).
- [x] **Endpoint (Apps Script + Sheet)** postavljen (v1.22.0) - `METRICS_URL` upisan u
      `metrics.js`, tracking je aktivan. Sheet "Sudoku - metrics" (tab `events`).
      Provjereno end-to-end: partija pokrenuta u browseru zapiše red (anon session,
      `env=dev`, gameId, difficulty, variants). Postavljanje opisano u
      [metrics/README.md](../metrics/README.md).
- [x] **Drugi krug eventa** (v1.23.0): `app_opened` (jedini trag povratnika - tko
      nastavi spremljenu partiju ne generira ploču pa inače ne proizvede ništa),
      `game_cancelled` (odustajanje od spore HARD generacije - `waitedMs`), te
      `playMs` / `moves` / `hints` u `game_solved`. `playMs` je igrano vrijeme (sat
      teče samo dok je kartica vidljiva).
- [ ] Po želji kasnije: `game_left` na `pagehide` - koliko je ćelija bilo popunjeno
      kad je čovjek otišao (jedini način da se vidi GDJE unutar partije ljudi
      odustaju). Ide throttlano, jednom po partiji, inače je previše šuma.

## Varijante

Regijske (samo prošire units/peers - najjeftinije):

- [x] X-Sudoku (dvije dijagonale 1-9)
- [x] Hyper / Windoku (4 dodatna 3×3 prozora kao units, v1.12.0)
- [x] Antiknight (isti broj zabranjen na skoku konja - dodatni peers, v1.16.0).
      Prva peer-varijanta: `EXTRA_PEERS` u `solver.js` (`ctxFor` dodaje susjede uz
      units), nema imenovanih jedinica ni trajne dekoracije ploče (vidi se kroz
      peer-highlight). Antiking je sad trivijalan (isti mehanizam, drugi offseti).
- [x] Antiking (isti broj zabranjen na dijagonalnom susjedu - dodatni peers, v1.19.0).
      Isti `EXTRA_PEERS` mehanizam kao Antiknight, samo drugi offseti (4 dijagonalna
      susjeda; ortogonalni potezi kralja su suvišni - već ih hvata red/stupac).
- [x] Jigsaw (9 nepravilnih regija umjesto kvadrata, v1.20.0). Prva varijanta koja
      ZAMJENJUJE box-units (ne dodaje ih) i nosi per-puzzle geometriju (`state.regions`,
      81-polje id-eva 0-8). `sudoku.js` `generateRegions()` perturbira klasične kvadrate
      transferima parova ćelija preko granice (BFS provjera povezanosti); `isValid`/
      generator dobivaju `jig` param. `solver.js` `ctxFor`/`namedFor`/`useVariant` grade
      box-units iz regija i NE cacheiraju jigsaw (per-puzzle); `lockedCandidates`/`hLocked`
      idu preko `curBoxes`/`curBoxOf`. Granice na ploči kroz postojeći `.br`/`.bb` (uvjet
      iz regija). Spec: [dorada-jigsaw.md](dorada-jigsaw.md).

Derivacijske (oznaka izvedena iz rješenja - `deriveClues` + render + `prune`):

- [x] Even/Odd (ćelija označena kao parna/neparna, v1.24.0). Prva derivacijska:
      per-puzzle `state.parity` (81-polje 0/1/2), izvedena iz rješenja na podskupu
      ćelija (`deriveParity`, `PARITY_DENSITY` knob u `sudoku.js`). Bolt-on bez Faza 0
      refaktora - "evenodd" je u `REGION_VARIANTS` ali ne dira units/peers: `isValid`
      (sudoku.js) i `computeCandidates` (solver.js) samo provjere parnost označene
      ćelije, parity se provlači kroz `dig`/`countSolutions`/`solveAndGrade`/`explainNext`
      (kao jigsaw `regions`). Render: kvadrat (parno) / krug (neparno) u `::before`
      sloju ćelije (skriveno na givens). Gustoća oznaka je knob za ugađanje težine.
- [ ] Parity (ograničenje parnosti - srodno Even/Odd, procijeniti spajanje)
- [x] Kropki (crne/bijele točke između susjeda: omjer 2 / razlika 1, v1.25.0).
      **Casual** izvedba (Vatrin izbor): samo pozitivno - prikazana točka mora
      vrijediti, odsutnost ne znači ništa (bez negativnog constrainta). Per-puzzle
      `state.dots = { h, v }` (81-polja 0/1/2), podskup točaka izveden iz rješenja
      (`deriveDots`, `KROPKI_DENSITY` knob u `sudoku.js`). Bolt-on bez Faza 0: kao
      evenodd, "kropki" je u `REGION_VARIANTS` ali ne dira units/peers - `isValid`
      (sudoku.js) provjeri prema popunjenim susjedima, `computeCandidates` + `place`
      (solver.js) propagiraju kroz sužavanje kandidata (**bez zasebne tehnike**,
      klasične dovrše - kao Even/Odd). Render: `<span class="kdot">` na bridu vezan uz
      desnu/donju ćeliju para (stacking iznad ranijeg susjeda), jer su `::before`/
      `::after` zauzeti parity/color. 1-2 par dobije crnu (omjer provjeren prvo).
      XV poslije reusea istu brid-infrastrukturu (drugi odnos: zbroj 5/10).
- [ ] XV (X = zbroj 10, V = zbroj 5 između susjeda)

Geometrija-first + relacijske (najteže - `setup` geometrije + relacijski `isValid`,
generacija mora dati jedinstveno rješenje):

- [ ] Thermo (vrijednosti rastu duž termometra)
- [ ] Palindrome (linija čita isto u oba smjera)
- [ ] Clone (dvije regije dijele isti raspored)
- [ ] Killer (kavezi sa zadanim zbrojem - traži vlastiti generator geometrije, zadnji)

## Značajke

- [x] Multi-select varijante (v1.13.0) - Diagonal i Hyper se biraju nezavisno i
      kombiniraju (npr. "Diagonal + Hyper"). Meni ima toggle-gumbe, Classic = prazan
      skup. `state.variants` je polje; stare spremljene igre migriraju iz `state.variant`.
      Cap na 2 istovremeno (v1.16.1, `MAX_VARIANTS` u `app.js`) - kombinacija 3+ digne
      generaciju do neupotrebljivosti i na Normal; kad su 2 aktivne, treći je disabled.
      Redizajn u listu s toggle-prekidačima + jednorečenični opis po varijanti (v1.18.0);
      Classic više nije gumb (= sve isključeno), napomena "Choose up to 2" iznad liste.
- [x] Bojanje ćelija (v1.8.0, prerađeno v1.9.0) - color mode gumb → paleta 9 boja.
      Unos kao broj: odaberi ćelije pa stisni boju. Do 4 boje po ćeliji (1 puna,
      2 stupca, 3 Y-oblik, 4 kvadranta), ista boja toggla off; Erase/Delete čisti.
      Perzistira u `state.colors`
      (array po ćeliji) + localStorage + undo. Boji i givens; overlay (`::after`,
      dinamični gradijent preko `--cc`) neovisan o highlightu.

## Poznato / tehnički dug

- **Spora HARD generacija za varijante** (Vatra OK s tim zasad, v1.14.0).
  `Sudoku.generate` za "hard" traži slagalicu čija je najteža KLASIČNA tehnika
  tier-2. Kod varijanti je solver jači (dodatni units), pa slagalice češće ispadnu
  tier-1 → generator vrti puno pokušaja (izmjereno: classic ~2.7s, hyper ~10.6s,
  Diagonal+Hyper još gore). Odluka: prihvatljivo (puzzle se ionako rješava 10+ min),
  korisnik je informiran napomenom u meniju. **Ne "popravljati" bez potrebe.** Ako
  ikad zatreba brže: za varijante "hard" vezati uz **broj zadanih polja** umjesto
  klasičnog tiera (po [dorada-varijante.md](dorada-varijante.md)).
  - Ublaženo (v1.17.0): generiranje ide u Web Worker (`gen-worker.js`), glavna nit
    ostaje slobodna, a loading overlay ima **Cancel** (worker.terminate() → natrag u
    meni). Spinner više ne zamrzava. Kombinacije su k tome capane na 2 (v1.16.1).
