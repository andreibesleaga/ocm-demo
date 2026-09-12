#!/usr/bin/env bash
# Refresh the self-hosted map libraries in public/vendor/.
#
# They are vendored rather than loaded from a CDN for the same reason the demo no
# longer draws tiles from the OpenStreetMap Foundation's volunteer servers: a third
# party that can rate-limit, block or disappear must not be able to take the map
# down. Everything the map needs is served from this app's own origin.
#
# MapLibre GL v6 is ESM-only and code-split, so all three chunks must be copied
# together; their relative imports then resolve inside public/vendor/.
# v6 is required, not v5: GHSA-jrc7-96c5-q579 (critical, attribution sanitizer
# bypass) is fixed in 6.4.1 and has no 5.x patch.
#
# Usage: scripts/vendor-map-libs.sh [maplibre-version] [bridge-version]
set -euo pipefail

MAPLIBRE_VERSION="${1:-6.9.0}"
BRIDGE_VERSION="${2:-0.1.4}"
VENDOR_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/vendor"

mkdir -p "$VENDOR_DIR"

for file in maplibre-gl.mjs maplibre-gl-shared.mjs maplibre-gl-worker.mjs maplibre-gl.css; do
  echo "  maplibre-gl@${MAPLIBRE_VERSION}/dist/${file}"
  curl -sSfL "https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/${file}" -o "$VENDOR_DIR/$file"
done

# The bridge ships bare specifiers. Rewrite them to the vendored neighbours so the
# files load straight from public/vendor/ with no import map and no bundler.
echo "  @maplibre/maplibre-gl-leaflet@${BRIDGE_VERSION}/dist/leaflet-maplibre-gl.mjs"
curl -sSfL "https://unpkg.com/@maplibre/maplibre-gl-leaflet@${BRIDGE_VERSION}/dist/leaflet-maplibre-gl.mjs" \
  | sed -e 's#from *"leaflet"#from "./leaflet-global.mjs"#' \
        -e 's#from *"maplibre-gl"#from "./maplibre-gl.mjs"#' \
  > "$VENDOR_DIR/leaflet-maplibre-gl.mjs"

if grep -qE 'from *"(leaflet|maplibre-gl)"' "$VENDOR_DIR/leaflet-maplibre-gl.mjs"; then
  echo "ERROR: a bare specifier survived the rewrite; the upstream build changed." >&2
  exit 1
fi

cat > "$VENDOR_DIR/VERSIONS.txt" <<TXT
maplibre-gl                     ${MAPLIBRE_VERSION}   BSD-3-Clause
@maplibre/maplibre-gl-leaflet   ${BRIDGE_VERSION}   ISC   (import specifiers rewritten, see above)
TXT

echo "Vendored into public/vendor/ — see VERSIONS.txt"
