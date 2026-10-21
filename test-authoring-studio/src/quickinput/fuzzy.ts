/*---------------------------------------------------------------------------------------------
 *  fuzzyScore and createMatches are adapted from VS Code (src/vs/base/common/filters.ts).
 *  Copyright (c) Microsoft Corporation. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** A matched range [start, end) in a label. */
export type Match = { start: number; end: number };
/** [score, wordStart, ...match positions (reversed)]. */
export type FuzzyScore = number[];

const maxLen = 128;
const initArr = (n: number) => new Array<number>(n + 1).fill(0);
const initTable = () => Array.from({ length: maxLen + 1 }, () => initArr(maxLen));
const minWordMatchPos = initArr(2 * maxLen);
const maxWordMatchPos = initArr(2 * maxLen);
const diag = initTable();
const table = initTable();
const arrows = initTable();
const enum Arrow { Diag = 1, Left = 2, LeftLeft = 3 }

const SEPARATORS = new Set('_-. /\\\'":$<>()[]{}');
const isSeparatorAtPos = (value: string, i: number) => i >= 0 && i < value.length && SEPARATORS.has(value[i]);
const isWhitespaceAtPos = (value: string, i: number) => i >= 0 && i < value.length && (value[i] === ' ' || value[i] === '\t');
const isUpperCaseAtPos = (pos: number, word: string, wordLow: string) => word[pos] !== wordLow[pos];

function isPatternInWord(patternLow: string, patternPos: number, patternLen: number, wordLow: string, wordPos: number, wordLen: number) {
  while (patternPos < patternLen && wordPos < wordLen) {
    if (patternLow[patternPos] === wordLow[wordPos]) { minWordMatchPos[patternPos] = wordPos; patternPos++; }
    wordPos++;
  }
  return patternPos === patternLen;
}
function fillInMaxWordMatchPos(patternLen: number, wordLen: number, patternStart: number, wordStart: number, patternLow: string, wordLow: string) {
  let patternPos = patternLen - 1, wordPos = wordLen - 1;
  while (patternPos >= patternStart && wordPos >= wordStart) {
    if (patternLow[patternPos] === wordLow[wordPos]) { maxWordMatchPos[patternPos] = wordPos; patternPos--; }
    wordPos--;
  }
}
function doScore(pattern: string, patternLow: string, patternPos: number, patternStart: number, word: string, wordLow: string, wordPos: number, wordLen: number, wordStart: number, newMatchStart: boolean, firstMatchStrong: boolean[]) {
  if (patternLow[patternPos] !== wordLow[wordPos]) return Number.MIN_SAFE_INTEGER;
  let score = 1;
  let isGapLocation = false;
  if (wordPos === patternPos - patternStart) score = pattern[patternPos] === word[wordPos] ? 7 : 5;
  else if (isUpperCaseAtPos(wordPos, word, wordLow) && (wordPos === 0 || !isUpperCaseAtPos(wordPos - 1, word, wordLow))) { score = pattern[patternPos] === word[wordPos] ? 7 : 5; isGapLocation = true; }
  else if (isSeparatorAtPos(wordLow, wordPos) && (wordPos === 0 || !isSeparatorAtPos(wordLow, wordPos - 1))) score = 5;
  else if (isSeparatorAtPos(wordLow, wordPos - 1) || isWhitespaceAtPos(wordLow, wordPos - 1)) { score = 5; isGapLocation = true; }
  if (score > 1 && patternPos === patternStart) firstMatchStrong[0] = true;
  if (!isGapLocation) isGapLocation = isUpperCaseAtPos(wordPos, word, wordLow) || isSeparatorAtPos(wordLow, wordPos - 1) || isWhitespaceAtPos(wordLow, wordPos - 1);
  if (patternPos === patternStart) { if (wordPos > wordStart) score -= isGapLocation ? 3 : 5; }
  else if (newMatchStart) score += isGapLocation ? 2 : 0;
  else score += isGapLocation ? 0 : 1;
  if (wordPos + 1 === wordLen) score -= isGapLocation ? 3 : 5;
  return score;
}

