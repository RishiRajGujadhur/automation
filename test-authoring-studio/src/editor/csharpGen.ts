import type { EditorView } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import { classAt, addMembers } from './textTools2';

/* C# generators and conversions of RIDER-VSCODE-FEATURES.md (text-based, previewable by undo). */

/** Adds `iface` to the base list of the class header that starts at `header` (before the `{`). */
function addBase(view: EditorView, header: number, open: number, iface: string) {
  const text = view.state.sliceDoc(header, open);
  if (new RegExp(`\\b${iface.replace(/[<>]/g, '\\$&')}`).test(text)) return;
  // The end of the header: before a where clause, or at its last non-space character.
  const where = /\swhere\s/.exec(text);
  const end = header + (where ? where.index : text.trimEnd().length);
  const hasBases = /\)\s*:|[^:]:\s*[\w<]/.test(view.state.sliceDoc(header, end).replace(/::/g, ''));
  view.dispatch({ changes: { from: end, insert: hasBases ? `, ${iface}` : ` : ${iface}` } });
}

/** Generate IEquatable<T> (Rider / Visual Studio): Equals(T), Equals(object), GetHashCode, == and != from the properties. */
export function generateIEquatable(view: EditorView) {
  const c = classAt(view.state);
  if (!c || !c.props.length || /IEquatable</.test(view.state.sliceDoc(c.header, c.open))) return false;
  const i = c.indent;
  const struct = c.kind === 'struct';
  const nullable = struct ? '' : '?';
  const eq = c.props.map((p) => `EqualityComparer<${p.type}>.Default.Equals(${p.name}, other.${p.name})`).join(`\n${i}    && `);
  const lines = [
    `${i}public bool Equals(${c.name}${nullable} other) => ${struct ? '' : 'other is not null\n' + i + '    && '}${eq};`, '',
    `${i}public override bool Equals(object? obj) => obj is ${c.name} other && Equals(other);`, '',
    `${i}public override int GetHashCode() => HashCode.Combine(${c.props.slice(0, 8).map((p) => p.name).join(', ')});`, '',
    `${i}public static bool operator ==(${c.name}${nullable} left, ${c.name}${nullable} right) => ${struct ? 'left.Equals(right)' : 'Equals(left, right)'};`, '',
    `${i}public static bool operator !=(${c.name}${nullable} left, ${c.name}${nullable} right) => !(left == right);`,
  ];
  addMembers(view, c.close, lines);
  addBase(view, c.header, c.open, `IEquatable<${c.name}>`);
  return true;
}

/** Generate Comparison Members (Rider): IComparable<T>.CompareTo property by property, and <, >, <=, >=. */
export function generateComparison(view: EditorView) {
  const c = classAt(view.state);
  if (!c || !c.props.length || /IComparable</.test(view.state.sliceDoc(c.header, c.open))) return false;
  const i = c.indent;
  const struct = c.kind === 'struct';
  const n = struct ? '' : '?';
  const body = [
    `${i}public int CompareTo(${c.name}${n} other)`, `${i}{`,
    ...(struct ? [] : [`${i}    if (ReferenceEquals(this, other)) return 0;`, `${i}    if (other is null) return 1;`]),
    `${i}    int result;`,
    ...c.props.flatMap((p, k) => (k === c.props.length - 1 ? [`${i}    return Comparer<${p.type}>.Default.Compare(${p.name}, other.${p.name});`] : [`${i}    if ((result = Comparer<${p.type}>.Default.Compare(${p.name}, other.${p.name})) != 0) return result;`])),
    `${i}}`, '',
    ...['<', '>', '<=', '>='].flatMap((op) => [`${i}public static bool operator ${op}(${c.name}${n} left, ${c.name}${n} right) => Comparer<${c.name}>.Default.Compare(left, right) ${op} 0;`, '']).slice(0, -1),
  ];
  addMembers(view, c.close, body);
  addBase(view, c.header, c.open, `IComparable<${c.name}>`);
  return true;
}

