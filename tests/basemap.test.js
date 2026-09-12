/* Regression guard for the "403r Access blocked" tile outage.

   Two independent causes are pinned here, because either one alone breaks the map:
     1. the server must not strip the Referer header from tile requests, and
     2. the volunteer OpenStreetMap tile servers must not be the default basemap. */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import request from 'supertest';

vi.mock('../mcp-server.js', () => ({
  default: class {
    listTools = vi.fn();
    callTool = vi.fn();
  },
}));

const { default: app } = await import('../index.js');

const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const basemapSource = readFileSync(new URL('../public/basemap.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

function loadBasemap({
  hasWebGL1 = false,
  hasWebGL2 = true,
  maplibreAvailable = true,
  vectorEvents = [],
  fetchImpl = vi.fn(async () => ({
    ok: true,
    json: async () => ({ version: 8, sources: { demo: {} } })
  })),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  const listeners = new Map();
  const on = (type, handler) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(handler);
  };
  const off = (type, handler) => {
    listeners.set(type, (listeners.get(type) || []).filter((fn) => fn !== handler));
  };
  const emit = (type, payload) => {
    for (const handler of listeners.get(type) || []) handler(payload);
  };

  const window = {
    WebGL2RenderingContext: hasWebGL2 ? function WebGL2RenderingContext() {} : undefined,
    WebGLRenderingContext: hasWebGL1 ? function WebGLRenderingContext() {} : undefined,
    addEventListener: vi.fn(on),
    removeEventListener: vi.fn(off),
  };
  const document = {
    createElement: vi.fn(() => ({
      getContext: vi.fn((kind) => {
        if (kind === 'webgl2' || kind === 'experimental-webgl2') return hasWebGL2 ? {} : null;
        if (kind === 'webgl' || kind === 'experimental-webgl') return hasWebGL1 ? {} : null;
        return null;
      })
    })),
    documentElement: {
      getAttribute: vi.fn(() => 'light')
    }
  };
  const map = {
    removeLayer: vi.fn(),
    attributionControl: {
      addAttribution: vi.fn(),
      removeAttribution: vi.fn()
    }
  };
  const vectorLayers = [];
  const L = {
    maplibreGL: maplibreAvailable ? vi.fn(() => {
      const behavior = vectorEvents[vectorLayers.length] || 'load';
      const glListeners = new Map();
      const glMap = {
        on: vi.fn((type, handler) => {
          if (!glListeners.has(type)) glListeners.set(type, []);
          glListeners.get(type).push(handler);
        }),
        off: vi.fn((type, handler) => {
          glListeners.set(type, (glListeners.get(type) || []).filter((fn) => fn !== handler));
        }),
        loaded: vi.fn(() => false),
        setStyle: vi.fn()
      };
      const fire = (type) => {
        for (const handler of glListeners.get(type) || []) handler({ type });
      };
      const layer = {
        addTo: vi.fn(() => {
          queueMicrotask(() => fire(behavior));
          return layer;
        }),
        getMaplibreMap: vi.fn(() => glMap),
        remove: vi.fn()
      };
      vectorLayers.push({ layer, glMap, behavior });
      return layer;
    }) : undefined,
    tileLayer: vi.fn(() => {
      const layer = {
        addTo: vi.fn(() => layer)
      };
      return layer;
    })
  };

  runInNewContext(basemapSource, {
    window,
    document,
    L,
    fetch: fetchImpl,
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl,
    console,
  });

  return { Basemap: window.Basemap, L, map, fetchImpl, vectorLayers };
}

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

  it('treats WebGL1-only browsers as no-WebGL for MapLibre GL 6', async () => {
    const { Basemap, L, map, fetchImpl } = loadBasemap({ hasWebGL1: true, hasWebGL2: false });
    const provider = await Basemap.attach(map);
    expect(provider.id).toBe('osm-raster');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(L.maplibreGL).not.toHaveBeenCalled();
    expect(L.tileLayer).toHaveBeenCalledTimes(1);
  });

  it('fails over to the next vector provider when the first one errors during load', async () => {
    const { Basemap, L, map } = loadBasemap({ vectorEvents: ['error', 'load'] });
    const provider = await Basemap.attach(map);
    expect(provider.id).toBe('versatiles');
    expect(map.removeLayer).toHaveBeenCalledTimes(1);
    expect(L.tileLayer).not.toHaveBeenCalled();
  });

  it('does not fall back to OSM raster when every vector provider fails on a WebGL2 browser', async () => {
    const { Basemap, L, map } = loadBasemap({ vectorEvents: ['error', 'error'] });
    await expect(Basemap.attach(map)).resolves.toBeNull();
    expect(map.removeLayer).toHaveBeenCalledTimes(2);
    expect(L.tileLayer).not.toHaveBeenCalled();
  });

  it('falls back to raster if the MapLibre bridge never becomes ready', async () => {
    const setTimeoutImpl = vi.fn((fn) => {
      fn();
      return 1;
    });
    const { Basemap, L, map, fetchImpl } = loadBasemap({
      maplibreAvailable: false,
      setTimeoutImpl,
      clearTimeoutImpl: vi.fn(),
    });
    const provider = await Basemap.attach(map);
    expect(provider.id).toBe('osm-raster');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(L.tileLayer).toHaveBeenCalledTimes(1);
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

  it('documents the remaining third-party map dependencies accurately', () => {
    expect(indexSource).toContain("Leaflet CSS from unpkg");
    expect(indexSource).toContain("remote style/tile URLs");
    expect(indexSource).not.toContain("MapLibre GL and tiles from CDNs");
  });
});
