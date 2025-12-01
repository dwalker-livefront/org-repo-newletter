import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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
    // Initialize MCP client connection to GitHub MCP server
    // According to https://github.com/github/github-mcp-server, the server can be run:
    // 1. Via Docker (default for POC): docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN=<token> ghcr.io/github/github-mcp-server
    // 2. As a binary: Set GITHUB_MCP_BINARY_PATH env var to use a local binary instead
    const binaryPath = process.env.GITHUB_MCP_BINARY_PATH;

    let transport: StdioClientTransport;

    // Helper to filter out undefined env vars
    const getEnv = (): Record<string, string> => {
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }
      return env;
    };

    if (binaryPath) {
      // Use specified binary path if provided
      const env = getEnv();
      env.GITHUB_PERSONAL_ACCESS_TOKEN = this.token;
      transport = new StdioClientTransport({
        command: binaryPath,
        args: [],
        env: env,
      });
    } else {
      // Default to Docker for POC
      // Use Docker to run the GitHub MCP server
      transport = new StdioClientTransport({
        command: "docker",
        args: [
          "run",
          "-i",
          "--rm",
          "-e",
          `GITHUB_PERSONAL_ACCESS_TOKEN=${this.token}`,
          "ghcr.io/github/github-mcp-server",
        ],
        env: getEnv(),
      });
    }

    this.client = new Client(
      {
        name: "github-newsletter-generator",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    try {
      await this.client.connect(transport);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes("ENOENT") || errorMsg.includes("not found")) {
        throw new Error(
          `GitHub MCP server not found. Please install it from https://github.com/github/github-mcp-server or set GITHUB_MCP_BINARY_PATH environment variable to the path of the binary. Alternatively, set GITHUB_MCP_USE_DOCKER=1 to use Docker.`
        );
      }
      throw error;
    }

    // List available tools for debugging
    // According to MCP SDK, we should use listTools() method
    try {
      // The MCP SDK Client should have a listTools method
      const toolsResponse = await (this.client as any).listTools();
      if (toolsResponse && toolsResponse.tools) {
        const toolNames = toolsResponse.tools
          .map((t: any) => t.name || t)
          .join(", ");
        console.log("Available MCP tools:", toolNames);
      }
    } catch (error) {
      console.warn(
        "Could not list MCP tools (this is okay):",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async listAvailableTools(): Promise<string[]> {
    if (!this.client) {
      throw new Error("MCP client not connected");
    }

    try {
      const toolsResponse =
        (await (this.client as any).listTools?.()) ||
        (await (this.client as any).getTools?.());
      if (toolsResponse && toolsResponse.tools) {
        return toolsResponse.tools.map((t: any) => t.name || t);
      }
      return [];
    } catch (error) {
      console.error("Error listing tools:", error);
      return [];
    }
  }

  async callTool(
    toolName: string,
    args: Record<string, any>
  ): Promise<MCPToolResult> {
    if (!this.client) {
      throw new Error("MCP client not connected");
    }

    try {
      // Map OpenAI function names to actual MCP tool names and adjust arguments
      const { actualToolName, adjustedArgs } = this.mapToolNameAndArgs(
        toolName,
        args
      );

      console.log(
        `MCP: Calling ${actualToolName} with args:`,
        JSON.stringify(adjustedArgs, null, 2)
      );

      const result = await this.client.callTool({
        name: actualToolName,
        arguments: adjustedArgs,
      });

      return {
        content: (result.content || []) as Array<{
          type: string;
          text?: string;
          [key: string]: any;
        }>,
        isError: false,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error calling tool ${toolName}:`, errorMessage);
      return {
        content: [
          {
            type: "text",
            text: `Error calling tool ${toolName}: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  private mapToolNameAndArgs(
    openAIToolName: string,
    args: Record<string, any>
  ): { actualToolName: string; adjustedArgs: Record<string, any> } {
    // Map OpenAI function names to actual GitHub MCP tool names
    // Try multiple possible tool name formats
    const adjustedArgs = { ...args };

    if (openAIToolName === "mcp_GitHub_list_pull_requests") {
      // Try common variations
      return { actualToolName: "list_pull_requests", adjustedArgs };
    }

    if (openAIToolName === "mcp_GitHub_get_pull_request") {
      // Try pull_request_read with method, or get_pull_request
      adjustedArgs.method = "get";
      return { actualToolName: "pull_request_read", adjustedArgs };
    }

    if (openAIToolName === "mcp_GitHub_get_pull_request_diff") {
      adjustedArgs.method = "diff";
      return { actualToolName: "pull_request_read", adjustedArgs };
    }

    if (openAIToolName === "mcp_GitHub_get_pull_request_files") {
      adjustedArgs.method = "files";
      return { actualToolName: "pull_request_read", adjustedArgs };
    }

    if (openAIToolName === "mcp_GitHub_list_commits") {
      return { actualToolName: "list_commits", adjustedArgs };
    }

    // Try common variations for listing org repos
    if (
      openAIToolName === "list_org_repositories" ||
      openAIToolName.includes("org_repo")
    ) {
      // Try different possible tool names
      return { actualToolName: "list_org_repositories", adjustedArgs };
    }

    // Default: try the name as-is, or remove mcp_GitHub_ prefix
    const cleanedName = openAIToolName.replace(/^mcp_GitHub_/, "");
    return { actualToolName: cleanedName, adjustedArgs };
  }

  // Helper methods for common GitHub MCP operations
  async listPullRequests(params: {
    owner: string;
    repo: string;
    state?: "open" | "closed" | "all";
    base?: string;
    perPage?: number;
    page?: number;
  }): Promise<any> {
    return this.callTool("list_pull_requests", params);
  }

  async getPullRequest(params: {
    owner: string;
    repo: string;
    pullNumber: number;
    method?: string;
  }): Promise<any> {
    // Use the new pull_request_read tool with method parameter
    return this.callTool("pull_request_read", {
      ...params,
      method: params.method || "get",
    });
  }

  async getPullRequestDiff(params: {
    owner: string;
    repo: string;
    pullNumber: number;
  }): Promise<any> {
    return this.callTool("pull_request_read", {
      ...params,
      method: "diff",
    });
  }

  async getPullRequestFiles(params: {
    owner: string;
    repo: string;
    pullNumber: number;
    page?: number;
    perPage?: number;
  }): Promise<any> {
    return this.callTool("pull_request_read", {
      ...params,
      method: "files",
    });
  }

  async listCommits(params: {
    owner: string;
    repo: string;
    sha?: string;
    author?: string;
    perPage?: number;
    page?: number;
  }): Promise<any> {
    return this.callTool("list_commits", params);
  }

  async listOrgRepositories(params: {
    org: string;
    type?: "all" | "public" | "private" | "forks" | "sources" | "member";
    sort?: "created" | "updated" | "pushed" | "full_name";
    direction?: "asc" | "desc";
    perPage?: number;
    page?: number;
  }): Promise<any> {
    // Try common tool names for listing org repos
    return this.callTool("list_org_repositories", params);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}
