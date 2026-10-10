export async function api<T = any>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const r = await fetch(
    `/api${url}`,
    body === undefined
      ? { signal }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}
export type Paged<T> = { items: T[]; total: number; hasNext: boolean; indexedTotal?: number };
export type Check = { id: string; label: string; status: 'pass' | 'warn' | 'fail' | 'skip'; detail: string; file?: string; line?: number };
export type Verification = {
  url: string;
  source: string;
  results: { type: string; value: string; count: number; visible?: boolean; status: 'verified' | 'multiple' | 'none' | 'unsupported' | 'error'; error?: string }[];
};
export type FilePreview = { id: string; file: string; diff: string; changed: boolean; notes?: string[]; changes?: string[]; created?: boolean };
export type ProjectModel = {
  root: string;
  projects: string[];
  packages: string[];
  frameworks: string[];
  layers: Record<string, number>;
  indicators: { label: string; ok: boolean }[];
  files: { file: string; layer: string }[];
  truncated: boolean;
};
