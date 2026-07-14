/* Anonimni event tracking (koliko se partija pokrene, kakvih, i koliko ih se riješi).
   Šalje na Google Apps Script web app (doPost -> Sheet). Vidi metrics/README.md.

   Načela: nikad ne ruši igru (sve u try/catch), ne blokira (fire-and-forget),
   bez PII (anoniman per-browser id), i NO-OP dok METRICS_URL nije postavljen. */
(() => {
  "use strict";

  /** Apps Script web app URL (.../exec). Prazno = tracking isključen (no-op).
      Nije secret (klijent ga svejedno otkriva u network tabu), pa smije u repo. */
  const METRICS_URL =
    "https://script.google.com/macros/s/AKfycbydNb2L5QtAqMrRyD7QBRpMNjOM06OTmNXWlUo-PrDinyVttSelQEz9Cjsrf6LEQ7ju/exec";

  const SID_KEY = "sudoku_sid";

  // Okruženje: lokalno testiranje ne smije zagaditi produkcijske brojke.
  // Isto značenje kao `import.meta.env.DEV` u LRO-u, samo bez build systema: dev je
  // ono što pokrećem sam (dev server / file://), prod je svaka isporučena kopija.
  // Namjerno se NE nabrajaju itch hostovi - igra se servira iz iframea na CDN
  // domeni koja se može promijeniti, pa bi lista bila pogađanje; "nije moj lokalni
  // host" je provjerljivo i ne može tiho zakazati.
  const DEV_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];
  function env() {
    try {
      const h = location.hostname;
      // file:// nema hostname (prazan) - to je lokalno otvoren file, dakle dev.
      if (!h || DEV_HOSTS.includes(h) || h.endsWith(".local")) return "dev";
      return "prod";
    } catch {
      return "prod";
    }
  }

  function uuid() {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch {
      /* padni na fallback */
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // Anoniman, per-browser id (localStorage). Bez ikakvog PII.
  function sessionId() {
    try {
      let id = localStorage.getItem(SID_KEY);
      if (!id) {
        id = uuid();
        localStorage.setItem(SID_KEY, id);
      }
      return id;
    } catch {
      return "nostore";
    }
  }

  // Verzija iz package.json (isti izvor istine kao prikaz u headeru). Dohvat je
  // lijen i jednokratan; eventi prije njega čekaju u lancu obećanja, ne gube se.
  let versionP = null;
  function version() {
    if (!versionP) {
      versionP = fetch("./package.json")
        .then((r) => r.json())
        .then((p) => (p && p.version) || "")
        .catch(() => "");
    }
    return versionP;
  }

  function send(body) {
    // no-cors + text/plain = "simple request" (bez CORS preflighta koji Apps
    // Script ne podržava); response se ne čita, bitan je samo upis s druge strane.
    fetch(METRICS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      /* mrežna greška u trackingu se svjesno ignorira */
    });
  }

  /** Pošalji jedan event. `payload` su neosjetljivi podaci (difficulty, variants...). */
  function track(event, payload) {
    if (!METRICS_URL) return;
    try {
      const base = {
        session: sessionId(),
        env: env(),
        event,
        payload: payload || {},
        ts: Date.now(),
      };
      version()
        .then((v) => send({ ...base, version: v }))
        .catch(() => {});
    } catch {
      /* tracking nikad ne smije srušiti igru */
    }
  }

  window.Metrics = { track, uuid, env };
})();
