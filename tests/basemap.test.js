/* Regression guard for the "403r Access blocked" tile outage.

   Two independent causes are pinned here, because either one alone breaks the map:
     1. the server must not strip the Referer header from tile requests, and
     2. the volunteer OpenStreetMap tile servers must not be the default basemap. */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import request from 'supertest';

vi.mock('../mcp-server.js', () => ({
  default: class {
    listTools = vi.fn();
    callTool = vi.fn();
  },
}));

const { default: app } = await import('../index.js');

const basemapSource = readFileSync(new URL('../public/basemap.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

describe('basemap resilience', () => {
  it('does not send a Referrer-Policy that hides the Referer from tile servers', async () => {
    const res = await request(app).get('/healthz');
    const policy = res.headers['referrer-policy'];
    expect(policy).toBeDefined();
    expect(policy).not.toMatch(/no-referrer(?!-when-downgrade)/);
    expect(policy).toBe('strict-origin-when-cross-origin');
  });

  it('never uses the deprecated {s}.tile.openstreetmap.org subdomain form', () => {
    expect(basemapSource).not.toMatch(/\{s\}\.tile\.openstreetmap\.org/);
    expect(appSource).not.toMatch(/\{s\}\.tile\.openstreetmap\.org/);
  });

  it('draws the map through the failover-aware basemap module, not a hardcoded layer', () => {
    expect(appSource).toMatch(/Basemap\.attach\(map\)/);
    expect(appSource).not.toMatch(/L\.tileLayer\(/);
  });

  it('prefers keyless providers and keeps OSM raster as a last resort only', () => {
    const ids = [...basemapSource.matchAll(/id:\s*'([a-z-]+)'/g)].map((m) => m[1]);
    expect(ids).toEqual(['openfreemap', 'versatiles', 'osm-raster']);
    expect(ids.indexOf('osm-raster')).toBe(ids.length - 1);
  });

  it('lets the Referer reach the OSM raster fallback when it is used', () => {
    expect(basemapSource).toMatch(/referrerPolicy:\s*'strict-origin-when-cross-origin'/);
  });

  it('serves the map libraries from this origin, never from a CDN', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    expect(html).toMatch(/href="vendor\/maplibre-gl\.css"/);
    expect(html).toMatch(/src="map-boot\.mjs"/);
    expect(html).not.toMatch(/unpkg\.com[^"']*maplibre/);
    for (const file of [
      'maplibre-gl.mjs',
      'maplibre-gl-shared.mjs',
      'maplibre-gl-worker.mjs',
      'maplibre-gl.css',
      'leaflet-maplibre-gl.mjs',
      'leaflet-global.mjs',
    ]) {
      expect(existsSync(new URL(`../public/vendor/${file}`, import.meta.url))).toBe(true);
    }
  });

  it('pins a MapLibre GL major that is not affected by GHSA-jrc7-96c5-q579', () => {
    const versions = readFileSync(new URL('../public/vendor/VERSIONS.txt', import.meta.url), 'utf8');
    const [, version] = versions.match(/^maplibre-gl\s+(\d+\.\d+\.\d+)/m) ?? [];
    expect(version).toBeDefined();
    const [major, minor, patch] = version.split('.').map(Number);
    // The attribution sanitizer bypass is fixed in 6.4.1; there is no 5.x patch.
    expect(major).toBeGreaterThanOrEqual(6);
    expect(major > 6 || minor > 4 || (minor === 4 && patch >= 1)).toBe(true);
  });
});
