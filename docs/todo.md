# TODO

Otvoreni plan za Sudoku. Arhitektura i redoslijed dodavanja varijanti opisani su u
[dorada-varijante.md](dorada-varijante.md) (klasifikacija: regijske → derivacijske →
geometrija-first). Regijske varijante su složene kao **kombinabilan skup** aktivnih
varijanti (`state.variants`, npr. `["x","hyper"]`): `sudoku.js` (`isValid`) i `solver.js`
(`ctxFor`/`namedFor`) komponiraju units/peers preko aktivnog skupa. Nije puni Constraint
registry - kad broj varijanti naraste (ili kad zatreba `setup`/`deriveClues`), procijeniti
isplati li se Faza 0 refaktor iz doca.

**Riješeno: `clues` objekt umjesto pozicijskih parametara** (refaktor, bez bumpa -
dokazano bez promjene ponašanja).
`isValid` je imao 8 parametara (`board, idx, val, variants, jig, parity, edges, thm`);
sada su svi per-puzzle podaci u jednom `clues` objektu, pa ih `isValid` ima 5
(`board, idx, val, variants, clues`) i svaka buduća derivacijska varijanta dodaje
**nula** parametara.

- **`prepClues` je jedino mjesto koje gradi clues.** Nosi i wire polja
  (`regions`/`parity`/`edges`/`thermos` - idu u `state` i localStorage) i izvedene
  brze oblike (`jig`/`thm` - `isValid` ih gleda u vrućoj petlji). Izvedeno se NE
  sprema; slaže se iz wire polja pri svakoj gradnji.
- **Zamka kod prunea:** `pruneMarks` mijenja `clues.thermos` (wire lista), pa mora u
  koraku osvježiti izvedeni `clues.thm` - inače solver reže kandidate po staroj listi
  tuba. Isti oprez vrijedi za svaku buduću varijantu koja mijenja svoju wire listu
  nakon gradnje clues.
- **Migracija:** partije spremljene prije clues objekta nose oznake na vrhu `state`-a
  (a Kropki prije XV-a još i pod imenom `dots`); `load()` ih preuzima u `state.clues`.
- **Dokaz mehaničnosti:** regresijska mreža sa zasijanim RNG-om (96 ploča) dala je
  bajt-identičan ispis prije i poslije - puzzle, solution, tehnike, sve izvedene
  oznake. Za idući refaktor jezgre: isti pristup (zasij `Math.random`, snimi ploče
  prije, usporedi poslije) - ako je mehaničko, mora biti bajt-identično.

Namjerno je napravljen ODVOJENO od Thermo i PRIJE Palindromea: Thermo je zato bio dodan
kao 8. pozicijski parametar (ne kroz refaktor), da se kod regresije ne miješa nova
varijanta i refaktor jezgre.

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
- [x] Disjoint Groups (ista pozicija u kutiji kroz svih 9 kutija = jedinica, v1.35.0).
      Prva varijanta izvan originalne wish-liste (ona je iscrpljena u v1.34.x) i
      **najjeftinija dosad**: 9 statičnih units u `EXTRA_UNITS`, jedna grana u
      `isValid`, nula per-puzzle podataka i nula novog rendera. Vidi sekciju niže.
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
- [x] ~~Parity~~ - **nije zasebna varijanta.** Bila je na popisu iz originalne
      wish-liste, ali "parity constraint" znači točno ono što Even/Odd radi (oznaka
      koja fiksira parnost ćelije) - `deriveParity` je to. Nema se što spajati,
      stavka je zatvorena kao pokrivena.
- [x] Kropki (crne/bijele točke između susjeda: omjer 2 / razlika 1, v1.25.0).
      **Casual** izvedba (Vatrin izbor): samo pozitivno - prikazana točka mora
      vrijediti, odsutnost ne znači ništa (bez negativnog constrainta). Bolt-on bez
      Faza 0: kao evenodd, "kropki" je u `REGION_VARIANTS` ali ne dira units/peers -
      `isValid` (sudoku.js) provjeri prema popunjenim susjedima, `computeCandidates` +
      `place` (solver.js) propagiraju kroz sužavanje kandidata (**bez zasebne
      tehnike**, klasične dovrše - kao Even/Odd). 1-2 par dobije crnu (omjer provjeren
      prvo). Podatak i render dijeli s XV - vidi brid-oznake niže.
- [x] XV (V = zbroj 5, X = zbroj 10 između susjeda, v1.27.0). Casual kao Kropki.
      Dodavanje je bilo **generalizacija, ne novi kanal**: Kropki `state.dots`
      (tipovi 0-2) postao je `state.edges` (0 nema / 1 bijela / 2 crna / 3 V / 4 X),
      pa XV ne uvodi ni jedan novi parametar u `isValid`/`countSolutions`/`dig`/
      `solveAndGrade`/`explainNext` (već ih je bilo 7 - vidi Faza 0 procjenu gore).
      `deriveEdges(solution, useKropki, useXv)` + `edgeOk`/`edgeType` u `sudoku.js`;
      `XV_DENSITY` je zaseban knob i **veći** od Kropki (0.45-0.65 vs 0.35-0.55) jer
      manje parova kvalificira (zbroj 5/10 = 6 parova, Kropki 11) - mjereno daje
      12-14 oznaka po ploči. **Jedan brid = jedna oznaka**: fizički (točka i slovo bi
      se preklopili) i logički (Kropki bira prvi, XV puni slobodne). Jedini par koji
      kvalificira za obje je 2-3 (uzastopni I zbroj 5); casual semantika to podnosi
      jer odsutnost ionako ne znači ništa. Render: zajednička klasa `emark` nosi
      poziciju na bridu, `kdot`/`xmark` izgled. **XV slovo ima neprozirnu podlogu u
      boji ćelije** - tanki potezi bi se stopili s linijom ploče (pogotovo s debelom
      granicom bloka), pa slovo reže liniju kao u tiskanim XV slagalicama.
      Migracija: spremljene Kropki partije (`state.dots`) preuzimaju se u `state.edges`.
- [x] Sandwich (zbroj znamenki između 1 i 9 u retku/stupcu, v1.42.0). Sedma s liste
      kandidata i **prva oznaka izvan ploče** - time je otvoren render kanal koji je
      dotad bio jedina nedotaknuta skupina. Ujedno prva relacija kojoj se ne zna nad
      kojim ćelijama vrijedi (skup ovisi o tome gdje padnu 1 i 9), pa se propagira
      enumeracijom umjesto rasponom - vidi sekciju niže.

- [x] Thermo (vrijednosti rastu duž termometra, v1.30.0). **Nije ispala
      geometrija-first** - vidi zasebnu sekciju niže.
- [x] Palindrome (linija čita isto u oba smjera, v1.32.0). Kao Thermo, **nije ispala
      geometrija-first** - vidi zasebnu sekciju niže.
- [x] German Whispers (susjedi na liniji razlikuju se za barem 5, v1.36.0). Druga s
      liste kandidata. Geometriju posuđuje od Thermo, logiku od Kropkija - vidi
      sekciju niže.
- [x] Renban (uzastopan skup na liniji, bilo kojim redoslijedom, v1.38.0). Treća s
      liste kandidata, četvrta linijska. Treći tip odnosa: veže cijeli skup odjednom
      (kao Killer), ne poziciju ni susjedni par - vidi sekciju niže.
- [x] Zipper (parovi simetrični oko sredine zbrajaju se u vrijednost sredine, v1.39.0).
      Četvrta s liste kandidata, peta i zasad zadnja linijska - njome je iscrpljena
      cijela "jeftina" skupina. Prvi odnos koji FIKSIRA vrijednost umjesto da ju sužava.
- [x] Arrow (krug nosi zbroj znamenki na repu, v1.40.0). Peta s liste kandidata, šesta
      linijska i prva iz skupine označene kao skuplja. Jedini derive s pretragom uz
      vraćanje - vidi sekciju niže.
- [x] Nonconsecutive (susjedi preko brida ne smiju biti uzastopni, v1.41.0). Šesta i
      zadnja s liste kandidata. Jedina varijanta koja mijenja prostor rješenja umjesto
      da oznaku izvodi iz njega, i jedina bez ijednog per-puzzle podatka.
- [x] Clone (dvije regije dijele isti raspored, v1.33.0). Treća koju je doc krivo
      svrstao u geometrija-first - vidi zasebnu sekciju niže.

- [x] Killer (kavezi sa zadanim zbrojem, v1.34.0). **Ni on nije bio geometrija-first** -
      vidi zasebnu sekciju niže.

Geometrija-first + relacijske (najteže - `setup` geometrije + relacijski `isValid`):

- (prazno)

Kategorija je ostala **prazna**. Doc je u nju svrstao Thermo, Palindrome, Clone i
Killer - sva četiri iz istog razloga i sva četiri pogrešno: pisan je prije derive
pipelinea. Zadnji koji je "sigurno" pripadao ovamo bio je Killer, uz obrazloženje da
nije oznaka izvedena iz rješenja nego geometrija sa zbrojevima. Ali **zbroj JEST izveden
iz rješenja** - kavez je slobodna mrlja, a zbroj se izračuna tek kad mrlja stane.

Pouka za iduću varijantu: prije nego se prihvati docova procjena "ovo traži `setup()`",
provjeriti može li se oznaka IZVESTI iz gotovog rješenja. Dosad je odgovor bio da četiri
puta zaredom.

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
- [ ] **Daily Variant Mix** (ideja, neplanirano) - dnevni izazov: **ručno/offline
      pre-generirana Hard kombinacija 3+ varijanti**, isporučena playerima da ju igraju.
      Poanta je da zaobilazi dva postojeća ograničenja: `MAX_VARIANTS = 2` cap i sporu
      3+ generaciju (vidi tech-dug niže) - taj trošak platimo mi jednom, offline, umjesto
      da player čeka generaciju na uređaju. Otvorena pitanja za kad se uzme: kako "daily"
      radi (fiksni dnevni puzzle iz pre-generirane banke vs deterministički seed po
      datumu), gdje živi banka (bundlana JSON jer je PWA offline-first), kako se puzzle
      ubaci u `state` (isti oblik kao `Sudoku.generate` rezultat - puzzle/solution/variants/
      regions/parity/dots), i UX (zaseban "Daily" ulaz u meniju, jedan pokušaj po danu?).
      Metrike već nose `variants` u eventima pa se completion po danu vidi bez izmjena.

## Nužnost varijante (v1.28.0)

`variantNeeded` u `sudoku.js`: generator odbacuje slagalicu koju **klasika sama
jedinistveno rješava** - tamo su varijantna pravila/oznake dekoracija koju igrač
smije ignorirati. Kriterij je `countSolutions(puzzle, bez varijanti) > 1`:
aditivne varijante samo sužavaju skup rješenja, pa je klasično rješenje (kad je
jedinstveno) nužno ono isto. **Jigsaw je izuzet** - zamjenjuje box-jedinice, pa
"klasična" verzija ploče rješava drugi problem i usporedba nema smisla.

Izmjereno prije/poslije (12 ploča po slučaju):

- XV Normal: nužan u **7/10 → 12/12**. Klasika sama riješi 71% → 62% praznih.
- Hard je i prije filtera bio 10/10 nužan za sve varijante - tamo filter ništa
  ne odbacuje, samo garantira. Klasika na Hardu dogura do ~18% praznih (XV),
  pa oznake trebaš od početka, ne tek na kraju.

Trošak: jedan `countSolutions` po pokušaju, prije gradinga (jeftiniji od solvera).
Brzina generacije nije mjerljivo pala.

## Raspon zadanih brojeva na Hardu (v1.29.0)

**Hard s varijantama više nema fiksnih 28 zadanih** - target se bira po pokušaju iz
raspona, pa partije variraju (Vatrin zahtjev: "nekad 28, nekad 20, nekad 12, nekad 8").
Normal i Classic su netaknuti (Classic nema oznaka koje bi manjak brojeva nadoknadile,
i dokazano ne postoji ispod 17 zadanih).

**Gustoća oznaka prati broj zadanih** (`scaled`/`boost` u `sudoku.js`): 0 na vrhu
raspona (bazni raspon, kao dosad), 1 na dnu (sve kvalificirane oznake). Bez toga niski
targeti nisu rješivi - informacija mora doći odnekud.

**Tier je za Hard s varijantama samo gornja granica** (`res.tier <= reqTier` umjesto
`===`). Ploča s malo zadanih rješava se pretežno oznakama pa joj klasične tehnike
ispadnu trivijalne (tier-1) - traži li se točan tier, takva ploča se baca kao
"prelagana" iako je najviše varijantna. Težinu na Hardu s varijantama nosi broj
zadanih; Classic zadržava točan tier (tamo je tehnika jedina os težine).

**Dno raspona je PO VARIJANTI** (`STRENGTH`/`floorFor`), ne jedinstveno. Ispod svog
minimuma varijanta ne da rješivu ploču, a `dig` to otkrije tek nakon što iskopa do
zida jedinstvenosti - najskuplja operacija koju imamo. S jedinstvenim dnom od 8 XV je
trošio **23s po partiji**; s floorom po varijanti **0.0s**.

Izmjereno (12 partija, pravi `generate("hard", ...)`), raspon zadanih:

| varijanta | zadanih | varijanta | zadanih |
| --------- | ------- | --------- | ------- |
| Kropki+XV | 6-26    | XV        | 19-28   |
| Kropki    | 10-28   | Diagonal  | 26-28   |
| Even/Odd  | 14-27   | Classic   | 28      |

### Suvišne oznake (v1.29.1)

Vatrina zamjerka nakon prve odigrane Kropki+XV partije s 12 brojeva: "bilo je
redundantnih hintova". Točno - puna gustoća na dnu raspona prikaže SVE što odnos
dopušta, a izmjereno je **68-80% oznaka suvišno** (jedna ploča: 69 oznaka uz 10
brojeva, dovoljna 21). `pruneMarks` radi isto što `dig` radi s brojevima: probaj
maknuti svaku oznaku, vrati onu bez koje ploča stane. Kriterij je `solveAndGrade`,
ne `countSolutions` - solver rješava deduktivno (tehnike ne pogađaju), pa "rješivo +
točno rješenje" ujedno znači da je rješenje ostalo jedinstveno.

