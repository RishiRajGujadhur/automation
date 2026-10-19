import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { matchFile, parseStackTrace } from './traceParser';

/** Analyze Stack Trace: paste a trace; frames in the solution become links. */
export default function StackTrace({ initial, onOpen }: { initial: string; onOpen: (file: string, line: number) => void }) {
  const [text, setText] = useState(initial);
  const [files, setFiles] = useState<string[]>([]);
  useEffect(() => { api<{ files: { file: string }[] }>('/solution').then((s) => setFiles(s.files.map((f) => f.file)), () => {}); }, []);
  const frames = useMemo(() => parseStackTrace(text).map((f) => ({ ...f, repo: f.file ? matchFile(f.file, files) : undefined })), [text, files]);
  return (
    <div className="stack-trace">
      <textarea aria-label="Stack trace" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a stack trace (at Namespace.Class.Method() in C:\path\File.cs:line 42)" rows={6} spellCheck={false} />
      <ol aria-label="Frames">
        {frames.map((f, i) => (
          <li key={i} className={f.repo ? 'in-solution' : 'external'}>
            {f.repo && f.line ? <button className="link-button" onClick={() => onOpen(f.repo!, f.line!)}>{f.method}</button> : <span>{f.method}</span>}
            {f.file && <small>{f.repo ?? f.file}:{f.line}</small>}
          </li>
        ))}
        {!frames.length && <li className="subtle">No "at …" frames found.</li>}
      </ol>
    </div>
  );
}
