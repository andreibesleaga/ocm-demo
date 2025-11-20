# OCM MCP Demo

A simple web app demonstrating the OCM (Open Charge Map) MCP (Model Context Protocol) SDK,
using the npm package of https://github.com/andreibesleaga/ocm-sdk mcp-server.

Live demo: https://ocm-demo.up.railway.app/

Live MCP server: https://ocm-mcp.stlmcp.com

## Features

- Interactive map showing EV charging stations
- AI-style command interface using MCP
- Real-time data from Open Charge Map API
- Click-to-select map coordinates
  

## Project Structure

```
ocm-demo/
├── index.js          # Main Express application
├── mcp-server.js     # MCP client module (can be used standalone)
├── public/
│   ├── index.html    # Web interface
│   └── app.js        # Client-side JavaScript
├── package.json
└── README.md
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set environment variable (optional):
```bash
export OCM_API_KEY=your_ocm_api_key
```

3. Run the application:
```bash
npm start
```

4. Open http://localhost:3000

## Usage

### Web Interface Commands

Enter commands like:
- "Find charging stations in US" or "charging US"
- "Find charging stations in London, GB" or "stations near London, GB"
- "charging stations Paris, FR" or "stations Paris"
- "Search coordinates 51.5074, -0.1278" (from map clicks)
- "List tools" or "tools" (show available MCP tools)

### Map Interaction

- **Click anywhere on the map** to select coordinates
- **Click "Search Here"** to find stations within 25km of selected point
- **Auto-populated coordinates** in command field

The app accepts flexible command formats - just mention "charging", "stations", "poi", or "coordinates" with a location.

## Running MCP Server Separately

### For Claude Desktop or Other AI Tools

The MCP server can be run independently and connected to Claude Desktop or other MCP-compatible AI tools.

#### Option 1: Direct NPX Command
```bash
npm run mcp-server
# or
npx ocm-mcp
```

#### Option 2: Claude Desktop Integration

Add to your Claude Desktop config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "ocm": {
      "command": "npx",
      "args": ["ocm-mcp"],
      "env": {
        "OCM_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

#### Option 3: Using the MCP Client Module

```javascript
import MCPClient from './mcp-server.js';

const client = new MCPClient();

// List available tools
const tools = await client.listTools();
console.log('Available tools:', tools);

// Search for charging stations
const stations = await client.callTool('list_poi', {
  latitude: 51.5074,
  longitude: -0.1278,
  distance: 25,
  maxresults: 50
});
```

### Available MCP Tools

The OCM MCP server provides these tools:
- `list_poi` - Search for charging stations by location
- `retrieve_referencedata` - Get reference data (countries, operators, etc.)
- `authenticate_profile` - Authenticate user profile
- `submit_comment` - Submit comments about charging stations
- `create_mediaitem` - Create media items
- `retrieve_openapi` - Get OpenAPI specification

### Example Claude Prompts

Once connected to Claude Desktop:
- "Find EV charging stations in London"
- "Show me fast charging stations within 50km of Paris"
- "List charging stations in California with Tesla connectors"
- "What charging options are available near coordinates 40.7128, -74.0060?"

## Environment Variables

- `OCM_API_KEY` - Optional Open Charge Map API key for higher rate limits
- `PORT` - Server port (default: 3000)

## API Endpoints

- `POST /api/mcp` - Send MCP commands to the server
- `GET /` - Serve the web interface