/** Async disposable fields: streams, connections, clients, contexts and fields typed IAsyncDisposable. */
export function asyncDisposableFields(text: string) {
  const out: string[] = [];
  for (const m of text.matchAll(/^\s*(?:private|protected|internal|public)?\s*(?:readonly\s+)?([\w.<>]*(?:Stream|Connection|Client|Context|Transaction|AsyncDisposable|Browser|Page|Playwright)[\w<>]*)\??\s+(_?\w+)\s*(?:=|;)/gm)) out.push(m[2]);
  return out;
}
/** Implement IAsyncDisposable with the Dispose pattern (DisposeAsync + DisposeAsyncCore), disposing such fields. */
export function generateAsyncDisposable(view: EditorView) {
  const c = classAt(view.state);
  if (!c || /IAsyncDisposable/.test(view.state.sliceDoc(c.header, c.open))) return false;
  const i = c.indent;
  const fields = asyncDisposableFields(view.state.sliceDoc(c.open, c.close));
  const sealedClass = /\bsealed\b/.test(view.state.sliceDoc(c.header, c.open)) || c.kind === 'struct';
  const lines = [
    `${i}public async ValueTask DisposeAsync()`, `${i}{`, `${i}    await DisposeAsyncCore().ConfigureAwait(false);`, `${i}    GC.SuppressFinalize(this);`, `${i}}`, '',
    `${i}${sealedClass ? 'private' : 'protected virtual'} async ValueTask DisposeAsyncCore()`, `${i}{`,
    ...(fields.length ? fields.map((f) => `${i}    if (${f} is not null) await ${f}.DisposeAsync().ConfigureAwait(false);`) : [`${i}    // Dispose the managed resources asynchronously here.`, `${i}    await Task.CompletedTask;`]),
    `${i}}`,
  ];
  addMembers(view, c.close, lines);
  addBase(view, c.header, c.open, 'IAsyncDisposable');
  return true;
}

/** `$"…{a}…{b:F2}…"` → `string.Format("…{0}…{1:F2}…", a, b)`. Pure, for the unit tests; null when it is not one. */
export function interpolationToFormat(literal: string): string | null {
  const m = /^(\$@|@\$|\$)"([\s\S]*)"$/.exec(literal);
  if (!m) return null;
  const verbatim = m[1].includes('@');
  const args: string[] = [];
  let out = '';
  const s = m[2];
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === '{' && s[k + 1] === '{') { out += '{{'; k++; continue; }
    if (ch === '}' && s[k + 1] === '}') { out += '}}'; k++; continue; }
    if (ch !== '{') { out += ch; continue; }
    // A hole: the expression up to a top-level ':' or ',' (format / alignment), then its closing brace.
    let j = k + 1, depth = 0, split = -1;
    for (; j < s.length; j++) {
      const c = s[j];
      if (c === '"') { j++; while (j < s.length && s[j] !== '"') { if (s[j] === '\\') j++; j++; } continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === '}') { if (depth === 0) break; depth--; }
      else if ((c === ':' || c === ',') && depth === 0 && split < 0) split = j;
    }
    args.push(s.slice(k + 1, split < 0 ? j : split).trim());
    out += `{${args.length - 1}${split < 0 ? '' : s.slice(split, j)}}`;
    k = j;
  }
  return `string.Format(${verbatim ? '@' : ''}"${out}"${args.map((a) => `, ${a}`).join('')})`;
}
/** The interpolated string around the caret (one line). */
function interpolatedAt(state: EditorState) {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  for (const m of line.text.matchAll(/(\$@|@\$|\$)"(?:[^"\\]|\\.|"")*"/g)) {
    const from = line.from + m.index!, to = from + m[0].length;
    if (pos >= from && pos <= to) return { from, to, text: m[0] };
  }
  return null;
}
export function interpolationToFormatCmd(view: EditorView) {
  const s = interpolatedAt(view.state);
  const next = s && interpolationToFormat(s.text);
  if (!s || !next) return false;
  view.dispatch({ changes: { from: s.from, to: s.to, insert: next }, userEvent: 'input' });
  return true;
}

