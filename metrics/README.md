# Sudoku metrike (game_started / game_solved)

Anoniman event tracking iz igre → Google Apps Script → Google Sheet, plus live
dashboard nad tim podacima. Bez PII (samo anoniman per-browser id, verzija, težina,
varijante). Klijent: [`../metrics.js`](../metrics.js).

Cilj: znati koliko se partija pokrene, kakvih (classic / varijanta / kombinacija) i
po kojoj težini, te koliko ih se riješi. Bez toga launch na itch nema signal koristi
li itko igru.

Isti obrazac kao **Left-right onwards** (`~/github/left-right-onwards-web/metrics`) -
postupak je opisan u `~/github/game-development/telemetrija.md`.

## Fileovi

| file                               | uloga                                                      |
| ---------------------------------- | ---------------------------------------------------------- |
| [`apps-script.gs`](apps-script.gs) | collector: `doPost` upisuje event kao red u Sheet          |
| [`dashboard.gs`](dashboard.gs)     | dashboard: `doGet` + `getData` (agregati, filter `my ids`) |
| [`Index.html`](Index.html)         | dashboard frontend (grafovi)                               |

Collector i dashboard dijele **isti Apps Script projekt**: `dashboard.gs` koristi
`SHEET_ID` / `SHEET_NAME` iz `apps-script.gs` i **ne smije ih redeklarirati**
(`const` duplikat ruši cijeli projekt). U editoru se HTML file mora zvati `Index`
(bez ekstenzije) - `doGet` ga traži po tom imenu.

## Postavljanje (jednokratno)

1. **Sheet**: novi Google Sheet, tab preimenuj u `events`. Header skripta doda
   **automatski** (bold + zamrznut) kad je Sheet prazan - ne treba ručno. Iz URL-a
   Sheeta uzmi ID (`/d/<ID>/edit`).
2. **Apps Script**: u Sheetu Extensions → Apps Script. Zalijepi
   [`apps-script.gs`](apps-script.gs), upiši `SHEET_ID`. Spremi.
3. **Deploy**: Deploy → New deployment → tip **Web app**. Execute as **Me**,
   Who has access **Anyone**. Kopiraj Web app URL (završava na `/exec`).
4. **Igra**: upiši taj URL u [`../metrics.js`](../metrics.js) → `METRICS_URL`.
   Dok je prazno, tracking je isključen (no-op) i igra radi normalno.

Sheet je zaseban od LRO-ovog (druge kolone, druga igra) - ne dijeliti endpoint.

## Dashboard (jednokratno)

Collector već upisuje evente; dashboard ih samo čita i crta. Kod je u repou
(`dashboard.gs` + `Index.html`), postavlja se u **isti** Apps Script projekt kao
collector, ali se deploya kao **zaseban** Web app.

1. **Kod**: u istom Apps Script projektu New file → Script, nazovi `dashboard`,
   zalijepi [`dashboard.gs`](dashboard.gs). Zatim New file → HTML, nazovi `Index`
   (točno tako, bez `.html`), zalijepi [`Index.html`](Index.html). Spremi.
   - `dashboard.gs` **ne** deklarira `SHEET_ID` / `SHEET_NAME` - nasljeđuje ih iz
     `apps-script.gs` (Code.gs). Ako collector file ima placeholder umjesto pravog
     `SHEET_ID`, upiši pravi ID tamo (ne u dashboard).
2. **`my ids` tab** (preporučeno): u Sheetu dodaj tab `my ids`, u kolonu A od reda 2
   zalijepi vlastite `session` id-eve (iz `sudoku_sid` u localStorageu, ili iz
   `session` kolone Sheeta za svoje partije). `getData` ih dinamički preskače, pa
   vlastito testiranje ne ulazi u brojke. Bez taba dashboard i dalje radi (filtrira
   samo `env=prod`).
3. **Deploy**: Deploy → New deployment → **Web app**, Execute as **Me**, Who has
   access **Anyone**. Taj `.../exec` URL je dashboard - radi u svakom browseru, bez
   logina. To je **novi** deployment, ne diraj collectorov (njegov URL je u igri).

### push ≠ live (kad mijenjaš dashboard)

Web app servira **zamrznutu deployanu verziju**, ne zadnji spremljeni kod. Nakon
izmjene `dashboard.gs` / `Index.html`: Deploy → Manage deployments → uredi dashboard
deployment → **New version** (ili `@HEAD` deployment za brzu probu). Sam Save ne
osvježava javni URL.

### Dva pravila (ista kao LRO)

- **`getData` vraća samo agregate.** URL je javan (Access: Anyone) - tko ga ima,
  vidi sve što `getData` vrati. Brojevi, postoci, distribucije: da. Sirovi session
  id-evi: nikad.
