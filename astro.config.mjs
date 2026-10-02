// @ts-check
import { defineConfig } from 'astro/config';

// `site` + `base` tell Astro where the site lives.
// Until the custom domain is connected, GitHub Pages serves it at
// https://kibong2.github.io/om_vitankar_portfolio/
//
// WHEN YOU CONNECT A CUSTOM DOMAIN (e.g. omvitankar.me):
//   1. set `site` to 'https://omvitankar.me'
//   2. delete the `base` line
export default defineConfig({
  site: 'https://kibong2.github.io',
  base: '/om_vitankar_portfolio',
});
