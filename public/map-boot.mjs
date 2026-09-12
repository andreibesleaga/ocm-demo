/* Loads the self-hosted MapLibre GL bridge for Leaflet. Importing it is the whole
   job: the bridge registers itself as `L.maplibreGL` on the global Leaflet that the
   rest of the app uses. Nothing here comes from a CDN — see scripts/vendor-map-libs.sh. */
import './vendor/leaflet-maplibre-gl.mjs';

window.dispatchEvent(new Event('basemap:libs-ready'));
