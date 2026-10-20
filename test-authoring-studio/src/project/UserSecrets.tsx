import { useEffect, useState } from 'react';
import { api } from '../api';

/** Manage User Secrets (Visual Studio): the project's secrets.json, kept in the user profile, never in the repository. */
export default function UserSecrets({ project, id, onNotice }: { project: string; id: string; onNotice: (m: string) => void }) {
  const [text, setText] = useState<string>();
  const [where, setWhere] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { void api<{ path: string; text: string }>(`/project/secrets?id=${encodeURIComponent(id)}`).then((r) => { setText(r.text); setWhere(r.path); }, (e) => onNotice((e as Error).message)); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (text === undefined) return <p className="subtle">Loading…</p>;
  return (
    <div className="project-props user-secrets" aria-label={`User secrets of ${project}`}>
      <p className="subtle pp-file">{project} · UserSecretsId {id}</p>
      <p className="subtle">Stored in <code>{where}</code>: on this machine only, never committed. Reqnroll / Microsoft.Extensions.Configuration read it with AddUserSecrets.</p>
      <textarea aria-label="secrets.json" rows={12} spellCheck={false} value={text} onChange={(e) => { setText(e.target.value); setError(''); }} />
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="pp-footer"><button className="button primary" onClick={() => { try { JSON.parse(text); } catch (e) { setError(`Not valid JSON: ${(e as Error).message}`); return; } void api('/project/secrets', { id, text }).then(() => onNotice('Saved the user secrets.'), (e) => setError((e as Error).message)); }}>Save</button></div>
    </div>
  );
}
