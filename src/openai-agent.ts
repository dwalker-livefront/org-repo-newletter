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
  private readonly MAX_TOOL_RESULT_TOKENS = 5000; // Limit tool results to avoid token limits
  private readonly MAX_TOTAL_MESSAGE_TOKENS = 20000; // Limit total message context

  constructor(config: AppConfig, mcpClient: GitHubMCPClient) {
    this.config = config;
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
    this.mcpClient = mcpClient;
  }

  // Rough token estimation: ~4 characters per token
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // Truncate content to fit within token limit
  private truncateContent(content: string, maxTokens: number): string {
    const estimatedTokens = this.estimateTokens(content);
    if (estimatedTokens <= maxTokens) {
      return content;
    }

    // Truncate to approximately maxTokens
    const maxChars = maxTokens * 4;
    const truncated = content.substring(0, maxChars);
    return truncated + "\n\n[Content truncated due to size limits...]";
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

    let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    let maxIterations = 20;
    let iteration = 0;

    while (iteration < maxIterations) {
      // Check total message size and truncate if needed
      const totalMessageSize = messages.reduce((sum, msg) => {
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        return sum + this.estimateTokens(content);
      }, 0);

      if (totalMessageSize > this.MAX_TOTAL_MESSAGE_TOKENS) {
        console.warn(
          `  Message context is large (${totalMessageSize} tokens), truncating older messages...`
        );
        // Keep system prompt and last few messages, remove middle ones
        const systemMsg = messages[0];
        const lastMessages = messages.slice(-5); // Keep last 5 messages
        messages = [systemMsg, ...lastMessages];
      }

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
          console.log(
            `  Calling tool: ${toolName} with args:`,
            JSON.stringify(toolArgs, null, 2)
          );
          const result = await this.mcpClient.callTool(toolName, toolArgs);

          if (result.isError) {
            console.error(`  Tool ${toolName} returned error:`, result.content);
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result.content),
            });
          } else {
            // Extract text content from MCP result
            let textContent = result.content
              .map((item) => item.text || JSON.stringify(item))
              .join("\n");

            // Truncate large tool results to avoid token limits
            // Especially important for PR diffs which can be very large
            if (toolName.includes("diff") || toolName.includes("files")) {
              textContent = this.truncateContent(
                textContent,
                this.MAX_TOOL_RESULT_TOKENS
              );
              console.log(
                `  Truncated tool result to ~${this.MAX_TOOL_RESULT_TOKENS} tokens`
              );
            } else {
              textContent = this.truncateContent(
                textContent,
                this.MAX_TOOL_RESULT_TOKENS * 2
              );
            }

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: textContent || JSON.stringify(result.content),
            });
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.error(`  Error calling tool ${toolName}:`, errorMsg);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: `Error: ${errorMsg}`,
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
3. For large PRs, focus on file names and summary rather than full diffs
4. Generate a 1-2 sentence summary for each PR
5. Identify any high-risk or breaking changes

IMPORTANT: If PR diffs are very large, focus on:
- File names changed
- High-level summary of changes
- Key functionality affected
- Avoid including full diff content unless necessary

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
