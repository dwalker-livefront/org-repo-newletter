import OpenAI from "openai";
import type { AppConfig } from "./config.js";
import { GitHubMCPClient } from "./mcp-client.js";
import { format } from "date-fns";

export interface RepoSummary {
  repoName: string;
  owner: string;
  overallSummary: string;
  pullRequests: Array<{
    number: number;
    title: string;
    author: string;
    mergedDate: string;
    url: string;
    summary: string;
  }>;
  breakingChanges: Array<{
    prNumber: number;
    description: string;
  }>;
}

export class OpenAIAgent {
  private openai: OpenAI;
  private mcpClient: GitHubMCPClient;
  private config: AppConfig;

  constructor(config: AppConfig, mcpClient: GitHubMCPClient) {
    this.config = config;
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
    this.mcpClient = mcpClient;
  }

  async summarizeRepo(
    owner: string,
    repo: string,
    startDate: Date,
    endDate: Date
  ): Promise<RepoSummary> {
    const systemPrompt = this.buildSystemPrompt(
      owner,
      repo,
      startDate,
      endDate
    );
    const userPrompt = this.buildUserPrompt(owner, repo, startDate, endDate);

    // Define available tools for OpenAI
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "mcp_GitHub_list_pull_requests",
          description: "List pull requests for a repository",
          parameters: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              state: { type: "string", enum: ["open", "closed", "all"] },
              base: { type: "string" },
              perPage: { type: "number" },
              page: { type: "number" },
            },
            required: ["owner", "repo"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "mcp_GitHub_get_pull_request",
          description: "Get details of a specific pull request",
          parameters: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              pullNumber: { type: "number" },
            },
            required: ["owner", "repo", "pullNumber"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "mcp_GitHub_get_pull_request_diff",
          description: "Get the diff of a pull request",
          parameters: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              pullNumber: { type: "number" },
            },
            required: ["owner", "repo", "pullNumber"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "mcp_GitHub_get_pull_request_files",
          description: "Get files changed in a pull request",
          parameters: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              pullNumber: { type: "number" },
              page: { type: "number" },
              perPage: { type: "number" },
            },
            required: ["owner", "repo", "pullNumber"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "mcp_GitHub_list_commits",
          description: "List commits for a repository or pull request",
          parameters: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              sha: { type: "string" },
              author: { type: "string" },
              perPage: { type: "number" },
              page: { type: "number" },
            },
            required: ["owner", "repo"],
          },
        },
      },
    ];

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    let maxIterations = 20;
    let iteration = 0;

    while (iteration < maxIterations) {
      const response = await this.openai.chat.completions.create({
        model: this.config.openai.model,
        messages,
        tools,
        tool_choice: "auto",
      });

      const message = response.choices[0]?.message;
      if (!message) {
        throw new Error("No response from OpenAI");
      }

      messages.push(message);

      // If no tool calls, we're done
      if (!message.tool_calls || message.tool_calls.length === 0) {
        // Parse the final summary from the message
        return this.parseSummaryFromMessage(message.content || "", owner, repo);
      }

      // Handle tool calls
      for (const toolCall of message.tool_calls || []) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || "{}");

        try {
          const result = await this.mcpClient.callTool(toolName, toolArgs);

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result.content),
          });
        } catch (error) {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }
      }

      iteration++;
    }

    throw new Error("Max iterations reached while processing repo summary");
  }

  private buildSystemPrompt(
    owner: string,
    repo: string,
    startDate: Date,
    endDate: Date
  ): string {
    return `You are an AI assistant helping to generate a newsletter summary for GitHub repository ${owner}/${repo}.

You have access to GitHub MCP tools that allow you to:
- List pull requests
- Get pull request details
- Get pull request diffs
- Get files changed in pull requests
- List commits

Your task is to summarize all pull requests that were closed/merged between ${format(
      startDate,
      "yyyy-MM-dd"
    )} and ${format(endDate, "yyyy-MM-dd")}.

Use the GitHub MCP tools to gather information about the pull requests, then provide a comprehensive summary.`;
  }

  private buildUserPrompt(
    owner: string,
    repo: string,
    startDate: Date,
    endDate: Date
  ): string {
    return `Summarize all pull requests that were closed/merged in ${owner}/${repo} between ${format(
      startDate,
      "yyyy-MM-dd"
    )} and ${format(endDate, "yyyy-MM-dd")}.

Use the GitHub MCP tools to:
1. Fetch all pull requests that were closed/merged in the timeframe
2. For each PR, get details (number, title, author, merged date, description)
3. If needed, fetch PR diff/files to understand code changes
4. Generate a 1-2 sentence summary for each PR
5. Identify any high-risk or breaking changes

Provide your response in this JSON format:
{
  "overallSummary": "2-3 sentence summary of the week's activity",
  "pullRequests": [
    {
      "number": 123,
      "title": "PR title",
      "author": "username",
      "mergedDate": "2024-01-15",
      "url": "https://github.com/owner/repo/pull/123",
      "summary": "1-2 sentence summary of what this PR does"
    }
  ],
  "breakingChanges": [
    {
      "prNumber": 125,
      "description": "Description of breaking change"
    }
  ]
}`;
  }

  private parseSummaryFromMessage(
    content: string,
    owner: string,
    repo: string
  ): RepoSummary {
    try {
      // Try to extract JSON from the message
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          repoName: repo,
          owner,
          overallSummary: parsed.overallSummary || "No summary provided",
          pullRequests: parsed.pullRequests || [],
          breakingChanges: parsed.breakingChanges || [],
        };
      }
    } catch (error) {
      console.warn("Failed to parse JSON from OpenAI response:", error);
    }

    // Fallback if parsing fails
    return {
      repoName: repo,
      owner,
      overallSummary: content || "No summary provided",
      pullRequests: [],
      breakingChanges: [],
    };
  }
}
