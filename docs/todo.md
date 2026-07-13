# TODO

Otvoreni plan za Sudoku. Arhitektura i redoslijed dodavanja varijanti opisani su u
[dorada-varijante.md](dorada-varijante.md) (klasifikacija: regijske → derivacijske →
geometrija-first). Regijske varijante su složene kao **kombinabilan skup** aktivnih
varijanti (`state.variants`, npr. `["x","hyper"]`): `sudoku.js` (`isValid`) i `solver.js`
(`ctxFor`/`namedFor`) komponiraju units/peers preko aktivnog skupa. Nije puni Constraint
registry - kad broj varijanti naraste (ili kad zatreba `setup`/`deriveClues`), procijeniti
isplati li se Faza 0 refaktor iz doca.

## Metrike (blocker za launch na itch)

- [ ] **Anonimni event tracking** - mjeriti koliko se partija pokreće, kakvih
      (classic / pojedina varijanta / kombinacija) i po kojoj težini, te koliko ih
      se riješi. Bez ovoga launch na itch nema signal koristi li itko igru.
  - **Mehanizam kao u LRO** (`~/github/left-right-onwards-web`): tanak klijentski
    modul → POST na Google Apps Script web app → Google Sheet. Referenca:
    `src/core/metrics.ts` + `metrics/README.md` u tom repou. Načela iz LRO-a:
    anoniman per-browser session id (localStorage, bez PII), fire-and-forget
    (`fetch` + `no-cors` + `keepalive`, response se ne čita), sve u `try/catch`
    (tracking nikad ne smije srušiti igru), i **no-op dok `METRICS_URL` nije
    postavljen**. URL nije secret (vidi se u network tabu) - smije u repo.
  - **Točke emitiranja u ovom repou** (`app.js`):
    - start: u `newGame(difficulty, variants)` → event `game_started`
    - kraj: gdje se postavlja `state.solved = true` (win) → event `game_solved`
  - **Predloženi eventi i payload**:
    - `game_started` → `{ gameId, difficulty, variants }`
    - `game_solved` → `{ gameId, difficulty, variants }` (kasnije po želji + vrijeme/potezi)
    - `difficulty` je `"normal"` / `"hard"` (`DIFF_LABELS`); `variants` je
      `state.variants` polje (prazno = classic, npr. `["x","hyper"]` = kombinacija -
      polje samo pokriva i pojedinačne varijante i kombinacije).
    - `gameId` (novi uuid u `newGame`, spremljen u `state`) veže start↔solve pa se
      completion rate računa po partiji, ne samo agregatno; preživi reload kroz
      localStorage kao i ostatak `state`.
  - Dev vs prod razlikovati u payloadu (`env`) da lokalno testiranje ne zagađuje
    analizu - LRO to radi preko `import.meta.env.DEV`; ovdje nema build systema, pa
    izvesti iz `location.hostname` (localhost/127.0.0.1 = dev).

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

- [ ] Even/Odd (ćelija označena kao parna/neparna)
- [ ] Parity (ograničenje parnosti - srodno Even/Odd, procijeniti spajanje)
- [ ] Kropki (crne/bijele točke između susjeda: omjer 2 / razlika 1)
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
