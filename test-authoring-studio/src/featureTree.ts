import type { Feature } from './types';

export type FeatureFolder = {
  kind: 'folder';
  name: string;
  path: string;
  children: FeatureNode[];
  count: number;
};
export type FeatureNode =
  FeatureFolder | { kind: 'file'; name: string; path: string; feature: Feature };
export const normalizeFeaturePath = (file: string) =>
  file.replaceAll('\\', '/').replace(/^\.\//, '');
export function parentFolders(file: string): string[] {
  const parts = normalizeFeaturePath(file).split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}
export function featureDirectory(file?: string) {
  return file ? (parentFolders(file).at(-1) ?? '') : 'Features';
}
export function buildFeatureTree(features: Feature[], query = ''): FeatureNode[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const roots: FeatureNode[] = [];
  for (const feature of features) {
    const file = normalizeFeaturePath(feature.file);
    if (!terms.every((term) => `${feature.name} ${file}`.toLocaleLowerCase().includes(term)))
      continue;
    const parts = file.split('/');
    let children = roots;
    parts.forEach((name, i) => {
      const nodePath = parts.slice(0, i + 1).join('/');
      if (i === parts.length - 1) children.push({ kind: 'file', name, path: nodePath, feature });
      else {
        let folder = children.find(
          (n): n is FeatureFolder => n.kind === 'folder' && n.path === nodePath,
        );
        if (!folder) {
          folder = { kind: 'folder', name, path: nodePath, children: [], count: 0 };
          children.push(folder);
        }
        folder.count++;
        children = folder.children;
      }
    });
  }
  const sort = (nodes: FeatureNode[]) => {
    nodes.sort((a, b) =>
      a.kind !== b.kind
        ? a.kind === 'folder'
          ? -1
          : 1
        : a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    nodes.forEach((n) => {
      if (n.kind === 'folder') sort(n.children);
    });
  };
  sort(roots);
  return roots;
}
