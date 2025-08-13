import { spawn } from 'child_process';

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

export default MCPClient;