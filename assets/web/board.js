/* Доска: отрисовка, тап-тап и перетаскивание, подсветка, стрелка. */
(function (root, factory) {
  const Chess = (typeof module === "object" && module.exports) ? require("./chess.js") : root.ChessLogic;
  const api = factory(Chess, root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FisherBoard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Chess, root) {
  "use strict";

  const FILES = "abcdefgh";
  const PIECE_NAMES = { p: "P", n: "N", b: "B", r: "R", q: "Q", k: "K" };
  const REVIEW_KEYS = ["brilliant", "great", "best", "excellent", "good", "book", "forced", "equal", "inaccuracy", "mistake", "missed", "miss", "blunder"];

  function reviewTint(annotation) {
    if (!annotation || REVIEW_KEYS.indexOf(annotation.key) < 0) return "";
    const color = annotation.key === "great" ? "#5d91b2" : annotation.color;
    if (!/^#[0-9a-f]{6}$/i.test(color || "")) return "";
    return "rgba(" + [1, 3, 5].map(function (offset) { return parseInt(color.slice(offset, offset + 2), 16); }).join(", ") + ", 0.26)";
  }

  function sqIndex(file, rank) { return rank * 8 + file; }

  function create(el, opts) {
    opts = opts || {};
    el.classList.add("board");
    el.innerHTML = '<div class="sq-layer"></div><div class="check-layer"></div><div class="pc-layer"></div><svg class="arrow-layer" viewBox="0 0 8 8" aria-hidden="true"></svg><div class="mark-layer"></div>';
    const sqLayer = el.querySelector(".sq-layer");
    const pcLayer = el.querySelector(".pc-layer");
    const checkLayer = el.querySelector(".check-layer");
    const arrowLayer = el.querySelector(".arrow-layer");
    const markLayer = el.querySelector(".mark-layer");
    const pieces = new Array(64);
    let annotations = [], marks = Object.create(null), positionFen = "";
    let pointerId = null;
    let orientation = opts.orientation || "w";
    let state = null, inputState = null, inputMoves = null, premove = null;
    let selected = null;
    let lastMove = null;
    let showArrow = true;
    let arrow = null;
    let interactive = true;
    let dragFrom = null;
    let dragEl = null;
    let dragStart = null;
    let deselectOnTap = false;
    let releaseMotion = null;

    function cancelMotion(node) {
      if (node && node._fisherMotion) {
        node._fisherMotion.cancel(); node._fisherMotion = null;
        node.classList.remove("sliding");
      }
    }

    function movesForInput() { return inputMoves || Chess.legalMoves(inputState || state); }

    function previewPlacements(st, queued) {
      if (!st || !queued || queued.from < 0 || queued.from > 63 || queued.to < 0 || queued.to > 63 ||
          queued.from === queued.to || !st.board[queued.from] || st.board[queued.from] === ".") return [];
      const piece = st.board[queued.from];
      let sprite = piece;
      if (piece.toLowerCase() === "p" && queued.promo && "qrbn".indexOf(queued.promo) >= 0 &&
          ((queued.to >> 3) === 0 || (queued.to >> 3) === 7)) sprite = piece === "P" ? queued.promo.toUpperCase() : queued.promo;
      const placements = [{from:queued.from, to:queued.to, piece:sprite}];
      if (piece.toLowerCase() === "k" && (queued.from === 4 || queued.from === 60) && Math.abs(queued.to - queued.from) === 2) {
        const home = queued.from - 4, kingSide = queued.to > queued.from;
        const from = home + (kingSide ? 7 : 0), to = home + (kingSide ? 5 : 3);
        if (st.board[from] === (piece === "K" ? "R" : "r")) placements.push({from:from, to:to, piece:st.board[from]});
      }
      return placements;
    }

    function previewKey(queued) { return queued ? queued.from + ":" + queued.to + ":" + (queued.promo || "") : ""; }

    function previewMotions(st, queued) {
      const motions = [];
      previewPlacements(state, premove).concat(previewPlacements(st, queued)).forEach(function (placement) {
        const node = pieces[placement.from];
        if (!node || motions.some(function (motion) { return motion.node === node; })) return;
        const rect = releaseMotion && releaseMotion.from === placement.from ? releaseMotion.rect : node.getBoundingClientRect();
        motions.push({node:node, rect:rect}); cancelMotion(node);
      });
      return motions;
    }

    function prepareMotion(next) {
      if (!state) return [];
      const changed = [], sources = [], targets = [];
      for (let sq = 0; sq < 64; sq++) if (state.board[sq] !== next.board[sq]) changed.push(sq);
      if (changed.length > 4) return [];
      changed.forEach(function (sq) {
        if (pieces[sq]) {
          const rect = releaseMotion && releaseMotion.from === sq ? releaseMotion.rect : pieces[sq].getBoundingClientRect();
          sources.push({sq:sq, piece:state.board[sq], node:pieces[sq], rect:rect, used:false});
          cancelMotion(pieces[sq]);
        }
        if (next.board[sq] !== ".") targets.push({sq:sq, piece:next.board[sq]});
        pieces[sq] = null;
      });
      const motions = [];
      targets.forEach(function (target) {
        let source = sources.filter(function (candidate) { return !candidate.used && candidate.piece === target.piece; })[0];
        if (!source) source = sources.filter(function (candidate) {
          return !candidate.used && candidate.piece.toLowerCase() === "p" &&
            (candidate.piece === "P") === (target.piece === target.piece.toUpperCase()) &&
            ((target.sq >> 3) === 0 || (target.sq >> 3) === 7);
        })[0];
        if (!source) return;
        source.used = true; pieces[target.sq] = source.node;
        motions.push({node:source.node, rect:source.rect});
      });
      sources.forEach(function (source) { if (!source.used && source.node.parentNode) source.node.parentNode.removeChild(source.node); });
      return motions;
    }

    function animateMotions(motions) {
      if (root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      motions.forEach(function (motion) {
        const node = motion.node, end = node.getBoundingClientRect();
        const dx = motion.rect.left - end.left, dy = motion.rect.top - end.top;
        if (!node.animate || Math.abs(dx) + Math.abs(dy) < 1 || !end.width) return;
        node.classList.add("sliding");
        const animation = node.animate([{transform:"translate(" + dx + "px," + dy + "px)"}, {transform:"translate(0,0)"}],
          {duration:200, easing:"cubic-bezier(.2,.75,.25,1)"});
        node._fisherMotion = animation;
        animation.onfinish = function () {
          if (node._fisherMotion === animation) { node._fisherMotion = null; node.classList.remove("sliding"); }
        };
      });
    }

    for (let i = 0; i < 64; i++) {
      const d = document.createElement("div");
      d.className = "sq";
      sqLayer.appendChild(d);
    }

    function display(sq) {
      const f = sq & 7, r = sq >> 3;
      if (orientation === "w") return { col: f, row: 7 - r };
      return { col: 7 - f, row: r };
    }

    function fromDisplay(col, row) {
      if (orientation === "w") return sqIndex(col, 7 - row);
      return sqIndex(7 - col, row);
    }

    function pieceName(p) {
      return (p === p.toUpperCase() ? "w" : "b") + PIECE_NAMES[p.toLowerCase()];
    }

    function clearDrag() {
      if (dragEl) { dragEl.style.transform = ""; dragEl.classList.remove("dragging"); }
      dragEl = null;
      dragFrom = null;
      dragStart = null;
      deselectOnTap = false;
      if (pointerId !== null && el.releasePointerCapture) {
        try { el.releasePointerCapture(pointerId); } catch (e) {}
      }
      pointerId = null;
    }

    function render() {
      if (!state) return;
      const squares = sqLayer.children;
      const last = lastMove ? parseUci(lastMove) : null;
      const annotation = annotations[0];
      const marked = annotation && annotation.move ? parseUci(annotation.move) : null;
      const tint = reviewTint(annotation);
      const checkSq = checkSquare(state);
      const preview = previewPlacements(state, premove);
      const targets = selected === null ? [] : movesForInput().filter(function (m) {
        return m.from === selected;
      }).map(function (m) { return m.to; });
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const sq = fromDisplay(col, row);
          const f = sq & 7, r = sq >> 3;
          const d = squares[row * 8 + col];
          let cls = "sq " + (((f + r) & 1) ? "light" : "dark");
          if (last && (sq === last.from || sq === last.to)) cls += " last";
          if (sq === selected) cls += " selected";
          if (targets.indexOf(sq) >= 0) cls += state.board[sq] === "." ? " move" : " capture";
          if (sq === checkSq) cls += " check";
          if (preview.some(function (placement) { return placement.to === sq; })) cls += " premove-to";
          if (preview.some(function (placement) { return placement.from === sq; })) cls += " premove-from";
          if (marked && sq === marked.to && tint) cls += " review-square";
          d.className = cls;
          d.style.setProperty("--review-tint", marked && sq === marked.to ? tint : "");
          d.style.backgroundColor = marked && sq === marked.to && !tint ? annotation.color || "" : "";
          d.style.backgroundImage = marked && sq === marked.to && !tint && sq !== checkSq ? "none" : "";
          d.dataset.sq = String(sq);
          const fileLabel = row === 7 ? FILES[f] : "";
          const rankLabel = col === 0 ? String(r + 1) : "";
          d.innerHTML = (fileLabel ? '<span class="coord file">' + fileLabel + "</span>" : "") +
            (rankLabel ? '<span class="coord rank">' + rankLabel + "</span>" : "");
        }
      }

      for (let sq = 0; sq < 64; sq++) {
        const p = state.board[sq];
        if (p === ".") {
          if (pieces[sq]) { pcLayer.removeChild(pieces[sq]); pieces[sq] = null; }
          continue;
        }
        const placement = preview.filter(function (candidate) { return candidate.from === sq; })[0];
        const hidden = !placement && preview.some(function (candidate) { return candidate.to === sq; });
        const visibleSq = placement ? placement.to : sq, pos = display(visibleSq);
        let d = pieces[sq];
        if (!d) {
          d = document.createElement("div");
          d.className = "pc";
          const img = document.createElement("img");
          img.draggable = false;
          img.alt = "";
          d.appendChild(img);
          pcLayer.appendChild(d);
          pieces[sq] = d;
        }
        if (hidden) d.removeAttribute("data-sq");
        else d.dataset.sq = String(visibleSq);
        d.classList.toggle("premove-piece", !!placement);
        d.classList.toggle("premove-hidden", hidden);
        d.style.visibility = hidden ? "hidden" : "";
        d.style.left = (pos.col * 12.5) + "%";
        d.style.top = (pos.row * 12.5) + "%";
        const code = pieceName(placement ? placement.piece : p);
        const src = root.CaissaAppearance ? root.CaissaAppearance.pieceUrl(code) : "pieces/" + code + ".svg";
        if (d.firstChild.getAttribute("src") !== src) d.firstChild.setAttribute("src", src);
      }
      drawArrow();
      drawAnnotations();
      if (checkSq >= 0) {
        let aura = checkLayer.firstChild;
        if (!aura) { aura = document.createElement("div"); aura.className = "king-aura"; checkLayer.appendChild(aura); }
        const pos = display(checkSq);
        aura.dataset.sq = String(checkSq);
        aura.style.left = pos.col * 12.5 + "%"; aura.style.top = pos.row * 12.5 + "%";
      } else checkLayer.innerHTML = "";
    }

    function drawAnnotations() {
      const nextMarks = Object.create(null);
      annotations.forEach(function (annotation) {
        const marked = annotation && parseUci(annotation.move);
        if (!marked) return;
        const token = positionFen + "|" + annotation.key + "|" + annotation.move + "|" + (annotation.file || "") + "|" + (annotation.eventId || "");
        if (nextMarks[token]) return;
        let mark = marks[token];
        if (!mark) {
          mark = document.createElement("div");
          mark.className = "move-badge";
          mark.title = annotation.label || "";
          if (annotation.file) {
            const icon = document.createElement("img");
            icon.src = "analysis-icons/" + annotation.file;
            icon.alt = annotation.label || "";
            if (["brilliant", "great", "missed", "miss", "mate", "draw", "winner", "clock"].indexOf(annotation.key) >= 0 && annotation.animate !== false) icon.className = "brilliant-enter";
            mark.appendChild(icon);
          } else {
            const text = document.createElement("span");
            text.className = "corner-symbol";
            text.style.backgroundColor = annotation.color || "#81b64c";
            text.textContent = annotation.key === "forced" ? "→" : "≈";
            mark.appendChild(text);
          }
          markLayer.appendChild(mark);
        }
        const pos = display(marked.to);
        mark.style.left = pos.col * 12.5 + "%";
        mark.style.top = pos.row * 12.5 + "%";
        nextMarks[token] = mark;
      });
      Object.keys(marks).forEach(function (token) {
        if (!nextMarks[token]) markLayer.removeChild(marks[token]);
      });
      marks = nextMarks;
    }

    function checkSquare(st) {
      const k = st.board.indexOf(st.turn === "w" ? "K" : "k");
      if (k < 0) return -1;
      return Chess.attacked(st.board, k, st.turn === "w" ? "b" : "w") ? k : -1;
    }

    function parseUci(u) {
      if (!u || u.length < 4) return null;
      return { from: sqIndex(FILES.indexOf(u[0]), Number(u[1]) - 1), to: sqIndex(FILES.indexOf(u[2]), Number(u[3]) - 1) };
    }

    function drawArrow() {
      if (!showArrow || !arrow) { arrowLayer.innerHTML = ""; return; }
      const mv = parseUci(arrow);
      if (!mv) { arrowLayer.innerHTML = ""; return; }
      const a = display(mv.from), b = display(mv.to);
      let x1 = a.col + 0.5, y1 = a.row + 0.5, x2 = b.col + 0.5, y2 = b.row + 0.5;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.3) { arrowLayer.innerHTML = ""; return; }
      const ux = dx / len, uy = dy / len;
      const head = 0.42, half = 0.22;
      const bx = x2 - ux * head, by = y2 - uy * head;
      const sx = x1 + ux * 0.28, sy = y1 + uy * 0.28;
      const ex = x2 - ux * 0.05, ey = y2 - uy * 0.05;
      arrowLayer.innerHTML =
        '<line x1="' + sx + '" y1="' + sy + '" x2="' + bx + '" y2="' + by + '" stroke="#f7c045" stroke-width="0.17" stroke-linecap="round" opacity="0.85"/>' +
        '<polygon points="' + ex + "," + ey + " " + (bx - uy * half) + "," + (by + ux * half) + " " + (bx + uy * half) + "," + (by - ux * half) + '" fill="#f7c045" opacity="0.85"/>';
    }

    function eventSquare(e) {
      const rect = el.getBoundingClientRect();
      const col = Math.floor((e.clientX - rect.left) / rect.width * 8);
      const row = Math.floor((e.clientY - rect.top) / rect.height * 8);
      if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
      return fromDisplay(col, row);
    }

    function isOwn(sq) {
      if (!state || sq < 0) return false;
      const p = state.board[sq];
      if (p === ".") return false;
      return (p === p.toUpperCase()) === ((inputState || state).turn === "w");
    }

    function onDown(e) {
      if (!interactive || !state || e.isPrimary === false || e.button > 0 || pointerId !== null) return;
      const sq = eventSquare(e);
      if (sq < 0) return;
      e.preventDefault();
      pieces.forEach(cancelMotion);
      deselectOnTap = sq === selected;
      function capture() {
        pointerId = e.pointerId;
        if (el.setPointerCapture) { try { el.setPointerCapture(pointerId); } catch (err) {} }
      }
      if (selected !== null) {
        const legal = movesForInput().some(function (m) { return m.from === selected && m.to === sq; });
        if (legal) {
          dragFrom = selected;
          dragStart = { x: e.clientX, y: e.clientY };
          dragEl = pcLayer.querySelector('.pc[data-sq="' + selected + '"]');
          if (dragEl) dragEl.classList.add("dragging");
          capture();
          return;
        }
        if (!isOwn(sq)) { selected = null; render(); return; }
      }
      if (!isOwn(sq)) { selected = null; render(); return; }
      selected = sq;
      render();
      dragFrom = sq;
      dragStart = { x: e.clientX, y: e.clientY };
      dragEl = pcLayer.querySelector('.pc[data-sq="' + sq + '"]');
      if (dragEl) dragEl.classList.add("dragging");
      capture();
    }

    function onMove(e) {
      if (dragFrom === null || !dragEl || !dragStart) return;
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) < 4) return;
      dragEl.style.transform = "translate(" + dx + "px," + dy + "px)";
    }

    function onUp(e) {
      if (dragFrom === null || e.pointerId !== pointerId) return;
      const from = dragFrom;
      const wasDrag = dragStart && (Math.abs(e.clientX - dragStart.x) + Math.abs(e.clientY - dragStart.y) >= 4);
      const to = eventSquare(e);
      const deselect = deselectOnTap;
      const releasedRect = wasDrag && dragEl ? dragEl.getBoundingClientRect() : null;
      clearDrag();
      const legal = to >= 0 && to !== from && movesForInput().some(function (m) {
        return m.from === from && m.to === to;
      });
      if (legal) {
        selected = null;
        releaseMotion = releasedRect ? {from:from, to:to, rect:releasedRect} : null;
        if (opts.onMove) opts.onMove(from, to);
        render();
        releaseMotion = null;
        return;
      }
      if (!wasDrag) { if (deselect) selected = null; render(); return; }
      selected = null;
      render();
    }

    el.addEventListener("pointerdown", onDown);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerup", onUp);
    root.addEventListener("pointercancel", function () { clearDrag(); selected = null; render(); });
    el.addEventListener("lostpointercapture", function () {
      if (pointerId !== null) { clearDrag(); selected = null; render(); }
    });

    return {
      render: function (st, o) {
        o = o || {};
        const fen = Chess.toFen(st);
        const nextPremove = o.premove !== undefined ? o.premove : premove;
        const nextInputState = o.inputState !== undefined ? o.inputState : inputState;
        const heldPiece = dragFrom === null ? null : st.board[dragFrom];
        const preserveDrag = dragEl && dragEl === pieces[dragFrom] && heldPiece && heldPiece !== "." &&
          state.board[dragFrom] === heldPiece &&
          (heldPiece === heldPiece.toUpperCase() ? "w" : "b") === (nextInputState || st).turn;
        const motions = previewKey(nextPremove) !== previewKey(premove) ? previewMotions(st, nextPremove) : [];
        const actualMotions = positionFen !== fen ? prepareMotion(st) : [];
        actualMotions.forEach(function (motion) {
          if (!motions.some(function (saved) { return saved.node === motion.node; })) motions.push(motion);
        });
        if (positionFen !== fen && !preserveDrag) { clearDrag(); selected = null; }
        positionFen = fen;
        state = st;
        premove = nextPremove;
        if (o.inputState !== undefined) inputState = o.inputState;
        if (o.inputMoves !== undefined) inputMoves = o.inputMoves;
        if (o.lastMove !== undefined) lastMove = o.lastMove;
        if (o.selected !== undefined) selected = o.selected;
        if (o.interactive !== undefined) interactive = o.interactive;
        if (o.arrow !== undefined) arrow = o.arrow;
        if (o.showArrow !== undefined) showArrow = o.showArrow;
        if (o.annotations !== undefined) annotations = o.annotations || [];
        else if (o.annotation !== undefined) annotations = Array.isArray(o.annotation) ? o.annotation : o.annotation ? [o.annotation] : [];
        render();
        animateMotions(motions);
      },
      setOrientation: function (o) { pieces.forEach(cancelMotion); clearDrag(); selected = null; orientation = o; render(); },
      getOrientation: function () { return orientation; },
      clearSelection: function () { selected = null; render(); }
    };
  }

  return { create: create };
});
