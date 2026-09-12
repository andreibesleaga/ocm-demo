/* Leaflet is already on the page as the global `L` (classic script, SRI-pinned).
   The MapLibre bridge imports it as a module; this shim hands it that same
   instance, so the bridge extends the one `L` the rest of the app uses instead of
   a second, unrelated copy. */
export default window.L;
