/**
 * Paste JSON as Classes (Visual Studio's Edit ▸ Paste Special): C# classes for a JSON document — one per object
 * shape, PascalCase properties with [JsonPropertyName] when the name differs, List<T> for arrays.
 */
const pascal = (s: string) => s.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_m, _a, c: string) => c.toUpperCase()).replace(/^(\d)/, '_$1') || 'Value';
const singular = (s: string) => s.replace(/ies$/i, 'y').replace(/(ss|us)$/i, '$1').replace(/s$/i, '') || s;

export function jsonToClasses(json: string, rootName = 'Root') {
  const data = JSON.parse(json);
  const classes = new Map<string, Map<string, string>>();
  const typeOf = (v: unknown, name: string): string => {
    if (v === null) return 'object?';
    if (Array.isArray(v)) {
      const items = v.filter((x) => x !== null);
      if (!items.length) return 'List<object>';
      const objects = items.filter((x) => typeof x === 'object' && !Array.isArray(x));
      if (objects.length === items.length) { const merged = Object.assign({}, ...objects); return `List<${typeOf(merged, singular(name))}>`; }
      return `List<${typeOf(items[0], singular(name))}>`;
    }
    switch (typeof v) {
      case 'string': return /^\d{4}-\d{2}-\d{2}T/.test(v) ? 'DateTime' : 'string';
      case 'number': return Number.isInteger(v) ? (Math.abs(v) > 2 ** 31 ? 'long' : 'int') : 'double';
      case 'boolean': return 'bool';
      case 'object': {
        let cls = pascal(name);
        while (classes.has(cls) && JSON.stringify([...classes.get(cls)!.keys()]) !== JSON.stringify(Object.keys(v as object))) cls += '2';
        if (!classes.has(cls)) {
          const props = new Map<string, string>();
          classes.set(cls, props);
          for (const [k, val] of Object.entries(v as object)) props.set(k, typeOf(val, k));
        }
        return cls;
      }
      default: return 'object';
    }
  };
  const root = Array.isArray(data) ? typeOf(data, rootName) : typeOf(data, rootName);
  const out: string[] = [];
  let needsAttr = false;
  for (const [cls, props] of [...classes].reverse()) {
    out.push(`public class ${cls}`, '{');
    for (const [k, t] of props) {
      const p = pascal(k);
      if (p !== k) { out.push(`    [JsonPropertyName("${k}")]`); needsAttr = true; }
      out.push(`    public ${t} ${p === cls ? `${p}Value` : p} { get; set; }`);
    }
    out.push('}', '');
  }
  if (!classes.size) out.push(`// ${root}`);
  return (needsAttr ? 'using System.Text.Json.Serialization;\n\n' : '') + out.join('\n').trimEnd() + '\n';
}
