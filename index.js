import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import MCPClient from './mcp-server.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false })); // CSP off: demo loads Leaflet/tiles from CDNs
app.use(express.json());

// Configurable rate limit; defaults are permissive enough not to affect normal demo use.
app.use(rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 120,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(express.static('public'));

// Liveness probe for Railway / orchestrators.
app.get('/healthz', (req, res) => res.json({ ok: true }));

const mcpClient = new MCPClient();

// Calculate distance between two coordinates in km
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// API endpoint to handle MCP commands
app.post('/api/mcp', async (req, res) => {
  try {
    const { command } = req.body;

    if (typeof command !== 'string' || command.trim() === '') {
      return res.status(400).json({ error: 'Missing "command" string in request body.' });
    }

    if (command.toLowerCase().includes('charging') || command.toLowerCase().includes('stations') || command.toLowerCase().includes('poi') || command.toLowerCase().includes('coordinates')) {
      // Extract location from various formats
      let location = '';
      const locationMatch = command.match(/(?:in|near|at|for)\s+([^\n]+)/i);
      if (locationMatch) {
        location = locationMatch[1].trim();
      } else {
        // Try to extract last word(s) as location
        const words = command.trim().split(/\s+/);
        if (words.length > 1) {
          location = words[words.length - 1];
        }
      }
      
      const params = { maxresults: 100 };
      
      if (location) {
        // Handle coordinate input from map selection
        if (location.includes('coordinates') || command.toLowerCase().includes('coordinates')) {
          const coordMatch = command.match(/coordinates\s+([\d.-]+),\s*([\d.-]+)/i);
          if (coordMatch) {
            params.latitude = parseFloat(coordMatch[1]);
            params.longitude = parseFloat(coordMatch[2]);
            params.distance = 25;
          }
        }
        // Use Nominatim API for location lookup
        else {
          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`, {
              // Nominatim's usage policy requires a descriptive User-Agent.
              headers: { 'User-Agent': 'ocm-demo/1.0 (https://github.com/andreibesleaga/ocm-demo)' }
            });
            const data = await response.json();
            
            if (data && data.length > 0) {
              const result = data[0];
              params.latitude = parseFloat(result.lat);
              params.longitude = parseFloat(result.lon);
              
              // Set distance based on place type
              const type = result.type || result.class;
              if (type === 'country' || result.display_name.split(',').length <= 2) {
                params.distance = 500; // Large area for countries
              } else if (type === 'state' || type === 'region') {
                params.distance = 200; // Medium area for states/regions
              } else {
                params.distance = 30; // Small area for cities
              }
              
              // Extract country code if available
              const countryMatch = result.display_name.match(/\b([A-Z]{2})\b/);
              if (countryMatch) {
                params.countrycode = countryMatch[1];
              }
            }
          } catch (error) {
            console.error('Geocoding error:', error);
          }
        }
      }

      console.log('OCM API params:', params);
      const result = await mcpClient.callTool('list_poi', params);
      console.log('OCM API result count:', Array.isArray(result) ? result.length : 'not array');
      
      // Filter results to ensure they're within the specified area
      let filteredResult = result;
      if (Array.isArray(result) && params.latitude && params.longitude && params.distance) {
        filteredResult = result.filter(poi => {
          if (!poi.AddressInfo || !poi.AddressInfo.Latitude || !poi.AddressInfo.Longitude) {
            return false;
          }
          
          const distance = calculateDistance(
            params.latitude, params.longitude,
            poi.AddressInfo.Latitude, poi.AddressInfo.Longitude
          );
          
          return distance <= params.distance;
        });
        console.log('Filtered result count:', filteredResult.length);
      }
      
      res.json(filteredResult);
    } else if (command.toLowerCase().includes('tools')) {
      const tools = await mcpClient.listTools();
      res.json({ tools });
    } else {
      res.json({ 
        error: 'Command not recognized. Try: "Find charging stations in [location]" or "List tools"',
        availableCommands: ['Find charging stations in [location]', 'List tools']
      });
    }
  } catch (error) {
    console.error('MCP Error:', error);
    // Avoid leaking internal messages/stack details to clients in production.
    const safeError = process.env.NODE_ENV === 'production'
      ? 'Internal Server Error processing command.'
      : error.message;
    res.status(500).json({ error: safeError });
  }
});

export default app;

// Only probe MCP and start listening when run directly (`node index.js`),
// so the app can be imported in tests without spawning a server.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const tools = await mcpClient.listTools();
    console.log(`MCP client ready with ${tools.length} tools:`, tools.map(t => t.name));
  } catch (error) {
    console.error('MCP client test failed:', error.message);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Using real MCP protocol with ocm-mcp server`);
    console.log(`Open http://localhost:${PORT} to view the demo`);
  });
}