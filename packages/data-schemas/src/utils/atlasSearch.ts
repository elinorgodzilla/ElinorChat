import { getTenantId, SYSTEM_TENANT_ID } from '~/config/tenantContext';

type AtlasTextFilter = {
  text: {
    query: string;
    path: string;
  };
};

export function isAtlasSearchEnabled(): boolean {
  return process.env.ATLAS_SEARCH?.trim().toLowerCase() === 'true';
}

export function getAtlasSearchIndex(): string {
  return process.env.ATLAS_SEARCH_INDEX?.trim() || 'default';
}

export function getAtlasSearchScope(user: string): {
  filters: AtlasTextFilter[];
  match: Record<string, string>;
} {
  const tenantId = getTenantId();
  if (!tenantId && process.env.TENANT_ISOLATION_STRICT === 'true') {
    throw new Error('[TenantIsolation] Atlas search attempted without tenant context in strict mode');
  }

  const filters: AtlasTextFilter[] = [{ text: { query: user, path: 'user' } }];
  const match: Record<string, string> = { user };

  if (tenantId && tenantId !== SYSTEM_TENANT_ID) {
    filters.push({ text: { query: tenantId, path: 'tenantId' } });
    match.tenantId = tenantId;
  }

  return { filters, match };
}