Rezultat (Hard): Even/Odd 55 -> 9, Kropki 29 -> 13, XV 20 -> 6, Kropki+XV 44 -> 18.
Brzina nije mjerljivo pala - prune ide JEDNOM na gotovoj ploči, ne u generacijskoj
petlji, pa si smije priuštiti poziv solvera po oznaci.

**Prune ide samo na Hard s varijantama.** Na Normalu (34 zadana) klasika nosi ploču
gotovo cijelu, pa prune ispravno zaključi da je skoro svaka oznaka suvišna i ostavi
ih **2** - formalno točno (varijanta je i dalje nužna), ali ploča s dva X-a ne izgleda
kao XV slagalica. Normal zato drži baznu gustoću (XV ~14, Kropki ~22): tamo su oznake
dodatak, na Hardu nose rješenje.

Tehnike se čitaju NAKON prunea (`finish`) - ploča bez suvišnih oznaka može tražiti
drugu tehniku nego prije, inače chip u UI-ju prijavljuje slagalicu koja se ne isporučuje.

Metodologija mjerenja minimuma (skripte u scratchpadu, nisu u repou) - **dvije greške
koje se ne smiju ponoviti**:

1. Mjeriti STVARNI givens gotove ploče, ne zadani target. `dig` stane čim jedinstvenost
   pukne, pa nizak target znaci samo "kopaj koliko mozes" - ploča svejedno ispadne s
   ~24 broja. Prvo mjerenje je zbog toga tvrdilo "Classic min 8" (nemoguće - dokazani
   zid je 17).
2. `generateSolution` vrati `null` kad `fillBoard` probije budžet (jigsaw, gusto
   ograničene kombinacije poput antiknight+x). Pravi `generate` tada uzme svježe regije
   i pokuša ponovno; mjerač koji taj `null` broji kao neuspjeh lažno optuži Jigsaw da
   "ne prolazi ni na 28".

## Thermo (v1.30.0)

**Doc je Thermo krivo procijenio.** [dorada-varijante.md](dorada-varijante.md) ga
svrstava u "geometrija-first, najteže" jer pretpostavlja `setup()` koji složi tube
PRIJE rješenja - tada moraš naći rješenje koje ih zadovoljava, što jest istraživački
problem. Ali derive pipeline (izgrađen za Even/Odd, Kropki, XV) radi obrnuto:
rješenje prvo, oznaka se IZVEDE iz njega. `deriveThermos` je šetnja koja uvijek
korača na susjeda veće vrijednosti (potez kralja) - ne može proizvesti nemoguć
termometar, pa je generator ostao netaknut. **Klasifikacija u docu je starija od
derive pipelinea; isto vrijedi za Palindrome.**

Ispao je najjeftiniji od svih varijanti: **prosjek 40ms, max 155ms** po Hard partiji
(usporedba: XV je znao 23s prije floora, hyper ~10.6s).

`thermoRange(board, path, p)` je jezgra i dijele ju `sudoku.js` i `solver.js` (kao
`edgeOk`). Vraća `[lo,hi]` iz dva izvora:

1. **Pozicija sama** - ispod p je p strogo manjih, iznad `len-1-p` strogo većih.
   Vrijedi i na praznoj ploči (3. ćelija tube duljine 4 je 3-8). Odatle Thermo vuče
   većinu snage i zato mu `dig` doguraj do **17 zadanih** (STRENGTH 12).
2. **Popunjeni članovi tube** - svaki korak duž nje vrijedi barem 1, pa 7 na poziciji
   2 ostavlja poziciji 0 najviše 5. `place()` tu posljedicu propagira na CIJELU tubu,
   ne samo na susjeda.

Zajedno su ekvivalent "strogo raste", samo kao granice - solver tako reže kandidate
odmah umjesto par-po-par. Zasebne tehnike nema (kao Kropki/XV, klasične dovrše).

### Prune floor (`THERMO_KEEP_MIN`)

