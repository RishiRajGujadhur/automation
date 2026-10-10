import { useState } from 'react';
import { Braces } from 'lucide-react';
import { api, type FilePreview } from './api';
import DiffApproval from './DiffApproval';
import type { Action, Index } from './types';

type Result = {
  proposals: { section: string; field: string; fieldType: string; selectors: { type: string; value: string }[] }[];
  dictionary: FilePreview | null;
  pageObject: (FilePreview & { className: string }) | null;
  skipped: string[];
  reused: number;
};

/** Recording → dictionary entries → dictionary-backed page object, each written only after its own approval. */
export default function RecordingDictionary({ actions, onIndex }: { actions: Action[]; onIndex: (i: Index) => void }) {
  const [page, setPage] = useState('RecordedPage');
  const [section, setSection] = useState('Main');
  const [file, setFile] = useState('Dictionaries/RecordedPage.xml');
  const [pageObjectFile, setPageObjectFile] = useState('Pages/RecordedPage.cs');
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const usable = actions.filter((a) => a.action !== 'goto');
  return (
    <div className="recording-dictionary">
      <p className="subtle">
        {usable.length} unmatched interaction{usable.length === 1 ? '' : 's'}. Fields are proposed from recorded test ids, roles and accessible names (priority: test id → role → text). CSS and XPath are never invented. Existing fields are reused.
      </p>
      <div className="form-grid">
        <label className="field-label">PAGE NAME<input aria-label="Dictionary page name" value={page} onChange={(e) => setPage(e.target.value)} /></label>
        <label className="field-label">SECTION<input aria-label="Dictionary section" value={section} onChange={(e) => setSection(e.target.value)} /></label>
        <label className="field-label">DICTIONARY FILE<input aria-label="Dictionary file path" value={file} onChange={(e) => setFile(e.target.value)} /></label>
        <label className="field-label">PAGE OBJECT FILE (NEW)<input aria-label="Page object file path" value={pageObjectFile} onChange={(e) => setPageObjectFile(e.target.value)} /></label>
      </div>
      <button
        className="button primary-soft"
        disabled={busy || !usable.length}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            setResult(await api<Result>('/recording/dictionary-proposal', { actions: usable, page, section, file, pageObjectFile: pageObjectFile || undefined }));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Braces size={15} />
        Propose dictionary entries
      </button>
      {error && <p role="alert" className="inline-error">{error}</p>}
      {result && (
        <>
          {result.reused > 0 && <div className="info-box">{result.reused} interaction(s) reuse existing dictionary fields.</div>}
          {result.skipped.map((s) => <div className="info-box" key={s}>{s}</div>)}
          {result.dictionary && <><h4 className="detail-heading">Dictionary</h4><DiffApproval preview={result.dictionary} onApplied={onIndex} height="220px" /></>}
          {result.pageObject && <><h4 className="detail-heading">Page object · {result.pageObject.className}</h4><DiffApproval preview={result.pageObject} onApplied={onIndex} height="220px" /></>}
          {!result.dictionary && !result.pageObject && <p className="subtle">Nothing to write.</p>}
        </>
      )}
    </div>
  );
}
