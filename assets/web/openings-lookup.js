/* Индекс дебютов: ключ позиции (первые 4 поля FEN) -> линия. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OpeningsLookup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Поле взятия на проходе в ключ не входит: lichess пишет там "-",
  // хотя после двойного хода пешки движок мог бы указать поле.
  function fenKey(fen) {
    const p = String(fen).trim().split(/\s+/);
    return p.slice(0, 3).join(" ") + " -";
  }

  function buildIndex(lines) {
    const index = Object.create(null);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const key = fenKey(line.k || line.fen || "");
      if (!key) continue;
      const prev = index[key];
      if (!prev || (line.name || "").length > (prev.name || "").length) index[key] = line;
    }
    return index;
  }

  function lookup(index, fen) {
    return index[fenKey(fen)] || null;
  }

  function family(line, guides) {
    if (!line || !line.name) return null;
    const full = line.name.toLowerCase();
    let best = null;
    let bestLen = 0;
    for (let i = 0; i < guides.length; i++) {
      const g = guides[i];
      const matches = g.match || [];
      for (let j = 0; j < matches.length; j++) {
        const m = String(matches[j]).toLowerCase();
        if (full.indexOf(m) >= 0 && m.length > bestLen) {
          best = g;
          bestLen = m.length;
        }
      }
    }
    return best;
  }

  function label(line, guides) {
    if (!line) return "";
    const g = family(line, guides || []);
    if (!g) return line.name;
    const sub = line.name.indexOf(":") >= 0 ? line.name.split(":").slice(1).join(":").trim() : "";
    return sub ? g.name + ": " + sub : g.name;
  }

  return { fenKey: fenKey, buildIndex: buildIndex, lookup: lookup, family: family, label: label };
});
