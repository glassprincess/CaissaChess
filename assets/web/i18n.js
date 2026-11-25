(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CaissaI18n = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  let language = "ru", observer = null, validityHooked = false;
  const originals = new WeakMap();
  const attributes = ["aria-label", "aria-description", "title", "placeholder", "alt"];
  const catalogue = Object.create(null);
  const entries = `Настройки|Settings
Новая партия|New game
Игра против Stockfish|Play against Stockfish
Ваш цвет|Your color
Белые|White
Чёрные|Black
белые|white
чёрные|black
Случайно|Random
Рейтинг бота · Elo|Bot rating · Elo
Условная сила бота. 3500 и 4000 — полная сила с разным временем расчёта.|Approximate bot strength. 3500 and 4000 use full strength with different thinking times.
Контроль времени|Time control
Без часов|Untimed
1 минута|1 minute
3 минуты|3 minutes
5 минут|5 minutes
10 минут|10 minutes
Начать|Start
Вы|You
Просмотр партии без отмены ходов|Browse the game without taking back moves
Первая позиция|First position
Посмотреть предыдущий ход|View previous move
Посмотреть следующий ход|View next move
Текущая позиция|Current position
Последняя позиция|Last position
Вернуться к игре|Return to game
Повторить ход движка|Retry engine move
Это отменяет ходы, в отличие от стрелок просмотра|Takes back moves; the navigation arrows only browse the game
Отменить мой ход|Take back my move
Подсказка|Hint
Перевернуть|Flip board
Сдаться|Resign
Сдаться?|Resign?
Вы уверены, что хотите сдаться?|Are you sure you want to resign?
Продолжить игру|Continue game
Да, сдаться|Yes, resign
Разобрать партию|Review game
Живая доска|Analysis board
Ходы живого анализа|Analysis moves
Считаю…|Analyzing…
Считаю|Analyzing
Сброс|Reset
Стрелка|Arrow
Стрелки: вкл|Arrows: on
Стрелки: выкл|Arrows: off
Разобрать целиком|Review entire game
Сохранить PGN|Save PGN
Разбор PGN|PGN review
Файл .pgn или вставленный текст. Несколько партий в одном файле поддерживаются.|Choose a .pgn file or paste PGN text. Multiple games in one file are supported.
Выбрать .pgn|Choose .pgn file
Вставить PGN|Paste PGN
Разобрать текст|Review text
Быстро|Quick
Глубоко|Deep
Разбор партии|Game review
Отмена|Cancel
Другой PGN|Another PGN
Проверить глубже|Analyze deeper
Категории ходов выбранной стороны|Move categories for the selected side
Обе стороны|Both sides
Навигация по партии|Game navigation
Начальная позиция|Starting position
Предыдущий ход|Previous move
Следующий ход|Next move
Последний ход|Last move
Тип дебюта|Opening type
Все|All
Атаки|Attacks
Контры|Counterattacks
Гамбиты|Gambits
Поиск дебюта|Search openings
‹ Все дебюты|‹ All openings
Вариант|Variation
Навигация по дебюту|Opening navigation
В начало линии|Start of line
В конец линии|End of line
Позиция в линии|Position in line
Ходы выбранного варианта|Moves in the selected variation
Необязательная база Lichess онлайн|Optional online Lichess database
Продолжения Lichess|Lichess continuations
Продолжение Lichess|Lichess continuation
Запросить эту позицию|Look up this position
База мастеров — по запросу. Встроенные дебюты доступны без интернета.|Master games on request. Built-in openings are available offline.
Идея|Idea
Планы за белых|Plans for White
Планы за чёрных|Plans for Black
Типичные ошибки|Common mistakes
Варианты|Variations
Разобрать на доске|Analyze on board
Играть|Play
Анализ|Analysis
Дебюты|Openings
Диалог|Dialog
Язык|Language
Русский|Русский
Отчёт|Report
Отменить премув|Cancel premove
Подтвердите сдачу|Confirm resignation
Последние 10 секунд|Last 10 seconds
Прежний отчёт|Previous report
Разбор ещё идёт|Analysis is still running
Пока разбираю партию|Analyzing the game
Блестящий ход|Brilliant move
Великолепный ход|Great move
Лучший ход|Best move
Прекрасный ход|Excellent move
Хороший ход|Good move
Книжный ход|Book move
Неточность|Inaccuracy
Ошибка|Mistake
Упущенный шанс|Missed chance
Зевок|Blunder
Единственный ход|Only move
Мат|Checkmate
Пат|Stalemate
Ничья|Draw
Победа|Victory
Ферзь|Queen
Ладья|Rook
Слон|Bishop
Конь|Knight
Превращение|Promotion
Ходов пока нет|No moves yet
Глубина разбора по умолчанию|Default analysis depth
Быстро (14)|Quick (14)
Глубоко (18)|Deep (18)
Рейтинг бота по умолчанию · Elo|Default bot rating · Elo
Звук ходов|Move sounds
Громкость ходов|Move volume
Стрелки в анализе и дебютах|Arrows in analysis and openings
Сохранить|Save
О приложении|About
Исходный код|Source code
Лицензии|Licenses
Лицензии и авторы|Licenses and authors
Закрыть|Close
Не удалось открыть лицензии|Could not open licenses
Настройки сохранены|Settings saved
Просмотр позиции. Ходы партии сохранены.|Browsing a position. Your game moves are saved.
Stockfish думает…|Stockfish is thinking…
Ваш ход|Your move
Движок не ответил. Повторите ход.|Engine did not respond. Retry the move.
Ожидание движка…|Waiting for engine…
Время вышло|Time expired
Время вышло · у соперника один король|Time expired · opponent has only a king
Вы победили|You won
Вы проиграли|You lost
Разбираю ваши ходы…|Analyzing your moves…
К доске|Back to board
Ваша точность|Your accuracy
Примерный Elo партии|Estimated game Elo
Для оценки Elo нужно хотя бы 6 разобранных ходов.|At least 6 analyzed moves are needed to estimate Elo.
Оценка одной партии, не рейтинг игрока.|An estimate for this game, not a player rating.
Ваши ходы|Your moves
Вы сдались|You resigned
Сначала сделайте хотя бы один ход|Make at least one move first
Начальная позиция. Ходите за обе стороны.|Starting position. Play both sides.
Нужен FEN из 4–6 полей|FEN must contain 4–6 fields
Неверный FEN|Invalid FEN
В FEN нет королей|FEN has no kings
Позиция из FEN|Position from FEN
Вставьте FEN. Ход, рокировки и взятие на проходе сохраняются.|Paste FEN. Side to move, castling rights and en passant are preserved.
Загрузить|Load
Не удалось разобрать линию|Could not parse the line
Нет ходов для разбора|No moves to analyze
Глубоко · до 18|Deep · up to 18
Быстро · 14, сложные до 18|Quick · 14, complex positions up to 18
Разбор отменён|Analysis cancelled
Разбор|Analysis
Разбор недоступен. Повторите его из партии.|Analysis unavailable. Try again from the game.
Движок не вернул оценку позиции|Engine returned no position evaluation
Ключевых ходов не нашлось|No key moves found
Ничего не найдено|Nothing found
В этой базе продолжений нет. Можно продолжить на доске анализа.|No continuations in this database. You can continue on the analysis board.
движок не ответил|engine did not respond
Повторите импорт партии.|Import the game again.
Быстрая проверка: сложные позиции уточняются отдельно. Метки могут измениться после глубокого разбора.|Quick review: complex positions are checked separately. Move categories may change after deeper analysis.
Глубокая проверка: одинаковый режим MultiPV для всех некнижных позиций.|Deep review: the same MultiPV settings for every position outside the opening book.
PGN не найден.|No PGN found.
Основная линия|Main line
Не удалось открыть вариант|Could not open the variation
Оценка недоступна. Переключите ход для повторного расчёта.|Evaluation unavailable. Change moves to try again.
Расчёт позиции…|Evaluating position…
Шагайте по ходам: под доской будет пояснение каждого хода.|Step through the moves to see an explanation below the board.
База мастеров Lichess. Интернет используется только по кнопке; полученные позиции сохраняются для офлайн-просмотра.|Lichess master database. Internet access is used only on request; retrieved positions are saved for offline viewing.
Загружаю продолжения Lichess…|Loading Lichess continuations…
Сохранённые данные; сеть недоступна.|Saved data; network unavailable.
Сохранённая позиция.|Saved position.
База мастеров Lichess.|Lichess master database.
Числа показывают результаты партий, а не оценку движка.|Numbers show game results, not engine evaluations.
Нет связи с Lichess.|Cannot connect to Lichess.
Не загрузились данные дебютов|Could not load opening data
Не удалось прочитать PGN|Could not read PGN
PGN сохранён|PGN saved
Не удалось сохранить|Could not save
Движок недоступен. Проверьте сборку.|Engine unavailable. Check the installation.
Движок не ответил|Engine did not respond
Ошибка движка|Engine error
Недостаточно материала для мата|Insufficient material for checkmate
75 ходов без взятий и ходов пешками|75 moves without a capture or pawn move
Пятикратное повторение позиции|Fivefold repetition
Пустой PGN|Empty PGN
Пат. Ничья.|Stalemate. Draw.
Шах.|Check.
Запрос отменён.|Request cancelled.
Lichess вернул некорректный ответ.|Lichess returned an invalid response.
Нет сети. Встроенная база дебютов доступна офлайн.|No network. Built-in openings are available offline.
Лимит Lichess: подождите не менее минуты.|Lichess rate limit: wait at least a minute.
Lichess не ответил за 12 секунд.|Lichess did not respond within 12 seconds.
Не удалось связаться с Lichess. Встроенная база работает офлайн.|Could not connect to Lichess. The built-in database works offline.
Неверный FEN: число полей|Invalid FEN: field count
Неверный FEN: поля позиции|Invalid FEN: position fields
Неверный FEN: нужно 8 рядов|Invalid FEN: 8 ranks required
Неверный FEN: фигура или ширина ряда|Invalid FEN: piece or rank width
Неверный FEN: в ряду должно быть 8 клеток|Invalid FEN: each rank must contain 8 squares
Неверный FEN: нужен один король каждого цвета|Invalid FEN: exactly one king of each color required
Неверный FEN: пешка на крайней горизонтали|Invalid FEN: pawn on the first or eighth rank
Неверный FEN: король стороны, сделавшей ход, под шахом|Invalid FEN: the side that just moved is in check
Неверный FEN: взятие на проходе|Invalid FEN: en passant
Неверный FEN: права на рокировку|Invalid FEN: castling rights
Тема|Theme
Фигуры|Pieces
Классика|Classic
Предпросмотр фигур|Piece preview
Тренажёр|Training
На 5 ходов назад|Back 5 moves
На 5 ходов вперёд|Forward 5 moves
Маты|Checkmates
Премувы|Premoves
Матовые схемы|Checkmate patterns
Проверять обновления|Check for updates automatically
Проверить обновления|Check for updates
Проверяю…|Checking…
Обновить Caissa?|Update Caissa?
Доступна новая версия|A new version is available
Полный список изменений|Full release notes
Больше не спрашивать|Do not ask again
Проверку можно включить снова в настройках.|You can enable update checks again in Settings.
Установлена последняя версия|You are using the latest version
Нет подключения к интернету|No internet connection
Не удалось проверить обновления. Попробуйте позже.|Could not check for updates. Try again later.
Да|Yes`;
  entries.split("\n").forEach(function (line) {
    const pair = line.split("|"); catalogue[pair[0]] = pair[1];
  });

  function english(text) {
    if (Object.prototype.hasOwnProperty.call(catalogue, text)) return catalogue[text];
    let match;
    if ((match = /^Мат\. Победа (белых|чёрных)\.$/.exec(text))) return "Checkmate. " + (match[1] === "белых" ? "White" : "Black") + " wins.";
    if ((match = /^Ничья\. (.*)\.$/.exec(text))) return "Draw. " + english(match[1]) + ".";
    if ((match = /^Потеря (\d+)% шансов\.(?: Лучше было (.*))?$/.exec(text))) return "Lost " + match[1] + "% winning chances." + (match[2] ? " Better was " + match[2] : "");
    if ((match = /^(Примерно равная игра|Белые сыграли точнее|Чёрные сыграли точнее): ([\d.]+)% против ([\d.]+)%\.$/.exec(text))) return ({"Примерно равная игра":"Roughly equal play", "Белые сыграли точнее":"White played more accurately", "Чёрные сыграли точнее":"Black played more accurately"})[match[1]] + ": " + match[2] + "% vs " + match[3] + "%.";
    if ((match = /^Точность: белые (.*?) · чёрные ([^·]+)(.*)$/.exec(text))) return "Accuracy: White " + match[1] + " · Black " + match[2].trim() + english(match[3]);
    if ((match = /^Партия (\d+): неверный FEN$/.exec(text))) return "Game " + match[1] + ": invalid FEN";
    if ((match = /^Партия (\d+), ход (\d+): не удалось разобрать «(.*)»$/.exec(text))) return "Game " + match[1] + ", move " + match[2] + ": could not parse “" + match[3] + "”";
    if ((match = /^(Позиция|Уточнение|ход) (\d+) из (\d+)$/.exec(text))) return ({"Позиция":"Position", "Уточнение":"Refinement", "ход":"move"})[match[1]] + " " + match[2] + " of " + match[3];
    if ((match = /^(Разбор|Глубина)[: ]+(\d+%?)$/.exec(text))) return (match[1] === "Разбор" ? "Review: " : "Depth ") + match[2];
    if ((match = /^(Премув|Лучший ход|Подсказка|Загружено|Оценка): (.*)$/.exec(text))) return ({"Премув":"Premove", "Лучший ход":"Best move", "Подсказка":"Hint", "Загружено":"Loaded", "Оценка":"Evaluation"})[match[1]] + ": " + match[2].replace(/ · за белых$/, " · for White");
    if ((match = /^Движок: (.*)$/.exec(text))) return "Engine: " + english(match[1]);
    if ((match = /^Разбор прерван: (.*)\. Повторите импорт партии\.$/.exec(text))) return "Analysis interrupted: " + english(match[1]) + ". Import the game again.";
    if ((match = /^Lichess временно недоступен \(HTTP (\d+)\)\.$/.exec(text))) return "Lichess temporarily unavailable (HTTP " + match[1] + ").";
    if ((match = /^Белые (\d+), ничьи (\d+), чёрные (\d+)$/.exec(text))) return "White " + match[1] + ", draws " + match[2] + ", Black " + match[3];
    if ((match = /^(\d+) (полуходов|ходов|партий)$/.exec(text))) return match[1] + " " + ({"полуходов":"plies", "ходов":"moves", "партий":"games"})[match[2]];
    if ((match = /^(\d+) (Блестящий ход|Великолепный ход|Лучший ход|Прекрасный ход|Хороший ход|Книжный ход|Неточность|Ошибка|Упущенный шанс|Зевок|Единственный ход)$/.exec(text))) {
      let label = catalogue[match[2]];
      if (Number(match[1]) !== 1) label = label === "Inaccuracy" ? "Inaccuracies" : label + "s";
      return match[1] + " " + label;
    }
    if ((match = /^([\d.]+) с$/.exec(text))) return match[1] + " s";
    if (/Точность: белые (.*?) · чёрные ([^·]+)/.test(text)) return english(text.replace(/Точность: белые (.*?) · чёрные ([^·]+)/, function (_, white, black) { return "Accuracy: White " + white + " · Black " + black; }));
    if (text.indexOf(" · ") >= 0) return text.split(" · ").map(english).join(" · ");
    const prefixes = ["Сохранённые данные; сеть недоступна.", "Сохранённая позиция.", "База мастеров Lichess.", "Шагайте по ходам: под доской будет пояснение каждого хода."];
    for (let i = 0; i < prefixes.length; i++) {
      if (text.indexOf(prefixes[i] + " ") === 0) return catalogue[prefixes[i]] + " " + english(text.slice(prefixes[i].length + 1));
    }
    const suffix = "Числа показывают результаты партий, а не оценку движка.";
    if (text.endsWith(suffix)) return text.slice(0, -suffix.length) + catalogue[suffix];
    return text;
  }

  function t(text) {
    if (typeof text !== "string" || language !== "en") return text;
    const trimmed = text.trim();
    if (!trimmed) return text;
    const prefixes = {"Премув:":"Premove:", "Разбор:":"Review:"};
    const translated = prefixes[trimmed] || english(trimmed);
    return text.slice(0, text.indexOf(trimmed)) + translated + text.slice(text.indexOf(trimmed) + trimmed.length);
  }

  function translateValue(node, key, current, write) {
    let values = originals.get(node);
    if (!values) { values = Object.create(null); originals.set(node, values); }
    let value = values[key];
    if (!value || current !== value.rendered) value = values[key] = {source:current, rendered:current};
    const translated = t(value.source);
    if (current !== translated) write(translated);
    value.rendered = translated;
  }

  function skipped(node) {
    const parent = node.nodeType === 1 ? node : node.parentElement;
    return parent && parent.closest("script,style,code,pre,[data-i18n-skip],.who,#pgnRunTitle,#pgnResultTitle");
  }

  function visit(node) {
    if (!node || skipped(node)) return;
    if (node.nodeType === 3) {
      translateValue(node, "text", node.nodeValue, function (value) { node.nodeValue = value; });
      return;
    }
    if (node.nodeType === 1) attributes.forEach(function (name) {
      if (node.hasAttribute(name)) translateValue(node, name, node.getAttribute(name), function (value) { node.setAttribute(name, value); });
    });
    if (node.nodeType === 1 && node.tagName === "TEXTAREA") return;
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
  }

  function translateDOM(target) {
    if (!root.document) return;
    visit(target || root.document.body);
  }

  function hookValidity() {
    if (validityHooked) return;
    validityHooked = true;
    [root.HTMLInputElement, root.HTMLTextAreaElement, root.HTMLSelectElement].forEach(function (type) {
      if (!type || !type.prototype.setCustomValidity) return;
      const native = type.prototype.setCustomValidity;
      type.prototype.setCustomValidity = function (message) {
        const node = this;
        translateValue(node, "validity", String(message), function (value) { native.call(node, value); });
        native.call(node, t(message));
      };
    });
  }

  function observe() {
    if (!root.document || !root.document.body || !root.MutationObserver || observer) return;
    hookValidity();
    const config = {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:attributes};
    observer = new root.MutationObserver(function (records) {
      observer.disconnect();
      records.forEach(function (record) {
        if (record.type === "childList") {
          for (let i = 0; i < record.addedNodes.length; i++) visit(record.addedNodes[i]);
        } else visit(record.target);
      });
      observer.observe(root.document.body, config);
    });
    observer.observe(root.document.body, config);
    translateDOM();
  }

  function setLanguage(value) {
    language = value === "en" ? "en" : "ru";
    if (root.document) {
      root.document.documentElement.lang = language;
      translateDOM();
      const fields = root.document.querySelectorAll("input,textarea,select");
      for (let i = 0; i < fields.length; i++) {
        const saved = originals.get(fields[i]);
        if (saved && saved.validity) fields[i].setCustomValidity(saved.validity.source);
      }
    }
    return language;
  }

  return {setLanguage:setLanguage, getLanguage:function () { return language; }, t:t, translateDOM:translateDOM, observe:observe};
});
