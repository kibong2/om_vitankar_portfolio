// Prefixes a path with the site's base (e.g. "/portfolio") so links work
// both on GitHub Pages and later on a custom domain.
export function url(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : '/' + path}`;
}
