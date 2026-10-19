import { nativeImage, powerSaveBlocker } from 'electron';
import { ctx } from './context';
import { notify } from './notify';
import { updateTray } from './tray';

/**
 * Polls the in-process API for recording / test-run state and reflects it in the shell:
 * taskbar overlay (W11), keep-awake (W12), taskbar flash (W10), tray tooltip (T6),
 * a notification when a recording stops in the background (N1), and API health (N10).
 */
export const state = { recording: false, running: false, apiDown: false };
let blocker: number | undefined;
let timer: NodeJS.Timeout | undefined;
let generation = 0;
let activeRequest: AbortController | undefined;

// A small red dot, drawn once, for the taskbar overlay.
const dot = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7" fill="#e5484d" stroke="#fff" stroke-width="1.5"/></svg>').toString('base64'));

async function poll(currentGeneration: number) {
  if (!ctx.origin) return;
  const request = new AbortController();
  activeRequest = request;
  const timeout = setTimeout(() => request.abort(), 10_000);
  let recording = false, running = false, runStatus = '';
  try {
    const status = async (endpoint: string) => {
      const response = await fetch(`${ctx.origin}/api/${endpoint}`, { signal: request.signal });
      if (!response.ok) throw new Error(`Status request failed: ${response.status}`);
      const result = await response.json() as { status?: unknown };
      if (typeof result.status !== 'string') throw new Error('Invalid status response');
      return { status: result.status };
    };
    const [rec, exe] = await Promise.all([
      status('recording'), status('execution'),
    ]);
    if (currentGeneration !== generation) return;
    recording = rec.status === 'recording';
    running = exe.status === 'running';
    runStatus = exe.status;
    state.apiDown = false;
  } catch {
    request.abort(); // Cancel the sibling request too, including HTTP/JSON failures.
    if (currentGeneration !== generation) return;
    // The studio shows its own offline banner; the desktop adds a notification for when the window is hidden.
    if (!state.apiDown) { state.apiDown = true; notify('Local API is not responding', 'Help → Open Log File shows what happened.', { always: true }); }
    return;
  } finally {
    clearTimeout(timeout);
    if (activeRequest === request) activeRequest = undefined;
  }
  if (recording !== state.recording) {
    ctx.win?.setOverlayIcon(recording ? dot : null, recording ? 'Recording' : '');
    if (!recording && state.recording) notify('Recording stopped', 'Review the captured actions in the recorder.', { hash: '#/features/recorder' });
  }
  if (!running && state.running) {
    if (!ctx.win?.isFocused()) ctx.win?.flashFrame(true);
    notify(`Test run ${runStatus}`, 'Open the studio to see the output.');
  }
  state.recording = recording;
  state.running = running;
  const busy = recording || running;
  if (busy && blocker === undefined) blocker = powerSaveBlocker.start('prevent-app-suspension');
  if (!busy && blocker !== undefined) { powerSaveBlocker.stop(blocker); blocker = undefined; }
  updateTray();
}

export function startStatus() {
  stopStatus();
  const currentGeneration = generation;
  const next = async () => {
    await poll(currentGeneration);
    if (currentGeneration === generation) timer = setTimeout(next, 2000);
  };
  timer = setTimeout(next, 2000);
  ctx.win?.removeListener('focus', clearFlash);
  ctx.win?.on('focus', clearFlash);
}
const clearFlash = () => ctx.win?.flashFrame(false);
export const stopStatus = () => {
  generation++;
  clearTimeout(timer);
  timer = undefined;
  activeRequest?.abort();
  activeRequest = undefined;
  ctx.win?.removeListener('focus', clearFlash);
  if (blocker !== undefined) { powerSaveBlocker.stop(blocker); blocker = undefined; }
};
