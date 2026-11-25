/* Fisher: экраны, игра, живой разбор, PGN, дебюты. */
(function () {
  "use strict";

  const Chess = window.ChessLogic;
  const MR = window.MoveReview;
  const An = window.FisherAnalysis;
  const Pgn = window.FisherPgn;
  const OL = window.OpeningsLookup;
  const Eng = window.FisherEngine;

  const Game = window.GameSession;
  const UI = window.CaissaI18n;
  const Sounds = window.CaissaSounds;

  const App = {
    tab: "play",
    settings: { depth: 14, level: 1200, sound: true, volume: 85, showArrow: true, lang:"ru" },
    lines: [], guides: [], guideSets:null, index: null,
    engineReady: false
  };

  const play = {
    active: false, color: "w", level: 1200, state: null, moves: [], lastMove: null,
    thinking: false, hint: null, hintPending:false, evalScore: null, evalTurn: "w", orientation: "w",
    gen: 0, error: false, evals: [], reviewing: false, nav: null, clock:null, outcome:null, report:null, reportError:false, reportPromise:null, reportProgress:null, reportStarted:0, reportElapsed:0, resultReady:false, lowTime:false, premove:null
  };

  const live = {
    state: null, moves: [], fens: [], evals: [], lastMove: null,
    orientation: "w", showArrow: true, gen: 0, analyzing: false, loopGen: -1,
    future: [], nav:null, evalByFen: Object.create(null)
  };

  const batch = {
    rows: [], headers: {}, evals: [], depth: 14, nav: -1,
    gen: 0, running: false, side: "w", started: 0, elapsed: 0, fromPlayGen:null
  };

  const openings = {
    view: "list", guide: null, line: null, lineText: "", step: 0,
    variant: -1, notes: [], evals: Object.create(null), gen: 0, pendingFen: null,
    filter: "all", explorerFen: "", explorerGen: 0, explorerController: null, custom: null
  };

  let playBoard = null, liveBoard = null, pgnBoard = null, openingBoard = null;
  let toastTimer = null;
  let toastNode = null;
  const moveAudio = {play:Promise.resolve(),live:Promise.resolve()};
  const endSoundState = {play:"",live:"",batch:""};
  const endCategories = {
    mate:{key:"mate",file:"mate.svg",color:"#ca3431",label:"Мат"},
    draw:{key:"draw",file:"draw.svg",color:"#7c8a97",label:"Ничья"}
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function fenStart() { return Chess.toFen(Chess.startState()); }
  function toast(msg) {
    if (toastNode && toastNode.parentNode) toastNode.parentNode.removeChild(toastNode);
    const d = document.createElement("div");
    toastNode = d;
    d.className = "toast";
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function () { d.classList.add("show"); }, 10);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      d.classList.remove("show");
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 260);
    }, 2300);
  }
  function delay(milliseconds) {return new Promise(function(resolve){setTimeout(resolve,milliseconds);});}

  function historyFor(rows, start) { return [start || fenStart()].concat(rows.map(function (row) { return row.fenAfter; })); }
  function playStatus() { return play.outcome ? "finished" : Pgn.gameStatus(play.state, historyFor(play.moves)); }
  function viewingPlay() { return play.nav !== null && play.nav < play.moves.length - 1; }
  function unlockAudio() {Sounds.unlock().catch(function(){});}

  function notifyEnd(state, history, source, result) {
    let status=Pgn.gameStatus(state,history);
    if(status==="stalemate" || (status!=="mate" && result==="1/2-1/2"))status="draw";
    if(status==="play"){endSoundState[source]="";return;}
    if(endSoundState[source]===status)return;
    endSoundState[source]=status;
    if(status==="mate" && source!=="batch")vibrate("mate");
    if(source!=="play")Promise.resolve(moveAudio[source]).then(function(){return Sounds.play("game-end");});
  }

  function boardAnnotation(row, state, status, result) {
    if (status === "stalemate" || (status !== "mate" && result === "1/2-1/2")) status = "draw";
    const c = endCategories[status];
    if (!c) return moveAnnotation(row);
    function at(color, key, file, label, tint) {
      const square = state.board.indexOf(color === "w" ? "K" : "k"), name = Chess.sqName(square);
      return {move:name+name,key:key,file:file,color:tint,label:label,animate:true};
    }
    if (status === "mate") return [at(state.turn,"mate","mate.svg","Мат",c.color),
      at(state.turn === "w" ? "b" : "w","winner","winner.svg","Победа","#81b64c")];
    return [at("w","draw","draw_white.svg","Ничья",c.color),at("b","draw","draw_black.svg","Ничья",c.color)];
  }
  function vibrate(kind) {
    try {
      if (window.AndroidEngine && window.AndroidEngine.vibrate) window.AndroidEngine.vibrate(kind);
      else if (navigator.vibrate) navigator.vibrate(kind === "mate" ? [90,110,90] : 90);
    } catch (e) {}
  }
  function notifyCheck(state, history) {
    if (Pgn.gameStatus(state,history) === "play" && Pgn.isCheck(state,state.turn)) vibrate("check");
  }

  function moveSound(row,source) {
    if(!row)return Promise.resolve();
    const sound=Sounds.play(Sounds.eventForMove(row));
    if(source)moveAudio[source]=sound;
    return sound;
  }

  function search(opts, owner) {
    return Eng.search(opts, owner).then(function (r) { return r; }, function (err) {
      toast("Движок: " + (err && err.message ? err.message : err));
      return null;
    });
  }
  function findLegal(state, from, to, promo) {
    const moves = Chess.legalMoves(state);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m.from === from && m.to === to && (!promo || m.promo === promo)) return m;
    }
    return null;
  }
  function findUci(state, uci) {
    const moves = Chess.legalMoves(state);
    for (let i = 0; i < moves.length; i++) if (Chess.uci(moves[i]) === uci) return moves[i];
    return null;
  }
  function needsPromotion(state, from, to) {
    const moves = Chess.legalMoves(state);
    for (let i = 0; i < moves.length; i++) {
      if (moves[i].from === from && moves[i].to === to && moves[i].promo) return true;
    }
    return false;
  }

  function applyMove(state, m) {
    const fenBefore = Chess.toFen(state);
    const uci = Chess.uci(m);
    const san = Pgn.sanOf(state, uci) || uci;
    const mover = state.turn;
    const moveNumber = state.full;
    const legalCount = Chess.legalMoves(state).length;
    const next = Chess.apply(state, m);
    const fenAfter = Chess.toFen(next);
    const row = {
      san: san, uci: uci, fenBefore: fenBefore, fenAfter: fenAfter,
      color: mover, moveNumber: moveNumber, legalCount: legalCount,
      sacrifice: Chess.sacrificeLoss(state, next, uci),
      book: !!(App.index && OL.lookup(App.index, fenAfter)),
      key: null, loss: undefined, ply: 0
    };
    if (legalCount === 1) { row.key = "forced"; row.loss = 0; }
    else if (row.book) row.key = "book";
    return { row: row, next: next };
  }

  function rowsFromParsed(game) {
    let state = Chess.fromFen(game.startFen);
    const rows = [];
    for (let i = 0; i < game.moves.length; i++) {
      const mv = game.moves[i];
      if (mv.fenBefore) state = Chess.fromFen(mv.fenBefore);
      const m = findUci(state, mv.uci);
      if (!m) continue;
      const res = applyMove(state, m);
      res.row.ply = rows.length;
      rows.push(res.row);
      state = res.next;
    }
    return rows;
  }

  function gameText(state, history) {
    const st = Pgn.gameStatus(state, history);
    if (st === "mate") return "Мат. Победа " + (state.turn === "w" ? "чёрных" : "белых") + ".";
    if (st === "stalemate") return "Пат. Ничья.";
    if (st === "draw") return "Ничья. " + Pgn.drawReason(state, history) + ".";
    if (Pgn.isCheck(state, state.turn)) return "Шах.";
    return "";
  }

  function evalTurn(fen) {
    return Chess.fromFen(fen).turn;
  }

  function renderEvalBar(id, score, turn, state, status) {
    if (state) {
      const end = status || Pgn.gameStatus(state);
      if (end === "mate") { score = { type: "mate", value: 0 }; turn = state.turn; }
      else if (end === "stalemate" || end === "draw") score = { type: "cp", value: 0 };
    }
    const box = $(id);
    if (!box) return;
    const fill = box.querySelector(".fill");
    const num = box.querySelector(".evalnum");
    if (!score) {
      fill.style.height = "50%";
      num.textContent = "";
      return;
    }
    const cp = MR.whiteCp(score, turn);
    const pct = MR.barPercent(cp);
    fill.style.height = pct + "%";
    num.textContent = MR.formatEval(score, turn);
    num.style.color = pct >= 50 ? "#e6e6e6" : "#302e2b";
  }

  function moveLabel(row) {
    return row.moveNumber + (row.color === "w" ? "." : "...") + " " + row.san;
  }

  function moveAnnotation(row, animate) {
    if (!row || !row.key) return null;
    const c = An.category(row.key);
    if (!c) return null;
    return { move: row.uci, key: row.key, file: row.key === "missed" ? "miss.svg" : row.key === "forced" ? "forced.svg" : c.file || "", color: c.color,
      label: c.label, animate: animate !== false };
  }

  function renderArrowControls() {
    ["liveArrow", "pgnArrow", "openingArrow"].forEach(function (id) {
      const button = $(id);
      if (!button) return;
      button.classList.toggle("active", App.settings.showArrow);
      button.setAttribute("aria-pressed", String(App.settings.showArrow));
      button.textContent = App.settings.showArrow ? "Стрелки: вкл" : "Стрелки: выкл";
    });
  }

  function renderAllBoards() {
    renderArrowControls(); renderPlay(); renderLive();
    if (batch.rows.length) renderPgnBoard();
    if (openings.line) renderOpeningBoard();
  }

  function toggleArrows() {
    App.settings.showArrow = !App.settings.showArrow;
    live.showArrow = App.settings.showArrow;
    saveSettings(); renderAllBoards();
  }

  function badgeHtml(row) {
    if (row.key === "forced") return '<span class="badge badge-icon" title="Единственный ход"><img src="analysis-icons/forced.svg" alt="Единственный ход"></span>';
    if (!row.key) return '<span class="badge" style="background:#3d3a37;color:#a3a2a0" title="Считаю">…</span>';
    const c = An.category(row.key);
    if (!c) return "";
    return '<span class="badge badge-icon" title="' + esc(c.label) + '"><img src="analysis-icons/' + esc(row.key === "missed" ? "miss.svg" : c.file) + '" alt="' + esc(c.label) + '"></span>';
  }

  function movesHtml(rows, opts) {
    opts = opts || {};
    if (!rows.length) return '<div class="muted" style="padding:8px">Ходов пока нет</div>';
    let html = "";
    for (let i = 0; i < rows.length;) {
      const row = rows[i];
      html += '<div class="mvrow"><span class="num">' + row.moveNumber + ".</span>";
      if (row.color === "w") { html += moveCell(row, i, opts); i++; }
      else html += "<span></span>";
      if (i < rows.length && rows[i].color === "b") { html += moveCell(rows[i], i, opts); i++; }
      else html += "<span></span>";
      html += "</div>";
    }
    return html;
  }
  function moveCell(row, i, opts) {
    let cls = "mv";
    if (opts.active === i) cls += " active";
    const sanCls = "san" + (opts.last === i ? " last" : "");
    return '<button class="' + cls + '" data-ply="' + i + '"><span class="' + sanCls + '">' +
      esc(row.san) + "</span>" + (opts.hideGrades ? "" : badgeHtml(row)) + "</button>";
  }

  function setHidden(id, hidden) {
    const el = $(id);
    if (!el) return;
    if (hidden) el.classList.add("hidden");
    else el.classList.remove("hidden");
  }

  // ---------- modal ----------

  let modalFocus = null, modalPointerTarget = null;
  function showModal(html) {
    modalPointerTarget = null;
    modalFocus = document.activeElement;
    $("modalBox").innerHTML = html;
    $("modalRoot").classList.remove("hidden");
    const first = $("modalBox").querySelector("input, textarea, select, button, a");
    if (first) first.focus();
  }
  function closeModal() {
    modalPointerTarget = null;
    $("modalRoot").classList.add("hidden");
    $("modalBox").innerHTML = "";
    if (modalFocus && document.body.contains(modalFocus)) modalFocus.focus();
  }
  function showPromotion(color, cb) {
    const p = color === "w" ? "w" : "b";
    const names = [["q", "Ферзь"], ["r", "Ладья"], ["b", "Слон"], ["n", "Конь"]];
    let html = '<h3>Превращение</h3><div class="promo-grid">';
    for (let i = 0; i < names.length; i++) {
      html += '<button data-promo="' + names[i][0] + '" aria-label="' + names[i][1] + '">' +
        '<img src="pieces/' + p + names[i][0].toUpperCase() + '.svg" alt="' + names[i][1] + '"></button>';
    }
    html += "</div>";
    showModal(html);
    const buttons = $("modalBox").querySelectorAll("[data-promo]");
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        const promo = this.getAttribute("data-promo");
        closeModal();
        cb(promo);
      });
    }
  }

  // ---------- settings ----------

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem("fisher.settings") || "{}");
      if (s && typeof s === "object") Object.assign(App.settings, s);
    } catch (e) {}
    if (Game.RATINGS.indexOf(App.settings.level) < 0) App.settings.level = 1200;
    App.settings.volume = Math.max(0,Math.min(100,Number(App.settings.volume) || 0));
    play.level = App.settings.level;
    live.showArrow = App.settings.showArrow;
    if(App.settings.lang!=="en")App.settings.lang="ru";
  }
  function saveSettings() {
    try { localStorage.setItem("fisher.settings", JSON.stringify(App.settings)); } catch (e) {}
  }
  function openSettings() {
    const d = App.settings.depth === 18 ? 18 : 14;
    let html = "<h3>Настройки</h3>";
    html += '<label class="field"><span class="field-label">Язык</span><select id="setLanguage" class="select"><option value="ru"'+(App.settings.lang==="ru"?' selected':'')+'>Русский</option><option value="en"'+(App.settings.lang==="en"?' selected':'')+'>English</option></select></label>';
    html += '<div class="field"><span class="field-label">Глубина разбора по умолчанию</span>' +
      '<select id="setDepth" class="select"><option value="14"' + (d === 14 ? " selected" : "") + ">Быстро (14)</option>" +
      '<option value="18"' + (d === 18 ? " selected" : "") + ">Глубоко (18)</option></select></div>";
    html += '<div class="field"><span class="field-label">Рейтинг бота по умолчанию · Elo</span>' +
      '<select id="setLevel" class="select">';
    Game.RATINGS.forEach(function (elo) { html += '<option value="' + elo + '"' + (App.settings.level === elo ? " selected" : "") + ">" + elo + "</option>"; });
    html += "</select></div>";
    html += '<label class="check"><input type="checkbox" id="setSound"' + (App.settings.sound ? " checked" : "") + "> Звук ходов</label>";
    html += '<label class="field"><span class="field-label">Громкость ходов</span><span class="sound-volume"><input id="setVolume" type="range" min="0" max="100" value="' + App.settings.volume + '"><output id="volumeValue">' + App.settings.volume + '%</output></span></label>';
    html += '<label class="check"><input type="checkbox" id="setArrow"' + (App.settings.showArrow ? " checked" : "") + "> Стрелки в анализе и дебютах</label>";
    html += '<div class="modal-actions"><button class="ghost" data-close="1">Отмена</button>' +
      '<button class="primary" id="setSave">Сохранить</button></div>';
    html += '<footer class="settings-footer"><p class="muted">Caissa 1.4.1 · GlassPrincess</p><button class="ghost" id="showLicenses">Лицензии</button><a class="source-link" href="https://github.com/glassprincess/CaissaChess" target="_blank" rel="noopener">Исходный код</a></footer>';
    showModal(html);
    $("setVolume").addEventListener("input", function () { $("volumeValue").textContent=this.value+"%"; });
    $("setVolume").addEventListener("change", function () { Sounds.play("move",Number(this.value)); });
    $("showLicenses").addEventListener("click", function () {
      fetch(App.settings.lang==="en"?"licenses/THIRD_PARTY_NOTICES.en.txt":"licenses/THIRD_PARTY_NOTICES.txt").then(function (r) { if (!r.ok) throw new Error("licenses"); return r.text(); }).then(function (text) {
        showModal('<h3>Лицензии и авторы</h3><pre style="white-space:pre-wrap;overflow-wrap:break-word;font:inherit">' + esc(text) + '</pre><button class="ghost" data-close="1">Закрыть</button>');
      }, function () { toast("Не удалось открыть лицензии"); });
    });
    $("setSave").addEventListener("click", function () {
      App.settings.depth = Number($("setDepth").value);
      App.settings.level = Number($("setLevel").value);
      App.settings.sound = $("setSound").checked;
      App.settings.volume = Number($("setVolume").value);
      App.settings.showArrow = $("setArrow").checked;
      App.settings.lang = $("setLanguage").value;
      if (!play.active) play.level = App.settings.level;
      live.showArrow = App.settings.showArrow;
      saveSettings();
      closeModal();
      applyLanguage();
      setDepthButtons(App.settings.depth);
      renderAllBoards();
      toast("Настройки сохранены");
    });
  }

  // ---------- tabs ----------

  function showTab(name) {
    App.tab = name;
    const screens = ["play", "analysis", "openings"];
    for (let i = 0; i < screens.length; i++) setHidden("screen-" + screens[i], screens[i] !== name);
    const btns = $("tabbar").querySelectorAll("button");
    for (let i = 0; i < btns.length; i++) btns[i].classList.toggle("active", btns[i].getAttribute("data-tab") === name);
    if (name === "analysis") setAnalysisMode(currentAnalysisMode);
    if (name === "openings") { if (openings.view === "list") renderOpeningList(); else requestOpeningEval(); }
    window.scrollTo(0, 0);
  }

  let currentAnalysisMode = "live";
  function setAnalysisMode(mode) {
    currentAnalysisMode = mode;
    setHidden("livePane", mode !== "live");
    setHidden("pgnPane", mode !== "pgn");
    const btns = $("analysisMode").querySelectorAll("button");
    for (let i = 0; i < btns.length; i++) btns[i].classList.toggle("active", btns[i].getAttribute("data-mode") === mode);
    if (mode === "live") {
      renderLive();
      if (App.engineReady && live.fens.length && live.evals.length < live.fens.length) startLiveAnalysis();
    } else {
      renderPgnScreen();
    }
  }

  // ---------- play ----------

  function resetPlaySetup() {
    Eng.cancel("play-hint");Eng.cancel("play");Eng.cancel("finish-review");
    if(play.clock)play.clock.pause();
    play.hintPending=false;play.premove=null;play.resultReady=false;play.reportPromise=null;
    play.level=App.settings.level;play.active=false;play.outcome=null;play.report=null;
    play.nav=null;endSoundState.play="";play.moves=[];play.gen++;
    if(batch.fromPlayGen!==null){batch.fromPlayGen=null;batch.running=false;batch.rows=[];batch.evals=[];renderPgnScreen();}
    setHidden("playSetup",false);setHidden("playGame",true);
    const colorBtns=$("colorSeg").querySelectorAll("button");
    for(let i=0;i<colorBtns.length;i++)colorBtns[i].classList.toggle("active",colorBtns[i].getAttribute("data-color")==="w");
    play.color="w";
    const levelBtns=$("levelSeg").querySelectorAll("button");
    for(let i=0;i<levelBtns.length;i++)levelBtns[i].classList.toggle("active",Number(levelBtns[i].getAttribute("data-level"))===play.level);
  }

  function startPlay() {
    Eng.cancel("play-hint");play.hintPending=false;
    Eng.cancel("live");live.gen++;live.analyzing=false;
    let color = play.color;
    if (color === "r") color = Math.random() < 0.5 ? "w" : "b";
    play.color = color;
    play.orientation = color === "b" ? "b" : "w";
    Eng.cancel("finish-review");
    play.outcome=null;play.report=null;play.reportError=false;play.reportPromise=null;play.reportProgress=null;play.resultReady=false;play.lowTime=false;play.premove=null;
    moveAudio.play=Promise.resolve();Sounds.play("game-start");
    const time=$("playTime").value.split(":");
    play.clock=Game.createClock({baseMs:Number(time[0])*60000,incrementMs:Number(time[1])*1000});
    play.clock.start("w");
    play.state = Chess.startState();
    play.moves = []; play.nav = null; endSoundState.play = "";
    play.evals = []; play.reviewing = false;
    play.lastMove = null;
    play.hint = null;
    play.thinking = false;
    play.error = false;
    play.evalScore = null;
    play.evalTurn = "w";
    play.active = true;
    play.gen++;
    setHidden("playSetup", true);
    setHidden("playGame", false);
    playBoard.setOrientation(play.orientation);
    renderPlay();
    if (play.state.turn !== play.color) engineTurn();

  }

  function setPlayView(index) {
    if (!play.active) return;
    const last = play.moves.length - 1;
    index = Math.max(-1, Math.min(last, index));
    play.nav = index === last ? null : index;
    renderPlay();
  }

  function renderPlay() {
    if (!play.active || !play.state) return;
    const viewing = viewingPlay(), index = viewing ? play.nav : play.moves.length - 1;
    const st = viewing ? Chess.fromFen(index < 0 ? fenStart() : play.moves[index].fenAfter) : play.state;
    const history = historyFor(play.moves.slice(0, index + 1)), status = Pgn.gameStatus(st, history);
    const topColor = play.orientation === "w" ? "b" : "w";
    function playerHtml(color) {
      return '<span class="dot ' + color + '"></span><span class="name">' + (color === play.color ? UI.t("Вы") : "Stockfish") +
        '</span><span class="meta">' + (color === "w" ? "белые" : "чёрные") + '</span><span class="clock" data-clock="' + color + '"></span>';
    }
    $("playTop").innerHTML = playerHtml(topColor);
    $("playBottom").innerHTML = playerHtml(topColor === "w" ? "b" : "w");
    const row = index >= 0 ? play.moves[index] : null;
    let msg = viewing ? "Просмотр позиции. Ходы партии сохранены." : gameText(play.state, historyFor(play.moves));
    if(!viewing && play.outcome) msg=outcomeTitle()+" · "+play.outcome.reason;
    if (!msg) msg = play.thinking ? "Stockfish думает…" : play.state.turn === play.color ? "Ваш ход" : play.error ? "Движок не ответил. Повторите ход." : "Ожидание движка…";
    if (!viewing && play.hint) { const san = Pgn.sanOf(play.state, play.hint); if (san) msg = "Лучший ход: " + san + (play.evalScore ? " · " + MR.formatEval(play.evalScore,play.evalTurn) : ""); }
    $("playStatus").textContent = msg;
    setHidden("playRetry", !play.error || viewing); setHidden("playReturn", !viewing);
    const humanTurn = !viewing && !play.outcome && play.state.turn === play.color && !play.thinking && status === "play";
    const canPremove=!viewing && !play.outcome && play.thinking && status==="play";
    const inputState=canPremove?Object.assign({},st,{turn:play.color,ep:-1}):null;
    if(canPremove&&play.premove)$("playStatus").textContent="Премув: "+Chess.sqName(play.premove.from)+"–"+Chess.sqName(play.premove.to);
    playBoard.render(st, {lastMove:row ? row.uci : null, interactive:humanTurn || (canPremove && !play.premove),inputState:inputState,
      inputMoves:canPremove?Game.premoveMoves(st,play.color):null,premove:!viewing && !play.outcome?play.premove:null,
      arrow:!viewing && !play.premove?play.hint:null, showArrow:true,
      annotation:!viewing && play.outcome && play.outcome.flag ? timeoutAnnotations() : status === "play" ? null : boardAnnotation(null, st, status)});
    const ev = play.evals[index + 1], score = ev && ev.lines[0] ? ev.lines[0].eval : viewing ? null : play.evalScore;
    renderEvalBar("playEval", score, ev && ev.lines[0] ? st.turn : play.evalTurn, st, status);
    $("playPosition").textContent = (index + 1) + " / " + play.moves.length;
    $("playFirst").disabled = $("playPrev").disabled = index < 0;
    $("playNext").disabled = $("playLast").disabled = index >= play.moves.length - 1;
    $("playMoves").innerHTML = movesHtml(play.moves, {active:index, last:play.moves.length - 1,hideGrades:true});
    $("playUndo").disabled = !play.moves.length || viewing || !!play.outcome;
    $("playNew").textContent=play.outcome ? "Новая партия" : "Сдаться";
    renderClocks();
    setHidden("playReport",!play.outcome || !play.resultReady);
    setHidden("playCancelPremove",!play.premove);
    $("playHint").disabled = !humanTurn || play.hintPending; $("playReview").disabled = !play.moves.length || !play.outcome;
  }

  function commitPlay(row, next) {
    Eng.cancel("play-hint");play.hintPending=false;
    row.clockBefore=play.clock.snapshot();
    if (play.outcome || !play.clock.move(next.turn)) { tickClock();return false; }
    row.ply = play.moves.length;
    play.moves.push(row);
    play.state = next;
    if(playStatus()==="draw")row.drawAfter=true;
    play.lastMove = row.uci;
    play.hint = null;
    moveSound(row,"play");
    notifyEnd(play.state, historyFor(play.moves), "play");
    notifyCheck(play.state, historyFor(play.moves));
    const end=Pgn.gameStatus(play.state,historyFor(play.moves));
    if(end!=="play")finishPlay(end==="mate" ? (play.state.turn==="w"?"b":"w") : null,end==="mate"?"Мат":end==="stalemate"?"Пат":Pgn.drawReason(play.state,historyFor(play.moves)));
    return true;
  }

  function onPlayBoardMove(from, to) {
    if (!play.active || play.outcome || viewingPlay()) return;
    if(play.thinking && play.state.turn!==play.color){
      const candidates=Game.premoveMoves(play.state,play.color).filter(function(move){return move.from===from&&move.to===to;});
      if(!candidates.length)return;
      const gen=play.gen;
      if(candidates.some(function(move){return !!move.promo;}))showPromotion(play.color,function(promo){
        if(gen!==play.gen || play.outcome)return;
        if(!play.thinking && play.state.turn===play.color)commitPlayMove(from,to,promo);
        else queuePremove(from,to,promo);
      });
      else queuePremove(from,to,null);
      return;
    }
    if (play.state.turn !== play.color) return;
    if (playStatus() !== "play") return;
    if (needsPromotion(play.state, from, to)) {
      showPromotion(play.color, function (promo) { commitPlayMove(from, to, promo); });
      return;
    }
    commitPlayMove(from, to, null);
  }

  function commitPlayMove(from, to, promo) {
    if (!play.active || play.outcome || play.state.turn !== play.color) return;
    const m = findLegal(play.state, from, to, promo);
    if (!m) return;
    const res = applyMove(play.state, m);
    commitPlay(res.row, res.next);
    renderPlay();
    if (playStatus() === "play") engineTurn();

  }

  function engineTurn() {
    if (!play.active || play.thinking || play.state.turn === play.color || playStatus() !== "play") return;
    const gen = play.gen;
    const turn = play.state.turn;
    play.thinking = true;
    play.error = false;
    play.hint = null;
    renderPlay();
    if(play.clock)play.clock.resume();
    const profile=Game.profile(play.level), legal=Chess.legalMoves(play.state);
    const randomMove=Math.random()<profile.randomChance && legal.length ? Chess.uci(legal[Math.floor(Math.random()*legal.length)]) : null;
    const request=randomMove ? new Promise(function(resolve){setTimeout(function(){resolve({bestmove:randomMove,lines:[]});},200);}) :
      search({fen:Chess.toFen(play.state),multipv:1,movetime:profile.movetime,skill:profile.skill,elo:profile.engineElo},"play");
    request.then(function (res) {
      if (gen !== play.gen || !play.active || play.outcome) return;
      play.thinking = false;
      if (!res || !res.bestmove) { play.error = true; play.clock.pause(); renderPlay(); return; }
      if (res.lines && res.lines.length) {
        play.evalScore = res.lines[0].eval;
        play.evalTurn = turn;
      }
      const m = findUci(play.state, res.bestmove);
      if (!m) { play.error = true; play.clock.pause(); renderPlay(); return; }
      const r = applyMove(play.state, m);
      commitPlay(r.row, r.next);
      renderPlay();
      executePremove();

    });
  }

  function undoPlay() {
    Eng.cancel("play-hint");play.hintPending=false;
    play.nav = null; endSoundState.play = "";play.premove=null;
    if (!play.moves.length || play.outcome) return;
    play.gen++;
    Eng.cancel("play"); Eng.cancel("play-review"); Eng.cancel("finish-review");
    play.reviewing = false;
    play.thinking = false;
    play.error = false;
    play.hint = null;
    let removed = 0;
    while (play.moves.length && removed < 2) {
      const r = play.moves.pop();
      if(r.clockBefore)play.clock.restore(r.clockBefore);
      removed++;
      if (r.color === play.color) break;
    }
    play.state = play.moves.length ? Chess.fromFen(play.moves[play.moves.length - 1].fenAfter) : Chess.startState();
    play.evals.length = Math.min(play.evals.length, play.moves.length + 1);
    play.lastMove = play.moves.length ? play.moves[play.moves.length - 1].uci : null;
    play.evalScore = null;
    play.evalTurn = play.state.turn;
    renderPlay();
    if (playStatus() === "play" && play.state.turn !== play.color) engineTurn();

  }

  function clockText(ms) {
    const seconds=Math.ceil(ms/1000);return Math.floor(seconds/60)+":"+(seconds%60<10?"0":"")+seconds%60;
  }
  function renderClocks() {
    if(!play.clock)return;
    const snap=play.clock.snapshot(), clocks=$("playGame").querySelectorAll("[data-clock]");
    for(let i=0;i<clocks.length;i++){
      const color=clocks[i].getAttribute("data-clock");clocks[i].textContent=snap.timed?clockText(snap[color]):"∞";
      clocks[i].classList.toggle("ticking",snap.running&&snap.turn===color);clocks[i].classList.toggle("low",snap.timed&&snap[color]<20000);
    }
  }
  function tickClock() {
    if(!play.active || !play.clock || play.outcome)return;
    const snap=play.clock.snapshot();renderClocks();
    if(snap.timed && snap[play.color]<=10000 && snap[play.color]>0 && !play.lowTime){play.lowTime=true;Sounds.play("tenseconds");}
    if(snap.flag){
      const winner=Game.timeoutWinner(play.state.board,snap.flag);
      finishPlay(winner,winner?"Время вышло":"Время вышло · у соперника один король",snap.flag);
    }
  }
  function outcomeTitle() {return !play.outcome.winner?"Ничья":play.outcome.winner===play.color?"Вы победили":"Вы проиграли";}
  function finishPlay(winner,reason,flag) {
    if(play.outcome)return;
    play.outcome={winner:winner,reason:reason,flag:flag||null};play.thinking=false;play.hint=null;play.premove=null;play.clock.pause();
    Eng.cancel("play-hint");play.hintPending=false;
    Eng.cancel("play");Eng.cancel("live");live.gen++;live.analyzing=false;
    play.gen++;const gen=play.gen;
    play.reportStarted=Date.now();play.reportProgress=null;play.reportElapsed=0;renderPlay();
    if(reason!=="Мат")vibrate("mate");
    const endAudio=Promise.resolve(moveAudio.play).then(function(){return Sounds.play("game-end");});
    Promise.all([endAudio,delay(310)]).then(function(){return delay(1500);}).then(function(){
      if(gen!==play.gen || !play.active || !play.outcome)return;
      play.resultReady=true;renderPlay();
      if(App.tab==="play" && $("modalRoot").classList.contains("hidden"))showPlayResult();
    });
    if(!play.moves.length){play.report=An.sideStats([]);play.reportPromise=Promise.resolve([]);return;}
    runPlayReport(gen);
  }
  function runPlayReport(gen) {
    play.reportError=false;
    play.reportPromise=window.FisherReviewPipeline.run(play.moves,{search:finishSearch,engineKey:Eng,depth:14,
      isCancelled:function(){return gen!==play.gen;},
      onProgress:function(done,total,stage){
        play.reportProgress={done:done,total:total,stage:stage};
        const progress=$("resultProgress");if(progress)progress.textContent="Разбор: "+Math.min(100,Math.round(done/total*100))+"%";
        if(batch.fromPlayGen===gen)updateBatchProgress(done,total,stage);
      }
    }).then(function(evals){
      if(gen!==play.gen||!evals)return null;
      play.evals=evals;play.moves.forEach(function(row,i){classifyRow(row,i,evals);});
      play.report=An.sideStats(play.moves);play.reportElapsed=Date.now()-play.reportStarted;updatePlayReport();
      if(batch.fromPlayGen===gen)showPlayBatch(gen);
      return evals;
    }).catch(function(){
      if(gen!==play.gen)return null;
      play.reportError=true;updatePlayReport();
      if(batch.fromPlayGen===gen){batch.running=false;batch.rows=[];renderPgnScreen();setHidden("pgnErrors",false);$("pgnErrors").textContent="Разбор недоступен. Повторите его из партии.";}
      return null;
    });
  }
  function timeoutAnnotations() {
    const loser=play.outcome.flag,square=play.state.board.indexOf(loser==="w"?"K":"k"),name=Chess.sqName(square);
    const marks=[{move:name+name,key:"clock",file:loser==="w"?"clock_white.svg":"clock_black.svg",color:"#ca3431",label:"Время вышло",animate:true}];
    if(play.outcome.winner){const win=Chess.sqName(play.state.board.indexOf(play.outcome.winner==="w"?"K":"k"));marks.push({move:win+win,key:"winner",file:"winner.svg",color:"#81b64c",label:"Победа",animate:true});}
    return marks;
  }
  function queuePremove(from,to,promo) {
    if(!play.thinking || play.outcome)return;
    if(!Game.premoveMoves(play.state,play.color).some(function(move){return move.from===from&&move.to===to&&(!promo||move.promo===promo);}))return;
    play.premove={from:from,to:to,promo:promo};Sounds.play("premove");renderPlay();
  }
  function executePremove() {
    const queued=play.premove;play.premove=null;
    if(!queued || play.outcome || play.state.turn!==play.color)return;
    if(findLegal(play.state,queued.from,queued.to,queued.promo))commitPlayMove(queued.from,queued.to,queued.promo);
    else renderPlay();
  }

  function finishSearch(opts) {return search(opts,"finish-review");}
  function showPlayResult() {
    showModal('<div class="result-hero"><img src="'+(play.outcome.flag===play.color?'analysis-icons/clock_'+(play.color==='w'?'white':'black')+'.svg':play.outcome.winner===play.color?'analysis-icons/winner.svg':'caissa-queen.svg')+'" alt=""><h2>'+outcomeTitle()+'</h2><p class="muted">'+esc(play.outcome.reason)+'</p></div><div id="resultReport"><p id="resultProgress" role="status">Разбираю ваши ходы…</p></div><div class="modal-actions result-actions"><button id="resultNew" class="ghost">Новая партия</button><button id="resultReview" class="primary">Разобрать партию</button></div><button class="ghost wide" data-close="1">К доске</button>');
    $("resultNew").addEventListener("click",function(){closeModal();resetPlaySetup();});
    $("resultReview").disabled=!play.moves.length;
    $("resultReview").addEventListener("click",function(){closeModal();reviewPlay();});updatePlayReport();
  }
  function updatePlayReport() {
    if(!$("resultReport"))return;
    if(play.reportError){$("resultReport").innerHTML='<p>Разбор недоступен. Повторите его из партии.</p>';return;}
    if(!play.report)return;
    const accuracy=play.color==="w"?play.report.white:play.report.black,counts=play.report.countsBySide[play.color];
    const count=Object.keys(counts).reduce(function(n,key){return n+counts[key];},0),elo=Game.estimate(accuracy,count,play.level);
    let html='<div class="result-metrics"><div><strong>'+ (accuracy===null?'—':An.fmt(accuracy)+'%')+'</strong><span>Ваша точность</span></div><div><strong>'+(elo===null?'—':elo)+'</strong><span>Примерный Elo партии</span></div></div><p class="muted small-note">'+(elo===null?'Для оценки Elo нужно хотя бы 6 разобранных ходов.':'Оценка одной партии, не рейтинг игрока.')+'</p><h3>Ваши ходы</h3><div class="result-counts">';
    Object.keys(counts).forEach(function(key){const c=An.category(key);if(c)html+='<span title="'+esc(c.label)+'"><img src="analysis-icons/'+(key==="forced"?'forced.svg':key==="missed"?'miss.svg':c.file)+'" alt="'+esc(c.label)+'">'+counts[key]+' '+esc(c.label)+'</span>';});
    $("resultReport").innerHTML=html+'</div>';
  }
  function surrenderPlay() {
    if(!play.active)return;
    if(play.outcome){resetPlaySetup();return;}
    showModal('<h3>Подтвердите сдачу</h3><p>Вы уверены, что хотите сдаться?</p><div class="modal-actions"><button class="ghost" data-close="1">Продолжить игру</button><button id="confirmResign" class="danger">Да, сдаться</button></div>');
    $("confirmResign").addEventListener("click",function(){closeModal();finishPlay(play.color==="w"?"b":"w","Вы сдались");});
  }

  function hintPlay() {
    if (!play.active || play.thinking || play.hintPending || play.state.turn !== play.color || viewingPlay()) return;
    if (playStatus() !== "play") return;
    const gen = play.gen;
    const turn = play.state.turn;
    const fen = Chess.toFen(play.state);
    play.hintPending=true;renderPlay();
    search({ fen: fen, multipv: 1, depth: 18, movetime:1500, skill:20, elo:0 }, "play-hint").then(function (res) {
      if (gen !== play.gen || Chess.toFen(play.state) !== fen) return;
      play.hintPending=false;
      if(!res || !res.bestmove){renderPlay();return;}
      if (Chess.toFen(play.state) !== fen) return;
      play.hint = res.bestmove;
      if (res.lines && res.lines.length) {
        play.evalScore = res.lines[0].eval;
        play.evalTurn = turn;
      }
      renderPlay();
    });
  }

  function reviewPlay() {
    if(!play.outcome || !play.moves.length)return;
    if(play.reportError || !play.reportPromise){play.reportStarted=Date.now();runPlayReport(play.gen);}
    showPlayBatch(play.gen);
    showTab("analysis");setAnalysisMode("pgn");
  }
  function playHeaders() {
    const result=play.outcome.winner==="w"?"1-0":play.outcome.winner==="b"?"0-1":"1/2-1/2";
    return {Event:"Caissa",White:play.color==="w"?UI.t("Вы"):"Stockfish",Black:play.color==="b"?UI.t("Вы"):"Stockfish",Result:result};
  }
  function showPlayBatch(gen) {
    if(gen!==play.gen)return;
    if(batch.running && batch.fromPlayGen!==gen)Eng.cancel("batch");
    Eng.cancel("pgn-view");batch.gen++;batch.viewPendingFen="";batch.fromPlayGen=gen;
    batch.rows=play.moves.map(function(row){return Object.assign({},row);});batch.headers=playHeaders();
    batch.evals=play.evals.slice();batch.depth=14;batch.side=play.color;batch.nav=play.moves.length-1;
    batch.running=!play.report;batch.elapsed=play.reportElapsed;batch.started=play.reportStarted;
    renderPgnScreen();
    if(!batch.running)renderBatchResult();
    else{
      $("pgnRunTitle").textContent=batch.headers.White+" — "+batch.headers.Black+" · "+batch.headers.Result;
      $("pgnRunSub").textContent="Быстро · 14, сложные до 18";
      const progress=play.reportProgress;if(progress)updateBatchProgress(progress.done,progress.total,progress.stage);
    }
  }

  function initLive() {
    live.state = Chess.startState();
    live.fens = [Chess.toFen(live.state)];
    live.evals = [];
    live.moves = [];
    live.lastMove = null;
    live.future = [];live.nav=null;
    live.evalByFen = Object.create(null);
    live.gen = 0;
    live.analyzing = false;
    renderLive();
  }

  function openingLabelFor(fen) {
    if (!App.index) return "";
    const line = OL.lookup(App.index, fen);
    if (!line) return "";
    return OL.label(line, App.guides);
  }

  // Дебют не должен пропадать, как только линия вышла за справочник:
  // держим последнее найденное название.
  function openingLabelFromFens(fens) {
    for (let i = fens.length - 1; i >= 0; i--) {
      const label = openingLabelFor(fens[i]);
      if (label) return label;
    }
    return "";
  }

  function renderLive() {
    const index=live.nav===null?live.moves.length-1:live.nav,st=Chess.fromFen(live.fens[index+1]),history=live.fens.slice(0,index+2);
    const ev=live.evals[index+1],row=live.moves[index],status=Pgn.gameStatus(st,history);
    const arrow=ev&&ev.lines&&ev.lines[0]?ev.lines[0].move:null;
    liveBoard.render(st,{lastMove:row?row.uci:null,interactive:status==="play",arrow:arrow,showArrow:App.settings.showArrow,annotation:boardAnnotation(row,st,status)});
    renderEvalBar("liveEval",ev&&ev.lines[0]?ev.lines[0].eval:null,st.turn,st,status);
    $("liveOpening").textContent=openingLabelFromFens(history);
    $("liveExplain").textContent=status!=="play"?gameText(st,history):row?An.describe(row):"Начальная позиция. Ходите за обе стороны.";
    $("liveAccuracy").textContent=An.accuracyText(An.sideStats(live.moves));
    $("liveMoves").innerHTML=movesHtml(live.moves,{active:index,last:live.moves.length-1});
    $("liveUndo").disabled=$("liveFirst").disabled=index<0;
    $("liveRedo").disabled=$("liveLast").disabled=index>=live.moves.length-1;
    $("livePosition").textContent=(index+1)+" / "+live.moves.length;
    $("liveFull").disabled=!live.moves.length;renderArrowControls();
  }

  function onLiveBoardMove(from, to) {
    const selected=live.nav===null?live.state:Chess.fromFen(live.fens[live.nav+1]);
    if (needsPromotion(selected, from, to)) {
      showPromotion(selected.turn, function (promo) { commitLiveMove(from, to, promo); });
      return;
    }
    commitLiveMove(from, to, null);
  }

  function commitLiveMove(from, to, promo, keepFuture) {
    const selected=live.nav===null?live.state:Chess.fromFen(live.fens[live.nav+1]);
    const m = findLegal(selected, from, to, promo);
    if (!m) return;
    if(live.nav!==null){
      live.gen++;Eng.cancel("live");live.analyzing=false;live.moves.length=live.nav+1;live.fens.length=live.nav+2;live.evals.length=live.fens.length;live.state=selected;live.nav=null;
    }
    const res = applyMove(live.state, m);
    const row = res.row;
    if (!keepFuture) live.future = [];
    row.ply = live.moves.length;
    live.moves.push(row);
    live.state = res.next;
    live.fens.push(row.fenAfter);
    if(Pgn.gameStatus(live.state,live.fens)==="draw")row.drawAfter=true;
    live.lastMove = row.uci;
    live.evals.length = Math.min(live.evals.length, live.fens.length);
    if (live.evalByFen[row.fenAfter]) live.evals[live.fens.length - 1] = live.evalByFen[row.fenAfter];
    moveSound(row,"live");
    notifyEnd(live.state, live.fens, "live");
    notifyCheck(live.state,live.fens);
    classifyLiveRows();
    renderLive();
    startLiveAnalysis();
  }

  function classifyRow(row, i, evals) { return window.FisherMoveClassification.classifyRow(row, i, evals); }

  function classifyLiveRows() {
    for (let i = 0; i < live.moves.length; i++) classifyRow(live.moves[i], i, live.evals);
  }

  function startLiveAnalysis() {
    if (!App.engineReady) return;
    if (live.analyzing && live.loopGen === live.gen) return;
    live.loopGen = live.gen;
    liveLoop(live.gen);
  }

  function liveLoop(gen) {
    if (gen !== live.gen) { live.analyzing = false; return; }
    let idx = -1;
    for (let i = 0; i < live.fens.length; i++) {
      if (!live.evals[i]) { idx = i; break; }
    }
    if (idx < 0) { live.analyzing = false; return; }
    live.analyzing = true;
    search({ fen: live.fens[idx], multipv: 3, depth: 12, movetime: 500 }, "live").then(function (res) {
      if (gen !== live.gen) return;
      if (!res) { live.analyzing = false; return; }
      live.evals[idx] = res;
      live.evalByFen[live.fens[idx]] = res;
      classifyLiveRows();
      renderLive();
      liveLoop(gen);
    });
  }

  function undoLive() {navigateLive((live.nav===null?live.moves.length-1:live.nav)-1);}

  function redoLive() {navigateLive((live.nav===null?live.moves.length-1:live.nav)+1);}

  function navigateLive(index) {
    index=Math.max(-1,Math.min(live.moves.length-1,index));
    live.nav=index===live.moves.length-1?null:index;renderLive();
  }

  function resetLive() {
    endSoundState.live = "";
    live.future = [];live.nav=null; live.evalByFen = Object.create(null);
    live.gen++;
    Eng.cancel("live");
    live.analyzing = false;
    live.state = Chess.startState();
    live.fens = [Chess.toFen(live.state)];
    live.evals = [];
    live.moves = [];
    live.lastMove = null;
    renderLive();
    startLiveAnalysis();
  }

  function setLiveFen(fen) {
    endSoundState.live = "";
    if (!fen || fen.split(/\s+/).length < 4) { toast("Нужен FEN из 4–6 полей"); return false; }
    let st;
    try { st = Chess.fromFen(fen); } catch (e) { toast(e.message || "Неверный FEN"); return false; }
    if (st.board.indexOf("K") < 0 || st.board.indexOf("k") < 0) { toast("В FEN нет королей"); return; }
    live.future = [];live.nav=null; live.evalByFen = Object.create(null);
    live.gen++;
    Eng.cancel("live");
    live.analyzing = false;
    live.state = st;
    live.fens = [Chess.toFen(st)];
    live.evals = [];
    live.moves = [];
    live.lastMove = null;
    renderLive();
    startLiveAnalysis();
    return true;
  }

  function showFenModal() {
    const cur = Chess.toFen(live.state);
    showModal('<h3>Позиция из FEN</h3><p class="muted" style="font-size:13px">Вставьте FEN. Ход, рокировки и взятие на проходе сохраняются.</p>' +
      '<textarea id="fenInput" rows="3">' + esc(cur) + "</textarea>" +
      '<div class="modal-actions"><button class="ghost" data-close="1">Отмена</button>' +
      '<button class="primary" id="fenOk">Загрузить</button></div>');
    $("fenOk").addEventListener("click", function () {
      const v = $("fenInput").value.trim();
      if (setLiveFen(v)) closeModal();
    });
  }

  function saveLivePgn() {
    const headers = { Event: "Caissa", White: "Разбор", Black: "Разбор" };
    if (live.fens[0] !== fenStart()) { headers.SetUp = "1"; headers.FEN = live.fens[0]; }
    const end = Pgn.gameStatus(live.state, live.fens);
    const result = end === "mate" ? (live.state.turn === "w" ? "0-1" : "1-0") : end === "play" ? "*" : "1/2-1/2";
    const text = Pgn.toPgn(headers, live.moves, result);
    if (window.AndroidEngine && window.AndroidEngine.savePgn) {
      window.AndroidEngine.savePgn("fisher.pgn", text);
    } else {
      const blob = new Blob([text], { type: "application/x-chess-pgn" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "fisher.pgn";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
  }

  function loadLineToLive(lineText) {
    const parsed = Pgn.parse(lineText);
    if (!parsed.games.length || !parsed.games[0].ok) { toast("Не удалось разобрать линию"); return; }
    const rows = rowsFromParsed(parsed.games[0]);
    live.future = [];live.nav=null; live.evalByFen = Object.create(null);
    live.gen++;
    Eng.cancel("live");
    live.analyzing = false;
    live.moves = rows;
    live.fens = [parsed.games[0].startFen].concat(rows.map(function (r) { return r.fenAfter; }));
    live.evals = [];
    live.state = Chess.fromFen(live.fens[live.fens.length - 1]);
    live.lastMove = rows.length ? rows[rows.length - 1].uci : null;
    showTab("analysis");
    setAnalysisMode("live");
    renderLive();
    startLiveAnalysis();
  }

  // ---------- PGN batch ----------

  function openBatchFromRows(rows, headers) {
    if (!rows || !rows.length) { toast("Нет ходов для разбора"); return; }
    if (batch.running) { batch.gen++; Eng.cancel("batch"); batch.running = false; }
    showTab("analysis");
    setAnalysisMode("pgn");
    startBatch(rows, headers || {});
  }

  function resetRowForBatch(row) {
    if (!row) return;
    row.bestUci = null; row.bestSan = null; row.evalText = null;
    if (row.legalCount === 1) { row.key = "forced"; row.loss = 0; }
    else { row.key = row.book ? "book" : null; row.loss = undefined; }
  }

  function startBatch(rows, headers) {
    batch.fromPlayGen=null;
    batch.gen++;
    const gen = batch.gen;
    rows = rows.map(function (row) { return Object.assign({}, row); });
    batch.rows = rows;
    batch.headers = headers;
    batch.evals = new Array(rows.length + 1);
    batch.nav = rows.length - 1;
    batch.depth = App.settings.depth;
    Eng.cancel("pgn-view"); batch.viewPendingFen = "";
    batch.running = true; batch.started = Date.now(); batch.side = "w"; endSoundState.batch = "";
    for (let i = 0; i < rows.length; i++) { resetRowForBatch(rows[i]); classifyRow(rows[i], i, []); }
    setHidden("pgnImport", true);
    setHidden("pgnResult", true);
    setHidden("pgnRun", false);
    $("pgnRunTitle").textContent = (headers.White || UI.t("Белые")) + " — " + (headers.Black || UI.t("Чёрные")) +
      (headers.Result ? " · " + headers.Result : "");
    $("pgnRunSub").textContent = (batch.depth >= 18 ? "Глубоко · до 18" : "Быстро · 14, сложные до 18") + " · " + rows.length + " полуходов";
    setDepthButtons(batch.depth);
    updateBatchProgress(0, rows.length);
    setHidden("pgnErrors", true);
    stepBatch(0, gen);
  }

  function setDepthButtons(depth) {
    const btns = $("pgnDepth").querySelectorAll("button");
    for (let i = 0; i < btns.length; i++) btns[i].classList.toggle("active", Number(btns[i].getAttribute("data-depth")) === depth);
  }

  function updateBatchProgress(done, total, stage) {
    const base = batch.rows.length + 1;
    let pct = total ? done / total * 100 : 0;
    if (stage === "base") pct = Math.min(70, 70 * done / base);
    else if (stage === "refine") pct = total > base ? 70 + 30 * (done - base) / (total - base) : 100;
    $("pgnProgressText").textContent = stage === "refine" ? "Уточнение " + Math.max(0, done - base) + " из " + Math.max(0, total - base) :
      "Позиция " + Math.min(done, base) + " из " + base;
    $("pgnProgressBar").style.width = Math.max(0, Math.min(100, pct)) + "%";
  }

  function batchSearch(opts) { return search(opts, "batch"); }

  function stepBatch(i, gen) {
    window.FisherReviewPipeline.run(batch.rows, {search:batchSearch, engineKey:Eng, depth:batch.depth,
      isCancelled:function () { return gen !== batch.gen || !batch.running; },
      onPosition:function (index, res) {
        if (gen !== batch.gen) return;
        batch.evals[index] = res;
        for (let j = Math.max(0, index - 1); j <= index && j < batch.rows.length; j++) classifyRow(batch.rows[j], j, batch.evals);
      }, onProgress:updateBatchProgress
    }).then(function (evals) {
      if (gen !== batch.gen || !batch.running) return;
      if (!evals) throw new Error("Разбор отменён");
      batch.evals = evals;
      for (let j = 0; j < batch.rows.length; j++) classifyRow(batch.rows[j], j, evals);
      finishBatch();
    }).catch(function (err) {
      if (gen !== batch.gen) return;
      batch.running = false; batch.rows = []; batch.evals = [];
      renderPgnScreen(); setHidden("pgnErrors", false);
      $("pgnErrors").textContent = "Разбор прерван: " + (err.message || "движок не ответил") + ". Повторите импорт партии.";
    });
  }

  function finishBatch() {
    batch.running = false; batch.elapsed = Date.now() - batch.started;
    const last = batch.rows[batch.rows.length - 1];
    notifyEnd(Chess.fromFen(last.fenAfter), historyFor(batch.rows, batch.rows[0].fenBefore), "batch", batch.headers.Result);
    setHidden("pgnRun", true);
    setHidden("pgnResult", false);
    batch.nav = batch.rows.length - 1;
    renderBatchResult();
  }

  function cancelBatch() {
    batch.fromPlayGen=null;
    batch.gen++;
    batch.running = false;
    Eng.cancel("batch");
    batch.rows = [];
    batch.evals = [];
    setHidden("pgnRun", true);
    setHidden("pgnImport", false);
    setHidden("pgnResult", true);
    $("pgnProgressBar").style.width = "0%";
    $("pgnProgressText").textContent = "ход 0 из 0";
    toast("Разбор отменён");
  }

  function renderBatchResult() {
    const rows = batch.rows;
    const stats = An.sideStats(rows);
    $("pgnResultTitle").textContent = (batch.headers.White || UI.t("Белые")) + " — " +
      (batch.headers.Black || UI.t("Чёрные")) + (batch.headers.Result ? " · " + batch.headers.Result : "");
    $("pgnResultSub").textContent = "Глубина " + batch.depth + " · " + rows.length + " полуходов · " +
      An.accuracyText(stats) + " · " + (batch.elapsed / 1000).toFixed(1) + " с";

    function accBlock(name, val, black) {
      const pct = val === null ? 0 : Math.round(val * 10) / 10;
      return '<div class="acc' + (black ? " black" : "") + '"><div class="top"><span>' + name +
        '</span><span class="val">' + (val === null ? "—" : An.fmt(val) + "%") + '</span></div>' +
        '<div class="bar"><span style="width:' + pct + '%"></span></div></div>';
    }
    $("pgnAccBars").innerHTML = accBlock("Белые", stats.white, false) + accBlock("Чёрные", stats.black, true);
    $("pgnVerdict").textContent = An.verdict(stats);
    $("pgnReviewNote").textContent = batch.depth < 18 ? "Быстрая проверка: сложные позиции уточняются отдельно. Метки могут измениться после глубокого разбора." : "Глубокая проверка: одинаковый режим MultiPV для всех некнижных позиций.";
    setHidden("pgnDeepen", batch.depth >= 18);

    let chips = "";
    const order = ["brilliant", "great", "best", "excellent", "good", "book", "forced", "inaccuracy", "mistake", "missed", "blunder"];
    const selected = batch.side === "all" ? rows : rows.filter(function(row){return row.color === batch.side;});
    const counts = batch.side === "all" ? stats.counts : stats.countsBySide[batch.side];
    $("pgnCountsTitle").textContent = (batch.side === "all" ? "Обе стороны" : batch.side === "w" ? batch.headers.White || UI.t("Белые") : batch.headers.Black || UI.t("Чёрные")) + " · " + selected.length + " ходов";
    const sideButtons = $("pgnSides").querySelectorAll("[data-side]");
    for(let i=0;i<sideButtons.length;i++){sideButtons[i].classList.toggle("active",sideButtons[i].getAttribute("data-side")===batch.side);sideButtons[i].setAttribute("aria-pressed",String(sideButtons[i].getAttribute("data-side")===batch.side));}
    for (let i = 0; i < order.length; i++) {
      const key = order[i];
      const n = counts[key];
      if (!n) continue;
      const c = An.category(key);
      chips += '<span class="chip">' + badgeHtml({ key: key, evalText: "" }) + esc(c ? c.label : key) + " <b>" + n + "</b></span>";
    }
    $("pgnChips").innerHTML = chips;

    const keys = An.keyMoves(selected, 5);
    let km = "";
    for (let i = 0; i < keys.length; i++) {
      km += '<div class="keymove"><span class="km-no">' + esc(moveLabel(keys[i])) + '</span><span class="km-text">' +
        esc(An.describe(keys[i])) + "</span>" + badgeHtml(keys[i]) + "</div>";
    }
    $("pgnKeyMoves").innerHTML = km || '<div class="muted">Ключевых ходов не нашлось</div>';
    renderPgnBoard();
  }

  function requestPgnView(index, fen) {
    if (!App.engineReady || batch.running || App.tab !== "analysis" || currentAnalysisMode !== "pgn" || batch.evals[index] || batch.viewPendingFen === fen) return;
    if (Pgn.gameStatus(Chess.fromFen(fen)) !== "play") return;
    Eng.cancel("pgn-view"); batch.viewPendingFen = fen;
    const gen = batch.gen;
    search({fen:fen,multipv:1,depth:12,movetime:120},"pgn-view").then(function(res){
      if(gen !== batch.gen)return;
      if(batch.viewPendingFen===fen)batch.viewPendingFen="";
      if(res){batch.evals[index]=res;if(batch.nav+1===index)renderPgnBoard();}
    });
  }

  function renderPgnBoard() {
    if (!batch.rows.length) return;
    const rows = batch.rows;
    if (batch.nav < -1) batch.nav = -1;
    if (batch.nav > rows.length - 1) batch.nav = rows.length - 1;
    const nav = batch.nav;
    const fen = nav < 0 ? rows[0].fenBefore : rows[nav].fenAfter;
    const st = Chess.fromFen(fen);
    const ev = batch.evals[nav + 1];
    const arrow = ev && ev.lines && ev.lines.length ? ev.lines[0].move : null;
    pgnBoard.render(st, {
      lastMove: nav >= 0 ? rows[nav].uci : null,
      interactive: false, arrow: arrow, showArrow: App.settings.showArrow,
      annotation: boardAnnotation(nav >= 0 ? rows[nav] : null, st, Pgn.gameStatus(st, [rows[0].fenBefore].concat(rows.slice(0, nav + 1).map(function(row){return row.fenAfter;}))), nav === rows.length - 1 ? batch.headers.Result : null)
    });
    if (ev && ev.lines && ev.lines.length) renderEvalBar("pgnEval", ev.lines[0].eval, st.turn, st);
    else renderEvalBar("pgnEval", null, "w", st);
    const fens = [rows[0].fenBefore];
    for (let i = 0; i <= nav; i++) fens.push(rows[i].fenAfter);
    $("pgnOpening").textContent = openingLabelFromFens(fens);
    $("pgnExplain").textContent = nav < 0 ? "Начальная позиция" : An.describe(rows[nav]);
    $("pgnMoves").innerHTML = movesHtml(rows, { active: nav, last: rows.length - 1 });
    requestPgnView(nav + 1, fen);
    $("pgnFirst").disabled = $("pgnPrev").disabled = nav < 0;
    $("pgnNext").disabled = $("pgnLast").disabled = nav >= rows.length - 1;
    renderArrowControls();
  }

  function renderPgnScreen() {
    if (batch.running) {
      setHidden("pgnImport", true); setHidden("pgnRun", false); setHidden("pgnResult", true);
    } else if (batch.rows.length) {
      setHidden("pgnImport", true); setHidden("pgnRun", true); setHidden("pgnResult", false);
    } else {
      setHidden("pgnImport", false); setHidden("pgnRun", true); setHidden("pgnResult", true);
    }
  }

  function handlePgnText(text, name) {
    batch.fromPlayGen=null;
    batch.gen++;
    Eng.cancel("batch");
    batch.running = false;
    batch.rows = []; batch.evals = [];
    const parsed = Pgn.parse(text);
    setHidden("pgnImport", false);
    setHidden("pgnRun", true);
    setHidden("pgnResult", true);
    setHidden("pgnErrors", false);
    setHidden("pgnGames", false);
    if (!parsed.games.length) {
      $("pgnErrors").textContent = "PGN не найден.";
      renderGameList([]);
      return;
    }
    const ok = parsed.games.filter(function (g) { return g.ok; });
    if (parsed.errors.length) $("pgnErrors").textContent = parsed.errors.join("\n");
    else $("pgnErrors").textContent = name ? "Загружено: " + name : "";
    if (!ok.length) { renderGameList([]); return; }
    if (ok.length === 1 && parsed.errors.length === 0) {
      const rows = rowsFromParsed(ok[0]);
      openBatchFromRows(rows, ok[0].headers);
      return;
    }
    renderGameList(ok);
  }

  function renderGameList(games) {
    let html = "";
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      html += '<button class="game" data-idx="' + i + '">' +
        '<span class="players"><span class="who">' + esc((g.headers.White || UI.t("Белые")) + " — " + (g.headers.Black || UI.t("Чёрные"))) + "</span>" +
        '<span class="res">' + esc(g.headers.Result || g.result || "*") + "</span></span>" +
        '<span class="cnt">' + g.moves.length + " ходов</span></button>";
    }
    $("pgnGames").innerHTML = html;
    const btns = $("pgnGames").querySelectorAll("[data-idx]");
    for (let i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        const g = games[Number(this.getAttribute("data-idx"))];
        openBatchFromRows(rowsFromParsed(g), g.headers);
      });
    }
  }

  // ---------- openings ----------

  function renderOpeningList() {
    const q = ($("openingSearch") ? $("openingSearch").value : "").trim().toLowerCase();
    const list = $("openingList");
    if (!list) return;
    let html = "";
    let n = 0;
    for (let i = 0; i < App.guides.length; i++) {
      const g = App.guides[i];
      const hay = (g.name + " " + g.id + " " + g.eco + " " + (g.keywords || []).join(" ") + " " +
        g.variations.map(function (v) { return v.name + " " + (v.title || ""); }).join(" ")).toLowerCase();
      if (q && hay.indexOf(q) < 0) continue;
      if (!window.OpeningLessons.matchesFilter(g, openings.filter)) continue;
      n++;
      html += '<button class="opening-card" data-id="' + esc(g.id) + '">' +
        '<span class="eco">' + esc(g.eco) + '</span><span><span class="oc-name">' + esc(g.name) +
        '</span><span class="oc-line">' + esc(g.mainline) + "</span></span></button>";
    }
    if (!n) html = '<div class="muted" style="padding:10px">Ничего не найдено</div>';
    list.innerHTML = html;
    const cards = list.querySelectorAll("[data-id]");
    for (let i = 0; i < cards.length; i++) {
      cards[i].addEventListener("click", function () {
        const id = this.getAttribute("data-id");
        for (let k = 0; k < App.guides.length; k++) if (App.guides[k].id === id) return openOpening(App.guides[k]);
      });
    }
  }

  function openOpening(g) {
    openings.view = "detail";
    openings.guide = g; openings.custom = null;
    openings.line = null;
    openings.variant = -2;
    setHidden("openingListView", true); setHidden("openingDetailView", false);
    $("openingTitle").textContent = g.name; $("openingEco").textContent = "ECO " + g.eco;
    $("openingIdea").textContent = g.idea;
    [ ["openingWhite", g.white], ["openingBlack", g.black], ["openingMistakes", g.mistakes] ].forEach(function (pair) {
      $(pair[0]).innerHTML = pair[1].map(function (text) { return "<li>" + esc(text) + "</li>"; }).join("");
    });
    let options = '<option value="-1">Основная линия</option>', variants = "";
    for (let i = 0; i < g.variations.length; i++) {
      const v = g.variations[i];
      if (!window.OpeningLessons.matchesFilter(v, openings.filter)) continue;
      options += '<option value="' + i + '">' + esc(v.title || v.name) + '</option>';
      variants += '<button class="variation" data-vi="' + i + '"><span class="vn">' + esc(v.title || v.name) +
        '</span><span class="vl">' + esc(v.line) + '</span></button>';
    }
    $("openingVariantSelect").innerHTML = options;
    $("openingVariations").innerHTML = variants;
    const buttons = $("openingVariations").querySelectorAll("[data-vi]");
    for (let i = 0; i < buttons.length; i++) buttons[i].addEventListener("click", function () {
      selectOpeningVariant(Number(this.getAttribute("data-vi")));
      $("openingVariantSelect").scrollIntoView({ block: "start" });
    });
    let first = -1;
    if(openings.filter !== "all") for(let i=0;i<g.variations.length;i++) if(window.OpeningLessons.matchesFilter(g.variations[i],openings.filter)){first=i;break;}
    selectOpeningVariant(first,true);
    window.scrollTo(0, 0);
  }

  function selectOpeningVariant(index,quiet) {
    const g = openings.guide;
    if (!g || index === openings.variant) return;
    const chosen = index === -3 ? openings.custom : index < 0 ? { line: g.mainline, notes: g.notes } : g.variations[index];
    if (!chosen) return;
    const parsed = Pgn.parse(chosen.line).games[0];
    if (!parsed || !parsed.ok) { toast("Не удалось открыть вариант"); return; }
    const previous = openings.line;
    const previousFen=previous?openingFen():null;
    let fork = 0;
    if (previous) {
      while (fork < previous.moves.length && fork < parsed.moves.length && previous.moves[fork].uci === parsed.moves[fork].uci) fork++;
      if (fork >= parsed.moves.length) fork = 0;
    }
    openings.variant = index; openings.lineText = chosen.line; openings.line = parsed;
    openings.notes = window.OpeningLessons.notes(parsed, chosen.notes, App.settings.lang);
    $("openingVariantSelect").value = String(index);
    const buttons = $("openingVariations").querySelectorAll("[data-vi]");
    for (let i = 0; i < buttons.length; i++) buttons[i].classList.toggle("active", Number(buttons[i].getAttribute("data-vi")) === index);
    setOpeningStep(fork,true);
    if(previousFen && !quiet && previousFen!==openingFen())Sounds.play("move");
  }

  function setOpeningStep(step,quiet) {
    if (!openings.line) return;
    const previous=openings.step;
    openings.step = Math.max(0, Math.min(openings.line.moves.length, step));
    if(!quiet && openings.step!==previous){
      const index=openings.step>previous?openings.step-1:previous-1;
      const row=openings.line.moves[index];if(row)Sounds.play(Sounds.eventForMove(row));
    }
    openings.gen++; Eng.cancel("openings"); openings.pendingFen = null;
    renderOpeningBoard(); requestOpeningEval();
  }

  function openingFen() {
    return openings.step > 0 ? openings.line.moves[openings.step - 1].fenAfter : openings.line.startFen;
  }

  function requestOpeningEval() {
    if (!App.engineReady || !openings.line || openings.view !== "detail" || App.tab !== "openings") return;
    const fen = openingFen(), gen = openings.gen;
    if (openings.evals[fen] || openings.pendingFen === fen) return;
    openings.pendingFen = fen;
    search({ fen: fen, multipv: 3, depth: 12, movetime: 500 }, "openings").then(function (res) {
      if (gen !== openings.gen) return;
      openings.pendingFen = null;
      if (res) openings.evals[fen] = res;
      renderOpeningBoard();
      if (!res) $("openingEvalText").textContent = "Оценка недоступна. Переключите ход для повторного расчёта.";
    });
  }

  function renderOpeningBoard() {
    const line = openings.line;
    if (!line) return;
    const fen = openingFen(), st = Chess.fromFen(fen);
    resetExplorerPosition(fen);
    const row = openings.step > 0 ? line.moves[openings.step - 1] : null;
    const ev = openings.evals[fen];
    const best = ev && ev.lines && ev.lines[0];
    openingBoard.render(st, { lastMove: row ? row.uci : null, interactive: false,
      arrow: best ? best.move : null, showArrow: App.settings.showArrow,
      annotation: row && (openings.variant !== -3 || (App.index && OL.lookup(App.index,fen))) ? moveAnnotation(Object.assign({}, row, {key:"book"}), false) : null });
    renderEvalBar("openingEval", best ? best.eval : null, st.turn, st);
    $("openingEvalText").textContent = best ? "Оценка: " + MR.formatEval(best.eval, st.turn) + " · за белых" : "Расчёт позиции…";
    $("openingStep").textContent = openings.step + " / " + line.moves.length;
    $("openingCurrentMove").textContent = row ? moveLabel(row) : "Начальная позиция";
    $("openingExplain").textContent = row ? openings.notes[openings.step - 1] : "Шагайте по ходам: под доской будет пояснение каждого хода. " + openings.guide.idea;
    $("openingPrev").disabled = $("openingFirst").disabled = openings.step <= 0;
    $("openingNext").disabled = $("openingLast").disabled = openings.step >= line.moves.length;
    $("openingTimeline").max = String(line.moves.length); $("openingTimeline").value = String(openings.step);
    $("openingLine").textContent = openings.lineText;
    const rows = line.moves.map(function (move) { return Object.assign({}, move, {key:"book"}); });
    $("openingMoves").innerHTML = movesHtml(rows, {active:openings.step - 1});
    renderArrowControls();
  }

  function closeOpening() {
    cancelExplorer();
    openings.view = "list"; openings.gen++; Eng.cancel("openings"); openings.pendingFen = null;
    setHidden("openingListView", false); setHidden("openingDetailView", true); renderOpeningList();
  }

  function cancelExplorer() {
    openings.explorerGen++;
    if (openings.explorerController) openings.explorerController.abort();
    openings.explorerController = null;
  }
  function resetExplorerPosition(fen) {
    if (openings.explorerFen === fen) return;
    cancelExplorer(); openings.explorerFen = fen;
    $("explorerMoves").innerHTML = "";
    $("explorerStatus").textContent = "База мастеров Lichess. Интернет используется только по кнопке; полученные позиции сохраняются для офлайн-просмотра.";
    $("explorerLoad").disabled = false;
  }
  function requestExplorer() {
    if (!openings.line) return;
    cancelExplorer();
    const gen = openings.explorerGen, fen = openingFen();
    openings.explorerFen = fen;
    openings.explorerController = typeof AbortController === "function" ? new AbortController() : null;
    $("explorerLoad").disabled = true; $("explorerMoves").innerHTML = "";
    $("explorerStatus").textContent = "Загружаю продолжения Lichess…";
    window.OpeningExplorer.lookup(fen, {signal:openings.explorerController ? openings.explorerController.signal : null}).then(function (data) {
      if(gen!==openings.explorerGen)return;
      $("explorerLoad").disabled = false;
      $("explorerStatus").textContent = (data.stale || data.warning ? "Сохранённые данные; сеть недоступна. " : data.cached ? "Сохранённая позиция. " : "База мастеров Lichess. ") +
        (data.opening ? data.opening.eco + " · " + data.opening.name + ". " : "") + "Числа показывают результаты партий, а не оценку движка.";
      let html = "";
      data.moves.forEach(function (move) {
        const total=move.white+move.draws+move.black;
        html+='<button class="explorer-move" data-uci="'+esc(move.uci)+'"><strong>'+esc(move.san)+'</strong><span>'+total.toLocaleString()+
          ' партий</span><span class="explorer-ratio" aria-label="Белые '+move.white+', ничьи '+move.draws+', чёрные '+move.black+'">'+
          '<i style="width:'+(total?move.white/total*100:0)+'%"></i><i style="width:'+(total?move.draws/total*100:0)+'%"></i><i style="width:'+(total?move.black/total*100:0)+'%"></i></span></button>';
      });
      $("explorerMoves").innerHTML=html || '<p class="muted">В этой базе продолжений нет. Можно продолжить на доске анализа.</p>';
    },function(err){if(gen!==openings.explorerGen)return;$("explorerLoad").disabled=false;$("explorerStatus").textContent=err.message || "Нет связи с Lichess.";});
  }
  function applyExplorerMove(uci) {
    const state=Chess.fromFen(openingFen()), move=findUci(state,uci);
    if(!move)return;
    const prefix=openings.line.moves.slice(0,openings.step), applied=applyMove(state,move);
    prefix.push(applied.row);
    const text=Pgn.toPgn({},prefix,"*").split("\n\n")[1].trim();
    const parsed=Pgn.parse(text).games[0];
    if(!parsed || !parsed.ok)return;
    openings.custom={line:text}; openings.line=parsed; openings.lineText=text;
    openings.notes=window.OpeningLessons.notes(parsed,null,App.settings.lang); openings.variant=-3;
    if(!$("openingVariantSelect").querySelector('option[value="-3"]')) {
      const option=document.createElement("option"); option.value="-3"; option.textContent="Продолжение Lichess"; $("openingVariantSelect").appendChild(option);
    }
    $("openingVariantSelect").value="-3";
    setOpeningStep(prefix.length); requestExplorer();
  }

  // ---------- data ----------

  function loadData() {
    Promise.all(["openings.json","opening-guides.json","opening-guides.en.json"].map(function(path){return fetch(path).then(function(r){if(!r.ok)throw new Error(path);return r.json();});})).then(function(data){
      App.lines=data[0].lines||[];App.guideSets={ru:data[1].guides||[],en:data[2].guides||[]};
      App.guides=App.guideSets[App.settings.lang];App.index=OL.buildIndex(App.lines);renderOpeningList();renderLive();
    }).catch(function(err){toast("Не загрузились данные дебютов");console.error(err);});
  }
  function applyLanguage() {
    UI.setLanguage(App.settings.lang);
    const oldGuide=openings.guide,variant=openings.variant,step=openings.step,custom=openings.custom;
    if(App.guideSets){
      App.guides=App.guideSets[App.settings.lang];
      if(oldGuide){
        const next=App.guides.filter(function(g){return g.id===oldGuide.id;})[0];
        if(next){openOpening(next);if(variant===-3)openings.custom=custom;selectOpeningVariant(variant,true);setOpeningStep(step,true);}
      }
      $("openingSearch").value="";renderOpeningList();
    }
    if(window.AndroidEngine && window.AndroidEngine.setLanguage)window.AndroidEngine.setLanguage(App.settings.lang);
    if(batch.rows.length){
      if(batch.fromPlayGen!==null)batch.headers=playHeaders();
      if(!batch.running)renderBatchResult();
      else $("pgnRunTitle").textContent=(batch.headers.White||UI.t("Белые"))+" — "+(batch.headers.Black||UI.t("Чёрные"))+(batch.headers.Result?" · "+batch.headers.Result:"");
    }
    if($("resultReport"))updatePlayReport();
  }

  window.FisherBack = function () {
    if (!$("modalRoot").classList.contains("hidden")) { closeModal(); return true; }
    if (App.tab === "openings" && openings.view === "detail") { closeOpening(); return true; }
    if (App.tab !== "play") { showTab("play"); return true; }
    return false;
  };

  function bindChrome() {
    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown",unlockAudio);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { if (window.FisherBack()) e.preventDefault(); return; }
      if ($("modalRoot").classList.contains("hidden") && ["INPUT", "TEXTAREA", "SELECT"].indexOf(e.target.tagName) < 0) {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          const next = e.key === "ArrowRight";
          if (App.tab === "play" && play.active) {setPlayView((viewingPlay() ? play.nav : play.moves.length - 1) + (next ? 1 : -1)); e.preventDefault();}
          else if (App.tab === "analysis" && currentAnalysisMode === "live") { next ? redoLive() : undoLive(); e.preventDefault(); }
          else if (App.tab === "analysis" && currentAnalysisMode === "pgn" && batch.rows.length) {
            batch.nav += next ? 1 : -1; renderPgnBoard(); e.preventDefault();
          } else if (App.tab === "openings" && openings.view === "detail") {
            setOpeningStep(openings.step + (next ? 1 : -1)); e.preventDefault();
          }
        }
      }
      if (e.key !== "Tab" || $("modalRoot").classList.contains("hidden")) return;
      const items = $("modalBox").querySelectorAll("button, input, select, textarea, a[href]");
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    $("settingsBtn").addEventListener("click", openSettings);
    const tabs = $("tabbar").querySelectorAll("button");
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener("click", function () { showTab(this.getAttribute("data-tab")); });
    }
    $("modalRoot").addEventListener("pointerdown", function (e) {
      modalPointerTarget = e.target;
    });
    $("modalRoot").addEventListener("click", function (e) {
      const beganHere = modalPointerTarget === e.target;
      modalPointerTarget = null;
      if (e.target.getAttribute("data-close") &&
          (!e.target.classList.contains("modal-backdrop") || beganHere)) closeModal();
    });
    const modeBtns = $("analysisMode").querySelectorAll("button");
    for (let i = 0; i < modeBtns.length; i++) {
      modeBtns[i].addEventListener("click", function () { setAnalysisMode(this.getAttribute("data-mode")); });
    }
  }

  function bindPlay() {
    const colorBtns = $("colorSeg").querySelectorAll("button");
    for (let i = 0; i < colorBtns.length; i++) {
      colorBtns[i].addEventListener("click", function () {
        play.color = this.getAttribute("data-color");
        for (let k = 0; k < colorBtns.length; k++) colorBtns[k].classList.toggle("active", colorBtns[k] === this);
      });
    }
    const levelBtns = $("levelSeg").querySelectorAll("button");
    for (let i = 0; i < levelBtns.length; i++) {
      levelBtns[i].addEventListener("click", function () {
        play.level = Number(this.getAttribute("data-level"));
        for (let k = 0; k < levelBtns.length; k++) levelBtns[k].classList.toggle("active", levelBtns[k] === this);
      });
    }
    $("startGame").addEventListener("click", startPlay);
    $("playRetry").addEventListener("click", engineTurn);
    $("playUndo").addEventListener("click", undoPlay);
    $("playHint").addEventListener("click", hintPlay);
    $("playFlip").addEventListener("click", function () {
      play.orientation = play.orientation === "w" ? "b" : "w";
      playBoard.setOrientation(play.orientation);
      renderPlay();
    });
    $("playNew").addEventListener("click", surrenderPlay);
    $("playReview").addEventListener("click", reviewPlay);
    $("playReport").addEventListener("click",showPlayResult);
    $("playCancelPremove").addEventListener("click",function(){play.premove=null;renderPlay();});
    $("playFirst").addEventListener("click", function () {setPlayView(-1);});
    $("playPrev").addEventListener("click", function () {setPlayView((viewingPlay() ? play.nav : play.moves.length - 1) - 1);});
    $("playNext").addEventListener("click", function () {setPlayView((viewingPlay() ? play.nav : play.moves.length - 1) + 1);});
    $("playLast").addEventListener("click", function () {setPlayView(play.moves.length - 1);});
    $("playReturn").addEventListener("click", function () {setPlayView(play.moves.length - 1);});
    $("playMoves").addEventListener("click", function (e) {const button=e.target.closest("[data-ply]");if(button)setPlayView(Number(button.getAttribute("data-ply")));});
  }

  function bindLive() {
    $("liveFirst").addEventListener("click",function(){navigateLive(-1);});
    $("liveLast").addEventListener("click",function(){navigateLive(live.moves.length-1);});
    $("liveUndo").addEventListener("click", undoLive);
    $("liveReset").addEventListener("click", resetLive);
    $("liveFen").addEventListener("click", showFenModal);
    $("liveFlip").addEventListener("click", function () {
      live.orientation = live.orientation === "w" ? "b" : "w";
      liveBoard.setOrientation(live.orientation);
      renderLive();
    });
    $("liveArrow").addEventListener("click", toggleArrows);
    $("liveRedo").addEventListener("click", redoLive);
    $("liveMoves").addEventListener("click", function (e) {
      const button = e.target.closest("[data-ply]");
      if (button) navigateLive(Number(button.getAttribute("data-ply")));
    });
    $("liveFull").addEventListener("click", function () {
      openBatchFromRows(live.moves, { Event: "Caissa", White: "Разбор", Black: "Разбор", Result: "*" });
    });
    $("liveSave").addEventListener("click", saveLivePgn);
  }

  function bindPgn() {
    $("pgnDeepen").addEventListener("click",function(){if(batch.running)return;App.settings.depth=18;saveSettings();startBatch(batch.rows,batch.headers);});
    $("pgnSides").addEventListener("click", function(e){const button=e.target.closest("[data-side]");if(button){batch.side=button.getAttribute("data-side");renderBatchResult();}});
    $("pgnArrow").addEventListener("click", toggleArrows);
    $("pgnPick").addEventListener("click", function () {
      if (window.AndroidEngine && window.AndroidEngine.pickPgn) window.AndroidEngine.pickPgn();
      else $("pgnFile").click();
    });
    $("pgnFile").addEventListener("change", function () {
      const file = this.files && this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () { handlePgnText(String(reader.result || ""), file.name); };
      reader.readAsText(file);
      this.value = "";
    });
    $("pgnPasteBtn").addEventListener("click", function () {
      setHidden("pgnText", false);
      setHidden("pgnParse", false);
      $("pgnText").focus();
    });
    $("pgnParse").addEventListener("click", function () { handlePgnText($("pgnText").value, "вставка"); });
    $("pgnCancel").addEventListener("click", cancelBatch);
    $("pgnNew").addEventListener("click", function () {
      batch.fromPlayGen=null;batch.rows = []; batch.evals = []; batch.running = false; batch.gen++;
      setHidden("pgnResult", true);
      setHidden("pgnImport", false);
      setHidden("pgnErrors", true);
      setHidden("pgnGames", true);
      $("pgnGames").innerHTML = "";
    });
    const depthBtns = $("pgnDepth").querySelectorAll("button");
    for (let i = 0; i < depthBtns.length; i++) {
      depthBtns[i].addEventListener("click", function () {
        if (batch.running) return;
        App.settings.depth = Number(this.getAttribute("data-depth"));
        saveSettings();
        setDepthButtons(App.settings.depth);
      });
    }
    $("pgnFirst").addEventListener("click", function () { batch.nav = -1; renderPgnBoard(); });
    $("pgnPrev").addEventListener("click", function () { batch.nav = Math.max(-1, batch.nav - 1); renderPgnBoard(); });
    $("pgnNext").addEventListener("click", function () { batch.nav = Math.min(batch.rows.length - 1, batch.nav + 1); renderPgnBoard(); });
    $("pgnLast").addEventListener("click", function () { batch.nav = batch.rows.length - 1; renderPgnBoard(); });
    $("pgnMoves").addEventListener("click", function (e) {
      const b = e.target.closest ? e.target.closest("[data-ply]") : null;
      if (!b) return;
      batch.nav = Number(b.getAttribute("data-ply"));
      renderPgnBoard();
    });
  }

  function bindOpenings() {
    $("openingFilters").addEventListener("click",function(e){const button=e.target.closest("[data-filter]");if(!button)return;openings.filter=button.getAttribute("data-filter");const buttons=$("openingFilters").querySelectorAll("[data-filter]");for(let i=0;i<buttons.length;i++){buttons[i].classList.toggle("active",buttons[i]===button);buttons[i].setAttribute("aria-pressed",String(buttons[i]===button));}renderOpeningList();});
    $("explorerLoad").addEventListener("click",requestExplorer);
    $("explorerMoves").addEventListener("click",function(e){const button=e.target.closest("[data-uci]");if(button)applyExplorerMove(button.getAttribute("data-uci"));});
    $("openingSearch").addEventListener("input", renderOpeningList);
    $("openingBack").addEventListener("click", closeOpening);
    $("openingVariantSelect").addEventListener("change", function () { selectOpeningVariant(Number(this.value)); });
    $("openingPrev").addEventListener("click", function () { setOpeningStep(openings.step - 1); });
    $("openingNext").addEventListener("click", function () { setOpeningStep(openings.step + 1); });
    $("openingFirst").addEventListener("click", function () { setOpeningStep(0); });
    $("openingLast").addEventListener("click", function () { setOpeningStep(openings.line.moves.length); });
    $("openingTimeline").addEventListener("input", function () { setOpeningStep(Number(this.value)); });
    $("openingArrow").addEventListener("click", toggleArrows);
    $("openingMoves").addEventListener("click", function (e) {
      const button = e.target.closest("[data-ply]");
      if (button) setOpeningStep(Number(button.getAttribute("data-ply")) + 1);
    });
    $("openingAnalyze").addEventListener("click", function () { loadLineToLive(openings.lineText); });
  }

  function createBoards() {
    playBoard = window.FisherBoard.create($("playBoard"), { onMove: onPlayBoardMove });
    liveBoard = window.FisherBoard.create($("liveBoard"), { onMove: onLiveBoardMove });
    pgnBoard = window.FisherBoard.create($("pgnBoard"), {});
    openingBoard = window.FisherBoard.create($("openingBoard"), {});
  }

  // Android file callbacks
  window.Files = {
    onError: function (message) { toast(message || "Не удалось прочитать PGN"); },
    onPgn: function (text, name) { handlePgnText(text, name || "файл"); },
    onSaved: function (ok, msg) { toast(ok ? "PGN сохранён" : (msg || "Не удалось сохранить")); }
  };

  function init() {
    loadSettings();
    Sounds.configure(function(){return App.settings;});Sounds.preload();
    UI.setLanguage(App.settings.lang);UI.observe();
    if(window.AndroidEngine && window.AndroidEngine.setLanguage)window.AndroidEngine.setLanguage(App.settings.lang);
    setDepthButtons(App.settings.depth);
    createBoards();
    renderArrowControls();
    bindChrome();
    bindPlay();
    bindLive();
    bindPgn();
    bindOpenings();
    resetPlaySetup();
    initLive();
    loadData();
    setInterval(tickClock,200);
    document.addEventListener("visibilitychange",tickClock);
    setTimeout(function(){const launch=$("launch");if(launch)launch.remove();},1100);
    Eng.init().then(function (ok) {
      App.engineReady = ok;
      if (!ok) {
        $("liveExplain").textContent = "Движок недоступен. Проверьте сборку.";
        return;
      }
      startLiveAnalysis();

    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
