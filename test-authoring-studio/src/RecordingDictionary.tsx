import { useEffect, useState } from 'react';
import { Formik, Form } from 'formik';
import { Braces } from 'lucide-react';
import { api, type FilePreview } from './api';
import DiffApproval from './DiffApproval';
import { TextField } from './forms';
import { recordingDictionarySchema } from './validators';
import type { Action, Index } from './types';
import { Button, Select } from './radix';
import { Segmented } from './radix2';

type Result = {
  proposals: { section: string; field: string; fieldType: string; selectors: { type: string; value: string }[] }[];
  dictionary: FilePreview | null;
  pageObject: (FilePreview & { className: string }) | null;
  skipped: string[];
  reused: number;
};
type Values = { page: string; section: string; file: string; pageObjectFile: string };

/**
 * Recording → dictionary entries (Page → Section → Field → Selector, the repository's XML format) → optional
 * dictionary-backed page object. Entries go into an existing dictionary file or a new one; each file is written
 * only after its own diff approval. Fields that already exist are reused, never duplicated.
 */
export default function RecordingDictionary({ actions, onIndex, compact }: { actions: Action[]; onIndex: (i: Index) => void; compact?: boolean }) {
  const [result, setResult] = useState<Result>();
  const [files, setFiles] = useState<string[]>([]);
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  useEffect(() => {
    api<string[]>('/dictionary/files').then((f) => { setFiles(f); if (f.length) setMode('existing'); }).catch(() => {});
  }, []);
  const usable = actions.filter((a) => a.action !== 'goto');
  return (
    <div className={`recording-dictionary ${compact ? 'compact' : ''}`}>
      <p className="subtle">
        {usable.length} interaction{usable.length === 1 ? '' : 's'}. New selectors come from recorded test ids, roles and accessible names (test id → role → text); CSS and XPath are never invented. Existing fields are reused.
      </p>
      <Formik<Values>
        initialValues={{ page: 'RecordedPage', section: 'Main', file: files[0] ?? 'Dictionaries/RecordedPage.xml', pageObjectFile: '' }}
        enableReinitialize
        validationSchema={recordingDictionarySchema}
        validateOnMount
        onSubmit={async (v, h) => {
          try {
            setResult(await api<Result>('/recording/dictionary-proposal', { actions: usable, page: v.page.trim(), section: v.section.trim(), file: v.file.trim(), ...(v.pageObjectFile.trim() ? { pageObjectFile: v.pageObjectFile.trim() } : {}) }));
            h.setStatus(undefined);
          } catch (e) {
            h.setStatus((e as Error).message);
          } finally {
            h.setSubmitting(false);
          }
        }}
      >
        {({ isSubmitting, isValid, status, values, setFieldValue }) => (
          <Form className="form-stack" noValidate>
            <div className="form-grid">
              <TextField name="page" label="PAGE NAME" hint="PascalCase, e.g. CheckoutPage" />
              <TextField name="section" label="SECTION" />
            </div>
            <div className="field-label">
              <span>SELECTORS FILE</span>
              <Segmented label="Selectors file" size="small" value={mode} onValueChange={(m) => { setMode(m); setFieldValue('file', m === 'existing' ? files[0] ?? '' : `Dictionaries/${values.page}.xml`); }} options={[{ value: 'existing', label: `Existing (${files.length})` }, { value: 'new', label: 'New file' }]} />
              {mode === 'existing' ? (
                files.length ? <Select ariaLabel="Existing dictionary file" value={values.file} onValueChange={(v) => setFieldValue('file', v)} options={files} /> : <span className="field-hint">No dictionary files yet: choose New file.</span>
              ) : (
                <TextField name="file" label="NEW DICTIONARY FILE" hint="Created with a <Page> root in the same format as the existing dictionaries." />
              )}
            </div>
            <TextField name="pageObjectFile" label="PAGE OBJECT FILE (OPTIONAL, NEW)" hint="Leave empty to update the selectors file only." />
            {status && <p className="field-error" role="alert">{status}</p>}
            <Button type="submit" variant="soft" disabled={isSubmitting || !isValid || !usable.length}>
              <Braces size={15} />
              {isSubmitting ? 'Proposing…' : 'Preview selector changes'}
            </Button>
          </Form>
        )}
      </Formik>
      {result && (
        <>
          {result.reused > 0 && <div className="info-box">{result.reused} interaction(s) already have dictionary fields; nothing is added for them.</div>}
          {result.skipped.map((s) => <div className="info-box" key={s}>{s}</div>)}
          {result.dictionary && <><h4 className="detail-heading">Selectors · {result.dictionary.file}</h4><DiffApproval preview={result.dictionary} onApplied={onIndex} height="220px" /></>}
          {result.pageObject && <><h4 className="detail-heading">Page object · {result.pageObject.className}</h4><DiffApproval preview={result.pageObject} onApplied={onIndex} height="220px" /></>}
          {!result.dictionary && !result.pageObject && <p className="subtle">Every recorded selector already exists. Nothing to write.</p>}
        </>
      )}
    </div>
  );
}
