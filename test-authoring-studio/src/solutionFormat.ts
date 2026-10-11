/**
 * Visual Studio solutions: the classic text `.sln` and the XML `.slnx` (VS 2022 17.13+ / VS 2026), parsed into
 * solution folders, projects and configurations, the way Solution Explorer shows them.
 */
export type SolutionNode =
  | { kind: 'folder'; name: string; children: SolutionNode[] }
  | { kind: 'project'; name: string; file: string };
export type ParsedSolution = { tree: SolutionNode[]; projects: { name: string; file: string }[]; configurations: string[] };

const FOLDER_TYPE = '2150E333-8FDC-42A3-9474-1A3956D46DE8';
const norm = (p: string) => p.replaceAll('\\', '/').replace(/^\.\//, '');

/** Classic `.sln`: Project(...) lines, solution folders (by type GUID), NestedProjects and configurations. */
export function parseSln(text: string): ParsedSolution {
  type Entry = { guid: string; name: string; path: string; folder: boolean };
  const entries = new Map<string, Entry>();
  for (const m of text.matchAll(/^Project\("\{([0-9A-F-]+)\}"\)\s*=\s*"([^"]*)",\s*"([^"]*)",\s*"\{([0-9A-F-]+)\}"/gim)) {
    entries.set(m[4].toUpperCase(), { guid: m[4].toUpperCase(), name: m[2], path: norm(m[3]), folder: m[1].toUpperCase() === FOLDER_TYPE });
  }
  const parent = new Map<string, string>();
  const nested = /GlobalSection\(NestedProjects\)[^\n]*\n([\s\S]*?)EndGlobalSection/i.exec(text)?.[1] ?? '';
  for (const m of nested.matchAll(/\{([0-9A-F-]+)\}\s*=\s*\{([0-9A-F-]+)\}/gi)) parent.set(m[1].toUpperCase(), m[2].toUpperCase());
  const configs = /GlobalSection\(SolutionConfigurationPlatforms\)[^\n]*\n([\s\S]*?)EndGlobalSection/i.exec(text)?.[1] ?? '';
  const configurations = [...configs.matchAll(/^\s*([^=\r\n]+?)\s*=/gm)].map((m) => m[1]);
  const nodes = new Map<string, SolutionNode>();
  for (const e of entries.values()) nodes.set(e.guid, e.folder ? { kind: 'folder', name: e.name, children: [] } : { kind: 'project', name: e.name, file: e.path });
  const tree: SolutionNode[] = [];
  for (const e of entries.values()) {
    const node = nodes.get(e.guid)!;
    const p = parent.get(e.guid);
    const host = p ? nodes.get(p) : undefined;
    if (host?.kind === 'folder') host.children.push(node); else tree.push(node);
  }
  const projects = [...entries.values()].filter((e) => !e.folder && /\.(cs|vb|fs)proj$/i.test(e.path)).map((e) => ({ name: e.name, file: e.path }));
  return { tree: sortTree(tree), projects, configurations };
}

/** `.slnx`: <Solution><Folder Name="/Tests/"><Project Path="…" /></Folder><Project Path="…" /></Solution>. */
export function parseSlnx(text: string): ParsedSolution {
  const tree: SolutionNode[] = [];
  const projects: { name: string; file: string }[] = [];
  const folders = new Map<string, Extract<SolutionNode, { kind: 'folder' }>>();
  const folderFor = (full: string) => {
    // "/Tests/Ui/" → nested folders Tests → Ui
    const parts = full.split('/').filter(Boolean);
    let children = tree;
    let key = '';
    let folder: Extract<SolutionNode, { kind: 'folder' }> | undefined;
    for (const name of parts) {
      key += `/${name}`;
      folder = folders.get(key);
      if (!folder) { folder = { kind: 'folder', name, children: [] }; folders.set(key, folder); children.push(folder); }
      children = folder.children;
    }
    return children;
  };
  const attr = (tag: string, name: string) => new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)?.[1];
  // Walk tags in order, tracking the open <Folder>.
  const stack: SolutionNode[][] = [tree];
  for (const m of text.matchAll(/<\s*(\/?)\s*(Folder|Project)\b([^>]*?)(\/?)>/gi)) {
    const [, closing, tag, attrs, selfClosing] = m;
    if (tag.toLowerCase() === 'folder') {
      if (closing) { stack.pop(); continue; }
      const children = folderFor(attr(attrs, 'Name') ?? '/');
      if (!selfClosing) stack.push(children);
      continue;
    }
    if (closing) continue;
    const file = norm(attr(attrs, 'Path') ?? '');
    if (!file) continue;
    const name = (file.split('/').pop() ?? file).replace(/\.\w+proj$/i, '');
    stack[stack.length - 1].push({ kind: 'project', name, file });
    projects.push({ name, file });
  }
  const configurations = [...text.matchAll(/<BuildType\s+Name="([^"]+)"/gi)].map((m) => m[1]);
  return { tree: sortTree(tree), projects, configurations: configurations.length ? configurations : ['Debug', 'Release'] };
}

const sortTree = (nodes: SolutionNode[]): SolutionNode[] => {
  nodes.sort((a, b) => (a.kind !== b.kind ? (a.kind === 'folder' ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true })));
  for (const n of nodes) if (n.kind === 'folder') sortTree(n.children);
  return nodes;
};

