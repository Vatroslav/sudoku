// Sudoku metrics collector - Google Apps Script.
// Prima anonimne evente iz igre (fetch no-cors, text/plain) i upisuje red u Sheet.
// Deploy: New deployment -> Web app -> Execute as: Me, Who has access: Anyone.
// URL koji dobijes (.../exec) ide u metrics.js -> METRICS_URL.

const SHEET_ID = "1JKhMghtg3dHOAVXM0EHGcdbwJoW0OmXvG105MrNt_Yw"; // iz URL-a Sheeta: /d/<OVO>/edit
const SHEET_NAME = "events";
// Nova polja se dodaju STROGO NA KRAJ - postojeci redovi tako ostanu poravnati
// (samo dobiju prazne nove kolone). Umetanje u sredinu bi im pomaknulo podatke.
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
  "play_ms",
  "moves",
  "hints",
  "waited_ms",
  "resumed"
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
      d.env || "", // 'dev' (localhost) | 'prod' (isporucena kopija)
      d.event || "", // app_opened | game_started | game_solved | game_cancelled
      p.gameId || "", // veze start <-> solve
      p.difficulty || "", // 'normal' | 'hard'
      (p.variants || []).join("+"), // '' = classic, npr. 'x+hyper'
      JSON.stringify(p), // cijeli payload (za buduca polja)
      d.ts || "", // client timestamp (ms)
      num(p.playMs), // game_solved: igrano vrijeme (ms, samo dok je kartica vidljiva)
      num(p.moves), // game_solved: broj unesenih brojeva
      num(p.hints), // game_solved: koliko je puta trazena pomoc
      num(p.waitedMs), // game_cancelled: koliko je cekao prije nego je odustao
      bool(p.resumed) // app_opened: je li zatecena spremljena partija
    ]);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, err: String(err) });
  }
}

// Prazna celija (a ne 0/false) kad polje ne pripada tom eventu - inace bi npr.
// svaki app_opened izgledao kao partija s 0 poteza i pokvario prosjeke.
function num(v) {
  return typeof v === "number" ? v : "";
}

function bool(v) {
  return typeof v === "boolean" ? v : "";
}

// Header (bold + zamrznut). Kad se doda novo polje, HEADER se produzi pa se prvi
// red prepise - stari redovi ostaju netaknuti, samo dobiju prazne nove kolone.
function ensureHeader(sh) {
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADER);
    sh.getRange(1, 1, 1, HEADER.length).setFontWeight("bold");
    sh.setFrozenRows(1);
    return;
  }
  const cur = sh.getRange(1, 1, 1, HEADER.length).getValues()[0];
  if (cur.join(" ") === HEADER.join(" ")) return;
  sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight("bold");
  sh.setFrozenRows(1);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}