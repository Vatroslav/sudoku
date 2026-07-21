# Dorada: varijante kao constraint arhitektura

## Cilj

Umjesto da igra nudi samo veće težine, želim da igrač **odabere varijante** (X-Sudoku, Killer, Thermo, Kropki, Antiknight...) i da se slagalica **generira na temelju odabranog**. Varijante se dodaju **postupno** - ne sve odjednom - pa arhitektura mora dopustiti dodavanje nove varijante bez diranja jezgre.

Popis varijanti koje me zanimaju (redoslijed nije prioritet): X-dijagonale, Hyper/Windoku, Jigsaw, Antiknight, Antiking, Killer, Thermo, Palindrome, Clone, Even/odd, Parity, Kropki, XV.

## Trenutno stanje

- `sudoku.js`: `isValid(board, idx, val)` hardkodira row/col/box. `fillBoard` (backtracking generira rješenje), `countSolutions` (provjera jedinstvenosti), `dig` (uklanja clue-ove), `generate(difficulty)`.
- `solver.js`: `peers` (Set susjeda = row+col+box) i `allUnits` (rows/cols/boxes). Sve tehnike (naked/hidden single, locked candidates, parovi/trojke) rade preko `peers`/`allUnits`. `solveAndGrade` ocjenjuje težinu po najtežoj potrebnoj tehnici.
- `app.js`: meni s tri težine, generira, prikazuje, hint.

**Ključni uvid:** generiranje, jedinstvenost i solver sve vise o jednoj točki - provjeri row/col/box. Parametriziraš li tu točku aktivnim varijantama, i generiranje i provjera jedinstvenosti riješe se odjednom.

## Ciljna arhitektura

Svaka varijanta = **modul** s ovim (opcijskim) dijelovima:

```
Constraint = {
  id, name,
  setup?(rng)            // generiraj geometriju (Jigsaw regije, Thermo linije, Killer kavezi)
  units?()               // skupovi-od-9 koji moraju imati 1-9 (X dijagonale, Hyper prozori, Jigsaw regije)
  peersFor?(idx)         // dodatni "isti-broj-zabranjen" susjedi (Antiknight, Antiking)
  isValid?(grid,idx,val) // relacijska provjera (Thermo raste, Killer zbroj, Kropki susjedi)
  prune?(grid,cand)      // solver logika specifična varijanti (vrati true ako je maknuo kandidat)
  deriveClues?(solution) // oznake izvedene iz rješenja (Kropki točke, XV, Even/odd)
  render(target, geom)   // kako se crta
}
```

- **Klasik postaje tri core modula** (row, col, box). Aktivni set = `[row, col, box, ...odabrane varijante]`.
- Iz aktivnog seta grade se `peers`, `units` i **jedinstvena** `isValidPlacement(grid, idx, val, active)`.
- `fillBoard`, `countSolutions` i validacija poteza zovu tu istu funkciju → generator automatski daje valjano varijantno rješenje, a `countSolutions` provjerava jedinstvenost **za tu kombinaciju varijanti**.

> **Najčešća greška:** ako `countSolutions`/`dig` ne koriste aktivne constrainte, uklanjanje clue-ova misli da je klasik i dobiješ puzzle bez jedinstvenog rješenja. Sve tri točke (fill, count, validacija) moraju dijeliti isti aktivni set.

## Klasifikacija varijanti (određuje redoslijed dodavanja)

| Tip                                            | Varijante                                                 | Kako se dodaje                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Regijske** (samo prošire units/peers)        | X-dijagonale, Hyper/Windoku, Jigsaw, Antiknight, Antiking | `units()` / `peersFor()`; generator gotovo bez izmjena                                                  |
| **Derivacijske** (oznaka izvedena iz rješenja) | Kropki, XV, Even/odd, Parity                              | `deriveClues(solution)` + render + `prune`                                                              |
| **Geometrija-first + relacijske** (najteže)    | Thermo, Palindrome, Clone, Killer                         | `setup()` generira geometriju, `isValid` djelomična provjera, generacija mora dati jedinstveno rješenje |

> **Treći red je demantiran u praksi.** Sva četiri (Thermo v1.30.0, Palindrome v1.32.0,
> Clone v1.33.0, Killer v1.34.0) ispala su derivacijska i generator nije diran ni jednom.
> Tablica je pisana prije derive pipelinea: pretpostavlja `setup()` koji složi geometriju
> PRIJE rješenja, a derive radi obrnuto - rješenje prvo, oznaka se izvede iz njega pa
> nemoguća geometrija ne može ni nastati. **Prije nego se prihvati procjena "ovo traži
> `setup()`", provjeriti može li se oznaka IZVESTI iz gotovog rješenja.** Detalji po
> varijanti u [todo.md](todo.md).

## Postupne faze

