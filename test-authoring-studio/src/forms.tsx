import { Formik, Form, Field, ErrorMessage, FieldArray, useField, type FormikHelpers } from 'formik';
import { Play, RefreshCw, ArrowRight, Plus, Trash2, FolderSearch } from 'lucide-react';
import type { ReactNode } from 'react';
import { workspaceSchema, recordSchema, featureFileSchema, runSchema, parametersSchema, dictionaryEntrySchema, selectorTypes } from './validators';
import type { Binding } from './types';
import { FormikSelect, Button } from './radix';

/** Label + input + inline error. Errors appear once the field is touched (or after a submit attempt). */
export function TextField({ name, label, hint, as, list, placeholder, rows, autoFocus }: { name: string; label: string; hint?: ReactNode; as?: 'textarea' | 'select'; list?: string; placeholder?: string; rows?: number; autoFocus?: boolean }) {
  const [, meta] = useField(name);
  const invalid = meta.touched && !!meta.error;
  const id = `f-${name.replace(/[^\w]/g, '-')}`;
  return (
    <div className={`field-label ${invalid ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <Field id={id} name={name} as={as} list={list} placeholder={placeholder} rows={rows} autoFocus={autoFocus} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : hint ? `${id}-hint` : undefined} />
      {invalid ? (
        <span id={`${id}-error`} className="field-error" role="alert">{meta.error}</span>
      ) : hint ? (
        <span id={`${id}-hint`} className="field-hint">{hint}</span>
      ) : null}
    </div>
  );
}
/** Comma-separated list bound to a string[] field. */
function ListField({ name, label, hint }: { name: string; label: string; hint?: string }) {
  const [field, meta, helpers] = useField<string[]>(name);
  const invalid = meta.touched && !!meta.error;
  return (
    <label className={`field-label ${invalid ? 'has-error' : ''}`}>
      {label}
      <input
        aria-label={label}
        aria-invalid={invalid}
        defaultValue={(field.value ?? []).join(', ')}
        onBlur={(e) => { helpers.setValue(e.target.value.split(',').map((s) => s.trim()).filter(Boolean)); helpers.setTouched(true, false); }}
      />
      {invalid ? <span className="field-error" role="alert">{String(meta.error)}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
function Submit({ children, disabled, isSubmitting, isValid, dirty }: { children: ReactNode; disabled?: boolean; isSubmitting: boolean; isValid: boolean; dirty?: boolean }) {
  return (
    <Button type="submit" variant="primary" disabled={disabled || isSubmitting || !isValid || dirty === false}>
      {children}
    </Button>
  );
}
const run = <T,>(fn: (v: T) => Promise<void> | void) => async (values: T, h: FormikHelpers<T>) => {
  try {
    await fn(values);
  } catch (e) {
    h.setStatus((e as Error).message);
  } finally {
    h.setSubmitting(false);
  }
};
const Status = ({ status }: { status?: string }) => (status ? <p className="field-error" role="alert">{status}</p> : null);

export type WorkspaceValues = { repositoryRoot: string; targetProject: string; referenceScope: string; featurePatterns: string[]; sourcePatterns: string[]; selectorPatterns: string[]; ignoredDirectories: string[] };
export function WorkspaceForm({ initial, onSubmit }: { initial: WorkspaceValues; onSubmit: (v: WorkspaceValues) => Promise<void> }) {
  return (
    <Formik initialValues={initial} validationSchema={workspaceSchema} validateOnMount onSubmit={run(onSubmit)}>
      {({ isSubmitting, isValid, status, values, setFieldValue }) => (
        <Form className="form-stack" noValidate>
          <p className="subtle">Point the scanner at a C# SpecFlow + Playwright repository. Indexing is read-only.</p>
          <TextField name="repositoryRoot" label="REPOSITORY ROOT" hint="Absolute path to the repository you want to author tests in." />
          <TextField name="targetProject" label="TARGET PROJECT / DIRECTORY" hint={'"." for the root, a folder, or a path to a .csproj.'} />
          <div className="field-label">
            <label htmlFor="f-referenceScope">REFERENCE SCOPE</label>
            <FormikSelect id="f-referenceScope" name="referenceScope" ariaLabel="Reference scope" options={[{ value: 'DirectReferences', label: 'Target + direct project references' }, { value: 'TargetOnly', label: 'Target project only' }]} />
          </div>
          <details className="code-details">
            <summary>Advanced scan patterns</summary>
            <ListField name="featurePatterns" label="FEATURE PATTERNS" hint="Comma separated, e.g. **/*.feature" />
            <ListField name="sourcePatterns" label="SOURCE PATTERNS" hint="Comma separated, e.g. **/*.cs" />
            <ListField name="selectorPatterns" label="DICTIONARY XML PATTERNS" hint="e.g. **/Dictionaries/**/*.xml" />
            <ListField name="ignoredDirectories" label="IGNORED DIRECTORIES" hint="Folder names, e.g. bin, obj" />
            <Button type="button" variant="ghost" size="tiny" onClick={() => setFieldValue('selectorPatterns', ['**/Dictionaries/**/*.xml'])} disabled={values.selectorPatterns.join() === '**/Dictionaries/**/*.xml'}>
              <FolderSearch size={12} />Only scan Dictionaries/ for XML
            </Button>
          </details>
          <Status status={status} />
          <Submit isSubmitting={isSubmitting} isValid={isValid}><RefreshCw size={16} />{isSubmitting ? 'Scanning…' : 'Scan workspace'}</Submit>
        </Form>
      )}
    </Formik>
  );
}

export function RecordForm({ initialUrl, recentUrls, onSubmit }: { initialUrl: string; recentUrls: string[]; onSubmit: (url: string) => Promise<void> }) {
  return (
    <Formik initialValues={{ url: initialUrl }} validationSchema={recordSchema} validateOnMount onSubmit={run((v: { url: string }) => onSubmit(v.url.trim()))}>
      {({ isSubmitting, isValid, status }) => (
        <Form className="form-stack" noValidate>
          <p className="subtle">A local Chromium window will open. Navigate, click, type, and press keys to capture actions.</p>
          <TextField name="url" label="START URL" list="recent-urls" autoFocus hint="Must start with http:// or https://. Recent URLs are suggested." />
          <datalist id="recent-urls">{recentUrls.map((u) => <option key={u} value={u} />)}</datalist>
          <div className="info-box">Passwords and fields marked as sensitive are redacted. Review recordings before sharing.</div>
          <Status status={status} />
          <Submit isSubmitting={isSubmitting} isValid={isValid}><Play size={16} />{isSubmitting ? 'Launching…' : 'Launch browser'}</Submit>
        </Form>
      )}
    </Formik>
  );
}

export function NewFeatureForm({ initialFile, existing, folders, onSubmit }: { initialFile: string; existing: string[]; folders: string[]; onSubmit: (v: { file: string; name: string }) => void }) {
  const guessName = (f: string) => (f.split('/').pop() ?? '').replace(/\.feature$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  return (
    <Formik initialValues={{ file: initialFile, name: guessName(initialFile) || 'New feature' }} validationSchema={featureFileSchema(existing)} validateOnMount onSubmit={run(onSubmit)}>
      {({ isSubmitting, isValid, status, values, setFieldValue, touched }) => (
        <Form className="form-stack" noValidate>
          <TextField name="file" label="FEATURE FILE" list="new-feature-folders" autoFocus hint="Repository-relative, e.g. Features/Checkout/PlaceOrder.feature. New folders are created on approval." />
          <datalist id="new-feature-folders">{folders.map((f) => <option key={f} value={`${f}/`} />)}</datalist>
          <TextField name="name" label="FEATURE NAME" />
          {!touched.name && guessName(values.file) && guessName(values.file) !== values.name && (
            <Button type="button" variant="ghost" size="tiny" onClick={() => setFieldValue('name', guessName(values.file))}>Use “{guessName(values.file)}”</Button>
          )}
          <p className="subtle">The file will only be written after you review and approve its diff.</p>
          <Status status={status} />
          <Submit isSubmitting={isSubmitting} isValid={isValid}>Create draft<ArrowRight size={15} /></Submit>
        </Form>
      )}
    </Formik>
  );
}

export function ParametersForm({ binding, onSubmit }: { binding: Binding; onSubmit: (values: Record<string, string>) => void }) {
  const initial = Object.fromEntries(binding.parameters.map((p) => [p.name, '']));
  return (
    <Formik initialValues={initial} validationSchema={parametersSchema(binding.parameters)} validateOnMount onSubmit={run(onSubmit)}>
      {({ isSubmitting, isValid }) => (
        <Form className="form-stack" noValidate>
          <code className="binding-code">{binding.keyword} {binding.pattern}</code>
          {binding.parameters.map((p, i) => (
            <TextField key={p.name} name={p.name} label={`${p.name} · ${p.type}`} as={p.type === 'Table' ? 'textarea' : undefined} rows={p.type === 'Table' ? 5 : undefined} placeholder={p.type === 'Table' ? '| column |\n| value |' : `Enter ${p.name}`} autoFocus={i === 0} />
          ))}
          {!binding.parameters.length && <p className="subtle">This step does not require parameters.</p>}
          <Submit isSubmitting={isSubmitting} isValid={isValid}><Plus size={16} />Add existing step</Submit>
        </Form>
      )}
    </Formik>
  );
}

export function RunForm({ initial, running, onSubmit, projects }: { initial: { project: string; filter: string }; running: boolean; onSubmit: (v: { project: string; filter: string }) => Promise<void>; projects: string[] }) {
  return (
    <Formik initialValues={initial} validationSchema={runSchema} validateOnMount onSubmit={run(onSubmit)}>
      {({ isSubmitting, isValid, status }) => (
        <Form className="form-stack" noValidate>
          <p className="subtle">This explicitly runs repository test code through dotnet test. Save the feature first. Indexing itself never executes repository code.</p>
          <TextField name="project" label="TEST PROJECT" list="run-projects" placeholder="src/Tests/Tests.csproj" />
          <datalist id="run-projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
          <TextField name="filter" label="TEST FILTER" placeholder="FullyQualifiedName~SearchForDayforce" hint="Required so the whole suite never runs by accident." />
          <Status status={status} />
          <Submit isSubmitting={isSubmitting} isValid={isValid} disabled={running}><Play size={15} />{running ? 'Running…' : 'Run selected tests'}</Submit>
        </Form>
      )}
    </Formik>
  );
}

export type DictionaryEntryValues = { dictionaryFile: string; selectors: { type: string; value: string }[] };
export function DictionaryEntryForm({ initial, files, onSubmit, busy }: { initial: DictionaryEntryValues; files: string[]; onSubmit: (v: DictionaryEntryValues) => Promise<void>; busy?: boolean }) {
  return (
    <Formik initialValues={initial} validationSchema={dictionaryEntrySchema} validateOnMount enableReinitialize onSubmit={run(onSubmit)}>
      {({ values, errors, touched, isSubmitting, isValid, status }) => (
        <Form className="form-stack" noValidate>
          <TextField name="dictionaryFile" label="DICTIONARY FILE" list="dictionary-files" hint="Existing files are appended to; a new path creates the file." />
          <datalist id="dictionary-files">{files.map((f) => <option key={f} value={f} />)}</datalist>
          <FieldArray name="selectors">
            {({ push, remove, move }) => (
              <>
                {values.selectors.map((_, i) => {
                  const err = (errors.selectors as { value?: string }[] | undefined)?.[i]?.value;
                  const show = (touched.selectors as { value?: boolean }[] | undefined)?.[i]?.value && err;
                  return (
                    <div key={i} className="selector-row-wrap">
                      <div className="selector-row">
                        <FormikSelect name={`selectors.${i}.type`} ariaLabel={`Selector ${i + 1} type`} options={selectorTypes} />
                        <Field name={`selectors.${i}.value`} aria-label={`Selector ${i + 1} value`} placeholder="Selector value" aria-invalid={!!show} />
                        <span className="row-buttons">
                          <button type="button" className="icon-button" aria-label={`Move selector ${i + 1} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                          <button type="button" className="icon-button" aria-label="Remove selector" disabled={values.selectors.length === 1} onClick={() => remove(i)}><Trash2 size={14} /></button>
                        </span>
                      </div>
                      {show && <span className="field-error" role="alert">{err}</span>}
                    </div>
                  );
                })}
                {typeof errors.selectors === 'string' && <span className="field-error" role="alert">{errors.selectors}</span>}
                <Button type="button" variant="ghost" size="tiny" onClick={() => push({ type: 'text', value: '' })} disabled={values.selectors.length >= 10}><Plus size={13} />Add selector</Button>
              </>
            )}
          </FieldArray>
          <ErrorMessage name="dictionaryFile">{() => null}</ErrorMessage>
          <Status status={status} />
          <Submit isSubmitting={isSubmitting || !!busy} isValid={isValid}>Preview dictionary change</Submit>
        </Form>
      )}
    </Formik>
  );
}
