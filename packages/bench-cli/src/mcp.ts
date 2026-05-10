import { MCP_URL } from './config.js';

export function printMcpConfig(client: string): void {
  if (client === 'claude') {
    console.log(JSON.stringify({
      mcpServers: {
        'wacht-docs': {
          command: 'npx',
          args: ['-y', 'mcp-remote', MCP_URL],
        },
      },
    }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    mcpServers: {
      'wacht-docs': {
        url: MCP_URL,
      },
    },
  }, null, 2));
}
