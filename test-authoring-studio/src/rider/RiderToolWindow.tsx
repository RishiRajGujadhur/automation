import StructurePanel from './StructurePanel';

/** Rider tool windows shown as tabs of the bottom panel (id → tab title). */
export const RIDER_TOOLS = {
  structure: 'Structure',
} as const;
export type RiderTool = keyof typeof RIDER_TOOLS;

export default function RiderToolWindow({ tool, onOpen, onClose }: { tool: RiderTool; onOpen: (file: string, line: number, column: number) => void; onNotice: (m: string) => void; onClose: () => void }) {
  if (tool === 'structure') return <StructurePanel onOpen={onOpen} onClose={onClose} />;
  return null;
}
