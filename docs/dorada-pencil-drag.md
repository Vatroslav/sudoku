# Dorada: pencil drag (brush unos kandidata)

> **Status: implementirano (v1.1.0).** Odstupanje od plana: umjesto "drag samo dodaje",
> smjer poteza određuje početna ćelija - ako već ima taj kandidat, cijeli potez briše,
> inače dodaje. Time je sačuvano brisanje pojedinačne bilješke (jedan tap = toggle), a
> potez i dalje ne miješa dodavanje i brisanje. U notes modu numpad bira "kist"
> (`state.activeNote`); van notes moda klik i dalje samo selektira.

## Cilj

Trenutno se pencil brojevi (bilješke/kandidati) unose "selektiraj ćeliju → uključi Bilješke → klikni broj na numpadu". Želim moći **povući preko više ćelija** i u svaku upisati isti pencil broj (kao kist). Posebno korisno na mobitelu.

## Trenutno stanje (`app.js`)

- Input je `cell.addEventListener("click", () => selectCell(i))` (oko linije 50): klik → `state.selected = idx`.
- Broj se unosi `inputNumber(n)` na selektiranu ćeliju. U notes modu (`state.notesMode`) dodaje/miče kandidat iz `state.notes[idx]` (polje brojeva), inače upisuje vrijednost (oko linije 130-135).
- `state.notes` = polje od 81 polja brojeva; perzistira u localStorage.
- Undo: `pushHistory()` snima stanje; `undo()` vraća prethodno.

## Izmjene

1. **Model "broj-pa-povuci":** dodaj `state.activeNote` (broj koji se maže). U notes modu klik na numpad ne unosi odmah nego postavi `activeNote` i istakne taj gumb. (Alternativa bez novog stanja: brush maže zadnje korišteni broj - jednostavnije, ali manje jasno.)

2. **Zamijeni `click` pointer-eventima na ćelijama:**
   - `pointerdown` na ćeliji → `dragging = true`, snimi undo stanje (početak poteza), primijeni na tu ćeliju.
   - `pointerenter` na ćeliji dok je `dragging` → primijeni.
   - `pointerup` na `window` → `dragging = false`.
   - **Van notes moda** `pointerdown` radi kao dosad (samo selekcija ćelije).

3. **"Primijeni" u notes modu** = dodaj `activeNote` u `state.notes[idx]` ako ga još nema. Drag samo **dodaje** (ne toggla), da povlačenjem ne brišeš usput ono što si maloprije upisao. Preskoči ćelije koje već imaju upisanu vrijednost (`state.values[idx] !== 0`).

4. **CSS:** `#board` mora imati `touch-action: none` da povlačenje ne skrola stranicu. Provjeri da je na boardu, ne samo na body.

5. **Undo = jedan drag jedan korak:** snimi stanje na `pointerdown`, ne na svaku ćeliju koju drag prijeđe.

## Provjera

- Uključi Bilješke, odaberi broj, povuci dijagonalno preko praznih ćelija → u svaku se upiše taj kandidat.
- Povlačenje ne skrola stranicu (mobitel + desktop).
- Jedan potez povlačenja = jedan Undo.
- Ćelije s upisanom vrijednošću se preskaču.
- Van Bilješki, klik i dalje samo selektira (ne maže).
