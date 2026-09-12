/* OCM MCP Demo — basemap provider with failover.

   Why this file exists: the demo used to draw tiles straight from the OpenStreetMap
   Foundation's volunteer tile servers, through the long-deprecated rotating-subdomain
   host form. Those servers enforce the
   OSMF Tile Usage Policy and answer a request they do not like with a *200 OK*
   "403r Access blocked" PNG, so a blocked map is indistinguishable from a working
   one to Leaflet — no `tileerror` ever fires. The demo hit exactly that.

   The fix is to stop depending on that service. Both providers below are keyless,
   permit production use, serve `Access-Control-Allow-Origin: *`, and ask only for
   attribution. The last entry is a raster fallback used solely when the browser has
   no WebGL; it is policy-compliant (no `{s}` subdomains, Referer allowed to flow).

   Sources:
     https://operations.osmfoundation.org/policies/tiles/
     https://openfreemap.org/quick_start/
     https://versatiles.org/ */

(function (global) {
  'use strict';

  const PROBE_TIMEOUT_MS = 6000;
  const LIBS_TIMEOUT_MS = 8000;

  const PROVIDERS = [
    {
      id: 'openfreemap',
      label: 'OpenFreeMap',
      kind: 'vector',
      styles: {
        light: 'https://tiles.openfreemap.org/styles/positron',
        dark: 'https://tiles.openfreemap.org/styles/fiord'
      },
      attribution:
        '<a href="https://openfreemap.org/">OpenFreeMap</a> · ' +
        '<a href="https://www.openmaptiles.org/">© OpenMapTiles</a> · ' +
        'Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    },
    {
      id: 'versatiles',
      label: 'VersaTiles',
      kind: 'vector',
      styles: {
        light: 'https://tiles.versatiles.org/assets/styles/colorful/style.json',
        dark: 'https://tiles.versatiles.org/assets/styles/eclipse/style.json'
      },
      attribution:
        '<a href="https://versatiles.org/">VersaTiles</a> · ' +
        'Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    },
    {
      /* No-WebGL last resort only. Never the default: see the file header. */
      id: 'osm-raster',
      label: 'OpenStreetMap (raster)',
      kind: 'raster',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  ];

  /* map-boot.mjs is a module script, so it runs after this classic script. Wait for
     it before deciding whether the vector providers are usable; if it never arrives
     (module blocked, file missing) the raster fallback takes over instead of the map
     silently staying empty. */
  function libsReady() {
    if (typeof L.maplibreGL === 'function') return Promise.resolve(true);
    return new Promise(function (resolve) {
      const settle = function () { resolve(typeof L.maplibreGL === 'function'); };
      global.addEventListener('basemap:libs-ready', settle, { once: true });
      setTimeout(settle, LIBS_TIMEOUT_MS);
    });
  }

  function hasWebGL() {
    try {
      const canvas = document.createElement('canvas');
      return Boolean(
        global.WebGLRenderingContext &&
          (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      );
    } catch (e) {
      return false;
    }
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  /* A provider counts as reachable only if its style document actually parses.
     `res.ok` alone is not enough: a captive portal or an error page can answer 200. */
  async function reachable(provider) {
    const url = provider.styles[currentTheme()];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, mode: 'cors' });
      if (!res.ok) return false;
      const style = await res.json();
      return style && style.version === 8 && typeof style.sources === 'object';
    } catch (e) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  function addVector(map, provider) {
    /* Credit our own literal string rather than whatever HTML the style document
       carries: the required attribution stays correct even if a provider ships a
       blank one, and no third-party markup reaches MapLibre's sanitizer. */
    const layer = L.maplibreGL({
      style: provider.styles[currentTheme()],
      attributionControl: { customAttribution: provider.attribution }
    }).addTo(map);

    /* Follow the UI theme so the basemap does not glare in dark mode. */
    global.addEventListener('themechange', function () {
      const style = provider.styles[currentTheme()];
      try {
        layer.getMaplibreMap().setStyle(style);
      } catch (e) {
        /* A style swap is cosmetic; a failure must not take the map down. */
      }
    });
    return layer;
  }

  function addRaster(map, provider) {
    const layer = L.tileLayer(provider.url, {
      attribution: provider.attribution,
      maxZoom: provider.maxZoom,
      /* Required by the OSMF tile policy: the Referer header must reach the server. */
      referrerPolicy: 'strict-origin-when-cross-origin',
      crossOrigin: 'anonymous'
    }).addTo(map);
    return layer;
  }

  /* Attach the first reachable provider. Resolves with the provider that won, or
     null if every provider failed — the caller decides what to tell the visitor. */
  async function attach(map) {
    const webgl = hasWebGL() && (await libsReady());
    for (const provider of PROVIDERS) {
      if (provider.kind === 'vector' && !webgl) continue;
      if (provider.kind === 'vector') {
        if (!(await reachable(provider))) continue;
        addVector(map, provider);
        return provider;
      }
      addRaster(map, provider);
      return provider;
    }
    return null;
  }

  global.Basemap = { attach: attach, PROVIDERS: PROVIDERS };
})(window);
