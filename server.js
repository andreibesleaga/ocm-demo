import express from 'express';
import { spawn } from 'child_process';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// MCP Client using direct stdio communication
class MCPClient {
  async sendMCPRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      };

      const childProcess = spawn('npx', ['ocm-mcp'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          OCM_API_KEY: process.env.OCM_API_KEY || ''
        }
      });

      let output = '';

      childProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        // Ignore stderr output
      });

      childProcess.on('close', (code) => {
        try {
          const lines = output.split('\n').filter(line => line.trim());
          const jsonLine = lines.find(line => {
            try {
              const parsed = JSON.parse(line);
              return parsed.jsonrpc && parsed.id;
            } catch {
              return false;
            }
          });

          if (jsonLine) {
            const response = JSON.parse(jsonLine);
            if (response.error) {
              reject(new Error(response.error.message || 'MCP Error'));
            } else {
              resolve(response.result);
            }
          } else {
            reject(new Error('No valid JSON response'));
          }
        } catch (error) {
          reject(error);
        }
      });

      childProcess.stdin.write(JSON.stringify(request) + '\n');
      childProcess.stdin.end();
    });
  }

  async callTool(toolName, args = {}) {
    try {
      const result = await this.sendMCPRequest('tools/call', {
        name: toolName,
        arguments: args
      });
      
      // Handle OCM API response format
      if (result.content && Array.isArray(result.content) && result.content[0] && result.content[0].type === 'text') {
        try {
          return JSON.parse(result.content[0].text);
        } catch (parseError) {
          console.error('Failed to parse OCM response:', parseError);
          return result.content;
        }
      }
      
      return result.content || result;
    } catch (error) {
      console.error('MCP Tool call error:', error);
      throw error;
    }
  }

  async listTools() {
    try {
      const result = await this.sendMCPRequest('tools/list', {});
      return result.tools || [];
    } catch (error) {
      console.error('MCP List tools error:', error);
      return [];
    }
  }
}

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
        const loc = location.toLowerCase().trim();
        
        // Comprehensive location database
        const locations = {
          // Major cities
          'london': { latitude: 51.5074, longitude: -0.1278, distance: 30, countrycode: 'GB' },
          'paris': { latitude: 48.8566, longitude: 2.3522, distance: 30, countrycode: 'FR' },
          'berlin': { latitude: 52.5200, longitude: 13.4050, distance: 30, countrycode: 'DE' },
          'madrid': { latitude: 40.4168, longitude: -3.7038, distance: 30, countrycode: 'ES' },
          'rome': { latitude: 41.9028, longitude: 12.4964, distance: 30, countrycode: 'IT' },
          'amsterdam': { latitude: 52.3676, longitude: 4.9041, distance: 25, countrycode: 'NL' },
          'barcelona': { latitude: 41.3851, longitude: 2.1734, distance: 30, countrycode: 'ES' },
          'munich': { latitude: 48.1351, longitude: 11.5820, distance: 25, countrycode: 'DE' },
          'vienna': { latitude: 48.2082, longitude: 16.3738, distance: 25, countrycode: 'AT' },
          'zurich': { latitude: 47.3769, longitude: 8.5417, distance: 20, countrycode: 'CH' },
          'brussels': { latitude: 50.8503, longitude: 4.3517, distance: 25, countrycode: 'BE' },
          'copenhagen': { latitude: 55.6761, longitude: 12.5683, distance: 25, countrycode: 'DK' },
          'stockholm': { latitude: 59.3293, longitude: 18.0686, distance: 30, countrycode: 'SE' },
          'oslo': { latitude: 59.9139, longitude: 10.7522, distance: 25, countrycode: 'NO' },
          'helsinki': { latitude: 60.1699, longitude: 24.9384, distance: 25, countrycode: 'FI' },
          'dublin': { latitude: 53.3498, longitude: -6.2603, distance: 25, countrycode: 'IE' },
          'lisbon': { latitude: 38.7223, longitude: -9.1393, distance: 25, countrycode: 'PT' },
          'warsaw': { latitude: 52.2297, longitude: 21.0122, distance: 25, countrycode: 'PL' },
          'prague': { latitude: 50.0755, longitude: 14.4378, distance: 25, countrycode: 'CZ' },
          'budapest': { latitude: 47.4979, longitude: 19.0402, distance: 25, countrycode: 'HU' },
          // US cities
          'new york': { latitude: 40.7128, longitude: -74.0060, distance: 40, countrycode: 'US' },
          'los angeles': { latitude: 34.0522, longitude: -118.2437, distance: 50, countrycode: 'US' },
          'chicago': { latitude: 41.8781, longitude: -87.6298, distance: 40, countrycode: 'US' },
          'san francisco': { latitude: 37.7749, longitude: -122.4194, distance: 30, countrycode: 'US' },
          'seattle': { latitude: 47.6062, longitude: -122.3321, distance: 30, countrycode: 'US' },
          'miami': { latitude: 25.7617, longitude: -80.1918, distance: 30, countrycode: 'US' },
          'denver': { latitude: 39.7392, longitude: -104.9903, distance: 35, countrycode: 'US' },
          'austin': { latitude: 30.2672, longitude: -97.7431, distance: 30, countrycode: 'US' },
          // Countries
          'us': { latitude: 39.8283, longitude: -98.5795, distance: 2000, countrycode: 'US' },
          'usa': { latitude: 39.8283, longitude: -98.5795, distance: 2000, countrycode: 'US' },
          'gb': { latitude: 54.7023, longitude: -3.2765, distance: 400, countrycode: 'GB' },
          'uk': { latitude: 54.7023, longitude: -3.2765, distance: 400, countrycode: 'GB' },
          'fr': { latitude: 46.6034, longitude: 1.8883, distance: 400, countrycode: 'FR' },
          'france': { latitude: 46.6034, longitude: 1.8883, distance: 400, countrycode: 'FR' },
          'de': { latitude: 51.1657, longitude: 10.4515, distance: 400, countrycode: 'DE' },
          'germany': { latitude: 51.1657, longitude: 10.4515, distance: 400, countrycode: 'DE' },
          'es': { latitude: 40.4637, longitude: -3.7492, distance: 400, countrycode: 'ES' },
          'spain': { latitude: 40.4637, longitude: -3.7492, distance: 400, countrycode: 'ES' },
          'it': { latitude: 41.8719, longitude: 12.5674, distance: 400, countrycode: 'IT' },
          'italy': { latitude: 41.8719, longitude: 12.5674, distance: 400, countrycode: 'IT' },
          'nl': { latitude: 52.1326, longitude: 5.2913, distance: 100, countrycode: 'NL' },
          'netherlands': { latitude: 52.1326, longitude: 5.2913, distance: 100, countrycode: 'NL' },
          'be': { latitude: 50.5039, longitude: 4.4699, distance: 100, countrycode: 'BE' },
          'belgium': { latitude: 50.5039, longitude: 4.4699, distance: 100, countrycode: 'BE' },
          'ch': { latitude: 46.8182, longitude: 8.2275, distance: 150, countrycode: 'CH' },
          'switzerland': { latitude: 46.8182, longitude: 8.2275, distance: 150, countrycode: 'CH' },
          'at': { latitude: 47.5162, longitude: 14.5501, distance: 200, countrycode: 'AT' },
          'austria': { latitude: 47.5162, longitude: 14.5501, distance: 200, countrycode: 'AT' },
          'dk': { latitude: 56.2639, longitude: 9.5018, distance: 200, countrycode: 'DK' },
          'denmark': { latitude: 56.2639, longitude: 9.5018, distance: 200, countrycode: 'DK' },
          'se': { latitude: 60.1282, longitude: 18.6435, distance: 600, countrycode: 'SE' },
          'sweden': { latitude: 60.1282, longitude: 18.6435, distance: 600, countrycode: 'SE' },
          'no': { latitude: 60.4720, longitude: 8.4689, distance: 600, countrycode: 'NO' },
          'norway': { latitude: 60.4720, longitude: 8.4689, distance: 600, countrycode: 'NO' }
        };
        
        // Try exact match first
        if (locations[loc]) {
          Object.assign(params, locations[loc]);
        }
        // Handle "City, Country" format
        else if (location.includes(',')) {
          const parts = location.split(',').map(p => p.trim().toLowerCase());
          const cityName = parts[0];
          const countryCode = parts[1];
          
          if (locations[cityName]) {
            Object.assign(params, locations[cityName]);
          } else if (locations[countryCode]) {
            Object.assign(params, locations[countryCode]);
          }
        }
        // Handle coordinate input from map selection
        else if (location.includes('coordinates')) {
          const coordMatch = location.match(/coordinates\s+([\d.-]+),\s*([\d.-]+)/i);
          if (coordMatch) {
            params.latitude = parseFloat(coordMatch[1]);
            params.longitude = parseFloat(coordMatch[2]);
            params.distance = 25; // 25km radius around selected point
          }
        }
        // Fallback: try partial matching for regions/states
        else {
          const partialMatch = Object.keys(locations).find(key => 
            key.includes(loc) || loc.includes(key)
          );
          if (partialMatch) {
            Object.assign(params, locations[partialMatch]);
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
    res.status(500).json({ error: error.message });
  }
});



// Test MCP client on startup
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
