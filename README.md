# OCM MCP Demo

A simple web application demonstrating the OCM (Open Charge Map) MCP (Model Context Protocol) SDK, using the npm package of https://github.com/andreibesleaga/ocm-sdk mcp-server.

Live: https://ocm-demo.onrender.com/

## Features

- Interactive map showing EV charging stations
- AI-style command interface using MCP
- Real-time data from Open Charge Map API

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

Enter commands like:
- "Find charging stations in US" or "charging US"
- "Find charging stations in London, GB" or "stations near London, GB"
- "charging stations Paris, FR" or "stations Paris"
- "List tools" or "tools" (show available MCP tools)

The app accepts flexible command formats - just mention "charging", "stations", or "poi" with a location.
