import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// MCP client for the `ocm-mcp` server, using the official SDK so the latest
// MCP protocol version is negotiated automatically (initialize handshake +
// version negotiation are handled by the SDK). Keeps the same public interface
// (`listTools` / `callTool`) the rest of the app already relies on.
class MCPClient {
  // Connect once and reuse the session; reconnect transparently on failure.
  async connect() {
    if (this.client) return this.client;
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['ocm-mcp'],
      env: { ...process.env, OCM_API_KEY: process.env.OCM_API_KEY || '' },
    });
    const client = new Client({ name: 'ocm-demo', version: '1.0.0' });
    await client.connect(transport);
    this.client = client;
    return client;
  }

  async #reset() {
    const c = this.client;
    this.client = undefined;
    try { await c?.close(); } catch { /* already gone */ }
  }

  async listTools() {
    try {
      const client = await this.connect();
      const { tools } = await client.listTools();
      return tools || [];
    } catch (error) {
      await this.#reset();
      console.error('MCP List tools error:', error);
      throw error;
    }
  }

  async callTool(toolName, args = {}) {
    try {
      const client = await this.connect();
      const result = await client.callTool({ name: toolName, arguments: args });

      // Unwrap the OCM API response (same shape as before): text content is JSON.
      if (Array.isArray(result.content) && result.content[0]?.type === 'text') {
        try {
          return JSON.parse(result.content[0].text);
        } catch (parseError) {
          console.error('Failed to parse OCM response:', parseError);
          return result.content;
        }
      }
      return result.content || result;
    } catch (error) {
      await this.#reset();
      console.error('MCP Tool call error:', error);
      throw error;
    }
  }
}

export default MCPClient;
