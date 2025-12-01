# GitHub Newsletter Generator

A Node.js/TypeScript CLI application that generates a weekly newsletter from GitHub organization activity. It uses OpenAI with MCP (Model Context Protocol) tool access to intelligently fetch PR details, analyze code changes, and generate summaries grouped by configurable teams.

## Features

- Automatically discovers repositories with pull request activity in a configurable timeframe
- Uses OpenAI with MCP to intelligently fetch and summarize PR details
- Groups repositories by configurable teams (using exact names or prefix patterns)
- Generates Markdown newsletters ready for Confluence, Notion, or other platforms
- Identifies high-risk and breaking changes

## Prerequisites

- Node.js v18 or higher
- GitHub personal access token with `repo` and `read:org` scopes
- OpenAI API key
- GitHub MCP server configured and accessible

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure GitHub Token

Create a GitHub personal access token with the following scopes:

- `repo` (for private repositories)
- `read:org` (for organization access)

Set it as an environment variable:

```bash
export GITHUB_TOKEN=your_github_token_here
```

### 3. Configure OpenAI API Key

Set your OpenAI API key as an environment variable:

```bash
export OPENAI_API_KEY=your_openai_api_key_here
```

### 4. Configure the Application

Edit `config.json`:

```json
{
  "github": {
    "organization": "your-org-name",
    "timeframeDays": 7,
    "token": "env:GITHUB_TOKEN"
  },
  "teams": {
    "AI Team": {
      "prefixes": ["ai-"],
      "repos": ["ai-core", "ai-utils"]
    },
    "Coaching Team": {
      "prefixes": ["coaching-"],
      "repos": []
    }
  },
  "openai": {
    "apiKey": "env:OPENAI_API_KEY",
    "model": "gpt-4-turbo"
  }
}
```

#### Configuration Options

- **github.organization**: Your GitHub organization name
- **github.timeframeDays**: Number of days to look back for PR activity (default: 7)
- **github.token**: GitHub token (use `env:GITHUB_TOKEN` to reference environment variable)
- **teams**: Team configuration object
  - Each team can have:
    - **prefixes**: Array of prefixes to match repo names (e.g., `["ai-"]` matches `ai-core`, `ai-utils`)
    - **repos**: Array of exact repo names to match
- **openai.apiKey**: OpenAI API key (use `env:OPENAI_API_KEY` to reference environment variable)
- **openai.model**: OpenAI model to use (default: `gpt-4-turbo`)

### 5. Model Selection

The application supports different OpenAI models:

- **gpt-4-turbo** (default): 128k context window, cost-effective for POC
- **gpt-4o**: 128k context window, enhanced code understanding
- **gpt-5**: 272k context window (if available), for extremely large repos

Update the `model` field in `config.json` to use a different model.

## Usage

### Build the Project

```bash
npm run build
```

### Run the Application

```bash
npm start
```

Or for development with TypeScript:

```bash
npm run dev
```

### Output

The newsletter will be generated as a Markdown file named `newsletter-YYYYMMDD-HHMMSS.md` in the project root.

## Newsletter Format

The generated newsletter follows this structure:

```markdown
# Weekly Newsletter - [Date Range]

## [Team Name]

### [Repo Name]

[AI-generated summary of all PRs for this repo]

**Pull Requests:**

- PR #123: Title (Author) - Merged: [date] - [Link]
  Summary: [1-2 sentence summary]
- PR #124: Title (Author) - Merged: [date] - [Link]
  Summary: [1-2 sentence summary]

**High-Risk/Breaking Changes:**

- PR #125: [Breaking change description]

---
```

## MCP Setup

This application uses the Model Context Protocol (MCP) to interact with GitHub. The MCP client is configured to connect to the GitHub MCP server.

### GitHub MCP Server

The application expects the GitHub MCP server to be available. You may need to:

1. Install the GitHub MCP server package
2. Configure MCP server connection
3. Ensure the server has access to your GitHub token

Refer to the [MCP documentation](https://modelcontextprotocol.io) for more details on setting up MCP servers.

## Troubleshooting

### "Environment variable GITHUB_TOKEN is not set"

Make sure you've exported the `GITHUB_TOKEN` environment variable before running the application.

### "Environment variable OPENAI_API_KEY is not set"

Make sure you've exported the `OPENAI_API_KEY` environment variable before running the application.

### "MCP client not connected"

Ensure the GitHub MCP server is properly configured and accessible. Check that the MCP server package is installed and the connection settings are correct.

### "No repositories processed"

The repo discovery feature may need to be fully implemented for your use case. You can:

1. Implement full repo discovery in `src/repo-discovery.ts`
2. Or modify `src/index.ts` to specify repos manually

### Rate Limiting

If you encounter rate limiting issues:

- The application includes delays between repo processing
- Consider processing fewer repos at a time
- Check your GitHub API rate limits

## Development

### Project Structure

```
.
├── src/
│   ├── config.ts              # Configuration loader
│   ├── repo-discovery.ts      # Repository discovery
│   ├── mcp-client.ts          # MCP client for GitHub
│   ├── openai-agent.ts        # OpenAI agent with MCP integration
│   ├── team-aggregator.ts     # Team grouping logic
│   ├── newsletter-generator.ts # Newsletter formatting
│   └── index.ts               # Main CLI entry point
├── config.json                # Configuration file
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
npm run build
```

### Type Checking

```bash
npx tsc --noEmit
```

## License

MIT
