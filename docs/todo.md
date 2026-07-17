# TODO

Otvoreni plan za Sudoku. Arhitektura i redoslijed dodavanja varijanti opisani su u
[dorada-varijante.md](dorada-varijante.md) (klasifikacija: regijske → derivacijske →
geometrija-first). Regijske varijante su složene kao **kombinabilan skup** aktivnih
varijanti (`state.variants`, npr. `["x","hyper"]`): `sudoku.js` (`isValid`) i `solver.js`
(`ctxFor`/`namedFor`) komponiraju units/peers preko aktivnog skupa. Nije puni Constraint
registry - kad broj varijanti naraste (ili kad zatreba `setup`/`deriveClues`), procijeniti
isplati li se Faza 0 refaktor iz doca.

**Otvoreno: `clues` objekt umjesto pozicijskih parametara.** `isValid` ih ima 8
(`board, idx, val, variants, jig, parity, edges, thm`), svaki od zadnjih četiri smije
biti null. Thermo je namjerno dodan kao 8. parametar, ne kroz refaktor - miješati novu
varijantu i refaktor jezgre znači da se kod regresije ne zna tko ju je uzrokovao.
Sljedeći put: skupiti `parity`/`edges`/`thermos` u jedan `clues` objekt (mehanički,
ali dira sva 4 filea + save migraciju), čime svaka buduća derivacijska varijanta dodaje
**nula** parametara. Napraviti to PRIJE Palindromea, ne zajedno s njim.

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

- [x] Thermo (vrijednosti rastu duž termometra, v1.30.0). **Nije ispala
      geometrija-first** - vidi zasebnu sekciju niže.

Geometrija-first + relacijske (najteže - `setup` geometrije + relacijski `isValid`,
generacija mora dati jedinstveno rješenje):

- [ ] Palindrome (linija čita isto u oba smjera). Kao i Thermo, kandidat za
      derive-first: iz gotovog rješenja tražiti put čije se vrijednosti zrcale.
      Teže od Thermo šetnje (uvjet veže parove s oba kraja puta, ne susjedni korak),
      ali i dalje jeftinije od `setup`-prvo pristupa. Render nasljeđuje Thermo
      segmente (`thermo-seg`) - linija je ista mašinerija bez kuglice.
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

Palindrome nasljeđuje ovu mašineriju (ista linija bez kuglice) - i uštip i lijek.

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
