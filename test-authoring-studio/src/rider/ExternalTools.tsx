import { useState } from 'react';
import { Play, Plus, Trash2 } from 'lucide-react';

/** External Tools (Rider's Settings ▸ Tools ▸ External Tools): commands with macros, run in the Terminal. */
export type ExternalTool = { name: string; command: string };
const KEY = 'tas:rider:externalTools';
const DEFAULTS: ExternalTool[] = [
  { name: 'File info', command: 'Get-Item "$FilePath$" | Format-List Name, Length, LastWriteTime' },
  { name: 'Git log for this file', command: 'git log --oneline -10 -- "$FilePath$"' },
];
export function externalTools(): ExternalTool[] { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? DEFAULTS; } catch { return DEFAULTS; } }
export function saveExternalTools(list: ExternalTool[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage blocked */ } }

export type MacroContext = { root: string; file: string; line: number; column: number; selection: string };
export const MACROS = ['$FilePath$', '$FileRelativePath$', '$FileDir$', '$FileName$', '$FileNameWithoutExtension$', '$LineNumber$', '$ColumnNumber$', '$SelectedText$', '$ProjectFileDir$'];
/** Replaces Rider's macros in a command line. */
export function expandMacros(command: string, c: MacroContext) {
  const sep = c.root.includes('\\') ? '\\' : '/';
  const abs = c.root ? `${c.root.replace(/[\\/]$/, '')}${sep}${c.file.split('/').join(sep)}` : c.file;
  const name = c.file.split('/').pop() ?? '';
  const values: Record<string, string> = {
    $FilePath$: abs, $FileRelativePath$: c.file, $FileDir$: abs.slice(0, Math.max(0, abs.length - name.length - 1)), $FileName$: name,
    $FileNameWithoutExtension$: name.replace(/\.[^.]*$/, ''), $LineNumber$: String(c.line), $ColumnNumber$: String(c.column),
    $SelectedText$: c.selection.replace(/"/g, '`"'), $ProjectFileDir$: c.root,
  };
  return command.replace(/\$\w+\$/g, (m) => values[m] ?? m);
}

/** Manage the tools and run one. */
export default function ExternalToolsDialog({ onRun }: { onRun: (tool: ExternalTool) => void }) {
  const [list, setList] = useState(externalTools);
  const update = (next: ExternalTool[]) => { setList(next); saveExternalTools(next); };
  return (
    <div className="external-tools">
      <p className="subtle">Commands run in the Terminal. Macros: {MACROS.map((m) => <code key={m}>{m}</code>).reduce<React.ReactNode[]>((a, m, i) => [...a, i ? ' ' : '', m], [])}</p>
      <ul aria-label="External tools">
        {list.map((t, i) => (
          <li key={i}>
            <input aria-label={`Name of tool ${i + 1}`} value={t.name} onChange={(e) => update(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input aria-label={`Command of tool ${i + 1}`} className="ext-command" value={t.command} onChange={(e) => update(list.map((x, j) => (j === i ? { ...x, command: e.target.value } : x)))} spellCheck={false} />
            <button className="icon-button" aria-label={`Run ${t.name}`} title="Run" onClick={() => onRun(t)}><Play size={14} /></button>
            <button className="icon-button" aria-label={`Remove ${t.name}`} title="Remove" onClick={() => update(list.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </li>
        ))}
      </ul>
      <button className="button" onClick={() => update([...list, { name: 'New tool', command: 'Write-Output "$FileName$ line $LineNumber$"' }])}><Plus size={13} /> Add tool</button>
    </div>
  );
}
