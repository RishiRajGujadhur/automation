import { describe, it, expect } from 'vitest';
import { buildFeatureTree, featureDirectory, parentFolders } from '../src/featureTree';
import type { Feature } from '../src/types';
const features = [
  { file: 'Features/Payroll/Salary/Create.feature', name: 'Create salary' },
  { file: 'Features/Payroll/Bonus/Create.feature', name: 'Create bonus' },
  { file: 'Features/Auth/Login.feature', name: 'Sign in' },
  { file: 'TopLevel.feature', name: 'Top level' },
] as Feature[];
describe('feature explorer hierarchy', () => {
  it('retains every folder and duplicate filename with stable full paths', () => {
    const tree = buildFeatureTree(features);
    expect(tree[0]).toMatchObject({ kind: 'folder', name: 'Features', count: 3 });
    expect(tree[1]).toMatchObject({ kind: 'file', name: 'TopLevel.feature' });
    const paths = JSON.stringify(tree);
    expect(paths).toContain('Features/Payroll/Salary/Create.feature');
    expect(paths).toContain('Features/Payroll/Bonus/Create.feature');
  });
  it('searches feature names and folder paths, preserving only matching ancestors', () => {
    const tree = buildFeatureTree(features, 'payroll salary');
    expect(tree[0]).toMatchObject({ count: 1 });
    expect(JSON.stringify(tree)).toContain('Salary');
    expect(JSON.stringify(tree)).not.toContain('Bonus');
    expect(JSON.stringify(buildFeatureTree(features, 'sign in'))).toContain('Login.feature');
    expect(buildFeatureTree(features, 'nothing here')).toEqual([]);
  });
  it('normalizes Windows paths and handles files at repository root', () => {
    expect(featureDirectory('Features\\Payroll\\Salary\\Create.feature')).toBe(
      'Features/Payroll/Salary',
    );
    expect(parentFolders('Features\\Payroll\\Salary\\Create.feature')).toEqual([
      'Features',
      'Features/Payroll',
      'Features/Payroll/Salary',
    ]);
    expect(featureDirectory('Root.feature')).toBe('');
    expect(
      JSON.stringify(
        buildFeatureTree([{ file: 'Features\\Auth\\Login.feature', name: 'Login' } as Feature]),
      ),
    ).toContain('Features/Auth/Login.feature');
  });
});
