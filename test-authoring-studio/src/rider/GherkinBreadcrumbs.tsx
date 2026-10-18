import { useMemo } from 'react';
import { ChevronRight, FileText, ListTree, Layers } from 'lucide-react';
import { Dropdown } from '../radix';
import { useCursor } from '../editor/cursor';
import { gherkinOutline, type OutlineItem } from './outline';
import { useFeature } from '../features';

const icon = (kind: string) => (kind === 'feature' ? FileText : kind === 'rule' ? Layers : ListTree);

/**
 * Breadcrumbs for feature files (Rider): Feature › Rule › Scenario / Examples at the caret. Each part lists the
 * entries at its level to jump to.
 */
export default function GherkinBreadcrumbs({ file, source, onGo }: { file: string; source: string; onGo: (line: number, column: number) => void }) {
  const cursor = useCursor();
  const on = useFeature('breadcrumbs');
  const items = useMemo(() => gherkinOutline(source), [source]);
  const line = cursor?.file === file ? cursor.line : 1;
  // The chain: every entry containing the caret line, outermost first.
  const chain = items.filter((it) => it.start <= line && line <= it.end).sort((a, b) => a.depth - b.depth);
  if (!items.length || !on) return null;
  const siblings = (it: OutlineItem) => {
    const parent = [...chain].reverse().find((p) => p.depth < it.depth);
    return items.filter((x) => x.depth === it.depth && (!parent || (x.start >= parent.start && x.end <= parent.end)));
  };
  return (
    <nav className="nav-bar gherkin-breadcrumbs" aria-label="Breadcrumbs">
      {chain.map((it, i) => {
        const Icon = icon(it.kind);
        return (
          <span key={`${it.line}`} className="crumb-part">
            {i > 0 && <ChevronRight size={12} aria-hidden="true" />}
            <Dropdown
              label={`${it.label} siblings`}
              trigger={<button className="nav-part" aria-label={`Breadcrumb: ${it.label}`}><Icon size={13} aria-hidden="true" />{it.label}</button>}
              entries={siblings(it).map((s) => ({ label: s.label, icon: icon(s.kind), onSelect: () => onGo(s.line, s.column) }))}
            />
          </span>
        );
      })}
    </nav>
  );
}
