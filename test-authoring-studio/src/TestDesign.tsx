import * as Tabs from '@radix-ui/react-tabs';
import { lazy, Suspense } from 'react';
import { Table2, Library, ListChecks, Workflow, ShieldCheck, Activity, Filter, BookOpenText, FlaskConical, type LucideIcon } from 'lucide-react';
import { useLocalState } from './ui';
import { useCorpus, type ToolProps } from './design/shared';

const ExamplesTool = lazy(() => import('./design/ExamplesTool'));
const StepLibraryTool = lazy(() => import('./design/StepLibraryTool'));
const SuiteTool = lazy(() => import('./design/SuiteTool'));
const FlowTool = lazy(() => import('./design/FlowTool'));
const QualityTool = lazy(() => import('./design/QualityTool'));
const ResultsTool = lazy(() => import('./design/ResultsTool'));
const PlansTool = lazy(() => import('./design/PlansTool'));
const DocsTool = lazy(() => import('./design/DocsTool'));
const TextLabTool = lazy(() => import('./design/TextLabTool'));

export const designTools: { id: string; label: string; icon: LucideIcon; description: string; C: React.ComponentType<ToolProps> }[] = [
  { id: 'examples', label: 'Examples generator', icon: Table2, description: 'Pairwise / t-way Examples tables, boundary values and decision tables.', C: ExamplesTool },
  { id: 'library', label: 'Step library', icon: Library, description: 'Reusable steps, parameterization, clusters and rename-everywhere.', C: StepLibraryTool },
  { id: 'suite', label: 'Suite optimizer', icon: ListChecks, description: 'Minimal covering suite and run-order prioritization.', C: SuiteTool },
  { id: 'flow', label: 'Flow generator', icon: Workflow, description: 'Scenarios from a state machine with coverage criteria.', C: FlowTool },
  { id: 'quality', label: 'Duplicates & smells', icon: ShieldCheck, description: 'Scenario smells, duplicate scenarios and readability.', C: QualityTool },
  { id: 'results', label: 'Results & flakiness', icon: Activity, description: 'Import JUnit/Cucumber reports and rank flaky scenarios.', C: ResultsTool },
  { id: 'plans', label: 'Plans & filters', icon: Filter, description: 'Tag expressions, saved filters and test cycles.', C: PlansTool },
  { id: 'docs', label: 'Living docs', icon: BookOpenText, description: 'Browsable HTML/Markdown specification with status.', C: DocsTool },
  { id: 'lab', label: 'Similarity lab', icon: FlaskConical, description: 'Compare two steps with every similarity measure.', C: TextLabTool },
];
export const DESIGN_TOOL_EVENT = 'tas:design-tool';

/** Test Design: deterministic algorithms over the feature corpus, one tool per tab (last tab remembered). */
export default function TestDesign({ revision, ...props }: Omit<ToolProps, 'corpus'> & { revision?: string }) {
  const [tool, setTool] = useLocalState('design:tool', 'examples');
  const { corpus, error } = useCorpus(revision);
  const current = designTools.some((t) => t.id === tool) ? tool : 'examples';
  return (
    <Tabs.Root className="test-design" value={current} onValueChange={setTool} orientation="vertical">
      <Tabs.List className="design-tabs" aria-label="Test design tools">
        {designTools.map((t) => (
          <Tabs.Trigger key={t.id} value={t.id} className="design-tab" title={t.description}>
            <t.icon size={16} aria-hidden="true" />
            <span>{t.label}</span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {designTools.map((t) => (
        <Tabs.Content key={t.id} value={t.id} className="design-panel">
          <p className="design-intro">{t.description}</p>
          {error && <p className="field-error" role="alert">Could not load features: {error}</p>}
          <Suspense fallback={<p className="subtle">Loading…</p>}>{current === t.id && <t.C corpus={corpus} {...props} />}</Suspense>
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
