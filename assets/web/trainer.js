(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CaissaTrainer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (global) {
  "use strict";

  function createClock(duration) {
    let left = duration, started = null;
    function remaining(now) { return Math.max(0, left - (started === null ? 0 : Math.max(0, now - started))); }
    return {remaining:remaining, start:function (now) { if (started === null) started = now; },
      pause:function (now) { left = remaining(now); started = null; },
      penalty:function (ms, now) { left = Math.max(0, remaining(now) - ms); if (started !== null) started = now; }};
  }
  function createDeck(items, random) {
    let pool = [], previous = "";
    random = random || Math.random;
    return {next:function () {
      if (!pool.length) {
        pool = items.slice();
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1)), temp = pool[i]; pool[i] = pool[j]; pool[j] = temp;
        }
        if (pool.length > 1 && pool[pool.length - 1].id === previous) { const tmp = pool[0]; pool[0] = pool[pool.length-1]; pool[pool.length-1] = tmp; }
      }
      const item = pool.pop(); if (item) previous = item.id; return item;
    }};
  }
  function isEquivalent(best, attempt) {
    if (!best || !attempt) return false;
    if (best.type === "mate") return attempt.type === "mate" && best.value > 0 && attempt.value > 0 && attempt.value <= best.value + 1;
    return (attempt.type === "mate" && attempt.value > 0) || (attempt.type === "cp" && best.value - attempt.value <= 35 && attempt.value >= 100);
  }
  function invert(score) { return score ? {type:score.type,value:-score.value} : null; }
  function scoreOf(result) { return result && result.lines && result.lines[0] ? result.lines[0].eval : null; }
  function formatScore(score) { return !score ? "?" : score.type === "mate" ? "#" + score.value : (score.value >= 0 ? "+" : "") + (score.value / 100).toFixed(2); }

  function create(root, deps) {
    const Chess = deps.Chess, Pgn = deps.Pgn, Eng = deps.Eng, Sounds = deps.Sounds;
    let visible = false, generation = 0, data = null, loading = false, deck = null;
    let state = null, puzzle = null, index = 0, side = "w", phase = "idle", session = null;
    let clock = null, ticker = null, scheduled = null, lastMove = null, annotation = null, hintArrow = null, hintSquare = null;
    let history = [], viewIndex = 0, wrongAttempts = 0;
    let preview = null, assisted = false, alternative = false, lineOrigin = null, branchLine = [];
    let moveAudio = Promise.resolve(), mateNotified = false, mateAnimated = false;
    const decks = {};
    const Provider = deps.PuzzleProvider || global.CaissaPuzzleProvider;
    const provider = Provider ? Provider.create({Chess:Chess,Pgn:Pgn,fetch:global.fetch && global.fetch.bind(global),storage:global.localStorage,isOnline:function () { return !global.navigator || global.navigator.onLine !== false; }}) : null;
    const Review = deps.MoveReview || global.MoveReview || (typeof require === "function" ? require("./review.js") : null);
    let feedback = "", explanation = "", analysisText = "", best = {}, translations = {};
    try { best = JSON.parse(global.localStorage.getItem("caissa.trainer.best.v1") || "{}"); } catch (e) {}
    if (!best || typeof best !== "object" || Array.isArray(best)) best={};
    function en() { return deps.I18n && deps.I18n.getLanguage() === "en"; }
    function t(ru, english) { translations[ru] = english; return en() ? english : ru; }
    function translateMessage(message) {
      Object.keys(translations).sort(function (a,b) { return Math.max(b.length,translations[b].length)-Math.max(a.length,translations[a].length); }).forEach(function (ru) {
        const from=en() ? ru : translations[ru], to=en() ? translations[ru] : ru;
        message=message.split(from).join(to);
      });
      return message;
    }
    function node(name) { return root.querySelector('[data-trainer="' + name + '"]'); }
    function text(name, value) { node(name).textContent = value; }
    root.innerHTML = '<div class="trainer-head"><h2 data-trainer="title"></h2><p class="muted" data-trainer="intro"></p></div>' +
      '<div class="trainer-settings" data-trainer="settings"><label><span data-trainer="modeLabel"></span><select class="select" data-trainer="mode"><option value="practice"></option><option value="sprint"></option><option value="survival"></option></select></label>' +
      '<label><span data-trainer="ratingLabel"></span><select class="select" data-trainer="rating"><option value="all">600–2400</option><option value="easy">600–1400</option><option value="medium">1400–1900</option><option value="hard">1900–2400</option></select></label>' +
      '<button class="btn primary" data-trainer="start"></button></div><p class="trainer-summary muted" data-trainer="summary" hidden></p><div data-trainer="content" hidden><p class="trainer-rules muted" data-trainer="rules"></p>' +
      '<div class="trainer-stats" aria-live="off" data-trainer="stats"></div><div class="trainer-position" data-trainer="position"></div>' +
      '<div class="trainer-board" data-trainer="board"></div><div class="trainer-promotion" data-trainer="promotion" hidden></div>' +
      '<div class="trainer-history"><button class="btn" data-trainer="backTen">«</button><button class="btn" data-trainer="back">‹</button><span class="muted" data-trainer="historyStatus"></span><button class="btn" data-trainer="forward">›</button><button class="btn" data-trainer="forwardTen">»</button><button class="btn trainer-current" data-trainer="current" hidden></button></div>' +
      '<div class="trainer-feedback" role="status" aria-live="polite"><strong data-trainer="feedback"></strong><p data-trainer="analysis"></p><p data-trainer="explanation"></p></div>' +
      '<div class="trainer-actions"><button class="btn" data-trainer="retry"></button><button class="btn" data-trainer="hint"></button><button class="btn" data-trainer="solution"></button><button class="btn primary" data-trainer="next"></button><button class="btn" data-trainer="skip"></button><button class="btn" data-trainer="end"></button></div>' +
      '<div class="trainer-result" data-trainer="result" role="status" hidden></div><p class="trainer-source muted" data-trainer="source"></p>' +
      '</div>';
    const board = global.FisherBoard.create(node("board"), {onMove:onBoardMove});
    function stopJobs() {
      generation++; Eng.cancel("trainer"); clearTimeout(scheduled); scheduled = null;
      node("promotion").hidden = true;
    }
    function active() { return !!session && phase !== "ended" && phase !== "idle"; }
    function thinking() { return phase === "thinking" || phase === "promotion"; }
    function clockPause() { if (clock) clock.pause(Date.now()); }
    function clockResume() { if (clock && visible && active() && thinking()) clock.start(Date.now()); }
    function tick() {
      if (clock && active() && clock.remaining(Date.now()) <= 0) { end(t("Время вышло", "Time is up")); return; }
      stats();
    }
    function stats() {
      if (!session) { text("stats", ""); return; }
      let s = t("Решено: ", "Solved: ") + session.score + t(" · Серия: ", " · Streak: ") + session.streak;
      if (session.mode === "survival") s += t(" · Жизни: ", " · Lives: ") + session.lives;
      if (clock) { const seconds = Math.ceil(clock.remaining(Date.now()) / 1000); s += " · " + Math.floor(seconds/60) + ":" + (seconds%60 < 10 ? "0" : "") + seconds%60; }
      s += t(" · Рекорд: ", " · Best: ") + (best[session.mode] || 0); text("stats", s);
    }
    function render() {
      root.setAttribute("data-trainer-active",active() ? "true" : "false");
      const viewing = history.length && viewIndex < history.length - 1;
      node("settings").hidden = active(); node("summary").hidden = !active(); node("content").hidden = !session;
      if (session) text("summary", modeName(session.mode) + " · " + session.rating);
      const marks = !viewing && mateNotified ? mateMarks() : !viewing && annotation ? [annotation] : [];
      if (state) board.render(viewing ? history[viewIndex].state : preview || state, {lastMove:viewing ? history[viewIndex].move : lastMove,interactive:visible && phase === "thinking" && !viewing,selected:viewing ? null : hintSquare,arrow:viewing ? null : hintArrow,showArrow:!!hintArrow,annotations:marks});
      if (!viewing && mateNotified) mateAnimated=true;
      text("historyStatus", history.length ? viewIndex + " / " + (history.length - 1) : "");
      node("back").disabled = node("backTen").disabled = !history.length || viewIndex === 0;
      node("forward").disabled = node("forwardTen").disabled = !viewing;
      node("current").hidden = !viewing;
      text("feedback", feedback); text("explanation", explanation); text("analysis", analysisText);
      node("retry").hidden = phase !== "replyError";
      text("retry",phase === "replyError" ? t("Повторить ответ", "Retry reply") : t("Попробовать ещё", "Try again"));
      node("hint").disabled = !active() || !thinking() || viewing; node("solution").disabled = !active() || !thinking() || viewing;
      node("next").hidden = phase !== "solved" && phase !== "revealed";
      node("skip").disabled = !active() || !thinking() || viewing;
      node("end").disabled = !active();
      text("position", puzzle ? (side === "w" ? t("Ход белых", "White to move") : t("Ход чёрных", "Black to move")) + " · " + puzzle.rating + " · #" + puzzle.id : "");
      stats();
    }
    function modeName(mode) { return mode === "sprint" ? t("Спринт · 3 мин", "Sprint · 3 min") : mode === "survival" ? t("Выживание · 3 жизни", "Survival · 3 lives") : t("Без времени", "Untimed"); }
    function language() {
      feedback=translateMessage(feedback); explanation=translateMessage(explanation); analysisText=translateMessage(analysisText);
      text("title", t("Найдите лучший ход", "Find the best move"));
      text("intro", t("Смешанные задачи из реальных партий. Найдите всю комбинацию.", "Mixed puzzles from real games. Find the whole combination."));
      text("modeLabel", t("Режим", "Mode")); text("ratingLabel", t("Рейтинг задач", "Puzzle rating"));
      const opts = node("mode").options;
      opts[0].textContent = modeName("practice"); opts[1].textContent = t("Спринт 3м", "Sprint 3m"); opts[2].textContent = t("Выживание", "Survival");
      const labels = {start:["Новая серия","New mix"],retry:["Попробовать ещё","Try again"],hint:["Подсказка","Hint"],solution:["Решение","Solution"],next:["Следующая задача","Next puzzle"],skip:["Пропустить","Skip"],end:["Завершить","Finish"],current:["К текущей позиции","Return to current"]};
      Object.keys(labels).forEach(function (key) { text(key,t(labels[key][0],labels[key][1])); });
      [["backTen","Назад на 10 полуходов","Back 10 plies"],["back","Предыдущий ход","Previous move"],["forward","Следующий ход","Next move"],["forwardTen","Вперёд на 10 полуходов","Forward 10 plies"]].forEach(function (item) { node(item[0]).setAttribute("aria-label", t(item[1],item[2])); });
      text("rules", node("mode").value === "practice" ? t("Без таймера. Подсказки и повторные попытки доступны; первые две ошибки не лишают зачёта.","No timer. Hints and retries are available; the first two mistakes still allow credit.") : t("Спринт: 3 минуты, ошибка отнимает 10 секунд. Выживание: 5 минут и 3 жизни. Подсказка, решение и пропуск считаются ошибкой. Таймер идёт только пока вы думаете. Уход с вкладки завершает серию.","Sprint: 3 minutes, mistakes cost 10 seconds. Survival: 5 minutes and 3 lives. Hints, solutions and skips count as mistakes. Only your thinking time is counted. Leaving this tab ends the run."));
      const source = node("source"); source.textContent = (data ? data.length : "") + t(" задач Lichess · CC0 · доступны без сети. "," Lichess puzzles · CC0 · available offline. ") + (puzzle && puzzle.online ? t("Задача из сети. ","Online puzzle. ") : "");
      const link = document.createElement("a"); link.href = puzzle ? puzzle.sourceURL : "https://database.lichess.org/#puzzles"; link.target = "_blank"; link.rel = "noopener"; link.textContent = t("Источник", "Source"); source.appendChild(link);
      if (session && phase==="ended") node("result").textContent=t("Решено без помощи: ","Solved without help: ")+session.score+t(". Нажмите «Новая серия», чтобы продолжить.",". Tap New mix to continue.");
      render();
    }
    function load() {
      if (data || loading) return;
      loading = true; node("start").disabled = true; feedback = t("Загружаем задачи…", "Loading puzzles…"); render();
      fetch("puzzles.json").then(function (response) { if (!response.ok) throw new Error("puzzles"); return response.json(); }).then(function (json) {
        if (!json.puzzles || !json.puzzles.length) throw new Error("puzzles");
        data = json.puzzles.filter(function (p) {
          try {
            let s = Chess.fromFen(p.fen);
            return [p.setup].concat(p.solution).every(function (uci) { const m = legal(s, uci); if (!m) return false; s = Chess.apply(s, m); return true; });
          } catch (e) { return false; }
        });
        if (!data.length) throw new Error("puzzles");
        loading = false; node("start").disabled = false; feedback = t("Выберите режим и начните серию.","Choose a mode and start a mix."); render();
      }).catch(function () { loading = false; node("start").disabled = false; feedback = t("Не удалось загрузить задачи. Нажмите «Новая серия», чтобы повторить.","Could not load puzzles. Tap New mix to retry."); render(); });
    }
    function legal(s, uci) { return Chess.legalMoves(s).filter(function (m) { return Chess.uci(m) === uci; })[0] || null; }
    function settings() { return deps.getSettings ? deps.getSettings() || {} : {}; }
    function showArrow() { return deps.showArrow ? deps.showArrow() === true : settings().showArrow === true; }
    function mateMarks() {
      return [state.turn,state.turn === "w" ? "b" : "w"].map(function (color,i) {
        const square=Chess.sqName(state.board.indexOf(color === "w" ? "K" : "k"));
        return {move:square+square,key:i ? "winner" : "mate",file:i ? "winner.svg" : "mate.svg",color:i ? "#81b64c" : "#ca3431",label:i ? t("Победа","Victory") : t("Мат","Checkmate"),animate:!mateAnimated};
      });
    }
    function playMove(move) {
      const san = Pgn.sanOf(state, Chess.uci(move)); lastMove = Chess.uci(move); state = Chess.apply(state,move);
      history.push({state:state,move:lastMove}); viewIndex = history.length - 1;
      if (Sounds && Sounds.play) moveAudio=Promise.resolve(Sounds.play(Sounds.eventForMove({san:san}))).catch(function () {});
      return san;
    }
    function start() {
      if (active()) return;
      if (!data) { load(); return; }
      stopJobs(); clockPause(); clearInterval(ticker);
      const range = node("rating").value;
      const chosen = data.filter(function (p) { return range === "easy" ? p.rating < 1400 : range === "medium" ? p.rating >= 1400 && p.rating < 1900 : range === "hard" ? p.rating >= 1900 : true; });
      if (!chosen.length) { feedback=t("Нет задач в этом диапазоне.","No puzzles in this range."); render(); return; }
      deck = decks[range] || (decks[range]=createDeck(chosen)); session = {mode:node("mode").value,score:0,streak:0,lives:3,range:range,rating:node("rating").options ? node("rating").options[node("rating").selectedIndex].textContent : range};
      clock = session.mode === "practice" ? null : createClock(session.mode === "sprint" ? 180000 : 300000);
      ticker = setInterval(tick,200); node("result").hidden = true; next();
    }
    function next() {
      if (!session || !visible) return;
      stopJobs(); clockPause(); const gen = generation;
      phase = "loading"; feedback = t("Загружаем задачу…", "Loading puzzle…"); render();
      const request = provider ? provider.next(session.range,data) : Promise.resolve(null);
      request.then(function (online) {
      if (gen !== generation || !visible) return;
      puzzle = online || deck.next(); index = 0; wrongAttempts = 0; assisted = false; alternative = false; branchLine = []; preview = null; annotation = null; hintArrow = null; hintSquare = null;
      mateNotified=false; mateAnimated=false;
      feedback = t("Последний ход соперника…", "Opponent's last move…"); explanation = ""; analysisText = ""; phase = "setup";
      state = Chess.fromFen(puzzle.fen); history = [{state:state,move:null}]; viewIndex = 0; const setup = legal(state,puzzle.setup);
      side = state.turn === "w" ? "b" : "w"; board.setOrientation(side); lastMove = null; render(); language();
      scheduled = setTimeout(function () {
        if (gen !== generation || !visible) return;
        playMove(setup); lineOrigin = state; phase = "thinking"; feedback = t("Найдите лучший ход.","Find the best move."); render(); clockResume();
      },450);
      });
    }
    function mistake(help) {
      if (help) assisted = true; else { wrongAttempts++; if (wrongAttempts >= 3) assisted = true; } session.streak = 0;
      if (session.mode === "sprint") clock.penalty(10000,Date.now());
      if (session.mode === "survival") session.lives--;
      if (session.lives <= 0 || (clock && clock.remaining(Date.now()) <= 0)) { end(t("Серия завершена", "Run finished")); return true; }
      return false;
    }
    function saveBest() {
      if (session.score > (best[session.mode] || 0)) {
        best[session.mode] = session.score;
        try { global.localStorage.setItem("caissa.trainer.best.v1",JSON.stringify(best)); } catch (e) {}
      }
    }
    function end(reason) {
      if (!session) return;
      stopJobs(); clockPause(); clearInterval(ticker); ticker = null; phase = "ended"; preview = null;
      saveBest();
      feedback = reason; const result = node("result"); result.hidden = false;
      result.textContent = t("Решено без помощи: ","Solved without help: ") + session.score + t(". Нажмите «Новая серия», чтобы продолжить.",". Tap New mix to continue."); render();
    }
    function search(s, gen, multipv) {
      if (gen !== generation || !visible || (deps.isReady && !deps.isReady())) return Promise.resolve(null);
      return Eng.search({fen:Chess.toFen(s),multipv:multipv,depth:18,movetime:600,skill:20,elo:0},"trainer");
    }
    function lineSAN(origin, moves) {
      let s = origin; const list = [];
      for (let i=0; i<moves.length && i<10; i++) { const m = legal(s,moves[i]); if (!m) break; list.push(Pgn.sanOf(s,moves[i])); s=Chess.apply(s,m); }
      return list.join(" ");
    }
    function explain(origin, moves) {
      const first = legal(origin,moves[0]); if (!first) return "";
      const target = origin.board[first.to], names = {p:["пешку","pawn"],n:["коня","knight"],b:["слона","bishop"],r:["ладью","rook"],q:["ферзя","queen"],k:["короля","king"]};
      const san = Pgn.sanOf(origin,moves[0]);
      let why = /#/.test(san) ? t("Этот ход ставит мат.","This move is checkmate.") : target !== "." ? t("Ход забирает ","The move captures a ") + t(names[target.toLowerCase()][0],names[target.toLowerCase()][1]) + t(" на "," on ") + Chess.sqName(first.to) + "." : /\+/.test(san) ? t("Шах заставляет соперника защищать короля.","Check forces the opponent to defend the king.") : t("Сравните защиту соперника с точным продолжением.","Compare the opponent's defence with the precise continuation.");
      const themes = {fork:["Двойной удар","Fork"],pin:["Связка","Pin"],skewer:["Сквозной удар","Skewer"],discoveredAttack:["Вскрытое нападение","Discovered attack"],deflection:["Отвлечение","Deflection"],attraction:["Завлечение","Attraction"],sacrifice:["Жертва","Sacrifice"],backRankMate:["Мат по последней горизонтали","Back-rank mate"],hangingPiece:["Незащищённая фигура","Hanging piece"],promotion:["Превращение пешки","Promotion"],endgame:["Эндшпиль","Endgame"]};
      const tags = puzzle.themes.filter(function (key) { return !!themes[key]; }).slice(0,3).map(function (key) { return t(themes[key][0],themes[key][1]); });
      return why + (tags.length ? " " + tags.join(" · ") + "." : "") + " " + t("Линия: ","Line: ") + lineSAN(origin,moves);
    }
    function solved() {
      clockPause(); phase = "solved";
      if (!mateNotified && Pgn.gameStatus(state) === "mate") {
        mateNotified=true;
        if (deps.vibrate && settings().haptics !== false && settings().vibration !== false) deps.vibrate("mate");
        if (Sounds && Sounds.play) moveAudio=moveAudio.then(function () { return Sounds.play("game-end"); }).catch(function () {});
      }
      if (!assisted) { session.score++; session.streak++; saveBest(); }
      feedback = assisted ? t("Комбинация найдена с помощью.","Combination completed with help.") : t("Задача решена!", "Puzzle solved!");
      if (!alternative) explanation = explain(lineOrigin,puzzle.solution);
      render();
    }
    function proceed(gen) {
      preview = null;
      if (Pgn.gameStatus(state) !== "play" || index >= puzzle.solution.length) { solved(); return; }
      phase = "reply"; render();
      const response = alternative ? search(state,gen,1).then(function (r) { if (r && r.lines[0]) branchLine=r.lines[0].pv.slice(1); return r && r.bestmove; }) : Promise.resolve(puzzle.solution[index]);
      response.then(function (uci) {
        if (gen !== generation || !visible) return;
        const move = legal(state,uci);
        if (!move) { replyError(); return; }
        scheduled=setTimeout(function () {
          if (gen !== generation || !visible) return;
          playMove(move); index++;
          if (index >= puzzle.solution.length || Pgn.gameStatus(state) !== "play") { solved(); return; }
          phase="thinking"; feedback=t("Верно. Найдите продолжение.","Correct. Find the continuation."); annotation=null; render(); clockResume();
        },250 + Math.floor(Math.random()*451));
      }).catch(function () { if (gen !== generation || !visible) return; replyError(); });
    }
    function replyError() { phase="replyError"; feedback=t("Движок не прислал ответ соперника. Повторите запрос; таймер остановлен.","The engine did not return the opponent's reply. Retry the request; the clock is paused."); render(); }
    function attempt(move) {
      if (!visible || phase !== "thinking" || viewIndex < history.length - 1) return;
      tick(); if (!active()) return;
      clockPause(); const gen=generation, before=state, uci=Chess.uci(move), after=Chess.apply(before,move);
      const expected=alternative ? branchLine[0] : puzzle.solution[index], canonical=uci===expected, mate=Pgn.gameStatus(after)==="mate";
      phase="evaluating"; feedback=t("Stockfish проверяет ход…","Stockfish is assessing your move…"); preview=after; annotation=null; hintArrow=null; hintSquare=null; render();
      let base=null;
      search(before,gen,3).then(function (r) { base=r; if (gen !== generation || !visible) return null; return search(after,gen,1); }).then(function (result) {
        if (gen !== generation || !visible) return;
        const target=scoreOf(base), actual=invert(scoreOf(result));
        const good=canonical || mate || isEquivalent(target,actual) || !!(base && base.bestmove===uci && target && (target.type==="mate" ? target.value>0 : target.value>=100));
        analysisText=base && (result || mate) ? t("Оценка за вашу сторону: ","Evaluation for your side: ") + (mate ? t("Мат","Checkmate") : formatScore(actual)) : t("Движок недоступен. Ход проверен по исходному решению Lichess.","Engine unavailable. Move checked against the original Lichess solution.");
        const classified = Review && target && scoreOf(result) ? Review.classify({played:uci,bestmove:base.bestmove,before:target,after:scoreOf(result),lines:base.lines}) : null;
        let key = good ? "best" : classified ? classified.key : "mistake";
        if (!good && ["best","great","excellent","brilliant","forced"].indexOf(key) >= 0) key = "good";
        if (key === "missed") key = "blunder";
        const labels = {best:["Лучший ход","Best move"],good:["Хороший, но не лучший","Good, but not best"],inaccuracy:["Неточность","Inaccuracy"],mistake:["Ошибка","Mistake"],blunder:["Грубая ошибка","Blunder"]};
        const label = labels[key] || labels.mistake;
        annotation={move:uci,key:key,file:key+".svg",color:good?"#81b64c":"#e58f2a",label:t(label[0],label[1])};
        if (good) {
          preview=null; playMove(move); index++; if (!canonical) alternative=true;
          if (alternative) branchLine=result && result.lines[0] ? result.lines[0].pv : [];
          explanation="";
          proceed(gen);
        } else {
          if (mistake()) return;
          preview=null; phase="thinking"; feedback=t(label[0],label[1]) + ". " + t("Выберите другой ход.","Choose another move.");
          explanation=assisted ? t("Эта задача уже не идёт в счёт.","This puzzle no longer counts.") : t("Ошибок: ","Mistakes: ")+wrongAttempts+" / 3"; render(); clockResume();
        }
      }).catch(function () {
        if (gen !== generation || !visible) return;
        preview=null; phase="thinking"; feedback=t("Не удалось оценить ход. Попробуйте ещё раз.","Could not assess the move. Try again."); render(); clockResume();
      });
    }
    function retry() { if (phase === "replyError") proceed(generation); }
    function onBoardMove(from,to) {
      if (viewIndex < history.length - 1 || phase !== "thinking") return;
      const moves=Chess.legalMoves(state).filter(function (m) { return m.from===from && m.to===to; });
      if (!moves.length) return;
      if (moves.length===1) { attempt(moves[0]); return; }
      phase="promotion"; const container=node("promotion"); container.textContent=""; container.hidden=false;
      moves.forEach(function (m) { const button=document.createElement("button"); button.className="btn"; button.textContent=m.promo.toUpperCase(); button.setAttribute("aria-label",t("Превратить в ","Promote to ")+m.promo.toUpperCase()); button.onclick=function () { container.hidden=true; phase="thinking"; attempt(m); }; container.appendChild(button); }); render();
    }
    function hint() {
      if (!active() || !thinking() || viewIndex < history.length - 1) return;
      if (mistake(true)) return;
      node("promotion").hidden=true; phase="thinking"; preview=null;
      const uci=alternative ? branchLine[0] : puzzle.solution[index];
      if (!uci || !legal(state,uci)) { feedback=t("Подсказка недоступна. Сделайте ход для проверки движком.","Hint unavailable. Make a move for engine assessment."); render(); return; }
      feedback=t("Начните фигурой с поля ","Start with the piece on ")+uci.slice(0,2)+".";
      // Only the origin is highlighted; the solution button reveals the full line.
      hintArrow=null; hintSquare=legal(state,uci).from; render();
    }
    function reveal() {
      if (!active() || !thinking() || viewIndex < history.length - 1) return;
      if (mistake(true)) return;
      stopJobs(); clockPause(); preview=null; phase="revealed"; annotation=null;
      hintArrow=showArrow() ? (alternative ? branchLine[0] : puzzle.solution[index]) : null; explanation=explain(state,alternative ? branchLine : puzzle.solution.slice(index));
      feedback=t("Решение открыто. Эта задача не идёт в счёт.","Solution revealed. This puzzle does not count."); analysisText=""; render();
    }
    node("start").onclick=start; node("next").onclick=next; node("retry").onclick=retry;
    node("hint").onclick=hint; node("solution").onclick=reveal; node("skip").onclick=function () { if (!active() || node("skip").disabled) return; if (!mistake(true)) next(); };
    node("end").onclick=function () { end(t("Серия завершена", "Run finished")); };
    node("mode").onchange=language;
    function navigate(delta) { if (!history.length || phase === "setup" || phase === "loading" || phase === "promotion") return; viewIndex=Math.max(0,Math.min(history.length-1,viewIndex+delta)); render(); }
    node("backTen").onclick=function () { navigate(-10); }; node("back").onclick=function () { navigate(-1); };
    node("forwardTen").onclick=function () { navigate(10); }; node("forward").onclick=function () { navigate(1); };
    node("current").onclick=function () { viewIndex=history.length-1; render(); };
    language();
    return {show:function () { visible=true; load(); render(); }, hide:function () {
      if (active()) end(t("Серия завершена при выходе из тренировки.","The run ended when you left training."));
      visible=false; stopJobs(); clearInterval(ticker); ticker=null; render();
    },refreshAppearance:function () { render(); },refreshLanguage:language};
  }
  return {create:create,createClock:createClock,createDeck:createDeck,isEquivalent:isEquivalent};
});
