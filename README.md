# OCM MCP Demo

A simple web application demonstrating the OCM (Open Charge Map) MCP (Model Context Protocol) SDK.

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
- "Find charging stations in London"
- "Find charging stations in Paris"

## Deploy to Render

1. Connect your GitHub repository to Render
2. Set environment variable `OCM_API_KEY` (optional)
3. Deploy as a Web Service

The app will automatically create the frontend files and start the server.