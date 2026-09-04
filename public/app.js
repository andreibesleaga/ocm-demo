/* OCM MCP Demo — map, MCP commands and result rendering.
   The API contract is unchanged: every request is POST /api/mcp {command}. */

const map = L.map('map', { zoomControl: false }).setView([51.505, -0.09], 10);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

L.control.zoom({ position: 'bottomright' }).addTo(map);

let markers = [];
let selectedMarker = null;
let pending = false;

const commandInput = document.getElementById('command');
const resultEl = document.getElementById('result');
const resultBody = document.getElementById('result-body');
const resultMeta = document.getElementById('result-meta');
const statusEl = resultEl.querySelector('.status');
const sendButton = document.getElementById('send');

/* ------------------------------------------------------------------ helpers */

function pinIcon(modifier) {
    const size = modifier === 'pin--selected' ? 24 : 18;
    return L.divIcon({
        className: '',
        html: '<span class="pin ' + (modifier || '') + '"></span>',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -(size / 2 + 2)]
    });
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
}

/** Replace the result panel body, its status pill and its meta line. */
function setResult(kind, statusText, metaText) {
    resultEl.className = 'result glass ' + kind;
    statusEl.textContent = statusText;
    resultMeta.textContent = metaText || '';
    resultBody.replaceChildren();
    return resultBody;
}

function setBusy(busy, message) {
    pending = busy;
    resultEl.setAttribute('aria-busy', busy ? 'true' : 'false');
    sendButton.disabled = busy;
    if (busy) {
        const body = setResult('info', 'Working', '');
        const line = el('p');
        line.appendChild(el('span', 'spinner'));
        line.appendChild(document.createTextNode(message));
        body.appendChild(line);
    }
}

function clearMarkers() {
    markers.forEach((marker) => map.removeLayer(marker));
    markers = [];
}

function stationFields(poi) {
    const address = poi.AddressInfo || {};
    const connection = (poi.Connections && poi.Connections[0]) || {};
    const country = address.Country ? address.Country.Title || address.Country : '';
    return {
        title: address.Title || 'Charging station',
        town: address.Town || '',
        country: typeof country === 'string' ? country : '',
        power: connection.PowerKW ? connection.PowerKW + ' kW' : null,
        status: poi.StatusType ? poi.StatusType.Title || 'Unknown' : 'Unknown',
        lat: address.Latitude,
        lon: address.Longitude
    };
}

/** Popup built as DOM so values coming from the API are never parsed as HTML. */
function popupContent(fields) {
    const wrap = el('div');
    wrap.appendChild(el('b', null, fields.title));
    const place = [fields.town, fields.country].filter(Boolean).join(', ');
    if (place) {
        wrap.appendChild(document.createElement('br'));
        wrap.appendChild(document.createTextNode(place));
    }
    wrap.appendChild(document.createElement('br'));
    wrap.appendChild(document.createTextNode('Power: ' + (fields.power || 'unknown')));
    wrap.appendChild(document.createElement('br'));
    wrap.appendChild(document.createTextNode('Status: ' + fields.status));
    return wrap;
}

/* ------------------------------------------------------------------ actions */

async function sendCommand() {
    const command = commandInput.value;
    if (!command.trim() || pending) return;

    setBusy(true, 'Processing MCP command via the protocol…');

    try {
        const response = await fetch('/api/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });

        const result = await response.json();

        if (result && result.error) {
            const body = setResult('error', 'Not recognised', '');
            body.appendChild(el('p', null, result.error));
            if (Array.isArray(result.availableCommands) && result.availableCommands.length) {
                body.appendChild(el('p', null, 'Try one of these:'));
                const list = el('ul', 'tools');
                result.availableCommands.forEach((entry) => list.appendChild(el('li', null, entry)));
                body.appendChild(list);
            }
        } else if (result && result.tools) {
            displayTools(result.tools);
        } else {
            displayResults(result);
        }
    } catch (error) {
        const body = setResult('error', 'Network error', '');
        body.appendChild(el('p', null, error.message));
    } finally {
        setBusy(false);
    }
}

async function listTools() {
    if (pending) return;
    setBusy(true, 'Listing MCP tools…');

    try {
        const response = await fetch('/api/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'list tools' })
        });

        const result = await response.json();
        displayTools(result.tools || []);
    } catch (error) {
        const body = setResult('error', 'Error listing tools', '');
        body.appendChild(el('p', null, error.message));
    } finally {
        setBusy(false);
    }
}

