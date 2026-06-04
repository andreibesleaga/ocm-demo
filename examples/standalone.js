// Minimal standalone example of using the MCP client without the web server.
//   node examples/standalone.js
import MCPClient from '../mcp-client.js';

async function run() {
  const client = new MCPClient();

  const tools = await client.listTools();
  console.log('Available tools:', tools.map((t) => t.name));

  const stations = await client.callTool('list_poi', {
    latitude: 51.5074,
    longitude: -0.1278,
    distance: 25,
    maxresults: 5,
  });
  console.log('Stations found:', Array.isArray(stations) ? stations.length : stations);
}

run().catch((err) => {
  console.error('Example failed:', err.message);
  process.exit(1);
});
