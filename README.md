# Sudoku

Offline Sudoku PWA - radi u browseru, instalira se na telefon kao app. Bez servera, bez interneta nakon prvog učitavanja.

## Značajke

- Tri težine, klasificirane stvarnim **logičkim solverom** po najtežoj potrebnoj tehnici:
  - **Normalno** - rješivo samo skeniranjem (naked/hidden singles)
  - **Teško** - traži intermediate logiku (locked candidates, parovi/trojke), bez naprednih strategija
  - **Ekspert** - garantirano traži bar jednu naprednu tehniku (X-Wing ili XY-Wing); chip u statusu pokazuje koju
- Svaka slagalica ima jedinstveno rješenje i rješiva je bez pogađanja
- Bilješke (pencil marks), undo, brisanje
- **Pomoć** - objašnjava sljedeći logički potez korak po korak: prvi tap nagovijesti tehniku i regiju, drugi otkrije točno polje i broj; upozorava na pogrešne unose
- Highlight reda/stupca/kvadrata, istih brojeva i pogrešnih unosa (crveno)
- Auto-spremanje - nastavi gdje si stao (localStorage)
- Tamna tema, mobile-first, touch-friendly

## Kako radi grading

`solver.js` oponaša ljudsko rješavanje: primjenjuje tehnike od najlakše prema najtežoj i bilježi
najtežu koju je morao upotrijebiti. Generator (`sudoku.js`) vadi slagalice dok ne pogodi traženi
tier. Ekspert se uvijek može riješiti tehnikama X-Wing / XY-Wing - taman za vježbu.

## Instalacija na Android telefon

PWA treba HTTPS ili `localhost`. Najjednostavnije opcije:

### Opcija A - GitHub Pages (preporuka, jednom postavi pa zaboravi)

1. Push repo na GitHub
2. Settings → Pages → Source: `main` branch, `/root`
3. Otvori dobiveni `https://<user>.github.io/sudoku/` u Chromeu na telefonu
4. Izbornik (⋮) → **Add to Home screen** → igra dobije ikonu kao prava app

### Opcija B - lokalni server na PC-u (brzi test)

```bash
cd sudoku
python -m http.server 8000
```

Otvori `http://localhost:8000` na PC-u, ili `http://<PC-IP>:8000` na telefonu (isti WiFi).

## Tipke (desktop)

- `1-9` unos broja, `Backspace` briše, `N` toggle bilješki, `Ctrl+Z` undo, strelice navigacija

## Struktura

- `index.html` - kostur
- `sudoku.js` - generator/solver (backtracking + provjera jedinstvenosti)
- `app.js` - UI, unos, stanje, spremanje
- `style.css` - tamna tema
- `manifest.webmanifest` + `sw.js` - PWA (instalacija + offline cache)
- `icons/` - ikone aplikacije
