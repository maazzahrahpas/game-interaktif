/**
 * Normalizes Vercel rewritten `/api/index?__path=...` URLs back into standard `/api/...` paths
 * while preserving any additional query parameters.
 */
export function normalizeVercelApiUrl(rawUrl: string): string {
  const input = rawUrl || '/api';
  const parsed = new URL(input, 'http://localhost');
  const rewrittenPath = parsed.searchParams.get('__path');

  if (rewrittenPath !== null) {
    parsed.searchParams.delete('__path');
    const cleanSubpath = rewrittenPath.replace(/^\/+/, '');
    const base = cleanSubpath ? `/api/${cleanSubpath}` : '/api';
    const qs = parsed.searchParams.toString();
    return qs ? `${base}?${qs}` : base;
  }

  if (parsed.pathname === '/api/index') {
    return parsed.search ? `/api${parsed.search}` : '/api';
  }

  return `${parsed.pathname}${parsed.search}`;
}
