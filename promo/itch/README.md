# itch.io store assets

Materijal za itch Project page (https://vatroslav.itch.io/sudoku-variants). Generiran iz
builda **v1.23.0**. Screenshotovi su iz stvarne igre (headless render, portrait 520x1040).

## Fajlovi

- `cover.png` - itch cover (630x500): naslov + tagline + pravi 9x9 grid u paleti igre
  (hyper-tint, dijagonala, odabrana ćelija). Generira ga `../make-cover.html`.
- `01-variants.png` - New game meni: lista varijanti (Diagonal + Hyper uključeni),
  Normal/Hard težine. Glavni diferencijator igre.
- `02-gameplay.png` - ploča u tijeku: odabrana ćelija + highlight istog broja, numpad s
  brojem preostalih znamenki.
- `description.html` - tekst store stranice (paste-ready HTML za Description). Izvor istine;
  držati ažurnim po verziji (oznaka u komentaru fajla).

## Regeneracija covera

`make-cover.html` je samostalan (inline CSS/JS, bez asseta). Renderiraj na 630x500:

```
msedge --headless=new --disable-gpu --hide-scrollbars --window-size=630,500 \
  --virtual-time-budget=4000 --screenshot=promo/itch/cover.png \
  file:///C:/Users/mileu/github/sudoku/promo/make-cover.html
```

(ili posluži repo lokalno pa gađaj `http://localhost:PORT/promo/make-cover.html`).

Screenshotovi: pokreni igru (`python -m http.server`), headless render portrait prozora;
za meni/highlight stanja koristi privremenu HTML kopiju s ubačenim `<script>` koji otvori
meni / odabere ćeliju (vidi git povijest ovog commita za obrazac).

## Upload je ručni

butler / `/deploy-itch` gura **samo build igre**, ne postavke stranice. Cover, screenshotovi,
description, tagovi, embed - sve ide ručno kroz itch dashboard (**Edit game**). Prevuci
fajlove: cover je gore u formi, screenshotovi u **Screenshots** sekciji.

## Checklist itch postavki (ručno, prije Public)

- [ ] **Kind of project**: HTML
- [ ] Upload builda (radi `/deploy-itch`) + cekiraj **"This file will be played in the browser"**
- [ ] **Embed**: Manually set size, viewport **450x800** (portrait ~9:16); Mobile friendly ON,
      Fullscreen button ON, Automatically start OFF, scrollbars OFF
- [ ] **Cover image**: `cover.png`
- [ ] **Screenshots**: `01-variants.png`, `02-gameplay.png`
- [ ] **Genre**: Puzzle
- [ ] **Tags**: sudoku, puzzle, logic, minimalist, singleplayer, mobile, offline, pwa, numbers, brain-training
- [ ] **AI generation disclosure**: odgovori po Vatrinoj procjeni (kod je AI-asistiran; grafika/zvuk/tekst nisu gen-AI)
- [ ] **Release status**: Released
- [ ] Ostavi **Draft** dok build nije gore i odigran u embedu -> tek onda **Public**
