import { subDays } from "date-fns";
import type { AppConfig } from "./config.js";
import type { GitHubMCPClient } from "./mcp-client.js";

export interface RepoActivity {
  owner: string;
  repo: string;
  prCount: number;
}

// Helper function to check if a date is within the timeframe
export function isWithinTimeframe(
  date: string | null,
  startDate: Date,
  endDate: Date
): boolean {
  if (!date) return false;
  const prDate = new Date(date);
  return prDate >= startDate && prDate <= endDate;
}

/**
 * Extract all unique repos from the teams configuration
 */
export function extractReposFromConfig(
  config: AppConfig
): Array<{ owner: string; repo: string }> {
  const repos: Array<{ owner: string; repo: string }> = [];
  const seenRepos = new Set<string>();

  for (const teamConfig of Object.values(config.teams)) {
    // Add repos from explicit repo list
    if (teamConfig.repos) {
      for (const repoName of teamConfig.repos) {
        const key = `${config.github.organization}/${repoName}`;
        if (!seenRepos.has(key)) {
          seenRepos.add(key);
          repos.push({
            owner: config.github.organization,
            repo: repoName,
          });
        }
      }
    }
  }

  return repos;
}

/**
 * Check if a repository has PRs closed/merged within the timeframe
 */
export async function checkRepoHasPRsInTimeframe(
  mcpClient: GitHubMCPClient,
  owner: string,
  repo: string,
  startDate: Date,
  endDate: Date
): Promise<{ hasActivity: boolean; prCount: number }> {
  try {
    // Use MCP to list pull requests with state=closed
    const result = await mcpClient.listPullRequests({
      owner,
      repo,
      state: "closed",
      perPage: 100, // Check up to 100 PRs
      page: 1,
    });

    // Parse the result - MCP returns content array
    let prs: any[] = [];
    if (result.content && result.content.length > 0) {
      const contentText = result.content
        .map((item: any) => item.text || JSON.stringify(item))
        .join("\n");

      try {
        // Try to parse as JSON if it's structured
        const parsed = JSON.parse(contentText);
        prs = Array.isArray(parsed)
          ? parsed
          : parsed.data || parsed.items || [];
      } catch {
        // If not JSON, try to extract from text
        // The MCP server might return structured data differently
        prs = [];
      }
    }

    // Filter PRs by merged_at or closed_at date within timeframe
    let prCount = 0;
    for (const pr of prs) {
      const mergedAt = pr.merged_at || pr.mergedAt;
      const closedAt = pr.closed_at || pr.closedAt;
      const prDate = mergedAt || closedAt;

      if (isWithinTimeframe(prDate, startDate, endDate)) {
        prCount++;
      }
    }

    return {
      hasActivity: prCount > 0,
      prCount,
    };
  } catch (error) {
    console.warn(
      `Error checking PRs for ${owner}/${repo}:`,
      error instanceof Error ? error.message : String(error)
    );
    // Return false on error - we'll skip this repo
    return { hasActivity: false, prCount: 0 };
  }
}

/**
 * Discover repositories from config that have PR activity in the timeframe
 */
export async function discoverReposWithActivity(
  config: AppConfig,
  mcpClient: GitHubMCPClient,
  startDate: Date,
  endDate: Date
): Promise<RepoActivity[]> {
  const activeRepos: RepoActivity[] = [];

  // Extract all repos from config
  const reposFromConfig = extractReposFromConfig(config);

  console.log(
    `  Checking ${reposFromConfig.length} repositories from config...`
  );

  // Check each repo for PR activity
  for (const { owner, repo } of reposFromConfig) {
    const { hasActivity, prCount } = await checkRepoHasPRsInTimeframe(
      mcpClient,
      owner,
      repo,
      startDate,
      endDate
    );

    if (hasActivity) {
      activeRepos.push({
        owner,
        repo,
        prCount,
      });
      console.log(`  ✓ ${owner}/${repo} has ${prCount} PR(s) in timeframe`);
    } else {
      console.log(`  - ${owner}/${repo} has no PRs in timeframe`);
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return activeRepos;
}
