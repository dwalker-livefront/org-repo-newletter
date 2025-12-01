import type { AppConfig, TeamsConfig } from './config.js';
import type { RepoSummary } from './openai-agent.js';

export interface TeamGroupedSummaries {
  [teamName: string]: RepoSummary[];
}

export function groupReposByTeam(
  repoSummaries: RepoSummary[],
  teamsConfig: TeamsConfig
): TeamGroupedSummaries {
  const grouped: TeamGroupedSummaries = {};
  const teamNames = Object.keys(teamsConfig);

  for (const summary of repoSummaries) {
    const repoName = summary.repoName;
    let matchedTeam: string | null = null;

    // Check each team configuration
    for (const teamName of teamNames) {
      const teamConfig = teamsConfig[teamName];

      // Check exact repo name matches
      if (teamConfig.repos && teamConfig.repos.includes(repoName)) {
        matchedTeam = teamName;
        break;
      }

      // Check prefix patterns
      if (teamConfig.prefixes) {
        for (const prefix of teamConfig.prefixes) {
          if (repoName.startsWith(prefix)) {
            matchedTeam = teamName;
            break;
          }
        }
        if (matchedTeam) break;
      }
    }

    // Assign to matched team or "Unassigned"
    const assignedTeam = matchedTeam || 'Unassigned';
    if (!grouped[assignedTeam]) {
      grouped[assignedTeam] = [];
    }
    grouped[assignedTeam].push(summary);
  }

  return grouped;
}

export function getTeamOrder(config: AppConfig): string[] {
  const teamNames = Object.keys(config.teams);
  // Return team names in config order, with "Unassigned" at the end
  return [...teamNames, 'Unassigned'];
}

