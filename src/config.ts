import { readFileSync } from 'fs';
import { join } from 'path';
import Ajv from 'ajv';

export interface GitHubConfig {
  organization: string;
  timeframeDays: number;
  token: string;
}

export interface TeamConfig {
  prefixes?: string[];
  repos?: string[];
}

export interface TeamsConfig {
  [teamName: string]: TeamConfig;
}

export interface OpenAIConfig {
  apiKey: string;
  model: string;
}

export interface AppConfig {
  github: GitHubConfig;
  teams: TeamsConfig;
  openai: OpenAIConfig;
}

const configSchema = {
  type: 'object',
  required: ['github', 'teams', 'openai'],
  properties: {
    github: {
      type: 'object',
      required: ['organization', 'timeframeDays', 'token'],
      properties: {
        organization: { type: 'string' },
        timeframeDays: { type: 'number', minimum: 1 },
        token: { type: 'string' }
      }
    },
    teams: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          prefixes: {
            type: 'array',
            items: { type: 'string' }
          },
          repos: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    },
    openai: {
      type: 'object',
      required: ['apiKey'],
      properties: {
        apiKey: { type: 'string' },
        model: { type: 'string' }
      }
    }
  }
};

function resolveEnvVar(value: string): string {
  if (value.startsWith('env:')) {
    const envVarName = value.substring(4);
    const envValue = process.env[envVarName];
    if (!envValue) {
      throw new Error(`Environment variable ${envVarName} is not set`);
    }
    return envValue;
  }
  return value;
}

export function loadConfig(configPath?: string): AppConfig {
  const path = configPath || join(process.cwd(), 'config.json');
  const configContent = readFileSync(path, 'utf-8');
  const rawConfig: any = JSON.parse(configContent);

  // Validate schema
  const ajv = new Ajv();
  const validate = ajv.compile(configSchema);
  const valid = validate(rawConfig);

  if (!valid) {
    throw new Error(`Invalid config: ${JSON.stringify(validate.errors, null, 2)}`);
  }

  // Resolve environment variables
  const githubConfig = rawConfig.github as { organization: string; timeframeDays: number; token: string };
  const openaiConfig = rawConfig.openai as { apiKey: string; model?: string };
  
  const config: AppConfig = {
    github: {
      organization: githubConfig.organization,
      timeframeDays: githubConfig.timeframeDays,
      token: resolveEnvVar(githubConfig.token)
    },
    teams: rawConfig.teams as TeamsConfig,
    openai: {
      apiKey: resolveEnvVar(openaiConfig.apiKey),
      model: openaiConfig.model || 'gpt-4-turbo'
    }
  };

  // Verify GitHub token is available
  if (!config.github.token) {
    throw new Error('GitHub token is required but not set');
  }

  return config;
}

