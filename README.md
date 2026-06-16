# Sudoku

Offline Sudoku PWA - radi u browseru, instalira se na telefon kao app. Bez servera, bez interneta nakon prvog učitavanja.

## Značajke
- Generator slagalica s 4 težine (Lako / Srednje / Teško / Ekspert), uvijek jedinstveno rješenje
- Bilješke (pencil marks), undo, brisanje, pomoć (hint)
- Brojanje grešaka, highlight reda/stupca/kvadrata i istih brojeva
- Auto-spremanje - nastavi gdje si stao (localStorage)
- Tamna tema, mobile-first, touch-friendly

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
