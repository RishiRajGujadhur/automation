import { useState } from 'react';
import CodeEditor from './editor/CodeEditor';

/**
 * Floating editor window (VS Code's Move into New Window, Rider's Open in New Window): a file alone in its own browser
 * or desktop window, saved the same way as in the studio (auto save, diff for Ctrl+S when auto save is off).
 */
export default function FloatingEditor({ file }: { file: string }) {
  const [notice, setNotice] = useState('');
  document.title = `${file.split('/').pop()} · TestAuthoring Studio`;
  return (
    <div className="floating-editor" aria-label={`Floating editor ${file}`}>
      <header className="floating-head"><strong>{file.split('/').pop()}</strong><span className="meta">{file}</span>{notice && <span role="status" className="meta">{notice}</span>}</header>
      <div className="floating-body"><CodeEditor file={file} active onNotice={setNotice} /></div>
    </div>
  );
}
/** The file of a floating-window URL (#/float?file=…), or null. */
export const floatingFile = (hash: string) => (hash.startsWith('#/float') ? new URLSearchParams(hash.split('?')[1] ?? '').get('file') : null);
