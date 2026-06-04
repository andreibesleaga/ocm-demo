import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock the MCP client so tests never spawn `npx ocm-mcp`.
const listTools = vi.fn();
const callTool = vi.fn();
vi.mock('../mcp-server.js', () => ({
  default: class {
    listTools = listTools;
    callTool = callTool;
  },
}));

const { default: app } = await import('../index.js');

describe('ocm-demo server', () => {
  beforeEach(() => {
    listTools.mockReset();
    callTool.mockReset();
  });

  it('GET /healthz returns ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('POST /api/mcp "List tools" returns tools', async () => {
    listTools.mockResolvedValue([{ name: 'list_poi' }]);
    const res = await request(app).post('/api/mcp').send({ command: 'List tools' });
    expect(res.status).toBe(200);
    expect(res.body.tools).toEqual([{ name: 'list_poi' }]);
  });

  it('POST /api/mcp charging command calls list_poi and returns array', async () => {
    callTool.mockResolvedValue([]);
    const res = await request(app)
      .post('/api/mcp')
      .send({ command: 'Search coordinates 51.5074, -0.1278' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(callTool).toHaveBeenCalledWith('list_poi', expect.objectContaining({
      latitude: 51.5074,
      longitude: -0.1278,
    }));
  });

  it('POST /api/mcp with empty command returns 400', async () => {
    const res = await request(app).post('/api/mcp').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/command/i);
  });

  it('unrecognized command returns helpful message', async () => {
    const res = await request(app).post('/api/mcp').send({ command: 'hello there' });
    expect(res.status).toBe(200);
    expect(res.body.error).toMatch(/not recognized/i);
    expect(res.body.availableCommands).toBeInstanceOf(Array);
  });

  it('sanitizes internal errors in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    listTools.mockRejectedValue(new Error('secret internal path /etc/leak'));
    const res = await request(app).post('/api/mcp').send({ command: 'List tools' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal Server Error processing command.');
    expect(JSON.stringify(res.body)).not.toMatch(/leak/);
    process.env.NODE_ENV = prev;
  });
});
