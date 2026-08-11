import { describe, expect, test } from 'bun:test';
import { parseEnv } from '../src/config/env';

const base = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test',
  CORS_ORIGINS: 'http://localhost:3000, https://example.com/',
};

describe('environment validation', () => {
  test('parses and normalizes configured origins', () => {
    expect(parseEnv(base).corsOrigins).toEqual([
      'http://localhost:3000',
      'https://example.com',
    ]);
  });

  test('rejects wildcard production CORS', () => {
    expect(() =>
      parseEnv({ ...base, NODE_ENV: 'production', CORS_ORIGINS: '*' }),
    ).toThrow();
  });

  test('rejects a non-PostgreSQL production database', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: 'file:test.db' })).toThrow();
  });
});
