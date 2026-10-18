import { describe, expect, it } from 'vitest';
import { parseHttp } from '../src/editor/httpClient';

describe('HTTP Client parser (J22)', () => {
  it('reads requests, headers, bodies and variables', () => {
    const reqs = parseHttp([
      '@base = https://api.example.com',
      '@token = abc',
      '',
      '### List users',
      'GET {{base}}/users?page=1 HTTP/1.1',
      'Authorization: Bearer {{token}}',
      '',
      '### Create',
      '# a comment',
      'POST {{base}}/users',
      'Content-Type: application/json',
      '',
      '{ "name": "Ada" }',
      '',
      '###',
      'https://example.com/health',
    ].join('\n'));
    expect(reqs).toHaveLength(3);
    expect(reqs[0]).toMatchObject({ line: 5, method: 'GET', url: 'https://api.example.com/users?page=1', headers: { Authorization: 'Bearer abc' }, body: '', name: 'List users' });
    expect(reqs[1]).toMatchObject({ line: 10, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{ "name": "Ada" }', name: 'Create' });
    expect(reqs[2]).toMatchObject({ method: 'GET', url: 'https://example.com/health' });
  });
  it('fills dynamic variables', () => {
    const [r] = parseHttp('POST https://x.test/{{$randomInt}}\n\n{"id":"{{$guid}}"}');
    expect(r.url).toMatch(/^https:\/\/x\.test\/\d+$/);
    expect(JSON.parse(r.body).id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
