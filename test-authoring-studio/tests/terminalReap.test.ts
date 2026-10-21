import { describe, it, expect } from 'vitest';
import os from 'node:os';
import { startTerminal, releaseWhenUnused, terminal } from '../server/terminal';

describe('terminal sessions', () => {
  it('stops a shell nobody listens to any more', async () => {
    const { id } = startTerminal(os.tmpdir());
    const listened = startTerminal(os.tmpdir());
    const keep = () => {};
    terminal(listened.id)!.on('event', keep);
    releaseWhenUnused(id, 50);
    releaseWhenUnused(listened.id, 50);
    await new Promise((r) => setTimeout(r, 1500));
    expect(terminal(id)).toBeUndefined();
    // A page still connected keeps its shell.
    expect(terminal(listened.id)).toBeDefined();
    terminal(listened.id)!.off('event', keep);
    releaseWhenUnused(listened.id, 10);
    await new Promise((r) => setTimeout(r, 1500));
    expect(terminal(listened.id)).toBeUndefined();
  });
});
