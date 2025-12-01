import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: any;
  }>;
  isError?: boolean;
}

export class GitHubMCPClient {
  private client: Client | null = null;
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async connect(): Promise<void> {
    // Initialize MCP client connection
    // This assumes the GitHub MCP server is running and accessible
    // The actual connection method depends on how MCP is configured
    // For now, we'll create a client that can route tool calls
    
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        ...process.env,
        GITHUB_TOKEN: this.token
      }
    });

    this.client = new Client({
      name: 'github-newsletter-generator',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await this.client.connect(transport);
  }

  async callTool(toolName: string, args: Record<string, any>): Promise<MCPToolResult> {
    if (!this.client) {
      throw new Error('MCP client not connected');
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: args
      });

      return {
        content: (result.content || []) as Array<{ type: string; text?: string; [key: string]: any }>,
        isError: false
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error calling tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  // Helper methods for common GitHub MCP operations
  async listPullRequests(params: {
    owner: string;
    repo: string;
    state?: 'open' | 'closed' | 'all';
    base?: string;
    perPage?: number;
    page?: number;
  }): Promise<any> {
    return this.callTool('mcp_GitHub_list_pull_requests', params);
  }

  async getPullRequest(params: {
    owner: string;
    repo: string;
    pullNumber: number;
  }): Promise<any> {
    return this.callTool('mcp_GitHub_get_pull_request', params);
  }

  async getPullRequestDiff(params: {
    owner: string;
    repo: string;
    pullNumber: number;
  }): Promise<any> {
    return this.callTool('mcp_GitHub_get_pull_request_diff', params);
  }

  async getPullRequestFiles(params: {
    owner: string;
    repo: string;
    pullNumber: number;
    page?: number;
    perPage?: number;
  }): Promise<any> {
    return this.callTool('mcp_GitHub_get_pull_request_files', params);
  }

  async listCommits(params: {
    owner: string;
    repo: string;
    sha?: string;
    author?: string;
    perPage?: number;
    page?: number;
  }): Promise<any> {
    return this.callTool('mcp_GitHub_list_commits', params);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}