function displayTools(tools) {
    if (!tools.length) {
        const body = setResult('info', 'No tools', '');
        body.appendChild(el('p', null, 'The MCP server reported no available tools.'));
        return;
    }

    const body = setResult('info', 'MCP tools', tools.length + ' available');
    const list = el('ul', 'tools');
    tools.forEach((tool) => {
        const item = el('li');
        item.appendChild(el('code', null, tool.name));
        if (tool.description) {
            item.appendChild(document.createTextNode(' — ' + tool.description));
        }
        list.appendChild(item);
    });
    body.appendChild(list);
}

function displayResults(result) {
    clearMarkers();

    if (!Array.isArray(result)) {
        const body = setResult('info', 'MCP response', '');
        const pre = el('pre', null, JSON.stringify(result, null, 2));
        body.appendChild(pre);
        return;
    }

    if (!result.length) {
        const body = setResult('info', 'No stations', '0 results');
        body.appendChild(el('p', null, 'The MCP server returned no charging stations for that area.'));
        return;
    }

    const stations = [];

    result.forEach((poi) => {
        const fields = stationFields(poi);
        if (typeof fields.lat !== 'number' || typeof fields.lon !== 'number') return;

        const marker = L.marker([fields.lat, fields.lon], { icon: pinIcon(), title: fields.title })
            .addTo(map)
            .bindPopup(popupContent(fields));
        markers.push(marker);
        stations.push({ fields: fields, marker: marker });
    });

    const body = setResult(
        'success',
        'MCP result',
        result.length + (result.length === 1 ? ' station' : ' stations') + ' · ' + stations.length + ' on the map'
    );

    const list = el('ul', 'stations');
    stations.slice(0, 50).forEach((station) => {
        const item = document.createElement('li');
        const button = el('button', 'station');
        button.type = 'button';

        const text = el('span');
        text.appendChild(el('span', 'station__name', station.fields.title));
        const place = [station.fields.town, station.fields.country].filter(Boolean).join(', ');
        text.appendChild(
            el('span', 'station__meta', [place, station.fields.status].filter(Boolean).join(' · '))
        );
        button.appendChild(text);
        const power = el('span', 'station__power', station.fields.power || '—');
        if (!station.fields.power) power.title = 'Power rating not published';
        button.appendChild(power);
        button.addEventListener('click', () => {
            map.setView(station.marker.getLatLng(), Math.max(map.getZoom(), 14));
            station.marker.openPopup();
        });

        item.appendChild(button);
        list.appendChild(item);
    });
    body.appendChild(list);

    if (stations.length > 50) {
        body.appendChild(el('p', 'hint', 'Showing the first 50 of ' + stations.length + ' mapped stations.'));
    }

    if (markers.length) {
        map.fitBounds(L.featureGroup(markers).getBounds().pad(0.1));
    }
}

function searchHere() {
    if (selectedMarker) {
        sendCommand();
    } else {
        const body = setResult('error', 'No point selected', '');
        body.appendChild(el('p', null, 'Click on the map first to select a location, then press “Search here”.'));
    }
}