/** VS Code's fuzzy score of `pattern` in `word` (undefined when it does not match). */
export function fuzzyScore(pattern: string, word: string, firstMatchCanBeWeak = false): FuzzyScore | undefined {
  const patternLow = pattern.toLowerCase(), wordLow = word.toLowerCase();
  const patternStart = 0, wordStart = 0;
  const patternLen = Math.min(pattern.length, maxLen), wordLen = Math.min(word.length, maxLen);
  if (patternStart >= patternLen || wordStart >= wordLen || patternLen - patternStart > wordLen - wordStart) return undefined;
  if (!isPatternInWord(patternLow, patternStart, patternLen, wordLow, wordStart, wordLen)) return undefined;
  fillInMaxWordMatchPos(patternLen, wordLen, patternStart, wordStart, patternLow, wordLow);
  let row = 1, column = 1, patternPos = patternStart, wordPos = wordStart;
  const hasStrongFirstMatch = [false];
  for (row = 1, patternPos = patternStart; patternPos < patternLen; row++, patternPos++) {
    const minPos = minWordMatchPos[patternPos], maxPos = maxWordMatchPos[patternPos];
    const nextMaxPos = patternPos + 1 < patternLen ? maxWordMatchPos[patternPos + 1] : wordLen;
    for (column = minPos - wordStart + 1, wordPos = minPos; wordPos < nextMaxPos; column++, wordPos++) {
      let score = Number.MIN_SAFE_INTEGER, canComeDiag = false;
      if (wordPos <= maxPos) score = doScore(pattern, patternLow, patternPos, patternStart, word, wordLow, wordPos, wordLen, wordStart, diag[row - 1][column - 1] === 0, hasStrongFirstMatch);
      let diagScore = 0;
      if (score !== Number.MIN_SAFE_INTEGER) { canComeDiag = true; diagScore = score + table[row - 1][column - 1]; }
      const canComeLeft = wordPos > minPos;
      const leftScore = canComeLeft ? table[row][column - 1] + (diag[row][column - 1] > 0 ? -5 : 0) : 0;
      const canComeLeftLeft = wordPos > minPos + 1 && diag[row][column - 1] > 0;
      const leftLeftScore = canComeLeftLeft ? table[row][column - 2] + (diag[row][column - 2] > 0 ? -5 : 0) : 0;
      if (canComeLeftLeft && (!canComeLeft || leftLeftScore >= leftScore) && (!canComeDiag || leftLeftScore >= diagScore)) { table[row][column] = leftLeftScore; arrows[row][column] = Arrow.LeftLeft; diag[row][column] = 0; }
      else if (canComeLeft && (!canComeDiag || leftScore >= diagScore)) { table[row][column] = leftScore; arrows[row][column] = Arrow.Left; diag[row][column] = 0; }
      else if (canComeDiag) { table[row][column] = diagScore; arrows[row][column] = Arrow.Diag; diag[row][column] = diag[row - 1][column - 1] + 1; }
      else return undefined;
    }
  }
  if (!hasStrongFirstMatch[0] && !firstMatchCanBeWeak) return undefined;
  row--; column--;
  const result: FuzzyScore = [table[row][column], wordStart];
  let backwardsDiagLength = 0, maxMatchColumn = 0;
  while (row >= 1) {
    let diagColumn = column;
    do {
      const arrow = arrows[row][diagColumn];
      if (arrow === Arrow.LeftLeft) diagColumn -= 2;
      else if (arrow === Arrow.Left) diagColumn -= 1;
      else break;
    } while (diagColumn >= 1);
    if (backwardsDiagLength > 1 && patternLow[patternStart + row - 1] === wordLow[wordStart + column - 1] && !isUpperCaseAtPos(diagColumn + wordStart - 1, word, wordLow) && backwardsDiagLength + 1 > diag[row][diagColumn]) diagColumn = column;
    backwardsDiagLength = diagColumn === column ? backwardsDiagLength + 1 : 1;
    if (!maxMatchColumn) maxMatchColumn = diagColumn;
    row--;
    column = diagColumn - 1;
    result.push(column);
  }
  if (wordLen - wordStart === patternLen) result[0] += 2;
  result[0] -= maxMatchColumn - patternLen;
  return result;
}

/** The matched ranges of a fuzzy score. */
export function createMatches(score: FuzzyScore | undefined): Match[] {
  if (!score) return [];
  const res: Match[] = [];
  const wordPos = score[1];
  for (let i = score.length - 1; i > 1; i--) {
    const pos = score[i] + wordPos;
    const last = res[res.length - 1];
    if (last && last.end === pos) last.end = pos + 1;
    else res.push({ start: pos, end: pos + 1 });
  }
  return res;
}

/**
 * Command palette matching (VS Code's matchesWords / contiguous substring): every word of the query is found, in
 * order, at a word start of the label (or anywhere as a substring); null when not all words match.
 */
export function matchesWords(query: string, label: string): Match[] | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const low = label.toLowerCase();
  const out: Match[] = [];
  let from = 0;
  for (const w of words) {
    // Prefer a word start, then any position.
    let at = -1;
    for (let i = low.indexOf(w, from); i >= 0; i = low.indexOf(w, i + 1)) if (i === 0 || /[\s:./_\-(]/.test(low[i - 1])) { at = i; break; }
    if (at < 0) at = low.indexOf(w, from);
    if (at < 0) return null;
    out.push({ start: at, end: at + w.length });
    from = at + w.length;
  }
  return out;
}

/** Fuzzy match of a file: the name first, then the path (VS Code's quick open scorer, simplified). */
export function scoreFile(query: string, name: string, path: string): { score: number; name: Match[]; path: Match[] } | undefined {
  const q = query.replace(/\s+/g, '');
  if (!q) return { score: 0, name: [], path: [] };
  const n = fuzzyScore(q, name, true);
  if (n) return { score: 1000 + n[0] + (name.toLowerCase().startsWith(q.toLowerCase()) ? 50 : 0), name: createMatches(n), path: [] };
  const p = fuzzyScore(q, path, true);
  if (p) return { score: p[0], name: [], path: createMatches(p) };
  return undefined;
}
