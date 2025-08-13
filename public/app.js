const map = L.map('map').setView([51.505, -0.09], 10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

let markers = [];
let selectedMarker = null;

// Add click handler for map selection
map.on('click', function(e) {
    const lat = e.latlng.lat.toFixed(4);
    const lng = e.latlng.lng.toFixed(4);
    
    // Remove previous selection marker
    if (selectedMarker) {
        map.removeLayer(selectedMarker);
    }
    
    // Add new selection marker (red)
    selectedMarker = L.marker([lat, lng], {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(map).bindPopup(`Selected: ${lat}, ${lng}<br>Click "Search Here" to find stations`);
    
    // Update command input
    document.getElementById('command').value = `Search coordinates ${lat}, ${lng}`;
});

async function sendCommand() {
    const command = document.getElementById('command').value;
    const resultDiv = document.getElementById('result');
    
    if (!command.trim()) return;
    
    resultDiv.innerHTML = 'Processing MCP command via protocol...';
    resultDiv.className = 'result';
    
    try {
        const response = await fetch('/api/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        
        const result = await response.json();
        
        if (result.error) {
            resultDiv.innerHTML = result.error;
            resultDiv.className = 'result error';
        } else if (result.tools) {
            displayTools(result.tools);
        } else {
            displayResults(result);
        }
    } catch (error) {
        resultDiv.innerHTML = 'Network error: ' + error.message;
        resultDiv.className = 'result error';
    }
}

async function listTools() {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = 'Listing MCP tools...';
    
    try {
        const response = await fetch('/api/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'list tools' })
        });
        
        const result = await response.json();
        displayTools(result.tools || []);
    } catch (error) {
        resultDiv.innerHTML = 'Error listing tools: ' + error.message;
        resultDiv.className = 'result error';
    }
}

function displayTools(tools) {
    const resultDiv = document.getElementById('result');
    if (tools.length > 0) {
        resultDiv.innerHTML = '<strong>Available MCP Tools:</strong><br>' + 
            tools.map(tool => '• ' + tool.name + ': ' + tool.description).join('<br>');
        resultDiv.className = 'result info';
    } else {
        resultDiv.innerHTML = 'No MCP tools available';
        resultDiv.className = 'result';
    }
}

function displayResults(result) {
    const resultDiv = document.getElementById('result');
    
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    if (Array.isArray(result) && result.length > 0) {
        let validMarkers = 0;
        
        result.forEach(poi => {
            if (poi.AddressInfo && poi.AddressInfo.Latitude && poi.AddressInfo.Longitude) {
                const title = poi.AddressInfo.Title || 'Charging Station';
                const town = poi.AddressInfo.Town || '';
                const country = poi.AddressInfo.Country ? poi.AddressInfo.Country.Title || poi.AddressInfo.Country : '';
                const power = poi.Connections && poi.Connections[0] && poi.Connections[0].PowerKW 
                    ? poi.Connections[0].PowerKW + 'kW' 
                    : 'Power unknown';
                const status = poi.StatusType ? poi.StatusType.Title || 'Unknown' : 'Unknown';
                
                const popupContent = '<b>' + title + '</b><br>' + 
                    (town ? town + '<br>' : '') +
                    (country ? country + '<br>' : '') +
                    'Power: ' + power + '<br>' +
                    'Status: ' + status;
                
                const marker = L.marker([poi.AddressInfo.Latitude, poi.AddressInfo.Longitude])
                    .addTo(map)
                    .bindPopup(popupContent);
                markers.push(marker);
                validMarkers++;
            }
        });
        
        resultDiv.innerHTML = '<strong>MCP Protocol Result: Found ' + result.length + ' charging stations</strong><br>' +
            'Added ' + validMarkers + ' markers to map';
        resultDiv.className = 'result success';
        
        if (markers.length > 0) {
            const group = new L.featureGroup(markers);
            map.fitBounds(group.getBounds().pad(0.1));
        }
    } else if (Array.isArray(result)) {
        resultDiv.innerHTML = 'MCP Result: No charging stations found';
        resultDiv.className = 'result';
    } else {
        console.log('Raw MCP response:', result);
        resultDiv.innerHTML = 'MCP Response: ' + JSON.stringify(result, null, 2);
        resultDiv.className = 'result';
    }
}

function searchHere() {
    if (selectedMarker) {
        sendCommand();
    } else {
        document.getElementById('result').innerHTML = 'Click on the map first to select a location';
        document.getElementById('result').className = 'result error';
    }
}

function showInstallGuide() {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
        <strong>OCM MCP Server Installation Guide</strong><br><br>
        
        <strong>📦 Installation:</strong><br>
        <code>npm install -g ocm-mcp</code><br><br>
        
        <strong>🔧 Claude Desktop Setup:</strong><br>
        Add to <code>claude_desktop_config.json</code>:<br>
        <pre>{
  "mcpServers": {
    "ocm": {
      "command": "npx",
      "args": ["ocm-mcp"],
      "env": {
        "OCM_API_KEY": "your_api_key_here"
      }
    }
  }
}</pre><br>
        
        <strong>💻 VSCode/Cursor Setup:</strong><br>
        Install MCP extension and add server config<br><br>
        
        <strong>🚀 Example Prompts:</strong><br>
        • "Find EV charging stations in London"<br>
        • "Show me fast charging stations within 50km of Paris"<br>
        • "List charging stations in California with Tesla connectors"<br>
        • "What charging options are near coordinates 40.7128, -74.0060?"<br><br>
        
        <strong>🛠️ Available Tools:</strong><br>
        • <code>list_poi</code> - Search charging stations by location<br>
        • <code>retrieve_referencedata</code> - Get countries, operators, etc.<br>
        • <code>authenticate_profile</code> - User authentication<br>
        • <code>submit_comment</code> - Submit station comments<br>
        • <code>create_mediaitem</code> - Upload station photos<br>
        • <code>retrieve_openapi</code> - Get API documentation<br><br>
        
        <strong>🔗 More Info:</strong><br>
        <a href="https://github.com/andreibesleaga/ocm-sdk" target="_blank">GitHub Repository</a><br>
        <a href="https://www.npmjs.com/package/ocm-mcp" target="_blank">NPM Package</a>
    `;
    resultDiv.className = 'result info';
}

document.getElementById('command').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && e.ctrlKey) {
        sendCommand();
    }
});