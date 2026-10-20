/** A Git Log row (graph line with a commit). */
export type LogRow = { hash?: string; author?: string; refs?: string; subject?: string };

/**
 * Git Log filter (Rider's Log filters as text): `author:ada`, `branch:main` (refs), `hash:abc12` and free words for the
 * message; `-word` excludes; "quoted phrases" keep spaces.
 */
export function matchCommit(r: LogRow, query: string) {
  if (!r.hash) return false;
  const terms = query.trim().toLowerCase().match(/-?\w+:"[^"]*"|-?"[^"]*"|\S+/g) ?? [];
  return terms.every((raw) => {
    const not = raw.startsWith('-') && raw.length > 1;
    const term = not ? raw.slice(1) : raw;
    const m = /^(author|branch|ref|hash):"?([^"]*)"?$/.exec(term);
    const value = m ? m[2] : term.replace(/^"|"$/g, '');
    const field = !m ? `${r.hash} ${r.subject ?? ''} ${r.author ?? ''} ${r.refs ?? ''}` : m[1] === 'author' ? r.author ?? '' : m[1] === 'hash' ? r.hash ?? '' : r.refs ?? '';
    return field.toLowerCase().includes(value) !== not;
  });
}
