import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { confined, updateExtraRoots } from '../server/core';

describe('solution projects outside the opened folder', () => {
  it('adds only listed project folders to the file boundary, never an ancestor of the folder', async () => {
    const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tas-extra-')));
    try {
      await fs.mkdir(path.join(base, 'sol'), { recursive: true });
      await fs.mkdir(path.join(base, 'shared'), { recursive: true });
      await fs.writeFile(path.join(base, 'shared/Shared.csproj'), '<Project />');
      await fs.writeFile(path.join(base, 'Root.csproj'), '<Project />'); // folder contains the opened folder
      await fs.writeFile(path.join(base, 'secret.txt'), 'x');
      await fs.writeFile(path.join(base, 'sol/S.slnx'), '<Solution><Project Path="../shared/Shared.csproj" /><Project Path="../Root.csproj" /></Solution>');
      const root = path.join(base, 'sol');
      expect(await updateExtraRoots({ repositoryRoot: root, solution: 'S.slnx' })).toEqual([path.join(base, 'shared')]);
      expect(await confined(root, '../shared/Shared.csproj')).toBe(path.join(base, 'shared', 'Shared.csproj'));
      await expect(confined(root, '../secret.txt')).rejects.toThrow(/outside/);
      await updateExtraRoots({ repositoryRoot: root, solution: '' });
      await expect(confined(root, '../shared/Shared.csproj')).rejects.toThrow(/outside/);
    } finally {
      await fs.rm(base, { recursive: true, force: true });
    }
  });
});
