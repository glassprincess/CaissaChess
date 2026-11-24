"use strict";
const assert = require("assert");
const MR = require("../assets/web/review.js");
const An = require("../assets/web/analysis.js");
assert.strictEqual(MR.classify({played:"a1a2",bestmove:"b1b2",before:{type:"cp",value:0},after:{type:"cp",value:40},sacrifice:3}).key, "good", "unsound sacrifice gets its ordinary loss grade");
assert.strictEqual(An.normalize({key:"sharp",loss:7}).key,"inaccuracy");
assert.strictEqual(An.category("eval"),null);
const stats = An.sideStats([{color:"w",key:"book",loss:0},{color:"b",key:"best",loss:0}]);
assert.deepStrictEqual(stats.countsBySide,{w:{book:1},b:{best:1}});
const Classification = require("../assets/web/move-classification.js");
const rows = require("../tools/benchmark-review.js").rows();
assert.strictEqual(rows.length,73);
assert.strictEqual(rows.filter(r=>r.color==="w").length,37);
assert.strictEqual(Classification.effectiveSacrifice(rows[50]),2,"Rc6 newly offers the exchange");
assert.strictEqual(Classification.effectiveSacrifice(rows[54]),2,"Qd4 deliberately keeps an avoidable exchange offer");
assert.strictEqual(Classification.effectiveSacrifice(rows[54],[
  {move:rows[54].uci,eval:{type:"cp",value:100}},
  {move:"a1a2",eval:{type:"cp",value:-300}}
]),2,"a uniquely necessary quiet continuation may deliberately maintain a sacrifice");
const trapped = require("../assets/web/pgn.js").parse('[FEN "4k3/8/8/8/8/8/Pp5B/RN2K3 w - - 0 1"]\n\n1. Bg3 *').games[0].moves[0];
const Chess = require("../assets/web/chess.js");
trapped.sacrifice = Chess.sacrificeLoss(Chess.fromFen(trapped.fenBefore),Chess.fromFen(trapped.fenAfter),trapped.uci);
assert.ok(trapped.sacrifice >= 2);
assert.strictEqual(Classification.effectiveSacrifice(trapped),0,"unavoidable loss of a trapped rook is not a voluntary sacrifice");
const book = Object.assign({},rows[0],{book:true});
Classification.classifyRow(book,0,[]);
assert.strictEqual(book.loss,0);
assert.strictEqual(book.key,"book");
console.log("review regression ok");

assert.strictEqual(MR.classify({played:"d2d4",bestmove:"e2e4",before:{type:"cp",value:30},after:{type:"cp",value:-30},lines:[{move:"e2e4",depth:14,eval:{type:"cp",value:30}},{move:"d2d4",depth:14,eval:{type:"cp",value:30}}]}).key,"best","verified equal MultiPV alternatives share best grade");

assert.strictEqual(MR.classify({played:"e2e4",bestmove:"e2e4",before:{type:"cp",value:0},after:{type:"cp",value:0},lines:[{move:"e2e4",depth:16,eval:{type:"cp",value:0}},{move:"d2d4",depth:10,eval:{type:"cp",value:-300}}]}).key,"best","незавершённая линия другой глубины не доказывает единственность хорошего хода");