- **Faza 0 - refaktor jezgre, nula novih varijanti.** Izvuci row/col/box iz `solver.js` (`peers`, `allUnits`) i `sudoku.js` (`isValid`) u constraint registry. Aktivni set = klasik. **Cilj: klasični Sudoku radi identično** (ista generacija, hint, gradiranje). Ovo je najveći dio posla i temelj za sve ostalo - ne prelaziti dalje dok klasik ne prolazi identično kao prije.
- **Faza 1 - UI za odabir.** Meni (sad tri diff gumba u `index.html`, oko linije 66-70) proširi: težina + lista varijanti (checkbox/chip). Odabir → `Sudoku.generate(difficulty, activeVariants)`. Spremi izbor u state + localStorage.
- **Faza 2 - prva regijska (X-Sudoku).** Dokaz `units()` puta: dvije dijagonale kao dodatni units + render linija. Generator ne diraš.
- **Faza 3 - prva derivacijska (Even/odd ili Kropki).** Dokaz `deriveClues` + `prune` + render puta.
- **Dalje po trošku:** Hyper, Antiknight/king (jeftini) → Jigsaw → Kropki/XV/Parity → Palindrome/Clone → Thermo → Killer (zadnji, traži vlastiti generator geometrije).

## Dvije zamke (izvan uobičajene domene - solver dizajn)

- **Težina i varijanta su dvije odvojene osi.** Trenutni grader mjeri klasične tehnike (single/locked/pairs). Varijanta mijenja težinu implicitno. Za MVP **ne** pokušavaj gradirati varijantne tehnike - ostavi težinu na broju clue-ova/klasičnim tehnikama, a varijanta je zaseban izbor. (Killer je iznimka - tamo je težina drugačije definirana, zato je zadnji.)
- **Generacija Thermo/Killer je istraživački problem**, ne "još jedan modul". Naći geometriju koja daje jedinstveno rješenje bitno je teže od regijskih varijanti. Zato su na kraju - ne miješati ih u ranu fazu. _(Nije se obistinilo - vidi napomenu uz tablicu.)_

## Kandidati nakon iscrpljene wish-liste

Popis s vrha ovog doca je **isporučen do zadnje varijante** (v1.34.x). Iduća varijanta
zato više ne dolazi s liste nego je nova odluka. Popis ispod je kandidatura, ne plan -
poredan po trošku u zatečenoj arhitekturi (derive pipeline + `.line-*` render + `KEEP_MIN`),
ne po privlačnosti.

**Skoro besplatno - regijske, samo units:**

- ~~**Disjoint Groups**~~ - **isporučen u v1.35.0**, prvi s ove liste. Procjena troška
  se obistinila (9 units, nula rendera, najjeftiniji dodatak dosad), a bojazan oko
  vidljivosti je razriješena drukčije nego što je ovdje predviđeno: tinta je odbačena
  jer bi se sudarala s hyper prozorima i Clone tonovima, a varijanta se oslonila na
  peer-highlight po presedanu Antiknighta. Mjerenje je usput dalo pravilo koje ova
  lista nije predviđala - **`STRENGTH` regijske varijante mjeri se na kombinacijama,
  ne na solo ploči**. Detalji u [todo.md](todo.md).

**Jeftino - derive + postojeći `.line-*` render:**

- **German Whispers** - susjedne ćelije na liniji razlikuju se za barem 5. Derive je
  šetnja kao `deriveThermos`, samo drugi uvjet koraka; najbliže copy-pasteu jezgre.
- **Renban** - linija nosi uzastopan skup znamenki u bilo kojem redoslijedu. Derive:
  šetnja pa provjera je li skup uzastopan (ili gradnja rastućeg pa premetanje puta).
- **Zipper line** - parovi simetrični oko sredine daju isti zbroj. Derive raste iz
  sredine u parovima, točno kao `derivePalindromes`.

Sve tri dijele `.line-seg` / `.line-joint` / `.line-clip` mašineriju (dvaput dokazanu,
Thermo pa Palindrome), izvode se iz gotovog rješenja pa generator ostaje netaknut, i
trebaju samo novu boju + `KEEP_MIN` + `STRENGTH`. Vrijedi i pravilo redoslijeda izvođenja
iz v1.33.0: prva ide oznaka s najmanje slobode.

**Skuplje - novi render kanal:**

- **Sandwich** - zbroj znamenki između 1 i 9 u retku/stupcu. Trivijalno se izvede, ali
  oznaka stoji **izvan ploče** - prvi put da nešto treba mjesto van grida (layout,
  mobitel, skaliranje). To je pravi novi posao, ne derive.
- **Arrow** - krug + rep čiji zbroj daje broj u krugu. Derive je teži (rep mora stati u
  vrijednost kruga), render kombinira liniju i krug.
- **Little Killer** - dijagonalni zbroj izvan ploče; isti render problem kao Sandwich.

**Nije derivacijsko - traži diranje generatora:**

- **Nonconsecutive** - ortogonalni susjedi ne smiju biti uzastopni. Globalno pravilo, ne
  oznaka izvedena iz rješenja, pa rješenje mora biti pronađeno UZ taj uvjet. Prva iskrena
  kandidatura za praznu "geometrija-first" kategoriju - za razliku od četiri koje su tamo
  bile krivo svrstane.
