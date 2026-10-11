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

// A small red dot, drawn once, for the taskbar overlay.
const dot = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7" fill="#e5484d" stroke="#fff" stroke-width="1.5"/></svg>').toString('base64'));

async function poll() {
  if (!ctx.origin) return;
  let recording = false, running = false, runStatus = '';
  try {
    const [rec, exe] = await Promise.all([
      fetch(`${ctx.origin}/api/recording`).then((r) => r.json() as Promise<{ status: string }>),
      fetch(`${ctx.origin}/api/execution`).then((r) => r.json() as Promise<{ status: string }>),
    ]);
    recording = rec.status === 'recording';
    running = exe.status === 'running';
    runStatus = exe.status;
    state.apiDown = false;
  } catch {
    // The studio shows its own offline banner; the desktop adds a notification for when the window is hidden.
    if (!state.apiDown) { state.apiDown = true; notify('Local API is not responding', 'Help → Open Log File shows what happened.', { always: true }); }
    return;
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
  clearInterval(timer);
  timer = setInterval(poll, 2000);
  ctx.win?.on('focus', () => ctx.win?.flashFrame(false));
}
export const stopStatus = () => { clearInterval(timer); if (blocker !== undefined) powerSaveBlocker.stop(blocker); };