function showInstallGuide() {
    const body = setResult('info', 'Installation guide', 'ocm-mcp');

    const guide = el('div', 'guide');
    guide.innerHTML = [
        '<h3>Install</h3>',
        '<p><code>npm install -g ocm-mcp</code></p>',
        '<h3>Claude Desktop setup</h3>',
        '<p>Add this to <code>claude_desktop_config.json</code>:</p>',
        '<pre>{\n  "mcpServers": {\n    "ocm": {\n      "command": "npx",\n      "args": ["ocm-mcp"],\n      "env": {\n        "OCM_API_KEY": "your_api_key_here"\n      }\n    }\n  }\n}</pre>',
        '<h3>VS Code / Cursor</h3>',
        '<p>Install an MCP extension and add the same server configuration.</p>',
        '<h3>Example prompts</h3>',
        '<ul>',
        '<li>Find EV charging stations in London</li>',
        '<li>Show me fast charging stations within 50 km of Paris</li>',
        '<li>List charging stations in California with Tesla connectors</li>',
        '<li>What charging options are near 40.7128, -74.0060?</li>',
        '</ul>',
        '<h3>Available tools</h3>',
        '<ul>',
        '<li><code>list_poi</code> — search charging stations by location</li>',
        '<li><code>retrieve_referencedata</code> — countries, operators and other reference data</li>',
        '<li><code>authenticate_profile</code> — user authentication</li>',
        '<li><code>submit_comment</code> — submit station comments</li>',
        '<li><code>create_mediaitem</code> — upload station photos</li>',
        '<li><code>retrieve_openapi</code> — get the API documentation</li>',
        '</ul>',
        '<h3>More</h3>',
        '<ul>',
        '<li><a href="https://github.com/andreibesleaga/ocm-sdk" target="_blank" rel="noopener">GitHub repository</a></li>',
        '<li><a href="https://www.npmjs.com/package/ocm-mcp" target="_blank" rel="noopener">npm package</a></li>',
        '</ul>'
    ].join('');

    body.appendChild(guide);
}

/* -------------------------------------------------------------------- wiring */

map.on('click', (event) => {
    const lat = event.latlng.lat.toFixed(4);
    const lng = event.latlng.lng.toFixed(4);

    if (selectedMarker) map.removeLayer(selectedMarker);

    selectedMarker = L.marker([lat, lng], {
        icon: pinIcon('pin--selected'),
        title: 'Selected location'
    })
        .addTo(map)
        .bindPopup('Selected: ' + lat + ', ' + lng + '<br>Press “Search here” to find stations');

    commandInput.value = 'Search coordinates ' + lat + ', ' + lng;
});

sendButton.addEventListener('click', sendCommand);
document.getElementById('search-here').addEventListener('click', searchHere);
document.getElementById('list-tools').addEventListener('click', listTools);
document.getElementById('install-guide').addEventListener('click', showInstallGuide);

document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
        commandInput.value = chip.dataset.command;
        commandInput.focus();
    });
});

commandInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        sendCommand();
    }
});

/* Bottom sheet on small screens. */
(function () {
    const app = document.getElementById('app');
    const dock = document.getElementById('dock');
    const handle = document.getElementById('sheet-handle');
    const label = document.getElementById('sheet-handle-label');
    if (!handle) return;

    const small = window.matchMedia('(max-width: 768px)');

    function setCollapsed(collapsed) {
        app.classList.toggle('is-collapsed', collapsed);
        handle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        label.textContent = collapsed ? 'More' : 'Less';
    }

    /* Keep the map's own controls clear of the sheet. */
    function measure() {
        app.style.setProperty('--sheet-h', small.matches ? dock.offsetHeight + 'px' : '0px');
    }

    if (window.ResizeObserver) new ResizeObserver(measure).observe(dock);
    window.addEventListener('resize', measure);
    if (small.addEventListener) small.addEventListener('change', measure);

    handle.addEventListener('click', () => {
        setCollapsed(!app.classList.contains('is-collapsed'));
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && small.matches && !app.classList.contains('is-collapsed')) {
            setCollapsed(true);
            handle.focus();
        }
    });

    /* Phones open with the map in view; the sheet expands on demand or on a result. */
    setCollapsed(small.matches);
    measure();

    /* A fresh result is worth showing straight away. */
    const observer = new MutationObserver(() => {
        if (small.matches && app.classList.contains('is-collapsed') && resultEl.classList.contains('success')) {
            setCollapsed(false);
        }
    });
    observer.observe(resultEl, { attributes: true, attributeFilter: ['class'] });
})();
