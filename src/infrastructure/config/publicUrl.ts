/**
 * The public address of this site (PUBLIC_BASE_URL), cleaned up: surrounding spaces and trailing
 * slashes are removed, so `${publicBaseUrl()}/generated/x.jpg` never contains `//`.
 */
export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000').trim().replace(/\/+$/, '');
}

/** Collapses repeated slashes in a URL path ("//generated/a.jpg" -> "/generated/a.jpg"). */
export function cleanPath(pathname: string): string {
  return pathname.replace(/\/{2,}/g, '/');
}