/** Convert Record to Class: a positional record → a class with init properties, a constructor, Deconstruct and value equality. Pure. */
export function recordToClass(text: string): string | null {
  const m = /^(\s*)((?:public|internal|private|protected|sealed|abstract|partial|\s)*)record(\s+class)?\s+(\w+)(<[^>]*>)?\s*\(([^)]*)\)\s*(:[^{;]*)?\s*(;|\{[\s\S]*\})\s*$/.exec(text);
  if (!m) return null;
  const [, indent, mods, , name, generic = '', params, bases = '', tail] = m;
  const i = `${indent}    `;
  const ps = params.split(',').map((p) => p.trim()).filter(Boolean).map((p) => { const q = /^(?:\[[^\]]*\]\s*)?(.+?)\s+(\w+)(\s*=\s*.+)?$/.exec(p)!; return { type: q[1], name: q[2] }; });
  const lc = (n: string) => n.charAt(0).toLowerCase() + n.slice(1);
  const body = tail === ';' ? '' : tail.trim().slice(1, -1).replace(/^\n|\s+$/g, '');
  const T = `${name}${generic}`;
  const lines = [
    `${indent}${mods.trim() ? `${mods.trim()} ` : ''}class ${name}${generic}${bases ? ` ${bases.trim()},` : ' :'} IEquatable<${T}>`,
    `${indent}{`,
    ...ps.map((p) => `${i}public ${p.type} ${p.name} { get; init; }`),
    '',
    `${i}public ${name}(${ps.map((p) => `${p.type} ${lc(p.name)}`).join(', ')})`,
    `${i}{`,
    ...ps.map((p) => `${i}    ${p.name} = ${lc(p.name)};`),
    `${i}}`,
    '',
    `${i}public void Deconstruct(${ps.map((p) => `out ${p.type} ${lc(p.name)}`).join(', ')})`,
    `${i}{`,
    ...ps.map((p) => `${i}    ${lc(p.name)} = ${p.name};`),
    `${i}}`,
    '',
    `${i}public bool Equals(${T}? other) => other is not null${ps.map((p) => ` && EqualityComparer<${p.type}>.Default.Equals(${p.name}, other.${p.name})`).join('')};`,
    `${i}public override bool Equals(object? obj) => Equals(obj as ${T});`,
    `${i}public override int GetHashCode() => HashCode.Combine(${ps.slice(0, 8).map((p) => p.name).join(', ')});`,
    `${i}public static bool operator ==(${T}? left, ${T}? right) => Equals(left, right);`,
    `${i}public static bool operator !=(${T}? left, ${T}? right) => !Equals(left, right);`,
    `${i}public override string ToString() => $"${name} {{ ${ps.map((p) => `${p.name} = {${p.name}}`).join(', ')} }}";`,
    ...(body ? ['', body] : []),
    `${indent}}`,
  ];
  return lines.join('\n');
}
/** The record declaration around the caret (from its line to its `;` or closing brace). */
export function recordToClassCmd(view: EditorView) {
  const doc = view.state.doc;
  const here = doc.lineAt(view.state.selection.main.head).number;
  for (let n = here; n >= Math.max(1, here - 40); n--) {
    const line = doc.line(n);
    if (!/\brecord\b(?!\s+struct)/.test(line.text)) continue;
    const text = doc.toString();
    let k = line.from, depth = 0, end = -1, opened = false;
    for (; k < text.length; k++) {
      const ch = text[k];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === '{' && depth === 0) { opened = true; let d = 0; for (; k < text.length; k++) { if (text[k] === '{') d++; else if (text[k] === '}' && --d === 0) break; } end = k + 1; break; }
      else if (ch === ';' && depth === 0 && !opened) { end = k + 1; break; }
    }
    if (end < 0) return false;
    const next = recordToClass(text.slice(line.from, end));
    if (!next) return false;
    view.dispatch({ changes: { from: line.from, to: end, insert: next }, userEvent: 'input' });
    return true;
  }
  return false;
}
