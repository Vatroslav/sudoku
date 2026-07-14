# Sudoku metrike (game_started / game_solved)

Anoniman event tracking iz igre → Google Apps Script → Google Sheet. Bez PII
(samo anoniman per-browser id, verzija, težina, varijante). Klijent: [`../metrics.js`](../metrics.js).

Cilj: znati koliko se partija pokrene, kakvih (classic / varijanta / kombinacija) i
po kojoj težini, te koliko ih se riješi. Bez toga launch na itch nema signal koristi
li itko igru.

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

| event          | payload                            | kada                              |
| -------------- | ---------------------------------- | --------------------------------- |
| `game_started` | `{ gameId, difficulty, variants }` | ploča generirana i prikazana      |
| `game_solved`  | `{ gameId, difficulty, variants }` | zadnja ćelija točna (win overlay) |

- `game_started` se šalje tek kad ploča stvarno postoji - generiranje koje korisnik
  prekine **Cancelom nije partija** i ne broji se (inače bi razvodnilo completion rate).
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
