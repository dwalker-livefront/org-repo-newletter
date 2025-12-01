#!/usr/bin/env node

import { writeFileSync } from "fs";
import { subDays } from "date-fns";
import { loadConfig } from "./config.js";
import { GitHubMCPClient } from "./mcp-client.js";
import { OpenAIAgent } from "./openai-agent.js";
import { groupReposByTeam, getTeamOrder } from "./team-aggregator.js";
import {
  generateNewsletter,
  writeNewsletterToFile,
} from "./newsletter-generator.js";
import { discoverReposWithActivity } from "./repo-discovery.js";
import type { RepoSummary } from "./openai-agent.js";

async function main() {
  console.log("GitHub Newsletter Generator");
  console.log("==========================\n");

  try {
    // Step 1: Load Configuration
    console.log("Loading configuration...");
    const config = loadConfig();
    console.log(
      `✓ Configuration loaded for organization: ${config.github.organization}`
    );
    console.log(`✓ Timeframe: ${config.github.timeframeDays} days`);
    console.log(`✓ Model: ${config.openai.model}\n`);

    // Calculate date range
    const endDate = new Date();
    const startDate = subDays(endDate, config.github.timeframeDays);
    console.log(
      `Date range: ${startDate.toISOString().split("T")[0]} to ${
        endDate.toISOString().split("T")[0]
      }\n`
    );

    // Step 2: Initialize MCP Client
    console.log("Connecting to GitHub MCP...");
    const mcpClient = new GitHubMCPClient(config.github.token);
    await mcpClient.connect();
    console.log("✓ Connected to GitHub MCP\n");

    // Step 3: Discover repositories with activity
    console.log("Discovering repositories with activity...");
    const reposWithActivity = await discoverReposWithActivity(
      config,
      mcpClient,
      startDate,
      endDate
    );

    if (reposWithActivity.length === 0) {
      console.log(
        "⚠ No repositories with PR activity found in the specified timeframe."
      );
      console.log("\nThis could mean:");
      console.log("1. No PRs were merged/closed in the timeframe");
      console.log("2. The repos specified in config.json don't exist or aren't accessible");
      console.log("3. Check your GitHub token permissions");
      await mcpClient.disconnect();
      process.exit(0);
    }

    console.log(
      `✓ Found ${reposWithActivity.length} repository/repositories with activity\n`
    );

    // Step 4: Summarize each repository
    console.log("Summarizing repositories...");
    const openaiAgent = new OpenAIAgent(config, mcpClient);
    const repoSummaries: RepoSummary[] = [];

    for (const { owner, repo } of reposWithActivity) {
      try {
        console.log(`  Processing ${owner}/${repo}...`);
        const summary = await openaiAgent.summarizeRepo(
          owner,
          repo,
          startDate,
          endDate
        );
        repoSummaries.push(summary);
        console.log(`  ✓ Completed ${owner}/${repo}`);

        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(
          `  ✗ Error processing ${owner}/${repo}:`,
          error instanceof Error ? error.message : String(error)
        );
        // Continue with next repo
      }
    }

    if (repoSummaries.length === 0) {
      console.log(
        "⚠ No repositories processed. Please implement repo discovery or specify repos manually."
      );
      console.log("\nTo use this tool:");
      console.log("1. Implement repo discovery in src/repo-discovery.ts");
      console.log("2. Or modify src/index.ts to specify repos manually");
      await mcpClient.disconnect();
      process.exit(0);
    }

    console.log(`✓ Processed ${repoSummaries.length} repositories\n`);

    // Step 5: Group by teams
    console.log("Grouping repositories by teams...");
    const groupedSummaries = groupReposByTeam(repoSummaries, config.teams);
    const teamOrder = getTeamOrder(config);
    console.log(
      `✓ Grouped into ${Object.keys(groupedSummaries).length} teams\n`
    );

    // Step 6: Generate newsletter
    console.log("Generating newsletter...");
    const newsletterContent = generateNewsletter(
      groupedSummaries,
      config,
      startDate,
      endDate,
      teamOrder
    );
    console.log("✓ Newsletter generated\n");

    // Step 7: Output newsletter
    const filename = writeNewsletterToFile(newsletterContent);
    writeFileSync(filename, newsletterContent, "utf-8");
    console.log(`✓ Newsletter written to: ${filename}\n`);

    // Display statistics
    const totalRepos = repoSummaries.length;
    const totalPRs = repoSummaries.reduce(
      (sum, repo) => sum + repo.pullRequests.length,
      0
    );
    const totalTeams = Object.keys(groupedSummaries).length;

    console.log("Statistics:");
    console.log(`  - Repositories processed: ${totalRepos}`);
    console.log(`  - Teams with activity: ${totalTeams}`);
    console.log(`  - Total PRs included: ${totalPRs}`);

    // Cleanup
    await mcpClient.disconnect();
    console.log("\n✓ Done!");
  } catch (error) {
    console.error(
      "\n✗ Error:",
      error instanceof Error ? error.message : String(error)
    );
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
