"use strict";
// Source TSVs: https://github.com/lichess-org/chess-openings (CC0).
// Run with a directory containing a.tsv through e.tsv; existing authored notes survive.
const fs = require("fs"), path = require("path");
const Pgn = require("../assets/web/pgn.js");
const filename = path.join(__dirname, "../assets/web/opening-guides.json");
const data = JSON.parse(fs.readFileSync(filename, "utf8"));
const rows = ["a", "b", "c", "d", "e"].flatMap(file => fs.readFileSync(path.join(process.argv[2], file + ".tsv"), "utf8").trim().split(/\r?\n/).slice(1).map(line => {
  const [eco, name, pgn] = line.split("\t");
  return { eco, name, line: pgn };
}));
const families = [
  ["kings-gambit", "Королевский гамбит", "King's Gambit", "f4 вскрывает линию f ценой пешки и ослабления короля.", "Готовьте Nf3 и Bc4, проверяя шахи по диагонали h4–e1.", "Отвечайте развитием и ударом ...d5; удержание лишней пешки не всегда выгодно."],
  ["danish", "Датский гамбит", "Danish Gambit", "После d4 и c3 белые предлагают пешки ради открытых диагоналей слонов.", "Развивайте слонов с темпом и используйте открытые линии до завершения развития чёрных.", "Проверяйте ...d5: возврат материала часто помогает закончить развитие."],
  ["center-game", "Центральный дебют", "Center Game", "Раннее d4 сразу оспаривает центр; после Qxd4 ферзь может попасть под темп ...Nc6.", "Выбирайте поле ферзю с учётом развития коней чёрных.", "Нападайте на ферзя с развитием и готовьте ...d5."],
  ["philidor", "Защита Филидора", "Philidor Defense", "Пешка d6 поддерживает e5, но ограничивает слона c8 до размена в центре.", "Занимайте центр ходом d4 и развивайте фигуры перед атакой.", "Подготовьте ...Nf6 и развитие слона; момент ...exd4 меняет структуру."],
  ["ponziani", "Дебют Понциани", "Ponziani Opening", "Ход c3 готовит d4, но пока оставляет поле c3 недоступным коню.", "Проверяйте центральный ответ ...d5 прежде чем наращивать пешечный центр.", "Используйте временную задержку развития белых для ...d5 или ...Nf6."],
  ["latvian", "Латышский гамбит", "Latvian Gambit", "Ответ ...f5 атакует e4 и одновременно ослабляет диагональ короля чёрных.", "Считайте Nxe5 и шахи ферзём: сохранность короля важнее захвата всех пешек.", "Проверяйте форсированные шахи белых до каждого нового пешечного хода."],
  ["blackmar-diemer", "Гамбит Блэкмара — Димера", "Blackmar-Diemer Gambit", "Ходы e4 и f3 предлагают пешку за развитие и открытую линию f.", "Развивайте коня взятием на f3 и готовьте рокировку перед атакой.", "Ищите ...e6 и ...c6 или активное развитие слона; не отставайте в развитии."],
  ["benko", "Волжский гамбит", "Benko Gambit", "Чёрные жертвуют пешку b ради линий a и b и давления на ферзевый фланг.", "Планируйте развитие и защиту пешек a2 и b2 после принятия гамбита.", "Развивайте слона на g7 и ладьи по открытым линиям, не теряя темпов на возврат пешки."],
  ["owen", "Защита Оуэна", "Owen Defense", "Фианкетто ...b6 и ...Bb7 направлено на e4; белые получают пространство в центре.", "Поддерживайте d4–e4 и следите за давлением слона b7.", "Подрывайте центр ходами ...e6 и ...c5 после развития слона."],
  ["nimzowitsch-defense", "Защита Нимцовича против e4", "Nimzowitsch Defense", "Раннее ...Nc6 давит на d4 и допускает большой пешечный центр белых.", "Выбирайте между d4 и Nf3, учитывая ответ ...d5.", "Определите момент ...d5 или ...e5, чтобы конь c6 поддерживал борьбу в центре."],
  ["bird", "Дебют Берда", "Bird Opening", "Ход f4 контролирует e5, но ослабляет короля и допускает гамбит Фрома ...e5.", "Развивайте Nf3 и готовьте рокировку; проверяйте шахи по диагонали h4–e1.", "Выбирайте устойчивый центр ...d5 или конкретно рассчитывайте контргамбит ...e5."],
  ["nimzo-larsen", "Дебют Нимцовича — Ларсена", "Nimzo-Larsen Attack", "После b3 слон b2 оказывает дальнее давление на центр и королевский фланг.", "Сочетайте Bb2 с e3 и Nf3, сохраняя диагональ слона открытой.", "Занимайте центр и учитывайте давление на g7 после развития слона b2."],
  ["kings-indian-attack", "Староиндийское начало", "King's Indian Attack", "Построение Nf3, g3, Bg2 и d3 готовит e4 и иногда атаку ходом e5.", "Согласуйте e4–e5 с развитием и безопасностью центра.", "Создавайте пространство в центре и ищите контригру на ферзевом фланге."],
  ["torre", "Атака Торре", "Torre Attack", "Слон выходит на g5 до e3 и связывает коня либо провоцирует ослабления.", "Ставьте e3 и Nbd2, проверяя центральное продвижение e4.", "Подрывайте d4 ходом ...c5 и выбирайте момент развития слона c8."],
  ["veresov", "Атака Рихтера — Вересова", "Richter-Veresov Attack", "Конь c3 и слон g5 поддерживают борьбу за e4 без раннего c4.", "Готовьте e4 и оценивайте последствия Bxf6 для структуры чёрных.", "Развивайте фигуры с контролем e4; проверяйте ...Bf5 и ...c5."],
  ["polish", "Дебют Сокольского", "Polish Opening", "Ход b4 готовит Bb2 и пространство на ферзевом фланге, но сама пешка требует внимания.", "Проверяйте нападение ...Bxb4 и развивайте слона b2 с поддержкой центра.", "Занимайте центр и используйте темпы против выдвинутой пешки b4."],
  ["semi-slav", "Полуславянская защита", "Semi-Slav Defense", "Пешки c6 и e6 укрепляют d5, ограничивая слона c8 до вскрытия центра.", "Выбирайте между e3 и Bg5; в острых линиях считайте ...dxc4 и ...b5.", "Готовьте ...c5 или ...e5, чтобы освободить фигуры и ударить по центру."],
  ["tarrasch", "Защита Тарраша", "Tarrasch Defense", "Раннее ...c5 оспаривает центр и часто ведёт к изолированной пешке d5.", "Блокируйте d5 и меняйте активные фигуры соперника, если образовался изолятор.", "Используйте свободное развитие и ищите ...d4 до того, как пешку d5 заблокируют."],
  ["bogo-indian", "Защита Боголюбова", "Bogo-Indian Defense", "Шах ...Bb4+ вынуждает белых определить расположение лёгких фигур.", "Выбирайте Bd2 или Nbd2, учитывая размен чернопольных слонов.", "Сочетайте размен на d2 с борьбой за e4 и своевременным ...d5."],
  ["old-indian", "Старая индийская защита", "Old Indian Defense", "Построение ...d6 и ...e5 создаёт компактный центр с развитием слона на e7.", "Используйте пространство, но готовьтесь к ...exd4 и давлению на e4.", "Закончите развитие и выберите контригру ...c6–d5 либо ...f5 по структуре."]
];
const mainlines = {
  "kings-gambit": "1. e4 e5 2. f4 exf4 3. Nf3 g5 4. h4 g4 5. Ne5",
  "danish": "1. e4 e5 2. d4 exd4 3. c3 dxc3 4. Bc4 cxb2 5. Bxb2 d5",
  "center-game": "1. e4 e5 2. d4 exd4 3. Qxd4 Nc6 4. Qe3 Nf6 5. Nc3",
  "philidor": "1. e4 e5 2. Nf3 d6 3. d4 Nf6 4. Nc3 Nbd7 5. Bc4 Be7",
  "ponziani": "1. e4 e5 2. Nf3 Nc6 3. c3 Nf6 4. d4 Nxe4 5. d5",
  "latvian": "1. e4 e5 2. Nf3 f5 3. Nxe5 Qf6 4. d4 d6 5. Nc4",
  "blackmar-diemer": "1. d4 d5 2. e4 dxe4 3. Nc3 Nf6 4. f3 exf3 5. Nxf3",
  "benko": "1. d4 Nf6 2. c4 c5 3. d5 b5 4. cxb5 a6 5. bxa6 Bxa6",
  "owen": "1. e4 b6 2. d4 Bb7 3. Bd3 e6 4. Nf3 c5 5. c3",
  "nimzowitsch-defense": "1. e4 Nc6 2. d4 d5 3. Nc3 dxe4 4. d5 Ne5 5. Nxe4",
  "bird": "1. f4 d5 2. Nf3 Nf6 3. e3 g6 4. b3 Bg7 5. Bb2",
  "nimzo-larsen": "1. b3 e5 2. Bb2 Nc6 3. e3 Nf6 4. Bb5 Bd6 5. Nf3",
  "kings-indian-attack": "1. Nf3 d5 2. g3 Nf6 3. Bg2 e6 4. O-O Be7 5. d3 O-O 6. Nbd2 c5 7. e4",
  "torre": "1. d4 Nf6 2. Nf3 e6 3. Bg5 c5 4. e3 d5 5. Nbd2",
  "veresov": "1. d4 Nf6 2. Nc3 d5 3. Bg5 Nbd7 4. Nf3 e6 5. e4",
  "polish": "1. b4 e5 2. Bb2 Bxb4 3. Bxe5 Nf6 4. Nf3 O-O 5. e3",
  "semi-slav": "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6 5. e3 Nbd7 6. Bd3 dxc4 7. Bxc4 b5",
  "tarrasch": "1. d4 d5 2. c4 e6 3. Nc3 c5 4. cxd5 exd5 5. Nf3 Nc6 6. g3",
  "bogo-indian": "1. d4 Nf6 2. c4 e6 3. Nf3 Bb4+ 4. Bd2 Qe7 5. g3",
  "old-indian": "1. d4 Nf6 2. c4 d6 3. Nc3 e5 4. Nf3 Nbd7 5. e4 Be7"
};
for (const [id, name, match, idea, white, black] of families) {
  if (data.guides.some(g => g.id === id)) continue;
  const selected = rows.filter(r => r.name.startsWith(match)).filter(r => Pgn.parse(r.line).games[0].moves.length >= 5);
  const unique = Array.from(new Map(selected.map(r => [r.line, r])).values());
  unique.sort((a, b) => a.line.length - b.line.length || a.name.localeCompare(b.name));
  const variants = unique.slice(0, 8);
  if (variants.length < 5) throw Error(id + ": too few source lines");
  data.guides.push({id, name, eco: Array.from(new Set(variants.map(r => r.eco))).join(", "), match: [match], mainline: variants[0].line, idea, white: [white], black: [black], mistakes: ["Перед жертвой проверьте форсированные ответы: шахи, взятия и угрозы; название гамбита не гарантирует компенсацию."], variations: variants.map(r => ({name: r.name, line: r.line, eco: r.eco}))});
}
for (const guide of (data.source ? [] : data.guides.slice(0, 30))) {
  const used = new Set([guide.mainline].concat(guide.variations.map(v => v.line)));
  const candidates = rows.filter(r => guide.match.some(m => r.name.startsWith(m))).filter(r => !used.has(r.line) && Pgn.parse(r.line).games[0].moves.length >= 8);
  candidates.sort((a, b) => Number(/Attack|Counter|Gambit/.test(b.name)) - Number(/Attack|Counter|Gambit/.test(a.name)) || a.line.length - b.line.length);
  for (const r of candidates.slice(0, 3)) guide.variations.push({name: r.name, line: r.line, eco: r.eco});
}
function tags(item) {
  const text = [item.name, (item.match || []).join(" ")].join(" ");
  const result = [];
  if (/attack|атак/i.test(text)) result.push("attack");
  if (/counter|контр|гамбит Фрома/i.test(text)) result.push("counter");
  if (/gambit|гамбит/i.test(text)) result.push("gambit");
  return result;
}
data.guides.forEach(g => { g.tags = tags(g); g.variations.forEach(v => {v.tags = tags(v);}); });
for (const guide of data.guides) {
  if (!mainlines[guide.id]) continue;
  const parsed = Pgn.parse(mainlines[guide.id]);
  if (parsed.errors.length || !parsed.games[0].ok) throw Error(guide.id + ": illegal mainline");
  guide.mainline = mainlines[guide.id];
}
data.source = {url: "https://github.com/lichess-org/chess-openings", license: "CC0-1.0", retrieved: "2026-11-23", rows: rows.length};
fs.writeFileSync(filename, JSON.stringify(data, null, 2) + "\n");
console.log(data.guides.length + " families; " + data.guides.reduce((n, g) => n + 1 + g.variations.length, 0) + " lines");
