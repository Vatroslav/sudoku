// Sudoku metrics collector - Google Apps Script.
// Prima anonimne evente iz igre (fetch no-cors, text/plain) i upisuje red u Sheet.
// Deploy: New deployment -> Web app -> Execute as: Me, Who has access: Anyone.
// URL koji dobiješ (.../exec) ide u metrics.js -> METRICS_URL.

const SHEET_ID = "PASTE_SHEET_ID_HERE"; // iz URL-a Sheeta: /d/<OVO>/edit
const SHEET_NAME = "events";
const HEADER = [
  "ts",
  "session",
  "version",
  "env",
  "event",
  "game_id",
  "difficulty",
  "variants",
  "payload",
  "client_ts",
];

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const p = d.payload || {};
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    ensureHeader(sh);
    sh.appendRow([
      new Date(), // server timestamp
      d.session || "", // anon per-browser id
      d.version || "", // verzija igre (package.json)
      d.env || "", // 'dev' (localhost) | 'prod' (itch) | 'other'
      d.event || "", // 'game_started' | 'game_solved'
      p.gameId || "", // veže start <-> solve
      p.difficulty || "", // 'normal' | 'hard'
      (p.variants || []).join("+"), // '' = classic, npr. 'x+hyper'
      JSON.stringify(p), // cijeli payload (za buduća polja)
      d.ts || "", // client timestamp (ms)
    ]);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, err: String(err) });
  }
}

// Doda header (bold + zamrznut) kad je Sheet prazan. Ne dira postojeće podatke.
function ensureHeader(sh) {
  if (sh.getLastRow() > 0) return;
  sh.appendRow(HEADER);
  sh.getRange(1, 1, 1, HEADER.length).setFontWeight("bold");
  sh.setFrozenRows(1);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
