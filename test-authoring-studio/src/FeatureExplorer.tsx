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
} from 'lucide-react';
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
  const count = tree.reduce((total, node) => total + (node.kind === 'folder' ? node.count : 1), 0);
  const render = (nodes: FeatureNode[], depth = 0) => (
    <ul className="folder-children">
      {nodes.map((node) => {
        if (node.kind === 'file')
          return (
            <li key={node.path}>
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
          );
        const expanded = searching || !collapsed.has(node.path);
        return (
          <li key={node.path}>
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
        );
      })}
    </ul>
  );
  return (
    <section className="feature-explorer" data-tour="explorer" aria-label="Feature explorer">
      <div className="sidebar-heading">
        <span>EXPLORER</span>
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
          <kbd>Ctrl K</kbd>
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
