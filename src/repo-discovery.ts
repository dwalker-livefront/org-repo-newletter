import { subDays } from 'date-fns';
import type { AppConfig } from './config.js';
import type { GitHubMCPClient } from './mcp-client.js';

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

export async function discoverReposWithActivity(
  config: AppConfig,
  mcpClient: GitHubMCPClient,
  organization: string
): Promise<RepoActivity[]> {
  const endDate = new Date();
  const startDate = subDays(endDate, config.github.timeframeDays);
  
  const activeRepos: RepoActivity[] = [];

  try {
    // Get list of pull requests for the organization
    // Note: MCP may not have a direct "list all org repos" endpoint
    // This is a simplified approach - you may need to:
    // 1. Use GitHub API directly to list org repos, OR
    // 2. Have a predefined list of repos, OR
    // 3. Use MCP to search for repos
    
    // For now, we'll try to get PRs by attempting common repo patterns
    // or you can specify repos in config
    
    // Example: Try to get PRs for repos that might exist
    // In production, you'd want to list all repos in the org first
    
    // Placeholder: This would need actual implementation based on available MCP tools
    // You might need to use GitHub API directly or have repos specified in config
    
  } catch (error) {
    console.warn('Error discovering repos:', error instanceof Error ? error.message : String(error));
  }
  
  return activeRepos;
}