- **Vlastite partije se filtriraju** - `env=prod` (miče dev) + tab `my ids`
  (miče vlastito testiranje na produ). Bez toga vlastito igranje izgleda kao promet.

### Što crta

- **KPI** - sesije, započete/riješene partije, completion %, medijan vremena, otvaranja.
- **Aktivnost po danu** - sesije i započete partije, + tablica (otvaranja, riješeno,
  odustalo). Dani prije uvođenja pojedinog eventa su crtica, ne nula (nije se mjerilo).
- **Obujam partija** - otvaranje → započeto → riješeno, s completion stopom.
- **Po težini** - Normal vs Hard: koliko se započne/riješi, medijan vremena i hintova.
- **Po varijanti** - popularnost (širina = započeto) i dovršenost (puna traka =
  riješeno); niska completion je crvena (varijanta pretežak/frustrira).

Sve **po partiji, ne po sesiji** (`gameId` veže start↔solve): session je per-browser
i preživi restart, pa jedna sesija drži više partija - miješanje daje krive brojke.

## Okruženja (dev vs prod)

Isto značenje kao `import.meta.env.DEV` u LRO-u (`~/github/left-right-onwards-web`),
samo bez build systema: **dev = ono što pokrećem sam, prod = svaka isporučena kopija**.

| env    | kada                                                      |
| ------ | --------------------------------------------------------- |
| `dev`  | `localhost`, `127.0.0.1`, `[::1]`, `*.local`, `file://`   |
| `prod` | bilo koji drugi host (itch i sve ostalo što je deployano) |

Itch hostovi se namjerno **ne nabrajaju**: igra se tamo servira iz iframea na CDN
domeni koja se može promijeniti, pa bi lista bila pogađanje koje tiho zakaže - eventi
s itcha bi ispali iz prod brojki, a da se to nigdje ne vidi. "Nije moj lokalni host"
je provjerljivo i ne može tiho propasti.

**Svaka analiza mora filtrirati `env = 'prod'`** - inače lokalno testiranje ulazi u
brojke. Dev evente ne brišemo, korisni su za provjeru da tracking uopće radi.

## Eventi

| event            | payload                                                                          | kada                              |
| ---------------- | -------------------------------------------------------------------------------- | --------------------------------- |
| `app_opened`     | `{ resumed }` (+ `gameId/difficulty/variants/solved` ako je nastavljena partija) | svako otvaranje igre              |
| `game_started`   | `{ gameId, difficulty, variants }`                                               | ploča generirana i prikazana      |
| `game_solved`    | `{ gameId, difficulty, variants, playMs, moves, hints }`                         | zadnja ćelija točna (win overlay) |
| `game_cancelled` | `{ difficulty, variants, waitedMs }`                                             | Cancel na generiranju             |

- `app_opened` je jedini trag povratnika: tko nastavi spremljenu partiju ne generira
  novu ploču, pa bez ovoga ne proizvede nijedan event. Bez njega su sesije i povrati
  nevidljivi, a nema ni nazivnika za ostale brojke.
- `game_started` se šalje tek kad ploča stvarno postoji - generiranje koje korisnik
  prekine **Cancelom nije partija** i ne broji se (inače bi razvodnilo completion rate).
- `game_cancelled` mjeri odustajanje od spore HARD generacije varijanti (poznati
  tehnički dug): `waitedMs` je koliko je čekao prije nego je prekinuo.
- `playMs` je **igrano** vrijeme - sat teče samo dok je kartica vidljiva, pa partija
  ostavljena otvorena preko noći ne daje besmislenih 10 sati. `moves` broji unose
  brojeva (ne bilješke ni boje), `hints` koliko je puta tražena pomoć.
- U Sheetu se nova polja pišu **na kraj** reda (`play_ms`, `moves`, `hints`,
  `waited_ms`, `resumed`); prazna ćelija znači "polje ne pripada tom eventu", pa
  `app_opened` ne izgleda kao partija s 0 poteza.
- `gameId` (uuid po partiji) veže start↔solve, pa je completion rate mjerljiv po
  partiji, ne samo agregatno. Živi u `state` → preživi reload kroz localStorage.
- `difficulty` je `normal` / `hard`; `variants` je polje (`[]` = classic,
  `["x","hyper"]` = kombinacija) - u Sheetu se zapisuje i kao `x+hyper`.
- Igre spremljene prije uvođenja metrika nemaju `gameId` (prazan) - njihov solve
  nema pripadajući start.

## Napomene

- URL nije secret (klijent ga otkriva u network tabu) - smije u repo.
- Fire-and-forget: `no-cors` + `keepalive`, response se ne čita, sve u `try/catch`.
  Tracking ne smije srušiti ni usporiti igru.
- Spam otpornost je minimalna; ako zatreba, dodaj shared token u payload koji
  `doPost` provjerava. Za sad nepotrebno (mala igra, Apps Script kvote dostatne).
