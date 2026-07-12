# TODO

Otvoreni plan za Sudoku. Arhitektura i redoslijed dodavanja varijanti opisani su u
[dorada-varijante.md](dorada-varijante.md) (klasifikacija: regijske → derivacijske →
geometrija-first). Trenutno su varijante složene kao lagani `variant` string-switch
(`"classic"|"x"`) kroz `sudoku.js` (`isValid`) i `solver.js` (`unitCtx`/`namedCtx`), ne
kroz puni Constraint registry - kad broj varijanti naraste, procijeniti isplati li se
Faza 0 refaktor iz doca.

## Varijante

Regijske (samo prošire units/peers - najjeftinije):

- [x] X-Sudoku (dvije dijagonale 1-9)
- [x] Hyper / Windoku (4 dodatna 3×3 prozora kao units, v1.12.0)
- [ ] Antiknight (isti broj zabranjen na skoku konja - dodatni peers)
- [ ] Antiking (isti broj zabranjen na dijagonalnom susjedu - dodatni peers)
- [ ] Jigsaw (9 nepravilnih regija umjesto kvadrata - `setup` geometrije + render)

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

- [x] Bojanje ćelija (v1.8.0, prerađeno v1.9.0) - color mode gumb → paleta 9 boja.
      Unos kao broj: odaberi ćelije pa stisni boju. Do 4 boje po ćeliji (1 puna,
      2 stupca, 3 Y-oblik, 4 kvadranta), ista boja toggla off; Erase/Delete čisti.
      Perzistira u `state.colors`
      (array po ćeliji) + localStorage + undo. Boji i givens; overlay (`::after`,
      dinamični gradijent preko `--cc`) neovisan o highlightu.
