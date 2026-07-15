# itch.io store assets

Materijal za itch Project page (https://vatroslav.itch.io/sudoku-variants). Generiran iz
builda **v1.23.0**. Screenshotovi su iz stvarne igre (headless render, portrait 520x1040).

## Fajlovi

- `cover.png` - itch cover (630x500): naslov + tagline + pravi 9x9 grid u paleti igre
  (X-dijagonale poravnate s gridom, hyper-tint, odabrana ćelija). Generira ga `../make-cover.html`.
- `01-jigsaw.png` - Jigsaw partija u tijeku: nepravilne regije, plavi upisi, bilješke, boje.
- `02-variants.png` - New game meni: lista varijanti (Diagonal + Hyper uključeni), Normal/Hard.
- `03-diagonal.png` - Diagonal partija: plave X-dijagonale + play stanje.
- `04-hyper.png` - Hyper partija: četiri dodatna prozora (ljubičasti tint) + play stanje.
- `description.html` - tekst store stranice (paste-ready HTML za Description). Izvor istine;
  držati ažurnim po verziji (oznaka u komentaru fajla).

Screenshotovi su iz **stvarne igre** - `../shot-harness.html` sinkrono generira pravu slagalicu
(`Sudoku.generate`) i seeda `localStorage` s uvjerljivim mid-solve stanjem (točni plavi upisi iz
rješenja, pencil bilješke, boje, odabir), pa `app.js` to učita i renderira. Nema workera ni timinga.

## Regeneracija (cover + screenshotovi)

Oba generatora su u `promo/`. Posluži repo lokalno (`python -m http.server PORT`) pa headless render:

```
# cover (630x500)
msedge --headless=new --disable-gpu --hide-scrollbars --window-size=630,500 \
  --virtual-time-budget=4000 --screenshot=promo/itch/cover.png \
  http://localhost:PORT/promo/make-cover.html

# screenshot varijante (portrait 520x1040); ?v= je prazan (classic), x, hyper, jigsaw...
msedge --headless=new --disable-gpu --hide-scrollbars --window-size=520,1040 \
  --virtual-time-budget=10000 --screenshot=promo/itch/01-jigsaw.png \
  "http://localhost:PORT/promo/shot-harness.html?v=jigsaw"
```

(`make-cover.html` je samostalan pa radi i preko `file:///`; `shot-harness.html` treba
posluženo jer učitava `../app.js` i drugove.)

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
- [ ] **Screenshots**: `01-jigsaw.png`, `02-variants.png`, `03-diagonal.png`, `04-hyper.png`
- [ ] **Genre**: Puzzle
- [ ] **Tags**: sudoku, puzzle, logic, minimalist, singleplayer, mobile, offline, pwa, numbers, brain-training
- [ ] **AI generation disclosure**: odgovori po Vatrinoj procjeni (kod je AI-asistiran; grafika/zvuk/tekst nisu gen-AI)
- [ ] **Release status**: Released
- [ ] Ostavi **Draft** dok build nije gore i odigran u embedu -> tek onda **Public**
