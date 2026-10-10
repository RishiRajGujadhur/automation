import { useState } from 'react';
import { Formik, Form } from 'formik';
import { Braces } from 'lucide-react';
import { api, type FilePreview } from './api';
import DiffApproval from './DiffApproval';
import { TextField } from './forms';
import { recordingDictionarySchema } from './validators';
import type { Action, Index } from './types';
import { Button } from './radix';

type Result = {
  proposals: { section: string; field: string; fieldType: string; selectors: { type: string; value: string }[] }[];
  dictionary: FilePreview | null;
  pageObject: (FilePreview & { className: string }) | null;
  skipped: string[];
  reused: number;
};
type Values = { page: string; section: string; file: string; pageObjectFile: string };

/** Recording → dictionary entries → dictionary-backed page object, each written only after its own approval. */
export default function RecordingDictionary({ actions, onIndex }: { actions: Action[]; onIndex: (i: Index) => void }) {
  const [result, setResult] = useState<Result>();
  const usable = actions.filter((a) => a.action !== 'goto');
  return (
    <div className="recording-dictionary">
      <p className="subtle">
        {usable.length} unmatched interaction{usable.length === 1 ? '' : 's'}. Fields are proposed from recorded test ids, roles and accessible names (priority: test id → role → text). CSS and XPath are never invented. Existing fields are reused.
      </p>
      <Formik<Values>
        initialValues={{ page: 'RecordedPage', section: 'Main', file: 'Dictionaries/RecordedPage.xml', pageObjectFile: 'Pages/RecordedPage.cs' }}
        validationSchema={recordingDictionarySchema}
        validateOnMount
        onSubmit={async (v, h) => {
          try {
            setResult(await api<Result>('/recording/dictionary-proposal', { actions: usable, page: v.page.trim(), section: v.section.trim(), file: v.file.trim(), pageObjectFile: v.pageObjectFile.trim() }));
            h.setStatus(undefined);
          } catch (e) {
            h.setStatus((e as Error).message);
          } finally {
            h.setSubmitting(false);
          }
        }}
      >
        {({ isSubmitting, isValid, status, values, setFieldValue, touched }) => (
          <Form className="form-stack" noValidate>
            <div className="form-grid">
              <TextField name="page" label="PAGE NAME" hint="PascalCase, e.g. CheckoutPage" />
              <TextField name="section" label="SECTION" />
              <TextField name="file" label="DICTIONARY FILE" />
              <TextField name="pageObjectFile" label="PAGE OBJECT FILE (NEW)" />
            </div>
            {!touched.file && values.file !== `Dictionaries/${values.page}.xml` && /^[A-Za-z]\w*$/.test(values.page) && (
              <Button type="button" variant="ghost" size="tiny" onClick={() => { setFieldValue('file', `Dictionaries/${values.page}.xml`); setFieldValue('pageObjectFile', `Pages/${values.page}.cs`); }}>
                Name files after {values.page}
              </Button>
            )}
            {status && <p className="field-error" role="alert">{status}</p>}
            <Button type="submit" variant="soft" disabled={isSubmitting || !isValid || !usable.length}>
              <Braces size={15} />
              {isSubmitting ? 'Proposing…' : 'Propose dictionary entries'}
            </Button>
          </Form>
        )}
      </Formik>
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
