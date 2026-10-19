import StructurePanel from './StructurePanel';
import HierarchyPanel from './HierarchyPanel';
import ProblemsPanel from './ProblemsPanel';
import ShelfPanel from './ShelfPanel';
import GitLogPanel from './GitLogPanel';
import NotificationsPanel from './NotificationsPanel';
import { lazy, Suspense } from 'react';

const TerminalPanel = lazy(() => import('./TerminalPanel'));

/** Rider tool windows shown as tabs of the bottom panel (id → tab title). */
export const RIDER_TOOLS = {
  structure: 'Structure',
  hierarchy: 'Hierarchy',
  problems: 'Problems',
  terminal: 'Terminal',
  shelf: 'Shelf',
  gitlog: 'Git Log',
  notifications: 'Notifications',
} as const;
export type RiderTool = keyof typeof RIDER_TOOLS;

export default function RiderToolWindow({ tool, onOpen, onNotice, onClose }: { tool: RiderTool; onOpen: (file: string, line: number, column: number) => void; onNotice: (m: string) => void; onClose: () => void }) {
  if (tool === 'structure') return <StructurePanel onOpen={onOpen} onClose={onClose} />;
  if (tool === 'hierarchy') return <HierarchyPanel onOpen={onOpen} onClose={onClose} />;
  if (tool === 'problems') return <ProblemsPanel onOpen={onOpen} onClose={onClose} />;
  if (tool === 'terminal') return <Suspense fallback={null}><TerminalPanel onClose={onClose} /></Suspense>;
  if (tool === 'shelf') return <ShelfPanel onOpen={(f) => onOpen(f, 1, 1)} onNotice={onNotice} onClose={onClose} />;
  if (tool === 'gitlog') return <GitLogPanel onOpen={(f) => onOpen(f, 1, 1)} onNotice={onNotice} onClose={onClose} />;
  if (tool === 'notifications') return <NotificationsPanel onClose={onClose} />;
  return null;
}
