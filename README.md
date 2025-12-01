# GitHub Newsletter Generator

A Node.js/TypeScript CLI application that generates a weekly newsletter from GitHub organization activity. It uses OpenAI with MCP (Model Context Protocol) tool access to intelligently fetch PR details, analyze code changes, and generate summaries grouped by configurable teams.

## Features

- **Automatic Repository Discovery**: Discovers repositories from config (explicit repos and prefix-based search)
- **PR Activity Detection**: Only processes repositories with closed/merged PRs in the specified timeframe
- **AI-Powered Summaries**: Uses OpenAI with MCP to intelligently fetch PR details, analyze code changes, and generate summaries
- **Team Grouping**: Groups repositories by configurable teams (using exact names or prefix patterns)
- **Token Management**: Automatically handles large PR diffs and manages context to stay within token limits
- **Markdown Output**: Generates Markdown newsletters ready for Confluence, Notion, or other platforms
- **Breaking Changes Detection**: Identifies high-risk and breaking changes in PRs

## Prerequisites

- Node.js v18 or higher
- Docker (for running GitHub MCP server - default)
- GitHub personal access token with `repo` and `read:org` scopes
- OpenAI API key

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure GitHub Token

Create a GitHub personal access token with the following scopes:

- `repo` (for private repositories)
- `read:org` (for organization access)

You can either:

- Set it as an environment variable and reference it in config: `"token": "env:GITHUB_TOKEN"`
- Or put it directly in `config.json`: `"token": "your_token_here"`

**Note**: The token is automatically passed to the GitHub MCP server as `GITHUB_PERSONAL_ACCESS_TOKEN`.

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
- **github.token**: GitHub personal access token (can use `env:GITHUB_TOKEN` to reference environment variable)
  - **Note**: The token is passed to the MCP server as `GITHUB_PERSONAL_ACCESS_TOKEN`
- **teams**: Team configuration object
  - Each team can have:
    - **prefixes**: Array of prefixes to match repo names (e.g., `["coaching-"]` matches `coaching-workouts-api`, `coaching-exercises-api`)
      - The application uses GitHub's `search_repositories` tool to find repos matching these prefixes
      - Query format: `org:{orgName} "{prefix}" in:name`
    - **repos**: Array of exact repo names to match (e.g., `["mobile-coaching-gateway-api"]`)
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

This application uses the Model Context Protocol (MCP) to interact with GitHub. The MCP client is configured to connect to the GitHub MCP server via Docker by default.

### GitHub MCP Server

The application uses the official GitHub MCP server from [github/github-mcp-server](https://github.com/github/github-mcp-server). By default, it runs via Docker, which means:

1. **Docker must be installed and running** on your system
2. The application will automatically pull and run the GitHub MCP server Docker image
3. No additional configuration needed - Docker handles everything

#### Alternative: Using a Local Binary

If you prefer to use a local binary instead of Docker, you can:

1. Download the GitHub MCP server binary from the [releases page](https://github.com/github/github-mcp-server/releases)
2. Set the `GITHUB_MCP_BINARY_PATH` environment variable to the path of the binary:
   ```bash
   export GITHUB_MCP_BINARY_PATH=/path/to/github-mcp-server
   ```

The application will automatically use the binary if this environment variable is set, otherwise it defaults to Docker.

## Troubleshooting

### "Environment variable GITHUB_TOKEN is not set"

If you're using `env:GITHUB_TOKEN` in your config, make sure you've exported the `GITHUB_TOKEN` environment variable before running the application. Alternatively, you can put the token directly in `config.json`.

### "Environment variable OPENAI_API_KEY is not set"

If you're using `env:OPENAI_API_KEY` in your config, make sure you've exported the `OPENAI_API_KEY` environment variable before running the application.

### "MCP client not connected" or "GitHub MCP server not found"

**If using Docker (default)**:

- Ensure Docker is installed and running
- The application will automatically pull the GitHub MCP server image on first use
- Check Docker logs if connection fails

**If using a local binary**:

- Set `GITHUB_MCP_BINARY_PATH` environment variable to the path of the binary
- Ensure the binary has execute permissions
- Download from [GitHub MCP server releases](https://github.com/github/github-mcp-server/releases)

### "No repositories processed"

This could mean:

1. No PRs were merged/closed in the specified timeframe
2. The repos specified in config.json don't exist or aren't accessible
3. Check your GitHub token permissions (`repo` and `read:org` scopes)

### "429 Request too large" or Token Limit Errors

The application includes automatic token management:

- Large PR diffs are automatically truncated
- Tool results are limited to prevent exceeding token limits
- Message context is managed to stay within limits

If you still encounter issues:

- The application processes repos one at a time with delays
- Consider reducing the `timeframeDays` to process fewer PRs
- Check your OpenAI API rate limits at https://platform.openai.com/account/rate-limits

### "Tool 'search_repositories' not found"

Ensure you're using a recent version of the GitHub MCP server. The `search_repositories` tool should be available in the official GitHub MCP server. If it's not available, prefix-based repo discovery will be skipped and only explicit repos from config will be used.

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
