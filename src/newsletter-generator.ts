import { format } from 'date-fns';
import type { RepoSummary } from './openai-agent.js';
import type { TeamGroupedSummaries } from './team-aggregator.js';
import type { AppConfig } from './config.js';

export function generateNewsletter(
  groupedSummaries: TeamGroupedSummaries,
  config: AppConfig,
  startDate: Date,
  endDate: Date,
  teamOrder: string[]
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Weekly Newsletter - ${format(startDate, 'MMM d, yyyy')} to ${format(endDate, 'MMM d, yyyy')}`);
  lines.push('');

  // Calculate statistics
  const totalRepos = Object.values(groupedSummaries).reduce((sum, repos) => sum + repos.length, 0);
  const totalPRs = Object.values(groupedSummaries).reduce(
    (sum, repos) => sum + repos.reduce((repoSum, repo) => repoSum + repo.pullRequests.length, 0),
    0
  );

  lines.push(`**Summary:** ${totalRepos} repositories with ${totalPRs} pull requests`);
  lines.push('');

  // Generate team sections
  for (const teamName of teamOrder) {
    const repos = groupedSummaries[teamName];
    if (!repos || repos.length === 0) {
      continue; // Skip teams with no repos
    }

    lines.push(`## ${teamName}`);
    lines.push('');

    for (const repo of repos) {
      lines.push(`### ${repo.repoName}`);
      lines.push('');
      lines.push(repo.overallSummary);
      lines.push('');

      if (repo.pullRequests.length > 0) {
        lines.push('**Pull Requests:**');
        for (const pr of repo.pullRequests) {
          lines.push(`- PR #${pr.number}: ${pr.title} (${pr.author}) - Merged: ${pr.mergedDate} - [Link](${pr.url})`);
          if (pr.summary) {
            lines.push(`  Summary: ${pr.summary}`);
          }
        }
        lines.push('');
      }

      if (repo.breakingChanges.length > 0) {
        lines.push('**High-Risk/Breaking Changes:**');
        for (const breakingChange of repo.breakingChanges) {
          lines.push(`- PR #${breakingChange.prNumber}: ${breakingChange.description}`);
        }
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function writeNewsletterToFile(content: string, outputPath?: string): string {
  const timestamp = format(new Date(), 'yyyyMMdd-HHmmss');
  const filename = outputPath || `newsletter-${timestamp}.md`;
  
  // In a real implementation, you would use fs.writeFileSync here
  // For now, we'll return the filename and let the caller handle writing
  return filename;
}

