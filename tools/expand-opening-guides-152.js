"use strict";
// Names and PGNs: lichess-org/chess-openings (CC0); teaching text is original.
// node tools/expand-opening-guides-152.js [directory containing a.tsv ... e.tsv]
const fs = require("fs"), path = require("path");
const Pgn = require("../assets/web/pgn.js");
const Lessons = require("../assets/web/opening-lessons.js");
const source = process.argv[2] || path.join(__dirname, "../work/opening-source");
const rows = ["a", "b", "c", "d", "e"].reduce(function (all, file) {
  return all.concat(fs.readFileSync(path.join(source, file + ".tsv"), "utf8").trim().split(/\r?\n/).slice(1).map(function (line) {
    const fields = line.split("\t"); return {eco: fields[0], name: fields[1], line: fields[2]};
  }));
}, []);
// id, Russian name, source name fragment, defining ply, idea RU/EN, plans RU/EN, caution RU/EN.
const families = [
  ["grob", "Дебют Гроба", "Grob Opening", 0,
    "Ход g4 готовит Bg2, но оставляет пешку g4 без защиты и ослабляет королевский фланг.", "The move g4 prepares Bg2, but leaves g4 undefended and weakens the kingside.",
    "Белым нужно рассчитать ...Bxg4 до развития слона на g2.", "White should calculate ...Bxg4 before developing the bishop to g2.",
    "Чёрным полезно занять центр ходом ...d5 и проверить безопасность пешки b7.", "Black can occupy the center with ...d5 and check the safety of b7.",
    "Ловушки на b7 не доказывают корректность жертвы пешки g4.", "Traps against b7 do not establish compensation for the g4-pawn."],
  ["fried-liver", "Атака Фегателло (жареная печень)", "Italian Game: Two Knights Defense, Fried Liver Attack", 10,
    "Nxf7 жертвует коня на вилку: после ...Kxf7 и Qf3+ король чёрных вынужден защищать коня d5.", "Nxf7 sacrifices a knight on a fork square: after ...Kxf7 and Qf3+, Black's king must help defend the d5-knight.",
    "Белым важно развить Nc3 с давлением на d5, пока король чёрных остаётся в центре.", "White should develop Nc3 against d5 while Black's king remains in the center.",
    "Чёрным нужно считать шахи и нападения на d5 до попытки удержать материал.", "Black must calculate checks and attacks on d5 before trying to keep the extra material.",
    "Вместо 5...Nxd5 существует 5...Na5; жертва Nxf7 не является обязательным продолжением защиты двух коней.", "Black can choose 5...Na5 instead of 5...Nxd5; Nxf7 is not forced in the Two Knights Defense."],
  ["halloween", "Гамбит Хэллоуин", "Four Knights Game: Halloween Gambit", 6,
    "Nxe5 отдаёт коня за пешку, чтобы после ...Nxe5 и d4 гонять чёрных коней пешками.", "Nxe5 gives a knight for a pawn so that ...Nxe5 and d4 allow White to chase Black's knights with pawns.",
    "Белым нужно использовать темпы d4 и e5 для развития, а не только двигать пешки.", "White should use the tempi from d4 and e5 to develop rather than only push pawns.",
    "Чёрным стоит искать устойчивые поля коням и своевременный подрыв ...d5.", "Black should find safe knight squares and a timely ...d5 break.",
    "Выигранные темпы не равны выигранной фигуре: гамбит требует конкретного расчёта.", "Gaining tempi does not replace the sacrificed piece; the gambit needs concrete calculation."],
  ["traxler", "Контратака Тракслера", "Italian Game: Two Knights Defense, Traxler", 7,
    "Вместо защиты f7 чёрные играют ...Bc5 и готовят жертву слона на f2 с шахом.", "Instead of defending f7, Black play ...Bc5 and prepare a bishop sacrifice on f2 with check.",
    "Белым нужно сравнить Bxf7+ и Nxf7, учитывая ответ ...Bxf2+.", "White should compare Bxf7+ and Nxf7, taking ...Bxf2+ into account.",
    "Чёрным важно продолжать атаку с темпом: потеря ферзя или ладьи без шахов опасна.", "Black need forcing play: losing a queen or rook without checks is dangerous.",
    "Взятие слона королём на f2 открывает дополнительные шахи; отказы от жертвы тоже нужно считать.", "Capturing the bishop with Kxf2 allows further checks; declining the sacrifice must also be calculated."],
  ["stafford", "Гамбит Стаффорда", "Petrov's Defense: Stafford", 5,
    "После ...Nc6 чёрные предлагают пешку e5 ради быстрого развития; ...dxc6 открывает диагонали слонам.", "With ...Nc6 Black offer the e5-pawn for development; ...dxc6 opens bishop diagonals.",
    "Белым полезно защитить e4 и завершить развитие, внимательно проверяя угрозы на f2.", "White should defend e4 and finish development while checking threats against f2.",
    "Чёрным нужно развивать слонов с угрозами, пока белые не закончили рокировку.", "Black need active bishop development before White finish castling.",
    "Ловушки на неосторожные ходы не делают гамбит форсированным выигрышем.", "Traps against careless moves do not make the gambit a forced win."],
  ["evans", "Гамбит Эванса", "Italian Game: Evans Gambit", 6,
    "Ход b4 отвлекает слона c5: после ...Bxb4 ход c3 выигрывает темп для подготовки d4.", "The move b4 deflects the c5-bishop: after ...Bxb4, c3 gains a tempo to prepare d4.",
    "Белым нужно быстро рокировать и вскрывать центр, пока слон чёрных теряет темпы.", "White should castle quickly and open the center while Black's bishop spends tempi moving.",
    "Чёрным важно закончить развитие, при необходимости вернув пешку.", "Black should finish development, returning the pawn if necessary.",
    "Пешка b4 не вынуждает ...Bxb4: после ...Bb6 структура и планы меняются.", "The b4-pawn does not force ...Bxb4; ...Bb6 changes the structure and plans."],
  ["smith-morra", "Гамбит Смита — Морра", "Sicilian Defense: Smith-Morra Gambit", 4,
    "Ход c3 предлагает вторую центральную пешку: после ...dxc3 и Nxc3 белые развиваются с открытыми линиями c и d.", "The move c3 offers another central pawn: after ...dxc3 and Nxc3, White develop with open c- and d-files.",
    "Белым полезны Bc4, Nf3 и рокировка, затем давление на d6.", "White can use Bc4, Nf3 and castling, followed by pressure against d6.",
    "Чёрным нужно выбирать расстановку ...e6 и ...d6 либо фианкетто, не оставляя короля в центре.", "Black should choose an ...e6/...d6 setup or a fianchetto without leaving the king in the center.",
    "После отказа от ...dxc3 нельзя автоматически применять планы принятого гамбита.", "If Black decline ...dxc3, the plans of the accepted gambit do not automatically apply."],
  ["sicilian-wing", "Фланговый гамбит в сицилианской", "Sicilian Defense: Wing Gambit", 2,
    "Ход b4 отвлекает пешку c5 от центра, предлагая материал ради d4 и открытых линий.", "The move b4 draws the c5-pawn away from the center, offering material for d4 and open lines.",
    "Белым нужно сравнить немедленное d4 с a3, которое снова атакует пешку b4.", "White should compare immediate d4 with a3, attacking the b4-pawn again.",
    "Чёрным важно проверить центральный ответ ...d5 до попытки удержать все пешки.", "Black should examine the central ...d5 break before trying to keep every pawn.",
    "После a3 взятие ...bxa3 не обязательно; ответ в центре может быть сильнее погони за пешками.", "After a3, ...bxa3 is optional; central action may matter more than collecting pawns."],
  ["albin", "Контргамбит Альбина", "Queen's Gambit Declined: Albin Countergambit", 3,
    "После ...e5 и dxe5 ход ...d4 создаёт продвинутую пешку, которая мешает обычному развитию белых.", "After ...e5 and dxe5, ...d4 establishes an advanced pawn that disrupts White's usual development.",
    "Белым нужно развивать Nf3 и выбирать момент атаки на пешку d4.", "White should develop Nf3 and choose when to attack the d4-pawn.",
    "Чёрным полезно поддержать d4 развитием ...Nc6 и активной игрой фигур.", "Black can support d4 with ...Nc6 and active piece play.",
    "Раннее e3 требует проверки ...Bb4+ и ...dxe3: это основа ловушки Ласкера.", "An early e3 requires checking ...Bb4+ and ...dxe3, the basis of the Lasker Trap."],
  ["chigorin", "Защита Чигорина", "Queen's Gambit Declined: Chigorin Defense", 3,
    "Ход ...Nc6 развивает фигуру и усиливает давление на d4, но временно закрывает пешке c путь на c5.", "The move ...Nc6 develops a piece and increases pressure on d4, but temporarily blocks the c-pawn's advance to c5.",
    "Белым стоит использовать пешечный центр и оценить размен слона на коня c6.", "White should use their pawn center and assess exchanging a bishop for the c6-knight.",
    "Чёрным нужна активная игра фигур против центра, особенно после ...Bg4.", "Black need active piece play against the center, especially after ...Bg4.",
    "Автоматическая расстановка как в обычном ферзевом гамбите упускает тактику на d4.", "An automatic Queen's Gambit setup can overlook tactics against d4."],
  ["colle", "Система Колле", "Queen's Pawn Game: Colle System", 4,
    "Белые строят центр d4–e3 и готовят e4 при поддержке Bd3, Nf3 и Nbd2.", "White build a d4-e3 center and prepare e4 with Bd3, Nf3 and Nbd2.",
    "Белым нужно подготовить e4 фигурами; в расстановке с b3 слон c1 выходит на b2.", "White should prepare e4 with pieces; in the b3 setup the c1-bishop develops to b2.",
    "Чёрным полезно своевременно сыграть ...c5 или вывести слона c8 до ...e6.", "Black can play a timely ...c5 or develop the c8-bishop before ...e6.",
    "Атака на h7 требует расчёта: наличие слона d3 само по себе не оправдывает Bxh7+.", "An attack on h7 needs calculation; a bishop on d3 alone does not justify Bxh7+."],
  ["englund", "Гамбит Энглунда", "Englund Gambit", 1,
    "Ход ...e5 предлагает пешку против d4; после dxe5 чёрные ищут темпы ходами ...Nc6 и ферзём.", "The move ...e5 offers a pawn against d4; after dxe5, Black seek tempi with ...Nc6 and queen moves.",
    "Белым стоит развиваться и следить за шахами по диагонали a5–e1.", "White should develop while watching checks along the a5-e1 diagonal.",
    "Чёрным нужно считать угрозы ферзём и не забывать о развитии королевского фланга.", "Black must calculate queen threats without neglecting kingside development.",
    "Ранняя атака ферзём может выиграть темп, но также позволяет белым развиваться с нападением.", "An early queen attack may gain a tempo but also lets White develop while attacking the queen."],
  ["elephant", "Слоновый гамбит", "Elephant Gambit", 3,
    "Ход ...d5 немедленно оспаривает центр после Nf3, допуская взятия на d5 или e5.", "The move ...d5 challenges the center immediately after Nf3, allowing captures on d5 or e5.",
    "Белым нужно сравнить exd5 и Nxe5 и проверить продвижение ...e4 с нападением на коня.", "White should compare exd5 and Nxe5, checking ...e4 attacks against the knight.",
    "Чёрным важно использовать центральные темпы для развития, а не только двигать пешки.", "Black should turn central tempi into development rather than only push pawns.",
    "После размена центральных пешек открытая линия e опасна для обоих королей.", "After central pawn exchanges, the open e-file can endanger either king."],
  ["st-george", "Защита Святого Георгия", "St. George Defense", 1,
    "Ход ...a6 готовит ...b5 и ...Bb7, но даёт белым время занять центр.", "The move ...a6 prepares ...b5 and ...Bb7, but gives White time to occupy the center.",
    "Белым полезно занять d4 и e4, затем закончить развитие перед вскрытием игры.", "White can occupy d4 and e4, then finish development before opening the position.",
    "Чёрным нужно связать игру ...Bb7 с подрывом ...c5 или ...d5.", "Black should combine ...Bb7 with a ...c5 or ...d5 break.",
    "Фланговые пешечные ходы без ответа в центре позволяют белым наращивать пространство.", "Flank pawn moves without central action let White gain space."],
  ["van-geet", "Дебют Ван Гета", "Van Geet Opening", 0,
    "Ход Nc3 развивает коня и контролирует d5 и e4, оставляя выбор центральных пешек на потом.", "The move Nc3 develops a knight and controls d5 and e4, postponing the central pawn setup.",
    "Белым нужно выбрать e4 или d4 с учётом ответа чёрных и блокады пешки c.", "White should choose e4 or d4 according to Black's reply and the blocked c-pawn.",
    "Чёрным полезно занять центр ходом ...d5 или ...e5 и проверить переходы в знакомые дебюты.", "Black can occupy the center with ...d5 or ...e5 and watch for familiar transpositions.",
    "Ход Nc3 сам по себе не задаёт один план: после разных ответов возникают разные структуры.", "Nc3 alone does not define one plan; different replies lead to different structures."],
  ["rat", "Защита Рат", "Rat Defense", 1,
    "Раннее ...d6 сохраняет гибкий пешечный центр и допускает ...e5 без немедленного развития коня g8.", "An early ...d6 keeps the pawn center flexible and allows ...e5 without immediately developing the g8-knight.",
    "Белым стоит занять центр и определить, нужен ли размен dxe5 с обменом ферзей.", "White should occupy the center and decide whether dxe5 with a queen exchange is useful.",
    "Чёрным нужно выбирать ...e5, ...g6 или ...Nd7 по структуре центра белых.", "Black should choose ...e5, ...g6 or ...Nd7 according to White's central setup.",
    "Варианты после d4 и e4 не всегда переходят друг в друга: следите за положением пешки c.", "Lines beginning with d4 and e4 do not always transpose; track the c-pawn."],
  ["neo-grunfeld", "Новая защита Грюнфельда", "Neo-Grünfeld Defense", 5,
    "Белые часто выбирают g3 и Bg2, а чёрные отвечают ударом ...d5 против центра c4–d4.", "White often choose g3 and Bg2, while Black challenge the c4-d4 center with ...d5.",
    "Белым нужно решить, когда менять cxd5, и развивать давление по большой диагонали.", "White should choose when to exchange cxd5 and develop pressure on the long diagonal.",
    "Чёрным важно сочетать ...d5 с ...Bg7 и подрывом ...c5 против центра.", "Black should combine ...d5 with ...Bg7 and a ...c5 break against the center.",
    "Фианкетто белых меняет тактику по сравнению с вариантом Грюнфельда с ранним Nc3.", "White's fianchetto changes the tactics compared with Gruenfeld lines featuring an early Nc3."],
  ["portuguese", "Португальский гамбит", "Scandinavian Defense: Portuguese Gambit", 5,
    "После exd5 и ...Nf6 чёрные играют ...Bg4, развивая слона вместо немедленного возврата пешки.", "After exd5 and ...Nf6, Black play ...Bg4, developing the bishop instead of recovering the pawn immediately.",
    "Белым нужно выбрать Nf3, Be2 или f3, учитывая безопасность короля и слона g4.", "White should choose Nf3, Be2 or f3 with king safety and the g4-bishop in mind.",
    "Чёрным полезны темпы против ферзя и короля, но отставание в материале требует активности.", "Black can seek tempi against the queen and king, but the material deficit requires activity.",
    "Ход f3 отгоняет слона, но ослабляет диагонали короля и задерживает Nf3.", "The move f3 attacks the bishop but weakens king diagonals and delays Nf3."],
  ["scotch-gambit", "Шотландский гамбит", "Scotch Game: Scotch Gambit", 6,
    "После ...exd4 белые играют Bc4 вместо возврата пешки, готовя быстрое развитие и давление на f7.", "After ...exd4, White play Bc4 instead of recovering the pawn, preparing rapid development and pressure on f7.",
    "Белым нужно сравнить c3, e5 и рокировку, учитывая давление на d4.", "White should compare c3, e5 and castling, considering the pressure on d4.",
    "Чёрным полезен своевременный удар ...d5, который оспаривает центр и атакует слона c4.", "Black can use a timely ...d5 break to challenge the center and attack the c4-bishop.",
    "Переходы в защиту двух коней и гамбит Геринга меняют порядок тактических угроз.", "Transpositions to the Two Knights Defense and Goering Gambit change the order of tactical threats."],
  ["vienna-gambit", "Венский гамбит", "Vienna Game: Vienna Gambit", 4,
    "Ход f4 после Nc3 оспаривает e5 и открывает линию f ценой ослабления короля.", "The move f4 after Nc3 challenges e5 and opens the f-file at the cost of king safety.",
    "Белым нужно проверить центральный ответ ...d5 и вовремя развить коня g1.", "White should check the central ...d5 reply and develop the g1-knight in time.",
    "Чёрным стоит сравнить взятие на f4 с контрударом ...d5.", "Black should compare capturing on f4 with the ...d5 counterstrike.",
    "После f4 шахи по диагонали h4–e1 требуют внимания даже при коне на c3.", "After f4, checks along h4-e1 need attention even with a knight on c3."]
];

