import express from 'express';
import { server, endpoints, init } from 'ocm-mcp/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/index.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Initialize MCP server
const mcpServer = new McpServer(
  { name: 'ocm-demo', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Initialize with OCM endpoints
init({ server: mcpServer, endpoints });

// API endpoint to handle MCP requests
app.post('/api/mcp', async (req, res) => {
  try {
    const { command } = req.body;
    
    // Parse command and call appropriate tool
    let result;
    
    if (command.toLowerCase().includes('charging stations') || command.toLowerCase().includes('poi')) {
      // Extract location parameters
      const locationMatch = command.match(/in\s+([a-zA-Z\s]+)/i);
      const params = { maxresults: 20 };
      
      if (locationMatch) {
        const location = locationMatch[1].trim().toLowerCase();
        if (location.includes('london')) {
          params.latitude = 51.5074;
          params.longitude = -0.1278;
          params.distance = 10;
        } else if (location.includes('paris')) {
          params.latitude = 48.8566;
          params.longitude = 2.3522;
          params.distance = 10;
        }
      }
      
      // Find the list_poi tool
      const listPoiTool = endpoints.find(e => e.tool.name === 'list_poi');
      if (listPoiTool) {
        result = await listPoiTool.handler(null, params);
      } else {
        result = { error: 'list_poi tool not found' };
      }
    } else {
      result = { 
        error: 'Command not recognized. Try: "Find charging stations in London"',
        availableCommands: ['Find charging stations in [location]']
      };
    }
    
    res.json(result);
  } catch (error) {
    console.error('MCP Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create public directory and files
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

async function createPublicFiles() {
  if (!existsSync('public')) {
    await mkdir('public');
  }
  
  const indexHtml = `<!DOCTYPE html>
<html>
<head>
    <title>OCM MCP Demo</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        body { margin: 0; font-family: Arial, sans-serif; }
        .container { display: flex; height: 100vh; }
        #map { flex: 1; }
        .sidebar { width: 300px; padding: 20px; background: #f5f5f5; overflow-y: auto; }
        .input-group { margin-bottom: 15px; }
        textarea { width: 100%; height: 100px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
        button { width: 100%; padding: 10px; background: #007cba; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #005a87; }
        .result { margin-top: 15px; padding: 10px; background: white; border-radius: 4px; font-size: 12px; }
        .error { background: #ffe6e6; color: #d00; }
    </style>
</head>
<body>
    <div class="container">
        <div id="map"></div>
        <div class="sidebar">
            <h3>OCM MCP Demo</h3>
            <div class="input-group">
                <textarea id="command" placeholder="Enter command like: Find charging stations in London"></textarea>
                <button onclick="sendCommand()">Send Command</button>
            </div>
            <div id="result" class="result">Enter a command to get started</div>
        </div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        const map = L.map('map').setView([51.505, -0.09], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        let markers = [];

        async function sendCommand() {
            const command = document.getElementById('command').value;
            const resultDiv = document.getElementById('result');
            
            if (!command.trim()) return;
            
            resultDiv.innerHTML = 'Processing...';
            
            try {
                const response = await fetch('/api/mcp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command })
                });
                
                const result = await response.json();
                
                if (result.error) {
                    resultDiv.innerHTML = '<div class="error">' + result.error + '</div>';
                } else {
                    displayResults(result);
                }
            } catch (error) {
                resultDiv.innerHTML = '<div class="error">Error: ' + error.message + '</div>';
            }
        }

        function displayResults(result) {
            const resultDiv = document.getElementById('result');
            
            // Clear existing markers
            markers.forEach(marker => map.removeLayer(marker));
            markers = [];
            
            if (result && Array.isArray(result)) {
                resultDiv.innerHTML = '<strong>Found ' + result.length + ' charging stations</strong>';
                
                result.forEach(poi => {
                    if (poi.AddressInfo && poi.AddressInfo.Latitude && poi.AddressInfo.Longitude) {
                        const marker = L.marker([poi.AddressInfo.Latitude, poi.AddressInfo.Longitude])
                            .addTo(map)
                            .bindPopup('<b>' + (poi.AddressInfo.Title || 'Charging Station') + '</b><br>' +
                                      (poi.AddressInfo.Town || '') + '<br>' +
                                      (poi.Connections && poi.Connections[0] ? poi.Connections[0].PowerKW + 'kW' : ''));
                        markers.push(marker);
                    }
                });
                
                if (markers.length > 0) {
                    const group = new L.featureGroup(markers);
                    map.fitBounds(group.getBounds().pad(0.1));
                }
            } else {
                resultDiv.innerHTML = JSON.stringify(result, null, 2);
            }
        }

        document.getElementById('command').addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && e.ctrlKey) {
                sendCommand();
            }
        });
    </script>
</body>
</html>`;

  await writeFile('public/index.html', indexHtml);
}

createPublicFiles().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to view the demo`);
  });
});