import { useEffect, useState } from 'react';
import { Boxes, Braces, SquareFunction, Variable, ChevronRight, Box } from 'lucide-react';
import { Dropdown } from '../radix';
import { api } from '../api';

type Range = { line: number; column: number; start: number; end: number };
type Member = { name: string; kind: string; range: Range };
type Type = { name: string; kind: string; range: Range; members: Member[] };
export type Outline = { project: string; types: Type[] };

const memberIcon = (kind: string) => (kind === 'method' || kind === 'constructor' ? SquareFunction : kind === 'property' || kind === 'field' || kind === 'event' ? Variable : Box);

/**
 * Visual Studio's navigation bar as a slim breadcrumb (VS Code style): project › type › member at the cursor; each
 * part lists its siblings to jump to. The outline is re-read (debounced) as the file changes.
 */
export default function NavBar({ file, source, line, onGo }: { file: string; source: string; line: number; onGo: (line: number, column: number) => void }) {
  const [outline, setOutline] = useState<Outline>();
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => api<Outline>('/csharp/outline', { file, source }).then((o) => live && setOutline(o), () => {}), outline ? 800 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [file, source]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!outline) return <nav className="nav-bar" aria-label="Navigation bar" />;
  // Innermost type containing the cursor, then the member containing it.
  const type = [...outline.types].filter((t) => t.range.start <= line && line <= t.range.end).sort((a, b) => (a.range.end - a.range.start) - (b.range.end - b.range.start))[0];
  const member = type?.members.find((m) => m.range.start <= line && line <= m.range.end);
  const MemberIcon = memberIcon(member?.kind ?? 'method');
  return (
    <nav className="nav-bar" aria-label="Navigation bar">
      <span className="nav-part" title="Project"><Boxes size={13} aria-hidden="true" />{outline.project}</span>
      <ChevronRight size={12} aria-hidden="true" />
      <Dropdown
        label="Types"
        trigger={<button className="nav-part" aria-label={`Type: ${type?.name ?? 'none'}`}><Braces size={13} aria-hidden="true" />{type?.name ?? '(no type)'}</button>}
        entries={outline.types.length ? outline.types.map((t) => ({ label: `${t.name}  ·  ${t.kind}`, icon: Braces, onSelect: () => onGo(t.range.line, t.range.column) })) : [{ label: 'No types in this file', disabled: true, onSelect: () => {} }]}
      />
      {type && (
        <>
          <ChevronRight size={12} aria-hidden="true" />
          <Dropdown
            label="Members"
            trigger={<button className="nav-part" aria-label={`Member: ${member?.name ?? 'none'}`}><MemberIcon size={13} aria-hidden="true" />{member?.name ?? '(no member)'}</button>}
            entries={type.members.length ? type.members.map((m) => ({ label: m.name, icon: memberIcon(m.kind), onSelect: () => onGo(m.range.line, m.range.column) })) : [{ label: 'No members', disabled: true, onSelect: () => {} }]}
          />
        </>
      )}
    </nav>
  );
}
