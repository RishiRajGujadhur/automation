import * as Yup from 'yup';

/** Repository-relative path: no drive letters, no leading slash, no `..` segments, forward slashes. */
const relativePath = (label: string) =>
  Yup.string()
    .trim()
    .required(`${label} is required.`)
    .test('relative', `${label} must be relative to the repository (no drive letter or leading /).`, (v) => !v || (!/^[A-Za-z]:/.test(v) && !/^[\\/]/.test(v)))
    .test('no-parent', `${label} cannot contain ".." segments.`, (v) => !v || !v.split(/[\\/]/).includes('..'))
    .test('no-backslash', 'Use forward slashes (/) in paths.', (v) => !v || !v.includes('\\'))
    .test('chars', `${label} contains characters that are not allowed in file names (< > : " | ? *).`, (v) => !v || !/[<>:"|?*]/.test(v));

const globList = (label: string) =>
  Yup.array()
    .of(Yup.string().trim().required())
    .min(1, `Add at least one ${label} pattern.`)
    .test('no-abs', `${label} patterns must be relative globs.`, (v) => !v || v.every((g) => !/^[A-Za-z]:|^\//.test(g)));

export const workspaceSchema = Yup.object({
  repositoryRoot: Yup.string()
    .trim()
    .required('Repository root is required.')
    .test('absolute', 'Use an absolute path, e.g. C:/Source/MyTests or /home/me/tests.', (v) => !v || /^([A-Za-z]:[\\/]|\/|\\\\)/.test(v)),
  targetProject: Yup.string()
    .trim()
    .required('Target project is required. Use "." for the repository root.')
    .test('proj', 'Target must be ".", a folder, or a .csproj file.', (v) => !v || v === '.' || v.endsWith('.csproj') || !/\.[a-z]+$/i.test(v)),
  referenceScope: Yup.string().oneOf(['DirectReferences', 'TargetOnly']).required(),
  featurePatterns: globList('feature').test('feature-ext', 'Feature patterns should end with .feature.', (v) => !v || v.every((g) => /\.feature$|\*$/.test(g))),
  sourcePatterns: globList('source'),
  selectorPatterns: globList('dictionary XML'),
  ignoredDirectories: Yup.array().of(Yup.string().trim().required()),
});

export const recordSchema = Yup.object({
  url: Yup.string()
    .trim()
    .required('Enter the page to start recording on.')
    .test('protocol', 'Start with http:// or https://', (v) => !v || /^https?:\/\//i.test(v))
    .url('That is not a valid URL.'),
});

export const featureFileSchema = (existing: string[] = []) =>
  Yup.object({
    file: relativePath('Feature file')
      .test('ext', 'Feature files must end with .feature.', (v) => !v || /\.feature$/i.test(v))
      .test('name', 'Use a PascalCase file name, e.g. Features/Checkout/PlaceOrder.feature.', (v) => !v || /(^|\/)[A-Z][A-Za-z0-9]*\.feature$/.test(v))
      .test('exists', 'A feature with this path already exists. Open it from the explorer instead.', (v) => !v || !existing.map((e) => e.toLowerCase()).includes(v.toLowerCase())),
    name: Yup.string().trim().required('Give the feature a name.').max(120, 'Keep the feature name under 120 characters.'),
  });

export const runSchema = Yup.object({
  project: relativePath('Test project').test('csproj', 'Choose a .csproj file.', (v) => !v || v.endsWith('.csproj')),
  filter: Yup.string()
    .trim()
    .required('A filter is required so you never run the whole suite by accident.')
    .test('shape', 'Use a dotnet test filter, e.g. FullyQualifiedName~PlaceOrder or Category=Smoke.', (v) => !v || /^[A-Za-z.]+\s*(=|!=|~|!~)\s*\S+/.test(v)),
});

export const parametersSchema = (params: { name: string; type: string }[]) =>
  Yup.object(
    Object.fromEntries(
      params.map((p) => [
        p.name,
        p.type === 'Table'
          ? Yup.string().trim().required(`${p.name} needs at least a header row.`).test('table', 'Each table row must start and end with |.', (v) => !v || v.split('\n').filter((l) => l.trim()).every((l) => /^\s*\|.*\|\s*$/.test(l)))
          : /^(int|long|short|decimal|double|float)$/i.test(p.type)
            ? Yup.string().trim().required(`${p.name} is required.`).matches(/^-?\d+(\.\d+)?$/, `${p.name} must be a number (${p.type}).`)
            : /^bool/i.test(p.type)
              ? Yup.string().trim().required(`${p.name} is required.`).oneOf(['true', 'false'], `${p.name} must be true or false.`)
              : Yup.string().trim().required(`${p.name} is required.`).test('quotes', 'Remove double quotes; the step already wraps the value.', (v) => !v || !v.includes('"')),
      ]),
    ),
  );

export const selectorTypes = ['testid', 'ariarole.textbox', 'ariarole.button', 'ariarole.link', 'ariarole.combobox', 'ariarole.checkbox', 'ariarole.radio', 'ariarole.option', 'ariarole.tab', 'ariarole.menuitem', 'ariarole.heading', 'text', 'css', 'xpath'];
export const dictionaryEntrySchema = Yup.object({
  dictionaryFile: relativePath('Dictionary file').test('xml', 'Dictionary files must end with .xml.', (v) => !v || /\.xml$/i.test(v)),
  selectors: Yup.array()
    .of(
      Yup.object({
        type: Yup.string().oneOf(selectorTypes, 'Unsupported selector type.').required(),
        value: Yup.string().trim().required('Enter a selector value or remove this row.'),
      }),
    )
    .min(1, 'Add at least one selector.')
    .test('dupes', 'Two rows have the same type and value.', (v) => !v || new Set(v.map((s) => `${s.type}|${s.value}`)).size === v.length)
    .test('css-id-first', 'Put a test id or role selector first; CSS and XPath are fallbacks.', (v) => !v?.length || !['css', 'xpath'].includes(v[0].type) || v.length === 1),
});

export const recordingDictionarySchema = Yup.object({
  page: Yup.string().trim().required('Page name is required.').matches(/^[A-Za-z][A-Za-z0-9]*$/, 'Use letters and digits only, e.g. CheckoutPage.'),
  section: Yup.string().trim().required('Section is required.').max(80),
  file: relativePath('Dictionary file').test('xml', 'Dictionary files must end with .xml.', (v) => !v || /\.xml$/i.test(v)),
  // Optional: leave empty to update the dictionary only.
  pageObjectFile: Yup.string()
    .trim()
    .test('cs', 'Page objects must be .cs files.', (v) => !v || /\.cs$/i.test(v))
    .test('relative', 'Use a path inside the repository, e.g. Pages/CheckoutPage.cs.', (v) => !v || (!/^([a-z]:|[\\/])/i.test(v) && !v.split(/[\\/]/).includes('..'))),
});

export const generatorSchema = Yup.object({
  area: relativePath('Feature area'),
  featureFile: Yup.string().trim().required('Feature file name is required.').matches(/^[A-Za-z0-9]+\.feature$/, 'Use a single file name like PlaceOrder.feature (folders go in Feature area).'),
  scenarioName: Yup.string().trim().required('Name the scenario.'),
  scenarioText: Yup.string()
    .trim()
    .required('Add at least one step.')
    .test('keywords', 'Every line must start with Given, When, Then, And, But or *.', (v) => !v || v.split('\n').filter((l) => l.trim()).every((l) => /^\s*(Given|When|Then|And|But|\*)\s+\S/.test(l)))
    .test('first', 'The first step should start with Given, When or Then.', (v) => !v || /^\s*(Given|When|Then)\b/.test(v.split('\n').find((l) => l.trim()) ?? '')),
  page: Yup.string().trim(),
  section: Yup.string().trim().required('Section is required to resolve a selector.'),
  field: Yup.string().trim().required('Field is required to resolve a selector.'),
  value: Yup.string().when('action', { is: 'fill', then: (s) => s.required('Fill actions need test data.'), otherwise: (s) => s }),
  action: Yup.string().oneOf(['fill', 'click', 'visible']),
});

/** Synchronous validation helper for non-Formik state (returns field -> first message). */
export function validateSync(schema: Yup.AnySchema, values: unknown): Record<string, string> {
  try {
    schema.validateSync(values, { abortEarly: false });
    return {};
  } catch (e) {
    const out: Record<string, string> = {};
    for (const err of (e as Yup.ValidationError).inner ?? []) if (err.path && !out[err.path]) out[err.path] = err.message;
    return out;
  }
}
