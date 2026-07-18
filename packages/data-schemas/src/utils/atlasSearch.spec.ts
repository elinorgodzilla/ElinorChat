import { tenantStorage } from '~/config/tenantContext';
import {
  getAtlasSearchIndex,
  getAtlasSearchScope,
  isAtlasSearchEnabled,
} from './atlasSearch';

describe('Atlas search configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ATLAS_SEARCH;
    delete process.env.ATLAS_SEARCH_INDEX;
    delete process.env.TENANT_ISOLATION_STRICT;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses explicit enablement and the default index', () => {
    expect(isAtlasSearchEnabled()).toBe(false);
    expect(getAtlasSearchIndex()).toBe('default');

    process.env.ATLAS_SEARCH = ' TRUE ';
    process.env.ATLAS_SEARCH_INDEX = 'custom';

    expect(isAtlasSearchEnabled()).toBe(true);
    expect(getAtlasSearchIndex()).toBe('custom');
  });

  it('scopes candidates and exact matches to the authenticated user', () => {
    expect(getAtlasSearchScope('user-1')).toEqual({
      filters: [{ text: { query: 'user-1', path: 'user' } }],
      match: { user: 'user-1' },
    });
  });

  it('also scopes searches to the active tenant', async () => {
    await tenantStorage.run({ tenantId: 'tenant-1' }, async () => {
      expect(getAtlasSearchScope('user-1')).toEqual({
        filters: [
          { text: { query: 'user-1', path: 'user' } },
          { text: { query: 'tenant-1', path: 'tenantId' } },
        ],
        match: { user: 'user-1', tenantId: 'tenant-1' },
      });
    });
  });

  it('fails closed without tenant context in strict mode', () => {
    process.env.TENANT_ISOLATION_STRICT = 'true';
    expect(() => getAtlasSearchScope('user-1')).toThrow('without tenant context');
  });
});
