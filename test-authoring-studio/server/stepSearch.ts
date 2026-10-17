import { Worker } from 'node:worker_threads';
import type { Binding, DictionaryEntry, Selector } from '../src/types.js';
type Background = { name: string; file: string; line: number; steps: { keyword: string; text: string }[] };
type Collection<T> = { items: T[]; facet: (item: T) => string | string[]; text: (item: T) => string };
/** One worker thread hosting FlexSearch indexes for every searchable collection of a scan. */
export class WorkspaceSearch {
  private worker = new Worker(new URL('./search-worker.mjs', import.meta.url));
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private sequence = 0;
  private collections = new Map<string, unknown[]>();
  readonly byId: Map<string, Binding>;
  readonly ready: Promise<unknown>;
  constructor(sets: { steps: Binding[]; selectors: Selector[]; dictionaries: DictionaryEntry[]; backgrounds: Background[] }) {
    this.byId = new Map(sets.steps.map((b) => [b.id, b]));
    this.worker.on('message', ({ id, result, error }) => {
      const job = this.pending.get(id);
      this.pending.delete(id);
      if (error) job?.reject(new Error(error));
      else job?.resolve(result);
    });
    this.worker.on('error', (error) => {
      for (const job of this.pending.values()) job.reject(error as Error);
      this.pending.clear();
    });
    this.ready = Promise.all([
      this.add('steps', { items: sets.steps, facet: (b) => (b.keyword === 'StepDefinition' ? ['Given', 'When', 'Then'] : b.keyword), text: (b) => [b.pattern, b.className, b.method, b.file, ...b.parameters.map((p) => p.name), ...b.examples].join(' ') }),
      this.add('selectors', { items: sets.selectors, facet: (s) => s.type, text: (s) => [s.owner, s.member, s.type, s.value, s.file].join(' ') }),
      this.add('dictionaries', { items: sets.dictionaries, facet: () => '', text: (e) => [e.page, e.section, e.field, e.fieldType, e.file, ...e.selectors.map((s) => s.value)].join(' ') }),
      this.add('backgrounds', { items: sets.backgrounds, facet: () => '', text: (b) => [b.name, b.file, ...b.steps.map((s) => s.text)].join(' ') }),
    ]);
    this.ready.catch(() => {});
  }
  private add<T>(name: string, c: Collection<T>) {
    this.collections.set(name, c.items);
    return this.request({ kind: 'init', collection: name, documents: c.items.map((item, id) => ({ id, facet: c.facet(item), text: c.text(item) })) });
  }
  private request(data: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, ...data });
    });
  }
  async query<T>(collection: string, query = '', offset = 0, limit = 25, facet = '') {
    await this.ready;
    const items = (this.collections.get(collection) ?? []) as T[];
    const result = await this.request({ kind: 'search', collection, query, offset, limit, facet });
    return { items: result.ids.map((id: number) => items[id]) as T[], offset, limit, hasNext: result.hasNext as boolean, total: result.total as number, indexedTotal: items.length };
  }
  search(query = '', offset = 0, limit = 25, keyword = '') {
    return this.query<Binding>('steps', query, offset, limit, keyword);
  }
  async close() {
    for (const job of this.pending.values()) job.reject(new Error('Workspace changed. Retry the search.'));
    this.pending.clear();
    await this.worker.terminate();
  }
}