Izmjereno **12/30 Hard ploča ostalo s ≤2 tube** (jedna ploča: 28 zadanih, 1 tuba).
Uzrok nije Thermo nego prune na VRHU raspona: s 28 zadanih klasika nosi ploču gotovo
cijelu, pa prune ispravno zaključi da je skoro svaka tuba suvišna. To je **isti
argument kojim je prune isključen na Normalu** ("ploča s dva X-a ne izgleda kao XV
slagalica"), samo vrijedi i na vrhu Hard raspona - pravilo "prune samo na Hardu" je
pisano s dna raspona na umu.

Kod tube je oštriji nego kod točke: termometar je strukturni objekt i jedan usamljen
se čita kao greška. Zato prune ne smije ispod 4 tube. Poslije: **0/30 ploča s ≤2
tube**, raspon 4-8 tuba (12-29 ćelija). Na dnu raspona granica se ne dosegne (tube
tamo nose rješenje) pa prune radi puni posao - 11 -> 6.

**Isto vrijedi vjerojatno i za XV/Kropki na 28 zadanih** - nije mjereno, ali mehanizam
je isti. Ako Vatra ikad javi "Hard XV ploča ima samo par oznaka", uzrok je ovdje.
Kod Palindromea se ponovilo mjerljivo (17/30 ploča na dnu) - vidi sekciju niže.

### Render: prva oznaka koja ne stane u ćeliju

Sve dosadašnje oznake staju unutar ćelije (parity `::before`, brid-oznake `emark`).
Tuba ide preko više njih, i to je bio jedini stvarno nov dio posla.

**Jedan SVG preko ploče ne ide** iako bi bio čišći: ćelije imaju NEPROZIRNU pozadinu
(`--cell`), pa bi SVG ispod njih bio nevidljiv, a iznad bi prekrio znamenke. Znamenka
je unutar ćelije koja ima `isolation: isolate` - nijedan susjedni element ne može se
ugurati između pozadine ćelije i njenog teksta.

Zato **svaka ćelija crta SVOJU polovicu segmenta**: pilula (`span.thermo-seg`,
`z-index: -1` = isti sloj kao parity, iznad highlighta i ispod znamenke) od svog
središta prema susjedu, rotirana `transform-origin: 0 50%` oko točke koja nakon
`translate` leži u središtu ćelije. Dvije polovice se preklope u razmaku pa je tuba
neprekinuta i preko debele granice bloka, **bez računanja točnih razmaka** (koji nisu
uniformni - `.br`/`.bb` nose 2px marginu).

**Prelazak preko granice je 3px i ne smije biti veći**: ćelija se cijela iscrtava
iznad ranije iscrtanih susjeda (DOM red), pa bi dulji segment prekrio susjedovu
znamenku. Na 3px dohvati samo njegov rub, a znamenka je centrirana.

#### Dijagonalni prijelaz (v1.30.1)

Vatrina zamjerka: "linije imaju prekid kad prelaze u druge ćelije dijagonalno".
Polovice segmenata rade samo za ORTOGONALNI korak, gdje susjedi dijele cijeli brid.
Dijagonalne ćelije dodiruju se **samo u točki**, pa tik uz kut bokovi pilule nužno
prelaze u dvije ćelije SA STRANE - a barem jedna od njih crta se kasnije i pojede ih
svojom neprozirnom pozadinom. Izmjereno hit-testom po osi tube: **11px → 7px** (uštip
36%). Ortogonalni korak drži 11px i preko debele granice bloka, pa problem nije u
duljini ni u razmacima.

Krpaju **dvije ćelije sa strane** - one s druge dijagonale kvadrata 2×2, kroz koje
tuba ne prolazi. Svaka nacrta svoj komad tube obrezan na vlastitu ćeliju
(`span.thermo-clip`, `overflow: hidden`). Dvije stvari koje nisu očite:

1. **A i B ne trebaju krpu.** Kutije ćelija se ne preklapaju, pa segment unutar
   VLASTITE ćelije nitko ne pojede - jedu se samo bokovi koji su izašli van.
2. **Obrez nije kozmetika nego uvjet.** Neobrezana krpa dosegne ~9.6px od kuta i
   prekrije susjedovu kutnu bilješku (znamenka je centrirana i ostaje čista, ali
   bilješke idu u 3×3 rešetku po ćeliji). Obrezana ne može izaći iz svoje ćelije, a
   `z-index: -1` je drži ispod vlastite znamenke i bilješki.

**Sidro je središte križa razmaka (kut ± pola razmaka), ne kut same ćelije.** Kutovi
četiriju ćelija razmaknuti su za razmak (3px na granici bloka), pa pilula usidrena na
vlastiti kut legne pokraj osi tube - prvi pokušaj je uštip zamijenio **podebljanjem na
15px**, jednako vidljivim. Razmak (`--gx`/`--gy`, 1px ili 3px) čita se iz istog pravila
koje ćeliji daje `.br`/`.bb`, pa vrijedi i za jigsaw granice.

Mjereno nakon fixa (svih 5 dijagonalnih koraka): **11.25-12.5px** uz ortogonalnu
kontrolu 10.75-11px. Ostatak odstupanja (~1px) je postojeći dug per-ćelija pristupa -
`.br`/`.bb` margine čine ćelije ne-kvadratnima pa polovice segmenata ni na ortogonalnom
koraku nisu savršeno kolinearne. Ortogonalni koraci mjere identično s krpama i bez njih.

Palindrome je tu mašineriju i naslijedio (v1.32.0) - i uštip i lijek, bez ijedne nove
render zamke.

#### Spoj u središtu ćelije (v1.30.2)

Kut je bio popravljen, a Vatra je javio "i dalje je problem". Bio je u pravu i uzrok je
bio **drugdje nego što je prva dijagnoza tvrdila**: ne na granici ćelija nego u njihovom
SREDIŠTU. Segmenti kreću iz središta, a zaobljeni vrh pilule tamo dolazi u **točku** -
pa se tuba stanji na svakom vrhu puta:

| slučaj                    | spoj pokriven | širina u središtu (nominalno 10.75px) |
| ------------------------- | ------------- | ------------------------------------- |
| kraj tube (zadnja ćelija) | 42%           | **0.00** (šiljak umjesto kraja)       |
| ravni prolaz              | 58%           | 6.25                                  |
| skretanje (lakat)         | 56-87%        | 7.50-13.00                            |
| kuglica                   | 100%          | uredno                                |

Kuglica je jedina bila čista - 58% je šire od tube pa je spoj pokrivala slučajno. Lijek
je `span.thermo-joint`: disk promjera tube u središtu svake ćelije koja nije kuglica.
To je točno ono što SVG dobije besplatno s `round` linejoinom i linecapom. Poslije:
**svi spojevi 100%**, kraj tube 11.00px.

**Zašto prva dijagnoza nije uhvatila ovo**: mjerilo se hit-testom oko SREDIŠTA GRANICE
između dvije ćelije (±10px), a središta ćelija su ~20px dalje - sonda ih nikad nije
dotakla. Uštip na kutu (11 → 7px) bio je stvaran i popravak stoji, ali nije bio ono
najvidljivije. Druga zamka: hit-test nad glifom znamenke vraća `.cell`, ne pilulu ispod
nje (tekst je inline sadržaj ćelije), pa je prvo mjerenje spojeva lažno prijavilo 0% za
svaku ćeliju sa znamenkom. Mjeriti tubu tek nakon što se znamenke maknu iz DOM-a.

## Palindrome (v1.32.0)

Druga varijanta koju je doc krivo svrstao u "geometrija-first" (prva je Thermo) - i
opet iz istog razloga: doc pretpostavlja `setup()` koji složi liniju PRIJE rješenja.
Derive pipeline ide obrnuto pa je i ovdje generator ostao netaknut.

**Razlika prema Thermo je SMJER rasta.** Termometar je šetnja s jednog kraja (svaki
korak gleda samo prethodnika), a palindromski uvjet veže parove s OBA kraja - pa
`derivePalindromes` raste **iz sredine prema van, u parovima**: nađi susjeda lijevog i
susjeda desnog kraja koji nose istu vrijednost u rješenju, dodaj oba. Svaki dodani par
je jednak po konstrukciji, pa nemoguća linija ne može nastati.

Samo **neparne duljine** (3/5/7): sredina je slobodna ćelija i sjeme je bilo koja
ćelija. Parna linija bi tražila sjeme od dva susjeda jednake vrijednosti - dodatan
slučaj za raspon koji neparne već pokrivaju.

Cijeli odnos ćelije staje u **jedan broj** - indeks zrcalnog partnera (`prepPalindromes`
vraća 81-polje, -1 gdje partnera nema). Za razliku od tube, gdje raspon ovisi o poziciji
i duljini cijelog puta, palindrom kaže samo "ove dvije ćelije su jednake" - ni `isValid`
ni solver ne trebaju put, samo partnera.

**Solverova snaga je u presjeku, ne u upisu.** Kod Thermo/Kropki oznaka radi tek kad je
susjed popunjen; ovdje dvije PRAZNE zrcalne ćelije smiju zadržati samo ono što obje
dopuštaju. Presjek stvarno reže jer par nužno leži u različitim redovima/stupcima/
kutijama (inače ne bi mogao biti jednak). Ide u `computeCandidates` nakon što su svi
skupovi izračunati; `place` uz to fiksira partnera pri upisu. Zasebne tehnike nema
(kao Kropki/XV/Thermo, klasične dovrše).

Najjeftinija varijanta dosad: **Hard prosjek 8ms, max 26ms** (Thermo 40ms, XV je znao
23s prije floora). Kombinacije: +Thermo 152ms, +Jigsaw 348ms, ostale ispod 35ms.

`STRENGTH: 10` (dno raspona 18 zadanih) izmjeren je probom u oba smjera: sa `STRENGTH:
20` (dno 8) generacija skoči na **2.6s prosjek / 13.5s max**, a ploče svejedno ne padnu
ispod 20 zadanih - dno je nedostižno i samo se troše pokušaji.

**Prune floor `PALINDROME_KEEP_MIN = 4`** iz istog razloga kao Thermo, i s istim
nalazom: bez granice je **17/30 Hard ploča** spušteno na 3 linije (prune na vrhu raspona
ispravno zaključi da je skoro svaka linija suvišna). S granicom: 4-8 linija, 17-36
ćelija - isti red veličine kao Thermo (4-8 tuba, 12-29 ćelija).

**Render je preuzet, ne napisan.** Thermo mašinerija (polovica segmenta po ćeliji,
krpa dijagonalnog kuta, disk u središtu) generalizirana je u `.line-seg` / `.line-joint`
/ `.line-clip` uz klasu vrste (`.thermo` / `.pal`) koja nosi samo boju; `.thermo-bulb`
je ostao Thermo-specifičan jer palindrom nema smjer pa ni kuglicu. Boja je jedina
stvarna razlika (`--palindrome`, isti ton svjetline kao `--thermo`) - kombinacija
Thermo+Palindrome se mora čitati na prvi pogled. Generator ne pušta dvije linije kroz
istu ćeliju (`derivePalindromes` prima `blocked` s ćelijama tuba): render crta segmente
PO ĆELIJI pa bi preklop bio i nečitljiv i dvosmislen - izmjereno 0 preklopa u 6 partija.

Regresija: 26 ploča (13 kombinacija × 2 težine, zasijan RNG) **bajt-identično** prije i
poslije - jedina razlika je novo prazno `palindromes: null` polje u `clues`. Hint je
odvojeno provjeren: 10/10 ploča (`palindrome`, `palindrome+thermo`) riješeno do kraja
samim hintovima, nula krivih prijedloga.

**Render je prošao iz prve** (Vatra odigrao partiju) - kod Thermo je isti render trebao
tri runde popravaka (kut, spoj u središtu). Potvrda da je generalizacija u `.line-*`
klase bila cijeli posao: naslijeđen je i dotjeran render, ne samo njegov oblik.

## Clone (v1.33.0)

Dvije regije istog oblika nose iste znamenke u odgovarajućim ćelijama. Treća varijanta
koju je doc svrstao u "geometrija-first" i treći put iz istog razloga u krivu.

**Nije dodao nijednu novu granu u jezgru.** Palindrome je pokazao da cijeli odnos
ćelije staje u jedan broj (indeks partnera koji mora nositi istu vrijednost); klon je
točno taj isti odnos, samo iz drugog izvora. Zato je izvedeni `pal` postao `mate`,
koji pune obje varijante, a `isValid`/`computeCandidates`/`place` nisu ni dirani -
dobili su samo više parova. Isti potez kao XV nad Kropkijem ("generalizacija, ne novi
kanal"): Clone je tako **najjeftiniji dodatak dosad po retku koda u jezgri**.

Jedan partner po ćeliji je dovoljan jer generator ne pušta dvije oznake kroz istu
ćeliju. Da se ipak sudare, klon bi pregazio palindrom - solver bi bio slabiji, nikad
krivi (obje relacije vrijede u rješenju, ispuštena znači samo nepotrošen trag).

**Kopija je čista translacija**, bez rotacije i zrcaljenja: igrač mora na prvi pogled
znati koja ćelija odgovara kojoj, a to nosi isti oblik u istoj orijentaciji. Regija
raste iz sjemena ORTOGONALNO (mrlja, ne put - dijagonalni korak bi bio još jedna
dvosmislenost), 3-6 ćelija; ćelija ulazi samo ako i ona i njena kopija stoje slobodne i
nose istu vrijednost u rješenju. Oba pomaka moraju biti različita od nule (ćelije istog
reda ne mogu nositi istu vrijednost); ostalo se ne filtrira - traži se jednakost U
RJEŠENJU pa nemoguć par jednostavno ne prođe. Svaki par dobiva svoj pomak, inače se dva
para čitaju kao jedna razlomljena regija.

Izmjereno (Hard): **prosjek 18ms, max 56ms**, 18-28 zadanih, 1-4 para (6-28 ćelija).
`STRENGTH: 10` (dno 18) je provjeren u oba smjera - sa 14 i 18 ploče svejedno ne padnu
ispod 18 zadanih, a s 18 generacija poskoči (max 446ms). Dno je točno na zidu.

### Redoslijed izvođenja: klon PRVI (11× jeftinije)

Prva verzija je klon izvela zadnjim, po uzoru na Palindrome (koji zaobilazi ćelije
tuba). Ispalo je da je redoslijed bitan i da je taj krivi:

| clone+thermo  | prosjek  | max     | parova |
| ------------- | -------- | ------- | ------ |
| klon zadnji   | 5521ms   | 15425   | 1-3    |
| **klon prvi** | **65ms** | **302** | 2-4    |

Klon je od svih oznaka NAJVEZANIJI: mrlja mora naći podudarne vrijednosti na točnom
pomaku, dok tuba i linija biraju bilo kojeg slobodnog susjeda. Kad tuba prva pojede
ploču, klonu ostane pola para regija - a `floorFor` mu svejedno pripisuje punu snagu
(10), pa `dig` gura ploču ispod dna koje ta kombinacija može podnijeti. To je isti
mehanizam koji je XV-u prije floora dizao generaciju na 23s, samo skriven u redoslijedu
umjesto u konstanti. **Pravilo za iduću oznaku koja zauzima ćeliju: prva ide ona koja
ima najmanje slobode, ne ona koja je zadnja dodana.** `deriveThermos` je zato dobio
`blocked` parametar (dotad ga je imao samo Palindrome).

### Prune floor je ispao NIŽI, ne nepostojeći

Thermo i Palindrome su oba trebali donju granicu (`THERMO_KEEP_MIN`,
`PALINDROME_KEEP_MIN`) jer prune na vrhu raspona pojede skoro sve oznake. Kod klona je
izmjereno **1/30 ploča** palo na jedan par (Thermo 12/30 na ≤2 tube, Palindrome 17/30 na
3 linije), pa je knob u v1.33.0 izostavljen. Dva razloga i dalje stoje:

1. **Jedinica je grublja** - micanje para skida 3-6 jednakosti odjednom, pa ploča obično
   stane i prune ga vrati.
2. **Jedan par nije greška.** Usamljen termometar se čita kao propust, ali klon je po
   definiciji "nešto i njegova kopija" - dvije obojane regije su minimalna ISPRAVNA
   slika varijante.

Ono što NIJE stajalo je zaključak "na nulu ne može pasti". Vrijedi samo za klon SAM;
u kombinaciji ploču nosi ona druga varijanta pa se `stoji()` ne zaustavi ni na zadnjem
paru - Diagonal+Clone isporučio **4/20** Hard ploča bez ijedne obojane regije. Ispravljeno
u v1.33.1 dnom od 1 para (vidi sekciju niže).

### Render: prva oznaka bez geometrije

Suprotno od Thermo/Palindromea, gdje je render bio cijeli posao (tri runde popravaka za
kut, spoj u središtu, krpe). Klon nema što crtati po ćeliji - ćelija je ili u klonu ili
nije - pa je render **ispuna cijele ćelije** (`span.clone-fill`, `z-index: -1`, isti
sloj kao parity i linije). Translucentna je namjerno: odabir i peer-highlight ispod nje
moraju ostati vidljivi.

Par se čita po BOJI (obje regije para nose istu), a koja ćelija odgovara kojoj po
obliku. Zato su tinte 4 različita TONA, ne nijanse istog - dva para iste boje čitala bi
se kao jedan klon. `CLONE_TINTS` u `app.js` mora pratiti `MAX_CLONES` u `sudoku.js`.
Tonovi su namjerno drugi od `--window-tint` zbog kombinacije Hyper + Clone.

Ispuna se NE skriva na zadanim ćelijama (za razliku od parity oznake): zadana znamenka u
klonu i dalje određuje partnera, pa je oznaka tamo nosiva informacija, ne ponavljanje.

**Render je prošao iz prve** (Vatra odigrao partiju), i to bez ijedne provjere okom
tijekom izrade - browser pane u toj sesiji nije radio (screenshotovi timeoutali, klikovi
na overlay se nisu registrirali), pa je jedini oslonac bio da sloj i mehanizam ispune
odgovaraju već dokazanom obrascu (`.cell.colored::after`). Prošlo je jer klon nema
geometriju: Thermo je trebao tri runde popravaka na stvarima koje se vide tek na ploči
(kut, spoj u središtu), a ispuna ćelije nema nijedan takav spoj.

**Naslijeđen obrazac je ovdje vrijedio više nego kod Palindromea** (koji je isto prošao
iz prve, ali uz render koji se dao pogledati). Pouka za iduću oznaku: kad se render
svede na postojeći sloj i ništa se ne crta preko granica ćelije, nedostatak vizualne
provjere je podnošljiv rizik. Za sve što prelazi granicu ćelije - nije.

> **Ispravljeno u v1.36.0.** Ta granica je bila postavljena na krivom mjestu. German
> Whispers crta segmente PREKO granica ćelija, shipan je bez vizualne provjere (browser
> pane nije radio) i prošao je iz prve. Prava razlika nije _što_ se crta nego **je li
> kôd koji to crta nov ili naslijeđen**: Thermo je jedini render koji je trebao tri
> runde popravaka (kut, spoj u središtu, krpe) i jedini je tu mašineriju PISAO.
> Palindrome, Clone i Whisper su je naslijedili i sva tri su prošla iz prve.
> Nova formulacija: **nedostatak vizualne provjere je podnošljiv kad se render svodi na
> već dokazan kôd, bez obzira prelazi li granicu ćelije. Za novu render mašineriju -
> nije.** Ono što u naslijeđenom slučaju ipak treba provjeriti okom je dio koji NIJE
> naslijeđen (kod Whispera boja `--whisper`, jedina stvar koju mjerenje ne hvata).

### Provjere

- **Regresija**: 26 ploča (13 kombinacija × 2 težine, zasijan RNG) **bajt-identično**
  prije i poslije - jedina razlika je novo prazno `clones: null` polje. Redoslijed
  izvođenja je preslagan, ali za kombinacije bez klona lanac poziva ostaje isti.
- **Generator**: na svakoj ploči provjereno da klon vrijedi u rješenju, da je kopija
  stvarno translacija i da se regije para ne preklapaju (sve kombinacije, obje težine).
- **Hint**: 10/10 Clone Hard ploča riješeno samim hintovima, **nula krivih prijedloga**
  (isto na Normalu; u kombinacijama 8-10/10, gdje zastoji dolaze od eliminacijskih
  koraka koje mjerni harness ne primjenjuje - shipane kombinacije poput thermo+palindrome
  i kropki+xv daju 6/10 na istom harnessu).

## Killer (v1.34.0)

Kavez je mrlja ćelija sa zadanim zbrojem, unutar koje se znamenka ne ponavlja. Četvrta
i zadnja varijanta koju je doc svrstao u "geometrija-first" - i četvrti put u krivu iz
istog razloga (vidi gore).

**Casual izvedba, kao Kropki/XV** (Vatrin izbor nakon usporedbe dviju ploča): kavezi
pokrivaju dio ploče uz zadane brojeve, umjesto strict Killera gdje kavezi pokrivaju
svih 81 ćeliju i nema nijednog zadanog broja. Strict nije stvar gustoće nego druge
igre: ploča bez zadanih brojeva nema što `dig` kopati, a `dig` je mehanizam kojim se
težina ovdje uopće određuje - `STRENGTH`, `floorFor` i cijeli raspon zadanih na Hardu
mjere se u zadanim brojevima. Uz to bi kombinacije izgubile smisao (Killer + Jigsaw =
ploča bez ijednog broja s dvije nepoznate geometrije).

**Gustoća je zato knob, i namjerno visok** (`CAGE_DENSITY` 0.55-0.75 pokrivenih ćelija,
mjereno u ćelijama a ne u broju kaveza). Killer je jedina varijanta koju igrači
prepoznaju po tome što kavezi pokrivaju ploču - pet kaveza razbacanih uokolo formalno
jest Killer, ali se ne čita kao Killer.

Izmjereno (Hard, 25 ploča po kombinaciji): **prosjek 41ms, max 399ms** sam; kombinacije
30-102ms prosjek uz rep do 1.3s (najskuplja killer+thermo). 15-28 zadanih, 9-18 kaveza,
**38-53 pokrivene ćelije**.

### Zbroj se izvodi, geometrija se ne postavlja

`deriveCages` je `deriveClones` bez dijela s pomakom: mrlja raste ortogonalno iz
sjemena, ćelija ulazi ako je slobodna i **njena vrijednost još nije u kavezu**, a zbroj
se zbroji iz rješenja kad mrlja stane. Nemoguć kavez tako ne može nastati i generator
je ostao netaknut.

`cageRange(board, cells, sum, idx)` je jezgra koju dijele `sudoku.js` i `solver.js` (kao
`thermoRange` i `edgeOk`). Preostali zbroj dijeli se između ove ćelije i k ostalih
praznih; znamenke su različite pa tih k nose barem 1+2+…+k a najviše 9+8+…, i iz toga
slijedi raspon za nas. Granica je namjerno **gruba** - ne gleda koje su znamenke
potrošene, samo koliko ih je. Točan skup tražio bi kombinatoriku po kavezu, a
ponavljanje ionako hvata zasebna provjera.

Zasebne tehnike nema (kao Kropki/XV/Thermo/Palindrome) - kavez steže kandidate u
`computeCandidates` i `place`, klasične dovrše. `place` propagira na **cijeli** kavez:
upis potroši i vrijednost i dio zbroja, pa udaljena ćelija dobije uži raspon odmah.

**Kavez ide ZADNJI u derive nizu** (klon → tuba → linija → kavez), suprotno od Clonea
koji ide prvi. Isto pravilo, drugi kraj: prva ide oznaka s najmanje slobode. Klonu
treba podudarnost na točnom pomaku, tubi i liniji odnos sa susjedom, a kavezu samo da
se vrijednost ne ponovi - to nađe u ostatku ploče.

### Prune floor je u ćelijama, ne u kavezima

Bez granice prune spusti ploču na **jedan kavez (2-4 ćelije)** - isti nalaz kao Thermo
(12/30 na ≤2 tube) i Palindrome (17/30 na 3 linije), jer na vrhu Hard raspona klasika
nosi ploču gotovo cijelu. Granica je zato nužna, ali je mjerena u **pokrivenim
ćelijama** (`CAGE_KEEP_CELLS`), ne u broju kaveza: kavez od 2 i kavez od 5 ne nose
isto, a ono što se čita kao Killer je pokrivenost.

Izmjereno po granici (Hard): 30 → 30-38 ćelija, 40 → 40-46, 45 → 45-46. Granica ne
košta brzinu - prune s njom staje ranije, dakle zove solver manje puta.

**Granica je RASPON (38-52), ne jedna vrijednost.** Vatrino pitanje ("zašto nije random
u rasponu?") otkrilo je da fiksno dno tiho poništava nasumičnost koja već postoji:
`CAGE_DENSITY` izvede 45-61 ćeliju, ali prune je svaku ploču svodio na isto dno, pa su
sve izlazile jednako guste (izmjereno 40-45 kad je Killer sam, 40-41 u kombinacijama -
bez obzira odakle je ploča krenula). S rasponom: **38-53 ćelije u svim kombinacijama**.
Kad dno ispadne više od izvedenog, prune kaveze ne dira pa gusta ploča ostane gusta.

Dvije stvari koje to nosi:

1. **`Math.random()` samo kad kaveza ima.** Inače pomakne RNG niz i pločama BEZ Killera,
   pa ista sjemenka prestane davati istu ploču - regresija to uhvati odmah.
2. **`KEEP_MIN.killer` ostaje `CAGE_KEEP_CELLS.min`, ne raspon.** `marksThin` njime
   odbacuje pokušaj još u generaciji, dakle prije nego se za tu ploču izvuče dno prunea;
   apsolutno dno mora biti ono najniže moguće, inače bi odbacivao ploče koje bi prune
   ionako prihvatio.

`STRENGTH: 16` (dno 12) izmjeren je u oba smjera: 8, 12, 16 i 20 daju ploče koje
svejedno ne padnu ispod ~13 zadanih - **zid je oko 13-15, dno je nedostižno** (isto kao
Palindrome), a 20 je samo sporiji bez ijedne ploče niže.

Izbor 16 nad 10 je **svjesna razmjena, ne besplatan dobitak** (30 ploča po vrijednosti):

| STRENGTH | killer sam    | +clone        | +thermo      | zadanih (sam) |
| -------- | ------------- | ------------- | ------------ | ------------- |
| 10       | 7ms (max 21)  | 10ms (max 53) | 98ms (1.3s)  | 18-27         |
| **16**   | 15ms (max 58) | 130ms (1.6s)  | 141ms (2.7s) | **15-28**     |

Uzeto 16 jer ploče s malo zadanih su ono što Killer čini Killerom (tamo kavezi nose
rješenje, a ne dekoriraju ga) - a rep od 2.7s je i dalje daleko ispod hypera (10.6s),
koji je u ovom repou već prihvaćen kao dug uz Cancel i worker.

### Render: prva oznaka koja piše TEKST u ćeliju

Obrub kaveza je lakši dio - ništa se ne crta preko granice ćelije (za razliku od
tuba), svaka ćelija pita samo "je li mi susjed u istom kavezu" i crta strane koje to
nisu. Ali dvije stvari nisu bile očite, i obje je našlo **mjerenje, ne oko** (browser
pane je i u ovoj sesiji bio polovičan - screenshotovi timeoutaju, klikovi ne prolaze,
ali `getBoundingClientRect` radi):

1. **Spoj preko granice bloka.** Okvir je izvan ćelije (`inset: -2px`) baš zato da se na
   strani sa susjedom produži preko razmaka i spoji sa susjedovim. Na -1px su spojevi
   preko granice bloka ostajali s 1px rupom - **3 od 32 spoja** na jednoj ploči, i to
   samo vertikalni. Razmak nije uniforman (1px među ćelijama, 3px na `.br`/`.bb`), pa
   inset mora biti veći od polovice najšireg. Poslije: 32/32 spoja s preklopom 1-3px.
2. **Zbroj i kutna bilješka bore se za isti kut.** `.notes` je 3×3 rešetka i mjesto 1 je
   gore lijevo - točno gdje ide zbroj. Rešetka se zato u toj ćeliji spusti (34%) **i**
   smanji: sam pomak ne stane na ~37px ćeliji (mobitel), gdje tri reda u preostaloj
   visini ispadnu niža od vlastitog fonta pa bi se redovi preklopili međusobno umjesto
   sa zbrojem. Izmjereno poslije: 0 preklopa i 0 preklopa među bilješkama na 375px i
   900px širini.

Uz to: zbroj počinje na 4px jer obrub stoji na 3px - broj koji presijeca vlastitu
liniju kaveza čita se kao greška u crtežu. I namjerno je **sitniji od bilješke** (10px
prema 12px): na istoj veličini se čitao kao još jedna bilješka.

### Usput nađen zatečen bug: prune je znao pojesti varijantu do nule

Killer ga nije uveo, ali ga je učinio čestim. Prune makne svaku oznaku bez koje ploča
stane - a kad je JEDNA varijanta dovoljno jaka da nosi ploču sama, sve oznake one druge
ispadnu suvišne. Ploča onda u naslovu piše "Clone + Killer" a nema nijednog klona.

Izmjereno (Hard, 20 ploča po kombinaciji):

| kombinacija         | bez druge varijante |
| ------------------- | ------------------- |
| clone+thermo (HEAD) | 1/20 (zatečeno)     |
| clone+killer        | **6/20**            |
| kropki+killer       | **2/20**            |

Thermo i Palindrome to nikad nisu pokazali jer imaju svoj `KEEP_MIN`. Popravak je ista
zaštita za one koji ga nemaju, samo na najnižoj granici: **nijedna aktivna varijanta ne
smije ostati bez ijedne oznake**. Kropki i XV se broje odvojeno iako dijele `edges` -
to su dvije varijante, ne jedna. Poslije: 0/40 praznih u svim provjerenim kombinacijama,
a regresija ostaje bajt-identična (popravak dira samo rubne slučajeve).

Isti bug je paralelno nađen s druge strane (Vatrina prijavljena ploča) i tamo dignut s
"barem 1 oznaka" na **vidljivo dno po varijanti** - vidi v1.34.1 niže. Granica od 1 je
bila ispravna dijagnoza, ali premala mjera: ploča s jednom oznakom parnosti formalno
JEST Even/Odd, a i dalje se ne čita kao Even/Odd.

### Provjere

- **Regresija**: 30 ploča (15 kombinacija × 2 težine, zasijan RNG) **bajt-identično**
  prije i poslije - jedina razlika je novo prazno `cages: null` polje.
- **Generator**: na svakoj ploči provjereno da je svaki kavez ortogonalno povezan, bez
  ponovljene znamenke, sa zbrojem koji odgovara rješenju, i bez preklopa s drugim
  kavezom (sve kombinacije, obje težine).
- **Hint**: **nula krivih prijedloga** u svim kombinacijama. Riješeno samim hintovima:
  Killer Normal 10/10, Hard 8/10, +thermo 9/10, +clone 8/10, +kropki 5/10 - zastoji su
  eliminacijski koraci koje mjerni harness ne primjenjuje (shipane kombinacije poput
  kropki+xv daju 6/10 na istom harnessu).

## Odabrana varijanta se MORA VIDJETI, ne samo postojati (v1.34.1)

Nastavak prethodne sekcije, nađen s druge strane: Vatra je prijavio Hard ploču
"Diagonal + Even/Odd" **bez ijedne oznake parnosti**, 2-3 partije za redom (u metrikama
vidljivo kao započeta pa odmah promijenjena partija). Ista dva uzroka:

1. `variantNeeded` provjerava **SKUP** varijanti, ne svaku pojedinu. Ploču na kojoj sav
   posao radi Diagonal, a Even/Odd ne radi ništa, kriterij `countSolutions(bez varijanti)
   > 1` uredno propusti - klasika je stvarno ne rješava.
2. `pruneMarks` onda ispravno zaključi da je suvišna **svaka** oznaka parnosti.

Solo varijanta na nulu ne može (`variantNeeded` jamči da barem jedna oznaka nosi
rješenje) - rupa je **isključivo u kombinacijama**, i tim češća što je druga varijanta
jača. Izmjereno na 20 Hard ploča po kombinaciji, prije popravka:

| Kombinacija         | Ploča bez ijedne oznake |
| ------------------- | ----------------------- |
| Antiknight+Even/Odd | 5/20                    |
| Diagonal+Clone      | 4/20                    |
| Diagonal+Kropki     | 3/20                    |
| Hyper+Even/Odd      | 2/20                    |
| Diagonal+Even/Odd   | 1/20                    |
| Diagonal+XV         | 1/20                    |

**Popravak diže granicu s 1 na vidljivo dno: `KEEP_MIN`**, jedno mjesto za svih sedam
oznakovnih varijanti (Even/Odd 6, Kropki 6, XV 5, Thermo/Palindrome 4 = postojeći
`*_KEEP_MIN`, Clone 1, Killer `CAGE_KEEP_CELLS`). Uz to:

- **Dno vrijedi na oba kraja.** Prune ispod njega ne reže (`mayDrop` gleda živi broj
  oznaka), a izvod koji ga ne dosegne odbacuje pokušaj (`marksThin`, prije `dig`-a jer
  je dig najskuplji korak). Krajnji fallback ima izlaz nakon `FALLBACK_TRIES` - ploča
  sa slabom oznakom pobjeđuje nikakvu ploču.
- **Kod brida se dno gleda po TIPU oznake** (1-2 Kropki, 3-4 XV) jer dijele `edges`.
- **Killer je jedini mjeren u ćelijama, ne u oznakama**, pa mu `left` pada za cijeli
  kavez i provjera je "ostaje li iznad dna NAKON ovog kaveza" (naslijeđeno iz v1.34.0).

Poslije popravka: **0/20 na svih mjerenih kombinacija**, obje težine. Brzina generacije
nemjerljivo promijenjena (clone+thermo, najteži par, prije avg 1974ms / max 21.8s →
poslije 771ms / max 6.1s - isti red veličine, razlika je šum tog para).

**Svjesno NIJE riješeno: nužnost po varijanti.** Ploča i dalje smije imati oznake koje
su čista dekoracija - garantira se da se varijanta **vidi**, ne da radi. Necessity po
varijanti tražila bi `countSolutions` po svakoj varijanti u svakom pokušaju i odbacivala
većinu ploča; vidljivost je ono što je igraču nedostajalo. Ako se ikad pokaže da
dekorativne oznake smetaju - to je sljedeći korak, ne ovaj.

## Disjoint Groups (v1.35.0)

Ćelije na istoj poziciji unutar svoje kutije (svih 9 gornjih-lijevih uglova, svih 9
sredina...) čine jedinicu - 9 dodatnih units. Prva varijanta odabrana izvan originalne
wish-liste; kandidati su popisani u [dorada-varijante.md](dorada-varijante.md).

**Najjeftiniji dodatak dosad, i to u svakoj dimenziji.** Clone je držao rekord po
retku koda u jezgri (naslijedio je `mate` polje od Palindromea); Disjoint je ispod
toga jer ne nosi **nikakav** per-puzzle podatak: geometrija je statična kao hyper
prozori, pa nema `derive*`, nema polja u `clues`, nema `KEEP_MIN`, nema prunea, nema
migracije spremljenih partija. Cijela varijanta je 9 units u `EXTRA_UNITS` + jedna
grana u `isValid` + jedan redak u peer-highlightu.

Izmjereno (Hard, 20-25 ploča): **prosjek 9ms, max 35ms** sam - najbrža varijanta u
repou (Palindrome 8ms je bio prethodni, ali uz 26ms max). Kombinacije 15-322ms
prosjek, najgori rep 2.1s (disjoint+killer). Normal je 3ms.

### `STRENGTH: 8` je odabran zbog KOMBINACIJA, ne zbog solo ploče

Prvo mjerenje je reklo da je dno prenisko: sa `STRENGTH: 8` (dno 20) ploče doista
staju na 20 zadanih, a sa 14 idu do 18 i sa 20 do 17. Po dosadašnjem pravilu ("izmjereni
minimum oduzet od 28") ispalo bi ~11, a po Killerovom argumentu ("ploče s malo zadanih
su ono što varijantu čini varijantom") i više.

**Oba bi bila kriva, jer solo mjerenje ovdje ne vidi cijenu.** Dno se zbraja po
kombinaciji (`floorFor`), pa svaka točka `STRENGTH`-a gura i svaku kombinaciju dublje:

| STRENGTH | disjoint sam    | +thermo          | +clone           |
| -------- | --------------- | ---------------- | ---------------- |
| 14       | 49ms (18-28)    | **4360ms (63s)** | -                |
| 10       | 43ms (19-27)    | 815ms (5.9s)     | **3419ms (36s)** |
| **8**    | **9ms (20-28)** | 322ms (5.9s)     | 241ms (1.6s)     |

Zatečeno najgore je clone+thermo (izmjereno 1511ms avg / 14.3s max na istom harnessu),
pa je 63s bilo daleko izvan svega prihvaćenog. Sa 8 su sve kombinacije u sekundi-dvije,
a solo raspon (20-28) je isti kao hyperov - što je i očekivano, obje su unit-varijante
sličnog obuhvata.

**Pouka za iduću regijsku varijantu: STRENGTH mjeriti na KOMBINACIJAMA, ne na solo
ploči.** Kod oznakovnih varijanti solo mjerenje je bilo dovoljno jer one nose vlastite
oznake; regijska varijanta nema što donijeti kombinaciji osim dubljeg dna.

Usput opovrgnuta hipoteza: pretpostavio sam da disjoint+clone koči zato što klon par
nosi ISTU vrijednost, a disjoint istu vrijednost zabranjuje na istoj poziciji u kutiji
(pa se prostor parova sužava). Palindrome ima točno isti odnos jednakosti i mjeri
**11ms** - hipoteza pala, uzrok je bio isključivo predubok `dig`.

### Bez trajne dekoracije, kao Antiknight

Prva namjera je bila obojati 9 grupa tintama, po uzoru na Hyper prozore. Odbačeno kad
se pogledalo s čim bi dijelile ploču: 4 hyper prozora, 4 Clone tona, 9 korisničkih boja
za bojanje ćelija i parity oznake. Devet trajnih tinti ne bi se dalo razlikovati ni od
čega od toga.

Presedan je **Antiknight/Antiking** (v1.16.0/v1.19.0): varijanta koja mijenja PRAVILO,
a ne nosi oznaku, vidi se kroz peer-highlight. Kod disjointa je čitljivija nego kod
njih - grupa je pravilna rešetka koraka 3, pa odabir ćelije odmah pokaže uzorak.
`markCount` ga zato ne broji (vraća null, kao ostale regijske) i `KEEP_MIN` ga se ne
tiče - nema oznake koja bi mogla nestati.

**Potvrđeno igranjem** (Vatra odigrao partiju, v1.35.0): pravilo se čita s ploče bez
ijedne trajne oznake, dodatna vizualna pomoć nije zatrebala. Time je zatvoren jedini
otvoreni rizik ove varijante - odluka o izostanku tinte bila je do tada procjena, ne
mjerenje (browser pane u toj sesiji nije radio, vidi Provjere niže).

**Time se izostanak dekoracije pretvara iz iznimke u pravilo.** Antiknight i Antiking
su prošli isto, ali su oba "potez figure" - obrazac koji igrač šahovski prepoznaje.
Disjoint nije, pa je bio pravi test tvrdnje: **varijanta koja mijenja pravilo, a ne
nosi per-puzzle podatak, ne treba trajnu dekoraciju** - peer-highlight je dovoljan.
To je i granica: čim varijanta nosi oznaku IZVEDENU iz rješenja, oznaka se mora
vidjeti (v1.34.1, `KEEP_MIN`), jer je tamo highlight ne može nadomjestiti.

### Jedina nespojiva kombinacija u repou: Jigsaw

Jigsaw ZAMJENJUJE kutije nepravilnim regijama, a disjoint je definiran kao "ista
pozicija UNUTAR kutije" - bez kutija pozicija ne postoji. Jezgra bi svejedno vrtjela
(disjoint gleda statične pozicije bez obzira na regije), ali ploča bi nosila dvije
geometrije koje se ne poklapaju.

`INCOMPATIBLE` u `app.js` je zato prvi takav par: zatamni nespojiv redak u meniju, a
`randomVariants` izbacuje nespojive iz poola pri izboru (inače random ponudi ono što
meni ne da ručno složiti). Cap je UI, kao `MAX_VARIANTS` - jezgra i dalje podržava
bilo koju kombinaciju.

### Provjere

- **Regresija**: 34 ploče (17 kombinacija × 2 težine, zasijan RNG) **bajt-identično**
  prije i poslije. Nema ni novog praznog polja u `clues` - za razliku od svih
  derivacijskih varijanti, koje su ga svaka dodale (`palindromes: null`, `clones: null`,
  `cages: null`). _(Ponovno provjereno pri izradi Whispera, nakon što je nađen isti
  harness bug opisan niže - usporedba je isprva pokrivala samo puzzle/solution, ne i
  oznake. S ispravljenim harnessom tvrdnja stoji.)_
- **Hint**: **nula krivih prijedloga** u svim mjerenim kombinacijama (Hard i Normal).
  Riješeno samim hintovima (Hard): disjoint 10/10, +x 10/10, +clone 9/10, +thermo 8/10,
  +killer i +evenodd 6/10; Normal 10/10.
  - **Ispravak brojki iz v1.35.0.** Prvo mjerenje je prijavljivalo 0-2/10 za skoro sve
    (i za zatečene kombinacije) i to je pripisano harnessu koji "ne primjenjuje
    eliminacijske korake". Uzrok je bio **bug u harnessu**: oznake žive u `r.clues`, a
    harness ih je čitao s vrha rezultata, pa je solveru pri svakom hintu predavao
    PRAZAN clues - rješavao je ploču bez oznaka i naravno zapinjao. Ispravljeno mjerenje
    daje 6-10/10, a zatečene kombinacije 6-10/10 (killer sam 6/10, clone sam 10/10,
    kropki+xv 7/10) umjesto nekadašnjih 0/10. Tvrdnja "nula krivih prijedloga" je
    preživjela ispravak - prijedlozi se provjeravaju protiv rješenja, pa ih slabiji
    solver čini rjeđima, nikad krivima.
- **UI logika**: browser pane u ovoj sesiji nije registrirao klikove na meni overlay
  (screenshotovi timeoutali) - isto kao u Clone sesiji. Nespojivost i `randomVariants`
  su zato provjereni Node testom koji logiku EKSTRAHIRA iz `app.js` regexom umjesto da
  je prepisuje (promašen regex ruši test, ne propušta ga): 8 slučajeva tablice
  istinitosti plus 20000 poziva randoma bez ijedne nevaljane kombinacije.
- **Odigrana partija**: Vatra odigrao Disjoint ploču i potvrdio da je dobro - pravilo
  se čita bez trajne oznake. To je bio jedini dio koji Node testovi nisu mogli pokriti.
  **Treća varijanta zaredom koja prolazi iz prve** (Palindrome, Clone, Disjoint), i
  treći put iz istog razloga: render se svodi na već dokazan sloj ili ga uopće nema.
  Kod Disjointa nema ni jedne nove CSS klase, pa je rizik bio najmanji dosad - Thermo,
  jedini koji je tražio tri runde popravaka, jedini je i crtao preko granice ćelije.

## German Whispers (v1.36.0)

Linija duž koje se SUSJEDI razlikuju za barem 5. Druga varijanta s liste kandidata
([dorada-varijante.md](dorada-varijante.md)), i prva koja je tamo bila procijenjena
kao "jeftino - derive + postojeći `.line-*` render". Procjena je bila točna: derive je
šetnja kao `deriveThermos` s drugim uvjetom koraka, a render je preuzet bez ijedne nove
CSS klase osim boje.

Izmjereno (Hard): **prosjek 17ms, max 231ms** sam; kombinacije 8-527ms prosjek uz
najgori rep 2.5s (whisper+thermo). Normal 3ms. Linija po ploči 4-8, duljina 3-6.

### Geometrija je Thermo, logika je Kropki

Ovo je prva varijanta koja te dvije strane posuđuje od **različitih** prethodnika, i
zato je jeftina: geometrijom je linija (put po potezu kralja, bez preklopa) pa dijeli
`validThermos`, `prepThermos` i cijeli `.line-*` render; logikom je odnos susjednog
PARA pa se ponaša kao `edgeOk`.

**Nema `whisperRange`** iako Thermo i Killer oba imaju svoj `*Range`. Dopušteni skup
nije interval nego unija dva repa - uz susjeda 3 prolaze samo 8-9, uz 7 samo 1-2 - a to
u `[lo,hi]` ne stane. Provjerava se par po par, kao kod brid-oznaka.

**Peta znamenka ne stoji nigdje na liniji** (|5-x| >= 5 traži x <= 0 ili x >= 10).
To je jedina informacija koju varijanta daje na PRAZNOJ ploči, bez ijednog popunjenog
susjeda, i funkcionalno je ekvivalent onome što je kod Thermo "pozicija sama". Odatle
whisper vuče velik dio snage; u `computeCandidates` je jedan `s.delete(5)`.

Dvije stvari koje `deriveThermos` ima besplatno, a ovdje se moraju napisati:

1. **Provjera da se put ne vrati na sebe.** Kod tube to jamči strogi rast (vrijednost
   bi morala biti veća od same sebe), pa `deriveThermos` gleda samo tuđe tube. Whisper
   odnos je simetričan - 1-7-1 je valjan niz - pa put rado napravi petlju. Odatle
   `mine` Set, posuđen od `derivePalindromes`.
2. **Šetnja nema prirodan smjer.** Thermo kreće iz niskih vrijednosti sam od sebe (iz 9
   se nema kamo), što je točno ono što bulb treba. Ovdje su 1 i 9 jednako dobri
   startovi, a 5 ispada sam od sebe jer nema nijednog partnera.

### Redoslijed izvođenja: whisper ide PRIJE tube i linije

Pravilo iz v1.33.0 ("prva ide oznaka s najmanje slobode") ovdje traži mjesto odmah iza
klona. Tuba traži susjeda veće vrijednosti - u prosjeku pola njih kvalificira; whisper
traži razliku od barem 5, a **vrijednost 4 ima točno jednog mogućeg partnera (9), 5
nijednog**. Niz je time: klon -> whisper -> tuba -> linija -> kavez.

### `STRENGTH: 10` - pravilo iz v1.35.0 ovdje spašava tri minute

Disjoint je pokazao da se `STRENGTH` regijske varijante mora mjeriti na kombinacijama.
Whisper pokazuje da to vrijedi i za **oznakovne** varijante, i to oštrije:

| STRENGTH | whisper sam  | +clone             | +thermo      |
| -------- | ------------ | ------------------ | ------------ |
| 12       | 10ms (16-28) | **10074ms (195s)** | 341ms (4.8s) |
| **10**   | 17ms (19-28) | **31ms (155ms)**   | 210ms (2.5s) |
| 8        | 7ms (20-28)  | 15ms (50ms)        | 21ms (102ms) |

Dvije točke snage su razlika između 155ms i **195 sekundi** na istom paru. Solo ploča
tu razliku ne vidi uopće (10ms prema 17ms) - da se `STRENGTH` kalibrirao samo na njoj,
kao što se radilo do v1.34.x, whisper+clone bi bio isporučen kao par koji se generira
tri minute.

Uzeto 10 umjesto 8 jer daje bolji solo raspon (19-28 prema 20-28) uz rep koji ostaje u
rangu zatečenog clone+thermo.

### Boja: prva varijanta kojoj su dvije susjedne već zauzete

Tuba je hladno plava (`--thermo`), palindrom hladno zelena (`--palindrome`). Whisper
mora raditi u sva tri para (najviše dvije linijske varijante su aktivne odjednom), pa
je uzet **topao** ton (`--whisper: #4d3f3c`) - razlikuje se od obiju po temperaturi, ne
po tonu koji bi se s njima natjecao. Svjetlina je namjerno ista (luma ~66 prema 65 i 71) da nijedna linija ne dominira pločom.

### Provjere

- **Regresija**: 34 ploče (17 kombinacija × 2 težine, zasijan RNG) identične do na novo
  prazno `whispers: null` polje u `clues` - isti obrazac kao Palindrome/Clone/Killer.
- **Generator**: na svakoj ploči provjereno da susjedi na liniji stvarno razlikuju za
  > = 5 u rješenju, da 5 nije nigdje na liniji, da je svaki korak potez kralja i da se
  > linije ne preklapaju (sve kombinacije, obje težine).
- **Hint**: **nula krivih prijedloga**. Riješeno samim hintovima (Hard): +clone 10/10,
  +killer 9/10, whisper sam 8/10, +x 8/10, +disjoint 8/10, +thermo 6/10; Normal 10/10.
- **`KEEP_MIN` = 4**: izmjereno 4-8 linija po ploči u svim kombinacijama, nijedna
  ispod dna (isti razlog kao `THERMO_KEEP_MIN` - usamljena linija se čita kao greška).
- **Render**: pri izradi NIJE bio vizualno provjeren - browser pane je i u ovoj sesiji
  bio polovičan (screenshot timeouta, JS izvršavanje blokirano), pa je jedina provjera
  bila da se Whisper Hard partija generira i iscrtava **bez ijedne greške u konzoli**,
  kroz stvarne klikove u meniju. Shipano je svjesno preko granice koju postavlja Clone
  sekcija ("za sve što prelazi granicu ćelije - nije podnošljiv rizik"), uz obrazloženje
  da je mašinerija naslijeđena bez izmjene i da je jedino novo boja.
  **Vatra je odigrao partiju i potvrdio da je dobro** - render i boja rade.

### Nađen bug u mjernim harnessima (i ispravljene tvrdnje iz v1.35.0)

Pri prvoj provjeri generatora ispalo je **0 linija na svakoj ploči**, iako je derive
očito radio. Uzrok nije bio u kodu nego u harnessu: oznake se vraćaju u `r.clues`, a
harness ih je čitao s vrha rezultata (`r.whispers`).

Isti previd bio je i u druga dva harnessa iz v1.35.0, s dvije različite posljedice:

- **Regresijski**: sva `clues` polja su bila `undefined`, pa je "bajt-identično"
  zapravo uspoređivalo samo `puzzle`/`solution`/`techniques`. Ponovljeno s ispravljenim
  harnessom - **tvrdnja stoji**, ali do sada nije bila dokazana.
- **Hint**: solver je pri svakom pozivu dobivao prazan `clues`, dakle rješavao ploču
  BEZ oznaka. Odatle stope 0-2/10, koje su pogrešno pripisane harnessu koji "ne
  primjenjuje eliminacijske korake". Ispravljeno: 6-10/10 svugdje, uključujući zatečene
  kombinacije (killer sam 0/10 -> 6/10, clone sam 0/10 -> 10/10).

**Zašto to nije proizvelo lažno "sve u redu":** obje tvrdnje koje su preživjele
(bajt-identičnost, nula krivih prijedloga) provjeravaju se protiv rješenja, pa ih
slabiji ulaz čini strožima ili rjeđima, nikad lažno pozitivnima. Pouka je svejedno da
harness mora **puknuti kad ne nađe što traži** umjesto da tiho radi s `undefined` -
zato oba sada bacaju iznimku ako `r.clues` nema.

## Legenda linijskih varijanti (v1.37.0)

Traka ispod ploče koja mapira boju na ime linijske varijante. Nastala je iz pitanja
koje se pojavilo pri planiranju četvrte linijske varijante (Renban/Zipper): tri linije
(Thermo, Palindrome, Whispers) crtaju ISTU geometriju pa ih razlikuje samo boja, a
paleta je uska - linija stoji ispod znamenke pa mora ostati tamna, i tu nema pet
razlučivih tonova.

**Problem je bio krivo postavljen, i to je glavni nalaz.** Prvo se činilo da treba pet
međusobno razlučivih boja. Ali na ploči su najviše DVIJE linije (`MAX_VARIANTS`), i
igrač ih je sam odabrao u meniju - pravo pitanje nije "razlikujem li pet boja" nego
"koja od ove dvije traži rast, a koja razliku 5". Boja je to pokušavala nositi sama;
legenda odgovara izravno.

Posljedice te preformulacije:

- **Render se ne dira uopće** - nula rizika onog tipa koji je Thermo koštao tri runde.
- **Prag za boju pada.** Boje moraju biti različite unutar para, ali više ne moraju
  biti pamtljive same za sebe - a to je bio dio koji se lomio na četvrtoj.
- **Skalira na koliko god varijanti.** Renban i Zipper trebaju samo boju koja se
  razlikuje od druge u paru, ne od svih ostalih odjednom.

### `LINE_KINDS` je jedan izvor za render I legendu

Legenda se NE gradi iz popisa odabranih varijanti nego iz istog `lines` polja kojim se
crtaju linije. Razlog je konkretan: `pruneMarks` zna pojesti sve oznake jedne varijante
(vidi v1.34.1), pa varijanta smije biti odabrana a da linija na ploči nema - takvu
legenda ne smije spominjati. Uzorak boje uzima se iz **iste CSS varijable** koju crta i
linija (`--thermo`/`--palindrome`/`--whisper`), pa ne može prikazati drugu boju od one
na ploči.

Traka je namjerno IZVAN `.board-wrap`: ploča je `container-type: size` i sve unutar nje
skalira se prema njoj, pa bi legenda ili rasla s pločom ili joj krala prostor pri
svakom renderu.

### Odbačene opcije (i zašto)

- **Debljina linije** - trivijalna (jedna varijabla), ali debljina već nosi drugo
  značenje (koliko je linija istaknuta), a pet razina staje samo ako najtanja postane
  jedva vidljiva.
- **Oznaka na kraju linije** - jeftina i presedan postoji (`.thermo-bulb`), za
  Palindrome čak semantična (kuglice na oba kraja doslovno crtaju simetriju). Ostavljena
  kao REZERVA ako se konkretan par pokaže pretijesnim. Ne rješava cijeli skup: Whispers
  i Zipper nemaju simbol koji se sam objašnjava.
- **Isprekidana / točkasta linija** - najjača razlika za oko, ali render crta svaku
  ćeliju kao zasebnu pilulu pa bi se uzorak resetirao u svakoj ćeliji i ne bi se
  poravnao preko granica. To je nova render mašinerija - jedini takav slučaj dosad
  (Thermo) tražio je tri runde popravaka.
- **Boja po SLOTU umjesto po varijanti** (prva odabrana linija uvijek plava, druga uvijek
  smeđa) - rješava skaliranje zauvijek s točno dvije boje. Odbačeno jer bi Thermo mijenjao
  boju ovisno o tome s čim je uparen, a plava tuba je uhodana kroz šest verzija.

### Provjere

- **Vizualno**: potvrđeno da se traka pojavljuje i nosi točno ime na Whisper Hard
  partiji (kroz stvarne klikove). Browser pane je zatim opet stao - dvije linije
  odjednom i skrivanje na Classicu **nisu** vidljivo provjereni.
- **Node test umjesto oka**: provjere koje bi inače tražile pogled, sve nad stvarnim
  datotekama (promašen regex ruši test): svaka vrsta ima `cssVar` definiran u `:root`
  (inače je uzorak proziran - greška nevidljiva u kodu), svaka ima `.line-seg.<kind>`
  pravilo koje tu varijablu koristi, svaka ima ime, i render/legenda dokazano čitaju
  isti popis. Zadnja provjera je zaštita za IDUĆU liniju: doda se Renban, zaboravi se
  legenda - test pukne.

## Renban (v1.38.0)

Linija čije vrijednosti čine UZASTOPAN skup, u bilo kojem redoslijedu ({4,6,5} je
valjano). Treća s liste kandidata i četvrta linijska varijanta - prva koja je
isporučena nakon što je legenda (v1.37.0) skinula pritisak s boje.

Izmjereno (Hard): **prosjek 8ms, max 44ms** sam; kombinacije 10-456ms prosjek.
Normal 2ms. Linija po ploči 4-8, duljina 3-5.

### Treći tip odnosa u repou

Dosadašnje linijske varijante vežu ili POZICIJU u putu (Thermo) ili SUSJEDNI PAR
(Whispers, kao Kropki). Renban veže **cijeli skup ćelija odjednom** - i time je zapravo
najbliži Killeru: kavez zadaje zbroj, Renban zadaje raspon. Otuda i ista struktura:
`renbanRange` uz zasebnu provjeru ponavljanja, propagacija na CIJELU liniju u `place`
(ne samo na susjede, kao kod Whispersa).

Uzastopan skup duljine L koji sadrži najmanju m i najveću M mora stati u prozor od L,
pa svaka vrijednost leži u `[M-L+1, m+L-1]`. Na praznoj liniji nema što stegnuti - za
razliku od Whispersa (5 otpada odmah) i Therma (pozicija sama reže). Snaga dolazi tek s
prvim upisom, ali onda naglo: jedan broj na liniji duljine 3 ostavlja ostalima samo 5
mogućnosti.

**Derive ima invariantu koju prethodne dvije nisu imale:** skup mora biti uzastopan u
SVAKOM koraku, ne tek na kraju - smije se dodati samo susjed čija je vrijednost trenutni
min-1 ili max+1. Cijena je da neke valjane linije promaknu (put koji bi preko "rupe"
došao do uzastopnog skupa odbacuje se čim rupa nastane); ne popravlja se jer bi tražilo
pretragu s vraćanjem umjesto šetnje, a i ovako ih ima 4-8 po ploči. Zauzvrat `mine` Set
nije potreban - min-1 i max+1 po definiciji nisu u skupu, pa se put ne može vratiti na
sebe (Whispers je to trebao, odnos mu je simetričan).

Redoslijed izvođenja: **Renban ide prvi od linijskih** (odmah iza klona). Nastavak mora
biti točno jedna od dvije vrijednosti, dok Whispers prima sve na razlici >= 5 (1-4
vrijednosti, prosjek 2.2). Isto pravilo kao v1.33.0.

### `STRENGTH: 8`, i jedan rep koji se nije dao reproducirati

Pravilo iz v1.35.0/v1.36.0 opet je odlučilo: sa 10 su `renban+thermo` i `renban+killer`
imali repove od 30s odnosno 29s, sa 8 su u sekundi. Solo raspon gubi točno jedan zadani
broj (20-28 prema 19-28).

**Zabilježeno jer nije objašnjeno:** jedno mjerenje `renban+thermo` sa `STRENGTH: 8`
uhvatilo je pokušaj od **374 sekunde**. Ponovljeno mjerenje na 110 ploča dalo je medijan
17ms, max 6.2s i 1/80 iznad 5s - outlier se nije reproducirao. Rep je dakle stvaran ali
rijedak, i u normalnom rasponu drži se uz zatečeni `clone+thermo` (14s). Nosi ga Cancel

- worker. Ako se ikad pokaže čestim, prvo pogledati taj par.

Pouka o metodologiji: `N=20` je premalo za tvrdnju o repu. Prosjek i max iz tako malog
uzorka su se ovdje razlikovali 60× između dva pokretanja iste kombinacije. Za repove
treba medijan/p90 na uzorku od barem 50, uz ispis svake ploče - inače se outlier čita
kao sistematska sporost (i obrnuto).

### Boja: prva odabrana nakon legende

Tri postojeće linije leže na hue 240 (tuba), 138 (palindrom) i 10 (whisper) - razmaci
102/128/130 - pa četvrta ide u najveći preostali, oko 290 (`--renban: #503b54`).
Zasićenost je malo viša (18% prema 10-13%) jer na četiri boje u ovako uskom rasponu
svjetline sam hue više ne nosi razliku.

**Legenda je ovdje prvi put isplatila.** Bez nje bi četvrta boja morala biti pamtljiva
sama za sebe; ovako mora razlikovati samo par na ploči, pa je izbor bio mehanički
(najveći razmak u hue krugu) umjesto kompromisa.

### Provjere

- **Regresija**: 34 ploče (17 kombinacija × 2 težine, zasijan RNG) identične do na novo
  prazno `renbans: null` polje. Ponovljeno nakon fiksiranja `STRENGTH` - i dalje
  identično (kombinacije bez Renbana ne diraju njegov `deriveRenbans`, pa RNG niz stoji).
- **Generator**: na svakoj ploči provjereno da vrijednosti linije čine uzastopan skup u
  rješenju (max-min === L-1), da nema ponovljene znamenke, da je svaki korak potez
  kralja i da se linije ne preklapaju.
- **Hint**: **nula krivih prijedloga**. Riješeno samim hintovima (Hard): +killer 10/10,
  +whisper 8/10, +thermo i +clone 7/10, +x 6/10, renban sam 5/10; Normal 10/10.
- **Legenda**: test iz v1.37.0 proširen na Renban i prolazi - `--renban` definiran,
  `.line-seg.renban` ga koristi, ime postoji, LINE_KINDS ga pokriva. To je točno ono
  zbog čega je test pisan: doda se linija, zaboravi legenda.
- **Render**: pri izradi nije bio vizualno provjeren (browser pane opet nije otvarao
  meni), pa je shipan po ispravljenoj pouci iz Clone sekcije - mašinerija naslijeđena,
  jedino novo boja. **Vatra odigrao Thermo + Renban i potvrdio da dobro izgleda**, a to
  je bio i najteži par za novu boju (ljubičasta uz plavu tubu). Četvrta linijska
  varijanta time prolazi iz prve, kao i tri prije nje.
- **Legenda je prošla prvi stvarni test** (v1.37.0): Thermo + Renban je prva odigrana
  partija s dvije linije otkako postoji.

## Zipper (v1.39.0)

Linija sa SREDIŠNJOM ćelijom, gdje se svaki par simetričan oko nje zbraja točno u
njezinu vrijednost: `[a,b,C,d,e]` traži `a+e === C` i `b+d === C`. Četvrta s liste
kandidata i peta linijska varijanta. Njome je iscrpljena cijela "jeftino - derive +
postojeći `.line-*` render" skupina.

Izmjereno (Hard, 60 ploča po kombinaciji): **medijan 8ms, p90 38ms, max 870ms** sam;
najgori par (zipper+thermo) medijan 25ms / p90 471ms / max 1.8s, **0/60 iznad 5s**.
Normal 2ms. Linija po ploči 4-9, duljina 3-5.

### Odabrana je standardna izvedba, ne ona iz popisa kandidata

Popis je Zipper opisao kao "parovi simetrični oko sredine daju isti zbroj" - dakle
zbroj bi bio bilo koja konstanta. Isporučeno je **standardno pravilo: zbroj = vrijednost
sredine**. Jače je (sredina je odmah gornja granica svakog člana) i to je ono što igrači
prepoznaju pod tim imenom.

Cijena te odluke je uvjet koji nijedna dosadašnja linija nije imala: **sredina mora biti
barem 3** da par uopće postoji (1+2), a raspodjela je vrlo neravnomjerna - sredina 3 ima
dva moguća para, sredina 9 njih osam. Zato `deriveZippers` bira sjeme SAMO među visokim
vrijednostima (`ZIPPER_SEED_MIN = 6`); bez toga većina pokušaja ne dogura ni do duljine 3. Izmjereno na gotovim pločama: prosječna sredina je 7.7.

Rast je iz sredine u parovima, isto kao `derivePalindromes` - uvjet para je jedina
razlika (`a+b === C` umjesto `a === b`). Otuda i samo neparne duljine.

### Prvi odnos koji FIKSIRA, a ne samo sužava

Dosadašnje varijante kandidatu uvijek ostave raspon: tuba granice iz pozicije, kavez iz
zbroja, Renban prozor od L, Whispers dva repa. Zipper je prvi kod kojeg su dvije
poznate ćelije dovoljne da treća bude **jedna jedina vrijednost** - kad su sredina i
jedan član para upisani, partner je `C - a`. Ćelija tako ispadne naked single bez ijedne
klasične tehnike.

To se vidi i u `STRENGTH`: **10 je prošlo iz prve**, jedina linija kojoj nije trebalo
spuštanje. Renban je na istoj vrijednosti imao repove od 30s pa je morao na 8. Ploče s
jakim odnosom ostaju rješive i s malo zadanih, pa `dig` ne kopa u prazno.

### Peta boja je granica ovog mehanizma

Postojeće linije leže na hue 240/138/10/290, pa je najveći preostali razmak (10→138)
dao ~74, maslinasto-oker (`--zipper: #464e2d`). Zasićenost je opet malo viša (25%) jer
je razmak do palindromove zelene **64 stupnja - najuži dosad** (prethodno najbliži par
imao je 102).

**Šesta linijska varijanta ne bi smjela birati boju.** Hue krug je na pet linija
podijeljen na razmake koji se približavaju granici razlučivosti pri ovako niskoj
zasićenosti i uskom rasponu svjetline (luma 65-72, jer linija stoji ispod znamenke).
Rezerva je već zapisana u sekciji o legendi: **oznaka na kraju linije** (jeftina,
presedan je `.thermo-bulb`, za Palindrome čak semantična).

> **Zaključak je preživio, obrazloženje nije (v1.39.1).** Ovo je krivo dijagnosticiralo
> problem kao "peta boja je previše" i mjerilo ga hue razmakom. Vatra je odigrao
> Palindrome + Zipper i prijavio da se jedva razlikuju - a mjerenje deltaE pokazalo je
> da su **thermo+renban (11.4) i thermo+whisper (12.8) bili GORI** od prijavljenog
> para (14.2). Problem nije bio u zadnjoj boji nego u tome što se biralo hue razmakom.
> Sve četiri su preračunate odjednom u Lab prostoru; vidi sekciju niže.

### Provjere

- **Regresija**: 34 ploče (17 kombinacija × 2 težine, zasijan RNG) identične do na novo
  prazno `zippers: null` polje.
- **Generator**: na svakoj ploči provjereno da je duljina neparna, da se svaki par
  simetričan oko sredine zbraja u vrijednost sredine U RJEŠENJU, da je korak potez
  kralja i da se linije ne preklapaju.
- **Hint**: **nula krivih prijedloga**. Riješeno samim hintovima (Hard): +clone 10/10,
  +x 9/10, +thermo 8/10, zipper sam i +renban 7/10, +killer 6/10; Normal 10/10.
- **Legenda**: test proširen na Zipper i prolazi.
- **Render NIJE vizualno provjeren** (browser pane opet polovičan). Mašinerija je
  naslijeđena, jedino novo je boja - a boja je ovdje **rizičnija nego ijednom dosad**
  jer je razmak do palindromove zelene najuži. Prvo što treba pogledati je par
  Palindrome + Zipper.

### Usput popravljen mjerni harness

`tail.js` je nabrajao ključeve oznaka rukom i `zippers` nije bio na popisu, pa su ploče
ispisivale `{"thermos":4}` i izgledale kao da Zipper nije nastao. Nije bio bug u kodu
(`zippercheck` je istovremeno pokazivao 4-9 linija), ali je isti obrazac koji je u
v1.36.0 doveo do lažnih hint brojki. Sada čita sve što je polje u `clues`.

## Boje linijskih varijanti preračunate (v1.39.1)

Vatra je nakon Zippera javio dvije stvari: Palindrome i Zipper se jedva razlikuju, a
uzorak u legendi je za Zipper bio točkica umjesto crtice. Oba su popravljena, i oba su
imala uzrok drukčiji od očekivanog.

### Legenda: sudar imena CSS klase

Prva hipoteza je bila `flex-shrink` (uzorak se skuplja kad ponestane mjesta). **Kriva** -
uzorak je već imao `flex-shrink: 0`. Mjerenje u browseru pokazalo je `flex-basis:
calc(20% - 8px)`, što nije bilo nigdje u pravilu za legendu.

Uzrok: klasa `.swatch` **već postoji** - to su gumbi palete boja
(`flex: 0 0 calc(20% - 8px)`). Legendin uzorak ju je slučajno preuzeo, pa mu je širina
ispadala 20% roditelja umjesto 18px. Račun se poklopio na decimalu: entry "German
Whispers" je 108.98px → 20% − 8px = 13.797px, točno izmjereno.

**Zašto baš Zipper:** entry je širok koliko i ime varijante, a "Zipper" je najkraće ime -
20% od ~58px minus 8px ispadne ~4px, što s punim radijusom postane krug. Duža imena su
davala kraću crticu, koja se čitala kao namjerna.

Popravak je preimenovanje u `.legend-swatch` (+ izričit `flex: none`). Pouka: **provjeri
je li ime klase slobodno prije nego ga uzmeš** - CSS nema module, a `swatch` je
očito ime za dvije različite stvari.

### Boje: hue razmak nije mjera razlučivosti

Do sada su boje birane jedna po jedna, svaka "u najveći preostali razmak u hue krugu".
Mjerenje percepcijske razlike (CIE Lab deltaE) na zatečenom skupu:

| par                  | deltaE |
| -------------------- | ------ |
| thermo + renban      | 11.4   |
| thermo + whisper     | 12.8   |
| palindrome + zipper  | 14.2   |
| palindrome + whisper | 15.1   |

**Prijavljeni par nije bio najgori - dva su bila gora, samo ih nitko nije odigrao.**
Problem dakle nije bio "peta boja je granica" (kako je zapisano u v1.39.0) nego sam
postupak: hue razmak ne mjeri razlučivost, jer oko nije jednako osjetljivo po hue
krugu, a kod tamnih niskozasićenih tonova pogotovo.

Sada su sve četiri birane ODJEDNOM u Lab prostoru: ista L\* (30), ista kroma (18), hue
jednoliko na 5 × 72°. Po konstrukciji daje jednaku percepcijsku svjetlinu i jednake
razmake. **Najgori par: 11.4 → 20.9**, provjereno čitanjem stvarno primijenjenih
vrijednosti sa žive stranice (ne iz izvora).

Svaka varijanta zadržava karakter koji je i prije imala - tuba plava, palindrom zelen,
whisper topao, renban ljubičast, zipper oker - pa ploča ne izgleda kao druga igra.
Luma ostaje 64-72, isti pojas kao prije.

**Za šestu liniju ovo se ne ponavlja**: 6 × 60° spustilo bi najgori par natrag ispod 20.
Tada ide rezerva (oznaka na kraju linije). Tvrdnja iz v1.39.0 da je "peta granica"
ostaje točna po zaključku, ali je obrazloženje bilo krivo - granica nije u broju boja
nego u tome koliko ih stane uz deltaE >= 20.

### Potvrđeno igranjem, i time kalibriran prag

Vatra je odigrao **Zipper + Palindrome** - točno par koji je prijavio kao nerazlučiv -
i potvrdio da je sada dobro. Time su zatvorena oba problema iz v1.39.1 i potvrđen
render Zippera (peta linijska varijanta, koja pri izradi nije bila vizualno provjerena).

Vrijednije od same potvrde je što je **prag sada empirijski kalibriran na istom paru**,
istom čovjeku i istom zaslonu:

| deltaE u tom paru | presuda                  |
| ----------------- | ------------------------ |
| 14.2              | "jedva vidljiva razlika" |
| 20.9              | "dobro je"               |

To je jedina točka koju imamo, ali je stvarna - dosad se o razlučivosti odlučivalo
procjenom. **Za buduće boje: 14 je premalo, ~21 je dovoljno.** Ciljati barem 20 u
najgorem paru, i to mjeriti u Lab prostoru, ne po hue razmaku.

### Pouka o mjerenju

Ovo je treći put u nizu da je hipoteza pala na mjerenju (prije: uzrok repa kod
Renbana, hint brojke kod Whispersa). Zajedničko im je da je **prva hipoteza bila
uvjerljiva i kriva**, a mjerenje jeftino. Kod boja je posebno važno jer se "izgleda
dobro" ne da provjeriti čitanjem koda - deltaE je jedini način da se tvrdnja o
razlučivosti obrani brojkom.

## Arrow (v1.40.0)

Krug nosi znamenku koja je ZBROJ znamenki na repu koji iz njega izlazi. Peta s liste
kandidata i **šesta linijska varijanta**. Prva iz skupine koja je na popisu bila
označena kao skuplja od "jeftinih".

Izmjereno (Hard, 60 ploča): **medijan 12ms, p90 48ms, max 106ms** sam; najgori par
(arrow+thermo) medijan 31ms / p90 536ms / max 1.8s, **0/60 iznad 5s**. Normal 3ms.
Strelica po ploči 4-9, rep 2-4 ćelije (prosjek 2.4), krug prosječno 6.9.

### Prva varijanta kojoj šetnja nije dovoljna

Sve dosadašnje linije rastu korak po korak uz LOKALNI uvjet - veći susjed (Thermo),
razlika >= 5 (Whispers), min-1/max+1 (Renban), par oko sredine (Zipper). Zajedničko im
je da svaki prefiks vrijedi sam za sebe, pa se šetnja može zaustaviti bilo kad i
isporučiti ono što ima.

Arrow to nema: uvjet vrijedi tek kad je rep **gotov**, jer zbroj mora pogoditi krug
točno. Put građen pohlepno završi kao promašaj i mora se odbaciti cijel. Zato je
`deriveArrows` jedini derive s **pretragom uz vraćanje** (DFS), a ne šetnjom.

Pretraga je svejedno jeftina jer je prostor sitan: rep ide najviše do 4, grananje je
8 susjeda, a rez ide čim parcijalni zbroj premaši krug.

**Rep je nužno kratak** i to je posljedica pravila, ne izbora: zbroj mora stati u
znamenku, a četiri RAZLIČITE ćelije nose barem 1+2+3+4 = 10. Duži repovi postoje samo
kad se vrijednosti ponavljaju, što je dopušteno jer rep nije jedinica - ali susjedi na
putu se uvijek vide, pa se ponavljanje može dogoditi tek preko jedne ćelije. Izmjereno:
prosječan rep 2.4 ćelije.

Prosječan krug ispadne **6.9**, znatno iznad sredine skale, iz istog razloga iz kojeg
Zipper ima visoku sredinu - veći zbroj ima više repova koji ga mogu složiti.

### `STRENGTH: 10` prošlo iz prve, drugi put zaredom

Kao Zipper, i iz istog razloga: odnos je jak u OBA smjera. Rep diže donju granicu kruga
i prije ijednog upisa (tri člana znače krug >= 3), a upisan krug ograniči svaki član
repa. Ploče zato ostaju rješive s malo zadanih i `dig` ne kopa u prazno. Renban i
Whispers, koji stežu slabije, morali su na 8 odnosno 10 nakon što su repovi eksplodirali.

### Boja: šesta je zahtijevala novi krug računa

Prag od 20 (kalibriran igranjem u v1.39.1) nije se dao zadržati dodavanjem šeste u
zatečeni raspored - ubacivanje u najveći preostali razmak dalo bi **~11**, dakle gore
od onoga što je prijavljeno kao nerazlučivo. Ni 6 × 60° pri dotadašnjoj kromi ne bi
prošlo (17.7).

Rješenje je veća kroma (18 → 22) uz malo višu L\* (30 → 32): **najgori par 21.8**,
provjereno na živoj stranici. Svih šest je i dalje u gamutu i zadržava svoj karakter.

**Arrow je pritom jedini kojem boja nije jedina razlika** - krug na kraju repa nosi je
i sam. To je ujedno ono što je Arrow činilo dobrim izborom za šestu liniju: da je
sljedeća varijanta bila još jedna gola linija, boja bi morala nositi sav teret i prag
se ne bi dao držati.

**Napomena o mjeri svjetline:** L\* (Lab) je mjerodavan, luma nije. Svih šest je na
L\* 32, dakle percepcijski jednako svijetle, ali im luma ispada 59-78 (Arrowova
tirkizna najniža). Luma sustavno podcjenjuje plavo-tirkizne tonove; raniji komentari
u CSS-u navodili su je kao kontrolu, što je ispravljeno.

### Render: prsten, ne kuglica

Krug se crta kao **prsten** (`.arrow-ring`), za razliku od pune Thermo kuglice.
Razlog je pravilo: znamenka u krugu JE zbroj repa, dakle nosiva informacija koja mora
ostati čitljiva. Kod tube kuglica smije progutati znamenku jer je ona tamo obična.

Promjer je isti kao kuglica (58%) da se dvije oznake čitaju kao ista obitelj, a razlika
puno/prazno nosi značenje. Time se Arrow razlikuje od Therma i bez oslanjanja na boju.

### Provjere

- **Regresija**: 34 ploče (17 kombinacija × 2 težine, zasijan RNG) identične do na novo
  prazno `arrows: null` polje.
- **Generator**: na svakoj ploči provjereno da je zbroj repa jednak vrijednosti kruga U
  RJEŠENJU, da je put [krug, ...rep] duljine >= 3, da je korak potez kralja i da se
  putovi ne preklapaju.
- **Hint**: **nula krivih prijedloga**. Riješeno samim hintovima (Hard): +x, +clone i
  +killer 9/10, +zipper 8/10, +thermo 7/10, arrow sam 4/10; Normal 10/10. Solo brojka je
  najniža dosad, ali u rangu zatečenih na istom harnessu (killer 6/10) - zastoji su
  eliminacijski koraci koje harness ne primjenjuje.
- **Boje**: min deltaE 21.8 na svih 15 parova, čitano sa žive stranice.
- **Legenda**: test proširen na Arrow i prolazi.
- **Render**: pri izradi nije bio vizualno provjeren, i to je bio prvi put otkako je
  pouka o naslijeđenom renderu zapisana da se crta **nešto novo** (prsten je nova CSS
  klasa, ne naslijeđeni `.line-*`). **Vatra odigrao Arrow + Even/Odd i potvrdio da je
  dobro** - prsten stoji i znamenka u njemu ostaje čitljiva. Time je i preračun boja na
  šest (v1.40.0) potvrđen u praksi.

## Abecedni redoslijed menija (v1.40.1)

Vatra je javio da varijante nisu složene abecedno. Provjera je pokazala da uzrok nije
Arrow nego **Killer, koji je od svog dodavanja (v1.34.0) stajao na 3. mjestu** umjesto
na jedanaestom. U commitu koji ga je dodao nema traga da je to bila namjera.

Moja greška je bila druge vrste: vidio sam Killera izvan reda, **pretpostavio da je
namjerno istaknut** i onda Arrow složio "abecedno među ostalima" - dakle iza njega.
Time je jedna zatečena anomalija postala dvije. Trebalo je provjeriti git povijest
prije nego što se odstupanje proglasi odlukom.

Popravak je premještanje Killera na abecedno mjesto (između Jigsaw i Kropki). Uz to je
napisan **test koji redoslijed štiti**, jer se dosad oslanjao na to da netko primijeti:

- meni mora biti složen abecedno po imenu koje igrač vidi (`variant-name`), ne po id-u -
  id-evi se razlikuju od imena na tri mjesta (`x` → Diagonal, `evenodd` → Even/Odd,
  `whisper` → German Whispers),
- svaki redak menija mora postojati u `REGION_VARIANTS`,
- svaka varijanta iz koda mora imati redak u meniju.

Zadnje dvije provjere su usput ispravile i **krivo brojanje u dosadašnjim porukama**:
varijanti ima **17**, ne 19 kako je tvrđeno nakon Arrowa. Nijedna nije nedostajala ni
visjela - brojka je jednostavno bila krivo zbrojena.

## Nonconsecutive (v1.41.0)

Ćelije koje dijele brid ne smiju nositi uzastopne znamenke. Šesta i zadnja s liste
kandidata, i **prva varijanta koja mijenja PROSTOR RJEŠENJA umjesto da oznaku izvodi
iz gotovog rješenja**.

Izmjereno (Hard): **prosjek 186ms, max 823ms** sam; kombinacije 214-421ms prosjek uz
rep do 1.9s. Normal 333ms - najsporiji Normal u repou (classic je 3ms), i to je cijena
koju plaća `fillBoard`, ne oznake.

### Doc ju je precijenio, ali je bio u pravu u čemu je različita

`dorada-varijante.md` ju je vodio kao "jedini koji stvarno traži diranje generatora" i
"prva iskrena kandidatura za praznu geometrija-first kategoriju". Ispalo je:

- **`isValid` grana je trivijalna** - četiri retka nad predizračunatim `orthPeers`,
  jednako kao Antiknight.
- **Propagacija u solveru već je postojala u drugom obliku.** Nonconsecutive je
  Kropki naopako: bijela točka kaže "ovaj par JEST uzastopan", ovdje NIJEDAN ortogonalni
  par nije - pa se umjesto zadržavanja odnosa brišu susjedne vrijednosti.
- **Nema derive, oznaka, rendera ni migracije** - kao Disjoint Groups.

Ono što JEST istina i po čemu je stvarno prva takva: rješenje se mora **pronaći uz taj
uvjet**, dok sve varijante od v1.24.0 idu obrnuto. Posljedica je jedina u repou:
**Normal je mjerljivo sporiji** (333ms prema 3ms za classic), jer trošak nosi
`fillBoard`, koji na Normalu inače ne radi ništa posebno.

**Nema per-puzzle podatka pa je regresija ispala BAJT-IDENTIČNA** - bez ijednog novog
praznog polja u `clues`. Jedina varijanta dosad kojoj to nije trebalo; i Disjoint, koji
je najbliži, mijenja `units` pa barem ulazi u cache-ključ.

### Zabranjena kombinacija: Kropki

Bijela Kropki točka znači "ovaj par je uzastopan", a točke stoje baš na bridovima koje
Nonconsecutive zabranjuje. Bijela zato **ne može postojati**. Izmjereno na 20 Hard
ploča po slučaju:

| skup            | bijelih | crnih |
| --------------- | ------- | ----- |
| Kropki sam      | 138     | 73    |
| Kropki + Noncon | **0**   | 120   |

Ploča se uredno generira i rješiva je, ali igraču obećava pola pravila kojeg nema -
isti argument kao "varijanta se mora vidjeti" (v1.34.1), samo primijenjen na pola
varijante. Zato je par dodan u `INCOMPATIBLE`, drugi otkako taj mehanizam postoji.

**XV je provjeren i NE degenerira** (V 40 → 25, X 101 → 76): zbroj 5 i 10 se i dalje
mogu složiti od ne-uzastopnih parova (1+4, 4+6, 1+9), pa obje oznake prežive. Ostaje
dopušten - degeneracija se mjeri, ne pretpostavlja po sličnosti pravila.

### Zatečeni rep kod Therma, nađen usput

`nonconsecutive+thermo` je u prvom mjerenju (N=20) dao **234s max**, što je izgledalo
kao vlastiti problem. Na 50 ploča: medijan 241ms, p90 799ms, max 2.5s, **0/50 iznad 5s**.

Kontrolno mjerenje istog oblika na **zatečenom** `clone+thermo` (bez ijedne izmjene iz
ove sesije): medijan 13ms, ali **max 30.9s i 1/50 iznad 5s**. Thermo sam: max 536ms,
0/50.

Dakle debeo rep nose KOMBINACIJE S THERMOM i to je zatečeno stanje, ne posljedica novih
varijanti. Isti fenomen objašnjava i Renbanov outlier od 374s (v1.38.0). Nije popravljano
u ovoj sesiji - vidi tehnički dug.

### Provjere

- **Regresija**: 34 ploče **bajt-identično**, bez ijedne razlike (nema novog polja).
- **Generator**: na svakoj ploči provjereno da nijedan par koji dijeli brid ne nosi
  uzastopne znamenke, **uz kontrolu** da isti test na klasičnoj ploči padne (336
  prekršaja na 10 ploča) - inače bi prolazio i kad pravilo ne bi radilo.
- **Hint**: **nula krivih prijedloga**, i riješeno 8-10/10 - najbolji rezultat dosad.
  Očekivano: pravilo daje eliminacije na cijeloj ploči, bez čekanja na oznaku.
- **Nespojivost**: tablica istinitosti proširena na novi par; `randomVariants` sada
  čita parove IZ `INCOMPATIBLE` umjesto da ih prepisuje (inače bi test i dalje
  provjeravao samo stari par - zamalo se dogodilo).
- **Potvrđeno igranjem**: Vatra odigrao partiju - pravilo se čita s ploče bez ijedne
  oznake, kao kod Disjoint Groups. Time je potvrđeno i da je izostanak rendera bio
  ispravan izbor za drugu varijantu zaredom koja mijenja pravilo umjesto da nosi oznaku.

## Sandwich (v1.42.0)

Broj izvan ploče je zbroj znamenki između 1 i 9 u tom retku/stupcu. Sedma s liste
kandidata i **prva varijanta čija oznaka ne stoji ni u ćeliji ni na bridu**.

Izmjereno (Hard, 60 ploča): **medijan 11ms, p90 91ms, max 122ms** sam; najgori par
(sandwich+thermo, 50 ploča) medijan 25ms / p90 401ms / max 3.8s, **0/50 iznad 5s**.
Normal 2ms - jednako brz kao classic. Oznaka po ploči 6-12 (prosjek 9.1) od mogućih 18.

### Doc je pogodio da je nova, ali je promašio u čemu

`dorada-varijante.md` ju je vodio kao "trivijalno se izvede, ali oznaka stoji izvan
ploče - to je pravi novi posao, ne derive". Prvi dio je točan (derive je četiri retka:
nađi 1 i 9, zbroji što je između). Ostatak je promašen na obje strane:

- **Render je ispao jeftiniji nego što se činilo.** Pojas nije novi sloj nego jedna
  traka grida oko ploče (`.board-frame`, `grid-template-columns: var(--gutter) 1fr`).
  Kako je pojas jednako širok lijevo i gore, ploča ostaje kvadrat bez ijednog dodatnog
  računa, a bez Sandwicha je `--gutter: 0` pa je raspored za sve ostale partije
  nepromijenjen. Poravnanje ne traži pozicioniranje: pojas ponovi ritam ploče (9 traka,
  gap 1px, padding 3px = okvir) i sjedne točno - izmjereno **0.00px odstupanja** na
  sva četiri kuta, na tri veličine ekrana.
- **Solver je bio pravi novi posao**, a doc ga nije ni spomenuo.

### Prva relacija kojoj se ne zna NAD ČIME vrijedi

Sve dosadašnje oznake vežu unaprijed poznat skup ćelija: tuba svoj put, kavez svoje
ćelije, brid svoja dva susjeda. Zato su sve svedive na isto pitanje - "koji raspon
ovoj ćeliji ostaje" (`thermoRange`, `cageRange`, `renbanRange`, `zipperRange`,
`arrowRange`) ili "zadovoljava li ovaj par" (`edgeOk`, `whisperOk`).

Sandwich to pitanje ne može ni postaviti: **koje ćelije zbroj broji ovisi o tome gdje
padnu 1 i 9**. Dok se krajevi ne znaju, ne postoji skup nad kojim bi se raspon računao.

Odatle dvije posljedice kakvih dosad nije bilo:

- **Solver propagira ENUMERACIJOM, ne rasponom.** `sandwichPrune` prođe sve parove
  pozicija na kojima 1 i 9 još mogu stajati, odbaci parove kojima zadani zbroj nije
  dostižan, i svakoj ćeliji ostavi **uniju** onoga što joj preživjeli parovi dopuštaju.
  Unija, ne presjek - dok je više parova živo, ćelija smije nositi ono što dopušta bilo
  koji od njih. To je jedino mjesto u repou gdje se kandidati skupljaju, a ne režu.
- **`isValid` je NAMJERNO slab.** Dok oba kraja nisu upisana, vraća `true` - ne zna nad
  čime bi sudio. Kad su oba tu, provjeri stane li ostatak u toliko različitih znamenki
  iz onoga što je liniji preostalo; kad je linija puna, to postane **točna jednakost**.
  Za `countSolutions`/`dig` je to dovoljno: na punoj ploči su krajevi nužno upisani, pa
  se nijedno krivo rješenje ne može prošuljati. Rezanje prije toga radi solver, gdje se
  isplati. Slaba provjera je pritom **sigurna** po konstrukciji - odbija samo nemoguće.

Da propagacija nije samo teoretski zdrava, provjereno je izravno: na **1826 djelomičnih
ploča i 56935 praznih ćelija** (5 kombinacija, ploče popunjavane točnim vrijednostima
nasumičnim redom) **nijedan točan kandidat nije izgubljen**. Bez te provjere unsound
prune ne bi pao odmah nego bi tiho isporučio ploče bez rješenja.

Snaga je mjerljiva: na svježoj Hard ploči propagacija reže **20.9%** kandidata, a
**0/15 ploča** se da riješiti bez nje.

### Jedina oznaka koja ne troši ćeliju

Sve dosadašnje oznake zauzimaju prostor na ploči, pa se izvode u nizu i svaka zaobilazi
ćelije prethodnih (`blocked` kroz `deriveGeom`, redoslijed po vezanosti - v1.33.0).
Sandwich ne troši **nijednu** ćeliju, pa:

- ne ulazi u `deriveGeom` nego stoji uz `parity`/`edges`,
- ne treba `blocked` ni redoslijed izvođenja,
- **nema nespojivih kombinacija** - ne može se sudariti ni s čim.

Uz to nema izvedenog oblika (`thm`/`cag`/`mate`): wire je već ono što `isValid` gleda,
jer se oznaka traži po retku/stupcu ćelije, a to su dva dijeljenja.

### Prune je opet tiho pojeo nasumičnost

S fiksnim dnom od 6 oznaka izmjereno je (20 Hard ploča po gustoći): **prosjek 6.3
oznake bez obzira na baznu gustoću** - i pri 0.35-0.55 i pri 0.7-1. Prune svaku ploču
sveže na dno, pa je `SANDWICH_DENSITY` bio knob koji ne radi ništa.

To je **isti nalaz koji je Killer dao u v1.34.0** (`CAGE_KEEP_CELLS`), samo u drugoj
jedinici, i rješenje je preslikano: dno je RASPON (`SANDWICH_KEEP` 6-12) koji se izvlači
po ploči. Rezultat: 6-12 oznaka (prosjek 9.1) umjesto uvijek 6.

**Pouka koja se sad ponovila dvaput: kad se uvodi KEEP_MIN, provjeriti mjerenjem veže
li dno svaku ploču na istu vrijednost.** Fiksno dno i nasumična gustoća su u sukobu -
gustoća gubi, tiho.

### `STRENGTH: 10` prošlo iz prve, treći put zaredom

Kao Zipper i Arrow. Razlog je isti - odnos je jak u oba smjera: oznaka steže i gdje 1 i
9 SMIJU stajati i što ćelije između njih nose, a nula (1 i 9 kao susjedi) fiksira par
odmah. Najgori par ostaje ispod 4s, bez ijedne ploče iznad 5s.

Nula se pritom **ne izostavlja iako izgleda kao "nema oznake"** - najjača je oznaka
koju varijanta ima. Zato odsutnost nosi -1, a ne 0. Izmjereno: 118 od 546 prikazanih
zbrojeva je nula (22%), prosjek 11.9, a i teoretski maksimum 35 se pojavi.

### Provjere

- **Regresija**: 44 ploče (22 kombinacije × 2 težine, zasijan RNG) identične do na novo
  prazno `sandwich: null` polje - nijedan redak uklonjen ni promijenjen. Novi `Math.random`
  poziv za dno prunea zove se SAMO kad oznaka postoji, inače bi pomaknuo RNG niz i
  pločama bez Sandwicha.
- **Generator**: na svakoj ploči provjereno da zbroj između 1 i 9 U RJEŠENJU odgovara
  prikazanoj oznaci, **uz kontrolu** da isti test na klasičnoj ploči padne (43 prekršaja) -
  inače bi prolazio i kad pravilo ne bi radilo.
- **Solver soundness**: 56935 provjera, nijedan točan kandidat izgubljen (vidi gore).
- **Hint**: 1495 prijedloga, **nula krivih**, nula kontradikcija; 25/30 ploča riješeno
  samim upisima (ostalih 5 stane na eliminacijskom koraku koji harness ne primjenjuje).
  Najbolji rezultat dosad uz Nonconsecutive.
- **Render**: poravnanje 0.00px na sva četiri kuta na 375×812, 320×568 i 812×375
  (landscape). Najširi mogući zbroj (35) ima 7.4px zalihe na mobitelu i 5.4px na
  najužem ekranu. Bez Sandwicha ploča je i dalje puna širina wrapa (351px = 351px),
  a font ćelije točno 1/0.93 od Sandwich verzije - dakle raspored ostalih partija je
  nepromijenjen. Nula grešaka u konzoli; oznake prežive reload.
- **Meni**: test iz v1.40.1 proširen i prolazi - abecedni redoslijed (Sandwich između
  Renbana i Therma), svaki redak ima varijantu i labelu, `app.js` i `sudoku.js` dijele
  isti popis. **Varijanti je sada 19.**
- **Potvrđeno igranjem**: **Vatra odigrao Sandwich i potvrdio da je dobro.** Pri izradi
  vizualna provjera NIJE bila moguća - screenshot u ovom okruženju konzistentno pada u
  timeout - pa je render bio provjeren isključivo mjerenjem (geometrija, prelijevanje
  teksta, boja). To je bio najveći otvoreni rizik ove varijante: po pouci iz v1.40.0
  rizik je najveći kad se crta NEŠTO NOVO, a ovdje je novo bilo cijelo mjesto crtanja.
  Mjerenje je time potvrđeno kao dostatna zamjena za oko **u ovom slučaju** - kad je
  ono što se provjerava geometrijsko (širina pojasa, veličina fonta, poravnanje), dakle
  mjerljivo. Ne generalizirati na render kojem je pitanje "izgleda li dobro", ne
  "stoji li na mjestu".

## Stanje popisa kandidata (nakon v1.42.0)

Popis iz [dorada-varijante.md](dorada-varijante.md), otvoren nakon što je originalna
wish-lista iscrpljena u v1.34.x, sada je **isporučen do jedne stavke**:

| isporučeno                                                                        | preostalo     |
| --------------------------------------------------------------------------------- | ------------- |
| Disjoint Groups, German Whispers, Renban, Zipper, Arrow, Nonconsecutive, Sandwich | Little Killer |

**Render kanal izvan ploče je time otvoren i dokazan** (v1.42.0, potvrđen igranjem), pa
razlog zbog kojeg je ta skupina ostavljena za kraj više ne vrijedi. Little Killer
nasljeđuje gotov `.board-frame` s pojasom; posao koji mu preostaje je drugačiji:

- oznaka mu stoji uz **dijagonalu**, ne uz redak - dakle u pojasu, ali s pripadnom
  strelicom smjera, i na uglovima gdje se pojasevi sastaju (Sandwich taj kut ne koristi),
- odnos je čisti zbroj nad zadanim skupom ćelija, dakle **natrag na `cageRange` oblik** -
  Sandwicheva enumeracija mu ne treba, jer dijagonala je poznata unaprijed.

Uz njega ostaje otvoreno i **Daily Variant Mix** (v1.23.0 ideja, neplanirano) te
tehnički dug oko Thermo repova, izmjeren u v1.41.0.

Uz njih ostaje otvoreno i **Daily Variant Mix** (v1.23.0 ideja, neplanirano) te
tehnički dug oko Thermo repova, izmjeren u v1.41.0.

## Poznato / tehnički dug

- **Debeo rep kod kombinacija s Thermom** (izmjereno v1.41.0, zatečeno od ranije).
  `clone+thermo` na 50 ploča: medijan 13ms, ali max **30.9s** i 1/50 iznad 5s. Thermo
  sam je uredan (max 536ms), pa problem nastaje u kombinaciji. Isti fenomen dao je
  outliere od 374s (renban+thermo, v1.38.0) i 234s (nonconsecutive+thermo, v1.41.0),
  koji se ni jednom nisu reproducirali u ponovljenom mjerenju - dakle rijedak je, ali
  dubok. Nosi ga Cancel + worker (v1.17.0). **Ako se ikad uzme:** mjeriti na barem 50
  ploča s ispisom svake (N=20 daje 60× različite maksimume između pokretanja), i
  gledati troši li se vrijeme u `dig`-u ili u odbačenim pokušajima prije njega.
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
