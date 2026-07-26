# itch.io store assets

Materijal za itch Project page (https://vatroslav.itch.io/sudoku-variants). Screenshotovi su
iz builda **v1.47.0** (headless render, portrait 520x1040); cover je stariji ali i dalje točan.

## Fajlovi

- `cover.png` - itch cover (630x500): naslov + tagline + pravi 9x9 grid u paleti igre
  (X-dijagonale poravnate s gridom, hyper-tint, odabrana ćelija). Generira ga `../make-cover.html`.
  Nabraja tri varijante uz **"+ more"**, pa ne zastarijeva kad se doda nova - ne treba ga
  regenerirati uz svaki release.
- `01-killer.png` - Killer partija: kavezi sa zbrojevima, plavi upisi, bilješke, boje.
- `02-variants.png` - New game meni: cijela lista varijanti, dvije uključene (Arrow + German
  Whispers) da se vidi kako izgleda odabir.
- `03-littlekiller.png` - Little Killer: pojas oznaka izvan mreže na sve četiri strane.
- `04-lines.png` - Thermo + Renban: dvije linijske varijante odjednom, s legendom ispod ploče.
- `05-jigsaw.png` - Jigsaw: nepravilne regije umjesto kvadrata.
- `description.html` - tekst store stranice (paste-ready HTML za Description). Izvor istine;
  držati ažurnim po verziji (oznaka u komentaru fajla).

**Izbor motiva nije proizvoljan**: svaki screenshot pokriva jedan RENDER KANAL, ne jednu
varijantu - kavez (obrub + zbroj u ćeliji), meni, oznaka izvan mreže, linija preko ćelija,
i geometrija regija. Varijanti je 20 i ne stanu na slike; kanala je pet i oni se vide.

Screenshotovi su iz **stvarne igre** - `../shot-harness.html` generira pravu slagalicu
(`Sudoku.generate`) i seeda `localStorage` uvjerljivim mid-solve stanjem (točni plavi upisi iz
rješenja, pencil bilješke, boje, odabir), pa `app.js` to učita i renderira. Nema workera ni timinga.

**Harness NE duplicira markup** - povlači `<body>` iz pravog `index.html`. Prije je imao
vlastitu kopiju i zato je istrunuo: nabrajao je 6 varijanti dok ih je igra imala 20, a stanje
je seedao u formatu od prije `clues` objekta, pa bi Killer ploča ispala **bez ijednog kaveza**.
Ako harness ikad opet treba znati nešto o UI-ju, to je znak da se ta stvar čita iz `index.html`,
ne da se prepiše ovamo.

## Regeneracija (cover + screenshotovi)

Oba generatora su u `promo/`. Posluži repo lokalno (`python -m http.server PORT`) pa headless render:

```
# cover (630x500)
msedge --headless=new --disable-gpu --hide-scrollbars --window-size=630,500 \
  --virtual-time-budget=4000 --screenshot=promo/itch/cover.png \
  http://localhost:PORT/promo/make-cover.html

# screenshot varijante (portrait 520x1040); ?v= je prazan (classic), killer, jigsaw,
# thermo,renban ... a ?menu= umjesto partije otvori meni s tim varijantama upaljenima
msedge --headless=new --disable-gpu --hide-scrollbars --window-size=520,1040 \
  --virtual-time-budget=15000 --screenshot=C:/apsolutni/put/promo/itch/01-killer.png \
  "http://localhost:PORT/promo/shot-harness.html?v=killer"
```

Dvije stvari koje se lako promaše:

- **`--screenshot` traži APSOLUTNI Windows put.** Relativan tiho padne s "cannot find the
  path specified" i file se ne napiše.
- **Za `?menu=` biraj varijante koje su u kadru.** Lista je abecedna i duža od ekrana, pa
  npr. `killer` i `littlekiller` budu upaljeni ispod ruba slike - vidi se lista, ali ne i
  da je išta odabrano.

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
- [ ] **Screenshots**: `01-killer.png`, `02-variants.png`, `03-littlekiller.png`, `04-lines.png`,
      `05-jigsaw.png`
- [ ] **Genre**: Puzzle
- [ ] **Tags**: sudoku, puzzle, logic, minimalist, singleplayer, mobile, offline, pwa, numbers, brain-training
- [ ] **AI generation disclosure**: odgovori po Vatrinoj procjeni (kod je AI-asistiran; grafika/zvuk/tekst nisu gen-AI)
- [ ] **Release status**: Released
- [ ] Ostavi **Draft** dok build nije gore i odigran u embedu -> tek onda **Public**
