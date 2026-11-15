/**
 * Line and word differences for `TextDiff` (docs/toolkit.md#textdiff): Myers' O((N+M)·D) shortest edit script after
 * trimming the common prefix and suffix. A middle part whose edit cost exceeds the limit is reported as removed and
 * added as a whole (a correct, not minimal script), which bounds time and memory for unrelated texts.
 */

/** One edit step: 0 keeps an element of both, 1 removes one of `a`, 2 adds one of `b`. */
export type Op = 0 | 1 | 2;

/** Largest edit cost searched between lines (about 4·D² bytes of trace) and between the words of a line pair. */
export const LINE_LIMIT = 2000;
export const WORD_LIMIT = 400;

/**
 * The edit script turning `a` into `b`, element by element. Beyond `limit` the differing middle is removed and added as
 * a whole, or with `strict` the result is null.
 */
export function editScript<T>(a: readonly T[], b: readonly T[], limit: number): Op[];
export function editScript<T>(a: readonly T[], b: readonly T[], limit: number, strict: true): Op[] | null;
export function editScript<T>(a: readonly T[], b: readonly T[], limit: number, strict = false): Op[] | null {
  let start = 0, endA = a.length, endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const found = shortest(a.slice(start, endA), b.slice(start, endB), limit);
  if (!found && strict) return null;
  const middle = found ?? [...Array<Op>(endA - start).fill(1), ...Array<Op>(endB - start).fill(2)];
  return [...Array<Op>(start).fill(0), ...middle, ...Array<Op>(a.length - endA).fill(0)];
}

/** Myers' greedy forward search with one trace row per cost; null when the cost exceeds `limit`. */
function shortest<T>(a: readonly T[], b: readonly T[], limit: number): Op[] | null {
  const n = a.length, m = b.length, max = Math.min(n + m, limit), offset = max + 1;
  if (!n || !m) return [...Array<Op>(n).fill(1), ...Array<Op>(m).fill(2)];
  const v = new Int32Array(2 * max + 3), trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) { trace.push(v.slice(offset - d, offset + d + 1)); return backtrack(trace, n, m); }
    }
    trace.push(v.slice(offset - d, offset + d + 1));
  }
  return null;
}

/** Walks the trace back from (n, m): each cost step is one removal or addition after a run of kept elements. */
function backtrack(trace: Int32Array[], n: number, m: number): Op[] {
  const ops: Op[] = [];
  let x = n, y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const previous = trace[d - 1], at = (k: number) => previous[k + d - 1], k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const fromK = down ? k + 1 : k - 1, fromX = at(fromK), startX = down ? fromX : fromX + 1;
    for (let i = x; i > startX; i--) ops.push(0);
    ops.push(down ? 2 : 1);
    x = fromX; y = fromX - fromK;
  }
  for (let i = x; i > 0; i--) ops.push(0);
  return ops.reverse();
}

/** Words, runs of white space and single other characters: the units of a word-level highlight. */
export const tokens = (line: string): string[] => line.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) ?? [];

/** One piece of a changed line: `changed` marks the removed (old side) or added (new side) words. */
export type Piece = { text: string; changed: boolean };

/**
 * The word-level pieces of a removed line and the added line paired with it, or null when the two have too little in
 * common for a highlight to help (the kept characters are less than a third of the longer line) or the word edit
 * exceeds `WORD_LIMIT` steps.
 */
export function words(before: string, after: string): { before: Piece[]; after: Piece[] } | null {
  const a = tokens(before), b = tokens(after), ops = editScript(a, b, WORD_LIMIT, true);
  if (!ops) return null;
  const old: Piece[] = [], next: Piece[] = [];
  const push = (pieces: Piece[], text: string, changed: boolean) => {
    const last = pieces[pieces.length - 1];
    if (last && last.changed === changed) last.text += text; else pieces.push({ text, changed });
  };
  let i = 0, j = 0, kept = 0;
  for (const op of ops) {
    if (op === 0) { kept += a[i].length; push(old, a[i++], false); push(next, b[j++], false); }
    else if (op === 1) push(old, a[i++], true);
    else push(next, b[j++], true);
  }
  return kept * 3 < Math.max(before.length, after.length) ? null : { before: old, after: next };
}

/** A line of the result: kept (both numbers), removed (old number) or added (new number); numbers count from 1. */
export type Line = { kind: Op; text: string; old?: number; new?: number };

/**
 * Splits a text into lines: `\r\n`, `\r` and `\n` end a line, so a final line break adds no empty line and an empty
 * text has none (the kind of line break and a final one are not compared).
 */
export const lines = (text: string): string[] => text === "" ? [] : text.replace(/(\r\n|\r|\n)$/, "").split(/\r\n|\r|\n/);

/** Line edit of two texts, with interned lines so the search compares numbers. */
export function lineDiff(before: string, after: string): Line[] {
  const a = lines(before), b = lines(after), ids = new Map<string, number>();
  const id = (line: string) => { let value = ids.get(line); if (value === undefined) ids.set(line, value = ids.size); return value; };
  const ops = editScript(a.map(id), b.map(id), LINE_LIMIT), result: Line[] = [];
  let i = 0, j = 0;
  for (const op of ops) {
    if (op === 0) { result.push({ kind: 0, text: a[i], old: ++i, new: ++j }); }
    else if (op === 1) result.push({ kind: 1, text: a[i], old: ++i });
    else result.push({ kind: 2, text: b[j], new: ++j });
  }
  return result;
}
