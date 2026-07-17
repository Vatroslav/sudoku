// Sudoku Telemetrija - live dashboard (GET). Živi u ISTOM Apps Script projektu kao
// collector (doPost u apps-script.gs). NE redeklarira SHEET_ID / SHEET_NAME - koristi
// globale iz collectora (const duplikat ruši cijeli projekt). Deploy kao ZASEBAN Web
// app (Execute as: Me, Access: Anyone) -> taj .../exec URL je dashboard.
//
// Dva pravila (ista kao LRO):
//  - getData vraća SAMO agregate. URL je javan; sirovi session id-evi nikad van.
//  - Vlastite partije se filtriraju: env='prod' + tab "my ids" (dinamički).

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Sudoku Telemetrija")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function getData() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var tz = ss.getSpreadsheetTimeZone() || "Europe/Zagreb";
  var sh = ss.getSheetByName(SHEET_NAME);
  var last = sh ? sh.getLastRow() : 0;
  if (!sh || last < 2) return emptyPayload_(ss, tz);

  // Isključi vlastite partije - tab "my ids", kolona A od reda 2. Dinamički
  // (sinkano sa Sheetom): nova vlastita sesija = jedan redak, bez diranja koda.
  var excl = {};
  var midSh = ss.getSheetByName("my ids");
  if (midSh && midSh.getLastRow() >= 2) {
    var idVals = midSh.getRange(2, 1, midSh.getLastRow() - 1, 1).getValues();
    for (var e = 0; e < idVals.length; e++) {
      var id = String(idVals[e][0]).trim();
      if (id) excl[id] = 1;
    }
  }

  // A:O = ts, session, version, env, event, game_id, difficulty, variants,
  //       payload, client_ts, play_ms, moves, hints, waited_ms, resumed
  var rows = sh.getRange(2, 1, last - 1, 15).getValues();
  var dayKey = function (d) {
    return Utilities.formatDate(d, tz, "yyyy-MM-dd");
  };
  var dayLabel = function (key) {
    return key.slice(8, 10) + "." + key.slice(5, 7) + ".";
  };

  var perDay = {}; // key -> { s:{}, o, st, so, c }
  var sessionsAll = {};
  var opened = 0,
    started = 0,
    solved = 0,
    cancelled = 0;
  var firstDay = {}; // event -> najraniji dan (honest null prije uvođenja eventa)
  var solveMsAll = []; // playMs riješenih (za medijan vremena)
  var byDiff = {}; // 'normal'/'hard' -> { started, solved, ms:[], hints:[] }
  var byVar = {}; // variantKey -> { started, solved, ms:[], hints:[] }

  var bucket = function (map, k) {
    if (!map[k]) map[k] = { started: 0, solved: 0, ms: [], hints: [] };
    return map[k];
  };
  var pushNum = function (arr, v) {
    if (typeof v === "number" && !isNaN(v)) arr.push(v);
  };

  for (var i = 0; i < rows.length; i++) {
    var ts = rows[i][0];
    var session = rows[i][1];
    var env = rows[i][3];
    var event = rows[i][4];
    var difficulty = rows[i][6] || "";
    var variants = rows[i][7]; // '' = classic, npr. 'x+hyper'
    var playMs = rows[i][10];
    var hints = rows[i][12];

    if (env !== "prod") continue;
    if (excl[String(session).trim()]) continue;
    if (!(ts instanceof Date)) continue;

    var key = dayKey(ts);
    if (!perDay[key]) perDay[key] = { s: {}, o: 0, st: 0, so: 0, c: 0 };
    sessionsAll[session] = 1;
    perDay[key].s[session] = 1;

    if (event && (firstDay[event] == null || key < firstDay[event])) firstDay[event] = key;

    if (event === "app_opened") {
      opened++;
      perDay[key].o++;
    } else if (event === "game_started") {
      started++;
      perDay[key].st++;
    } else if (event === "game_solved") {
      solved++;
      perDay[key].so++;
    } else if (event === "game_cancelled") {
      cancelled++;
      perDay[key].c++;
    }

    // Breakdown po težini i varijanti - samo partije (started/solved), ne otvaranja.
    var vkey = variants ? String(variants) : "classic";
    if (event === "game_started") {
      if (difficulty) bucket(byDiff, difficulty).started++;
      bucket(byVar, vkey).started++;
    } else if (event === "game_solved") {
      pushNum(solveMsAll, playMs);
      if (difficulty) {
        var bd = bucket(byDiff, difficulty);
        bd.solved++;
        pushNum(bd.ms, playMs);
        pushNum(bd.hints, hints);
      }
      var bv = bucket(byVar, vkey);
      bv.solved++;
      pushNum(bv.ms, playMs);
      pushNum(bv.hints, hints);
    }
  }

  // Dnevni redovi. Event-kolonu prije prvog dana tog eventa vraćamo kao null
  // (frontend crta crticu) - da dan prije uvođenja eventa ne izgleda kao stvarna nula.
  var keys = Object.keys(perDay).sort();
  var daily = keys.map(function (k) {
    var d = perDay[k];
    var g = function (ev, v) {
      return firstDay[ev] != null && k >= firstDay[ev] ? v : null;
    };
    return {
      d: dayLabel(k),
      s: Object.keys(d.s).length,
      o: g("app_opened", d.o),
      st: g("game_started", d.st),
      so: g("game_solved", d.so),
      c: g("game_cancelled", d.c),
    };
  });

  var diffOrder = ["normal", "hard"];
  var difficulty = diffOrder
    .filter(function (k) {
      return byDiff[k];
    })
    .map(function (k) {
      return summRow_(k, byDiff[k]);
    });

  var variants = Object.keys(byVar)
    .map(function (k) {
      return summRow_(k, byVar[k]);
    })
    .sort(function (a, b) {
      return b.started - a.started || b.solved - a.solved;
    });

  return {
    generatedAt: Utilities.formatDate(new Date(), tz, "dd.MM.yyyy HH:mm"),
    sheetUrl: ss.getUrl(),
    sheetName: SHEET_NAME,
    kpis: {
      sessions: Object.keys(sessionsAll).length,
      opened: opened,
      started: started,
      solved: solved,
      cancelled: cancelled,
      completionPct: started ? Math.round((solved / started) * 100) : 0,
      medianSolveMs: median_(solveMsAll),
      days: keys.length,
    },
    daily: daily,
    funnel: { opened: opened, started: started, solved: solved },
    difficulty: difficulty,
    variants: variants,
  };
}

function summRow_(key, b) {
  return {
    key: key,
    started: b.started,
    solved: b.solved,
    completionPct: b.started ? Math.round((b.solved / b.started) * 100) : null,
    medianMs: median_(b.ms),
    medianHints: median_(b.hints),
  };
}

function median_(arr) {
  if (!arr || !arr.length) return 0;
  var a = arr.slice().sort(function (x, y) {
    return x - y;
  });
  var n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

function emptyPayload_(ss, tz) {
  return {
    generatedAt: Utilities.formatDate(new Date(), tz, "dd.MM.yyyy HH:mm"),
    sheetUrl: ss ? ss.getUrl() : "",
    sheetName: SHEET_NAME,
    kpis: {
      sessions: 0,
      opened: 0,
      started: 0,
      solved: 0,
      cancelled: 0,
      completionPct: 0,
      medianSolveMs: 0,
      days: 0,
    },
    daily: [],
    funnel: { opened: 0, started: 0, solved: 0 },
    difficulty: [],
    variants: [],
  };
}