const extra = {
  "fried-liver": [
    ["King accepts the sacrifice", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3"],
    ["Central king, ...Nb4", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nb4 9. Qe4 c6"],
    ["Central king, ...Nce7", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nce7 9. d4 c6"],
    ["King retreats to e8", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke8 8. Bxd5"],
    ["King retreats to g8", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Kg8 8. Bxd5+"],
    ["Knight fork and king on g6", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Kg6 8. Bxd5"]
  ],
  "halloween": [
    ["Space with e5", "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Nxe5 Nxe5 5. d4 Ng6 6. e5 Ng8"],
    ["Chasing the c6-knight", "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Nxe5 Nxe5 5. d4 Nc6 6. d5 Ne5"],
    ["Developing with check", "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Nxe5 Nxe5 5. d4 Bb4 6. dxe5 Nxe4"]
  ],
  "traxler": [["Declining the bishop sacrifice", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 Bc5 5. Nxf7 Bxf2+ 6. Kf1"]],
  "stafford": [
    ["Defending e4 with d3", "1. e4 e5 2. Nf3 Nf6 3. Nxe5 Nc6 4. Nxc6 dxc6 5. d3 Bc5 6. Be2"],
    ["Solid central support", "1. e4 e5 2. Nf3 Nf6 3. Nxe5 Nc6 4. Nxc6 dxc6 5. Nc3 Bc5 6. d3"]
  ],
  "elephant": [
    ["Central exchanges", "1. e4 e5 2. Nf3 d5 3. exd5 e4 4. Qe2 Nf6 5. d3"],
    ["Developing after ...Bd6", "1. e4 e5 2. Nf3 d5 3. exd5 Bd6 4. d4 e4 5. Ne5"]
  ]
};

const output = ["opening-guides.json", "opening-guides.en.json"].map(function (file) {
  return {file: path.join(__dirname, "../assets/web", file), data: JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/web", file), "utf8"))};
});
families.forEach(function (f) {
  const seen = new Set();
  let selected = rows.filter(function (r) { return r.name.indexOf(f[2]) >= 0; }).filter(function (r) {
    if (seen.has(r.line)) return false; seen.add(r.line); return true;
  });
  if (f[0] === "st-george") selected.sort(function (a, b) { return Number(b.name.indexOf("St. George Defense") === 0) - Number(a.name.indexOf("St. George Defense") === 0); });
  // Keep the defining position; prefer developed continuations over single-move labels.
  const candidates = selected;
  const names = new Set([candidates[0].name]);
  selected = [candidates[0]];
  candidates.slice(1).forEach(function (r) {
    if (selected.length < 8 && !names.has(r.name) && Pgn.parse(r.line).games[0].moves.length >= 8) { selected.push(r); names.add(r.name); }
  });
  candidates.slice(1).forEach(function (r) { if (selected.length < 8 && selected.indexOf(r) < 0) selected.push(r); });
  const namedMainline = candidates.find(function (r) { return r.name === f[2] + ": Main Line"; });
  if (namedMainline && selected.indexOf(namedMainline) < 0) selected[selected.length - 1] = namedMainline;
  (extra[f[0]] || []).forEach(function (r) { if (!seen.has(r[1])) selected.push({name:r[0], line:r[1], eco:selected[0].eco, authored:true}); });
  if (selected.length < 6) throw Error("Too few lines: " + f[0]);
  selected.forEach(function (r) {
    const parsed = Pgn.parse(r.line);
    if (parsed.errors.length || !parsed.games.length || !parsed.games[0].ok) throw Error(f[0] + ": " + r.line + " " + JSON.stringify(parsed.errors));
    r.game = parsed.games[0];
  });
  const developed = selected.filter(function (r) { return r.game.moves.length >= 8; });
  const teachingLine = developed.indexOf(namedMainline) >= 0 ? namedMainline : developed[0] || namedMainline || selected.reduce(function (a, b) { return a.game.moves.length >= b.game.moves.length ? a : b; });
  output.forEach(function (out, language) {
    const en = language === 1, offset = en ? 1 : 0;
    const guide = {
      id:f[0], name:en ? f[2].split(": ").pop() : f[1], eco:selected[0].eco,
      match:[f[2]], mainline:teachingLine.line, idea:f[4 + offset],
      white:[f[6 + offset]], black:[f[8 + offset]], mistakes:[f[10 + offset]],
      tags:Lessons.tags({name:f[2]}), variations:selected.map(function (r) {
        const notes = Lessons.notes(r.game, null, en ? "en" : "ru");
        if (notes.length > f[3]) notes[f[3]] += " " + f[4 + offset];
        return {name:r.name, line:r.line, notes:notes, tags:Lessons.tags({name:r.name}), source:r.authored ? "Caissa teaching continuation" : "lichess-org/chess-openings (CC0)"};
      })
    };
    guide.notes = guide.variations.find(function (v) { return v.line === guide.mainline; }).notes.slice();
    if (f[0] === "fried-liver") guide.keywords = ["Fried Liver", "Fegatello", "Nxf7"];
    const existing = out.data.guides.findIndex(function (g) { return g.id === guide.id; });
    if (existing >= 0) out.data.guides[existing] = guide; else out.data.guides.push(guide);
  });
});
output.forEach(function (out) { fs.writeFileSync(out.file, JSON.stringify(out.data, null, 2) + "\n"); });
console.log("Added/updated " + families.length + " bilingual opening families from CC0 PGNs and original teaching continuations.");
