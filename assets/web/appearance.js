(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CaissaAppearance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const palettes = {
    classic: { bg: "#302e2b", panel: "#262421", panel2: "#21201d", line: "#3d3a37", text: "#e6e6e6", muted: "#a3a2a0", accent: "#81b64c", "accent-dark": "#6a9a3d", light: "#ebecd0", dark: "#779556" },
    gruvbox: { bg: "#282828", panel: "#32302f", panel2: "#1d2021", line: "#504945", text: "#ebdbb2", muted: "#bdae93", accent: "#b8bb26", "accent-dark": "#98971a", light: "#ebdbb2", dark: "#a18462" },
    catppuccin: { bg: "#1e1e2e", panel: "#242436", panel2: "#181825", line: "#45475a", text: "#cdd6f4", muted: "#a6adc8", accent: "#cba6f7", "accent-dark": "#b58add", light: "#cdd6f4", dark: "#7687ab" }
  };
  const themes = [{ id: "classic", name: "Classic" }, { id: "gruvbox", name: "Gruvbox" }, { id: "catppuccin", name: "Catppuccin" }];
  const pieceSets = [{ id: "cburnett", name: "Cburnett" }, { id: "merida", name: "Merida" }, { id: "chessnut", name: "Chessnut" }, { id: "celtic", name: "Celtic" }];
  let current = { theme: "classic", pieces: "cburnett" };

  function normalize(settings) {
    settings = settings || {};
    return {
      theme: themes.some(function (theme) { return theme.id === settings.theme; }) ? settings.theme : "classic",
      pieces: pieceSets.some(function (set) { return set.id === settings.pieces; }) ? settings.pieces : "cburnett"
    };
  }

  function apply(settings) {
    current = normalize(settings);
    const el = root.document && root.document.documentElement;
    if (el) {
      el.setAttribute("data-theme", current.theme);
      el.setAttribute("data-pieces", current.pieces);
      Object.keys(palettes[current.theme]).forEach(function (key) {
        el.style.setProperty("--" + key, palettes[current.theme][key]);
      });
    }
    return { theme: current.theme, pieces: current.pieces };
  }

  function pieceUrl(code, setId) {
    if (!/^[wb][PNBRQK]$/.test(code)) return "";
    const pieces = setId === undefined ? current.pieces : normalize({ pieces: setId }).pieces;
    return "pieces/" + (pieces === "cburnett" ? "" : pieces + "/") + code + ".svg";
  }

  return { themes: themes, pieceSets: pieceSets, palettes: palettes, normalize: normalize, apply: apply, pieceUrl: pieceUrl };
});
