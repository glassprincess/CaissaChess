(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./move-classification.js") : root.FisherMoveClassification);
  if (node) module.exports = api;
  else root.OpeningReview = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Classification) {
  "use strict";
  function hasScore(search) {
    const score = search && search.lines && search.lines[0] && search.lines[0].eval;
    return score && (score.type === "cp" || score.type === "mate") && Number.isFinite(score.value);
  }
  function grade(row, beforeSearch, afterSearch) {
    if (!row) return null;
    if (row.book) return Object.assign({}, row, {key:"book",loss:0});
    if (!hasScore(beforeSearch) || !hasScore(afterSearch)) return null;
    const annotated = Object.assign({}, row, {book:false,key:null,loss:undefined});
    return Classification.classifyRow(annotated, 0, [beforeSearch, afterSearch]);
  }
  return {grade:grade};
});
