import { describe, expect, it } from 'vitest';
import { jsonToClasses } from '../src/editor/jsonClasses';

describe('Paste JSON as Classes (X23)', () => {
  it('a class per object shape, typed properties, lists, renamed keys', () => {
    const code = jsonToClasses(JSON.stringify({ id: 7, user_name: 'ada', active: true, score: 1.5, createdAt: '2026-10-20T10:00:00Z', roles: ['admin'], orders: [{ id: 1, total: 9.5 }], address: { city: 'Paris' } }));
    expect(code).toContain('using System.Text.Json.Serialization;');
    expect(code).toContain('public class Root');
    expect(code).toContain('    public int Id { get; set; }');
    expect(code).toContain('    [JsonPropertyName("user_name")]\n    public string UserName { get; set; }');
    expect(code).toContain('    public bool Active { get; set; }');
    expect(code).toContain('    public double Score { get; set; }');
    expect(code).toContain('    public DateTime CreatedAt { get; set; }');
    expect(code).toContain('    public List<string> Roles { get; set; }');
    expect(code).toContain('    public List<Order> Orders { get; set; }');
    expect(code).toContain('public class Order');
    expect(code).toContain('    public Address Address { get; set; }');
  });
});
