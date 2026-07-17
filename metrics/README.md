# Sudoku metrike (game_started / game_solved)

Anoniman event tracking iz igre → Google Apps Script → Google Sheet, plus live
dashboard nad tim podacima. Bez PII (samo anoniman per-browser id, verzija, težina,
varijante). Klijent: [`../metrics.js`](../metrics.js).

Cilj: znati koliko se partija pokrene, kakvih (classic / varijanta / kombinacija) i
po kojoj težini, te koliko ih se riješi. Bez toga launch na itch nema signal koristi
li itko igru.

Isti obrazac kao **Left-right onwards** (`~/github/left-right-onwards-web/metrics`) -
opći postupak je u `~/github/game-development/telemetrija.md`. Apps Script kod je
verzioniran ovdje i sinkan **claspom** - ne lijepiti ručno u editor.

## Fileovi (`apps-script/`)

| file                                            | uloga                                                       |
| ----------------------------------------------- | ----------------------------------------------------------- |
| [`Code.js`](apps-script/Code.js)                | collector: `doPost` upisuje event kao red u Sheet           |
| [`dashboard.js`](apps-script/dashboard.js)      | dashboard: `doGet` + `getData` (agregati, filter `my ids`)  |
| [`Index.html`](apps-script/Index.html)          | dashboard frontend (grafovi)                                |
| [`appsscript.json`](apps-script/appsscript.json)| manifest (webapp: execute as me, access anyone)             |

Lokalno su `.js`, gore su `.gs` - clasp konvertira u oba smjera. HTML file se u
editoru zove `Index` (bez ekstenzije), `doGet` ga traži po tom imenu.

Collector i dashboard dijele **isti Apps Script projekt**: `dashboard.js` koristi
`SHEET_ID` / `SHEET_NAME` iz `Code.js` i **ne smije ih redeklarirati** (`const`
duplikat ruši cijeli projekt).

## clasp workflow

Auth (`~/.clasprc.json`) je vezan na **flamefame@gmail.com** - Sheet i skripta žive
na tom računu. Isti račun kao LRO.

```bash
cd metrics/apps-script
clasp status    # sto bi se pushalo
clasp push      # posalji izmjene u projekt (HEAD)
```

Ako `clasp push` javi problem s permisijama: `clasp login` na flamefame i na consent
ekranu **označiti checkboxove** (bez toga login "uspije" ali token nosi samo profil).
Traži i uključen Apps Script API: <https://script.google.com/home/usersettings>

### push ≠ live

Web app servira **deployanu verziju**, ne HEAD. `clasp push` sam po sebi ne mijenja
ono što javni URL-ovi vraćaju.

```bash
clasp list-deployments               # popis + koja verzija je na kojem
clasp update-deployment <id>         # tek OVO osvjezava javni URL (redeploy)
clasp create-deployment -d "opis"    # novi deployment (npr. za dashboard)
```

## Deploymenti

- **collector** (`@4`, id `AKfycbydNb2L5QtAqMrRyD7QBRpMNjOM06OTmNXWlUo-PrDinyVttSelQEz9Cjsrf6LEQ7ju`) -
  URL je u [`../metrics.js`](../metrics.js) → `METRICS_URL`. Radi; **ne dirati** bez
  razloga (redeploy = rizik da tracking stane).
- **dashboard** (`@5`, "Sudoku dashboard v1") - javni dashboard URL:
  <https://script.google.com/macros/s/AKfycbxZ8JLov_Q9l2WqnpWEFNHhHp_Eykc33IDynS0toBsNlJhq40J7NJm9EGTreU9dZ9Mi/exec>
  Izmjene dashboarda traže `clasp push` **i** `clasp update-deployment` tog id-a.
- **@HEAD** - dev deployment, uvijek najnoviji kod. Dobar za probu prije redeploya.

## `my ids` tab (filtar vlastitih partija)

U Sheetu tab `my ids`, kolona A od reda 2 = vlastiti `session` id-evi (iz
`sudoku_sid` u localStorageu, ili iz `session` kolone Sheeta za svoje partije).
`getData` ih dinamički preskače, pa vlastito testiranje ne ulazi u brojke. Bez taba
dashboard i dalje radi (filtrira samo `env=prod`).

## Dva pravila (ista kao LRO)

- **`getData` vraća samo agregate.** URL je javan (Access: Anyone) - tko ga ima,
  vidi sve što `getData` vrati. Brojevi, postoci, distribucije: da. Sirovi session
  id-evi: nikad.
- **Vlastite partije se filtriraju** - `env=prod` (miče dev) + tab `my ids`
  (miče vlastito testiranje na produ). Bez toga vlastito igranje izgleda kao promet.

## Što dashboard crta

- **KPI** - sesije, započete/riješene partije, completion %, medijan vremena, otvaranja.
- **Aktivnost po danu** - sesije i započete partije, + tablica (otvaranja, riješeno,
  odustalo). Dani prije uvođenja pojedinog eventa su crtica, ne nula (nije se mjerilo).
- **Obujam partija** - otvaranje → započeto → riješeno, s completion stopom.
- **Po težini** - Normal vs Hard: koliko se započne/riješi, medijan vremena i hintova.
- **Po varijanti** - popularnost (širina = započeto) i dovršenost (puna traka =
  riješeno); niska completion je crvena (varijanta pretežak/frustrira).

Sve **po partiji, ne po sesiji** (`gameId` veže start↔solve): session je per-browser
i preživi restart, pa jedna sesija drži više partija - miješanje daje krive brojke.

## Collector od nule (ako ikad treba novi Sheet)

1. **Sheet**: novi Google Sheet, tab preimenuj u `events`. Header skripta doda
   **automatski** (bold + zamrznut) kad je Sheet prazan. Iz URL-a Sheeta uzmi ID
   (`/d/<ID>/edit`).
2. **Kod**: upiši novi `SHEET_ID` u `apps-script/Code.js`, `clasp push`.
3. **Deploy**: `clasp create-deployment -d "collector"`. Taj `.../exec` URL ide u
   [`../metrics.js`](../metrics.js) → `METRICS_URL`. Dok je prazno, tracking je no-op.

Sheet je zaseban od LRO-ovog (druge kolone, druga igra) - ne dijeliti endpoint.

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
