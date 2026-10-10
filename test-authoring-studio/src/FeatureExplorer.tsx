import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FileCode2,
  Plus,
  Search,
  X,
  Copy,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
} from 'lucide-react';
import { RowMenu, copyText } from './ui';
import {
  buildFeatureTree,
  normalizeFeaturePath,
  parentFolders,
  type FeatureNode,
} from './featureTree';
import type { Feature } from './types';

type Props = {
  features: Feature[];
  selectedFile?: string;
  query: string;
  activeFolder: string;
  onQuery: (query: string) => void;
  onSelect: (feature: Feature) => void;
  onFolder: (folder: string) => void;
  onNew: (folder?: string) => void;
  onSource?: (file: string, line: number) => void;
};
export default function FeatureExplorer({
  features,
  selectedFile,
  query,
  activeFolder,
  onQuery,
  onSelect,
  onFolder,
  onNew,
  onSource,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildFeatureTree(features, query), [features, query]);
  const searching = !!query.trim();
  useEffect(() => {
    if (!selectedFile) return;
    setCollapsed((previous) => {
      const next = new Set(previous);
      parentFolders(selectedFile).forEach((p) => next.delete(p));
      return next;
    });
  }, [selectedFile]);
  const collapseAll = () => {
    const all = new Set<string>();
    const walk = (nodes: FeatureNode[]) => nodes.forEach((n) => { if (n.kind === 'folder') { all.add(n.path); walk(n.children); } });
    walk(tree);
    setCollapsed(all);
  };
  const count = tree.reduce((total, node) => total + (node.kind === 'folder' ? node.count : 1), 0);
  const render = (nodes: FeatureNode[], depth = 0) => (
    <ul className="folder-children">
      {nodes.map((node) => {
        if (node.kind === 'file')
          return (
            <RowMenu key={node.path} items={[
              { label: 'Open in editor', icon: FileCode2, onSelect: () => onSelect(node.feature) },
              ...(onSource ? [{ label: 'View source', icon: Eye, onSelect: () => onSource(node.feature.file, 1) }] : []),
              { label: 'Copy path', icon: Copy, onSelect: () => copyText(node.feature.file) },
              'separator' as const,
              { label: 'New feature beside this', icon: Plus, onSelect: () => onNew(node.path.split('/').slice(0, -1).join('/')) },
            ]}>
            <li>
              <button
                className={`explorer-file ${normalizeFeaturePath(selectedFile ?? '') === node.path ? 'selected' : ''}`}
                style={{ paddingLeft: 12 + depth * 14 }}
                title={node.path}
                aria-current={
                  normalizeFeaturePath(selectedFile ?? '') === node.path ? 'page' : undefined
                }
                onClick={() => onSelect(node.feature)}
              >
                <FileCode2 size={15} />
                <span>{node.name}</span>
              </button>
            </li>
            </RowMenu>
          );
        const expanded = searching || !collapsed.has(node.path);
        return (
          <RowMenu key={node.path} items={[
            { label: 'New feature here', icon: Plus, onSelect: () => onNew(node.path) },
            { label: expanded ? 'Collapse' : 'Expand', icon: expanded ? ChevronsDownUp : ChevronsUpDown, onSelect: () => setCollapsed((prev) => { const next = new Set(prev); if (expanded) next.add(node.path); else next.delete(node.path); return next; }) },
            { label: 'Collapse all folders', icon: ChevronsDownUp, onSelect: collapseAll },
            { label: 'Expand all folders', icon: ChevronsUpDown, onSelect: () => setCollapsed(new Set()) },
            'separator' as const,
            { label: 'Copy folder path', icon: Copy, onSelect: () => copyText(node.path) },
          ]}>
          <li>
            <div
              className={`explorer-folder-row ${activeFolder === node.path ? 'active-folder' : ''}`}
            >
              <button
                className="explorer-folder"
                style={{ paddingLeft: 8 + depth * 14 }}
                title={node.path}
                aria-label={`${expanded ? 'Collapse' : 'Expand'} folder ${node.path}`}
                aria-expanded={expanded}
                onClick={() => {
                  onFolder(node.path);
                  if (!searching)
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (expanded) next.add(node.path);
                      else next.delete(node.path);
                      return next;
                    });
                }}
              >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{' '}
                {expanded ? <FolderOpen size={15} /> : <Folder size={15} />}
                <span>{node.name}</span>
                <small>{node.count}</small>
              </button>
              <button
                className="folder-add icon-button"
                aria-label={`New feature in ${node.path}`}
                title={`New feature in ${node.path}`}
                onClick={() => onNew(node.path)}
              >
                <Plus size={13} />
              </button>
            </div>
            {expanded && render(node.children, depth + 1)}
          </li>
          </RowMenu>
        );
      })}
    </ul>
  );
  return (
    <section className="feature-explorer" data-tour="explorer" aria-label="Feature explorer">
      <div className="sidebar-heading">
        <span>EXPLORER</span>
        <button className="icon-button" aria-label="Collapse all folders" title="Collapse all folders" onClick={collapseAll}>
          <ChevronsDownUp size={15} />
        </button>
        <button
          className="icon-button"
          aria-label="New feature"
          data-tour="new-feature"
          onClick={() => onNew()}
        >
          <Plus size={16} />
        </button>
      </div>
      <label className="search-box">
        <Search size={15} />
        <input
          aria-label="Search features"
          placeholder="Search files, folders, features…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.stopPropagation(); onQuery(''); } }}
        />
        {query ? (
          <button
            className="icon-button"
            aria-label="Clear feature search"
            onClick={() => onQuery('')}
          >
            <X size={13} />
          </button>
        ) : (
          <kbd title="Press / to search features">/</kbd>
        )}
      </label>
      <div className="explorer-summary" role="status">
        {searching ? `${count} of ${features.length} files` : `${features.length} feature files`}
        {searching && <span>Matching folders expanded</span>}
      </div>
      <nav className="folder-tree" aria-label="Feature folders">
        {render(tree)}
      </nav>
      {!count && (
        <p className="explorer-empty">
          {searching
            ? 'No features match your search.'
            : 'No feature files yet. Create a draft to get started.'}
        </p>
      )}
      <button className="new-feature" onClick={() => onNew()}>
        <Plus size={15} />
        New feature
      </button>
    </section>
  );
}
