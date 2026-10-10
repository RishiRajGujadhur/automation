export type Source = { file: string; line: number };
export type Binding = Source & {
  id: string;
  keyword: string;
  pattern: string;
  className: string;
  method: string;
  parameters: { name: string; type: string }[];
  usages: number;
  examples: string[];
  expression?: 'Regex' | 'Cucumber';
  scopes?: { tag: string; feature: string; scenario: string }[];
};
export type Step = Source & {
  keyword: string;
  text: string;
  status: string;
  candidates: string[];
  argument?: unknown;
};
export type Feature = Source & {
  name: string;
  source: string;
  tags: string[];
  scenarios: { name: string; keyword: string; steps: Step[]; examples: unknown[]; line: number; tags?: string[] }[];
  backgrounds: { name: string; steps: Step[]; line: number }[];
};
export type Selector = Source & {
  id?: string;
  owner: string;
  member: string;
  type: string;
  value: string;
  resolution: string;
};
export type Index = {
  stats?: { steps:number;selectors:number;features:number;scenarios:number;backgrounds:number;dictionaries:number;methods:number };
  revision?:string;
  dictionaryEntries?: DictionaryEntry[];
  schemaVersion: number;
  workspace: string;
  features: Feature[];
  stepDefinitions: Binding[];
  selectors: Selector[];
  methods: (Source & { id: string; owner: string; name: string })[];
  callEdges: { from: string; to: string; resolution: string }[];
  diagnostics: string[];
};
export type DictionaryEntry = Source & {id:string;page:string;section:string;field:string;fieldType:string;selectors:{type:string;value:string;line:number;code:string|null;supported:boolean;warnings:string[]}[]};
export type StepPage={items:Binding[];offset:number;limit:number;hasNext:boolean;total:number;indexedTotal:number};
export type Action = {
  id: string;
  action: 'goto' | 'fill' | 'press' | 'click';
  url?: string;
  value?: string;
  key?: string;
  target?: { role?: string; name?: string; testId?: string; description?: string };
  sensitive?: boolean;
};
export type Match = {
  action: Action;
  candidates: { binding: Binding; score: number; reasons: string[]; text: string }[];
};
