import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { getEnv } from "@/lib/server/config";

let resolving = false;

function toMysqlUrl(input: {
  username: string;
  password: string;
  endpoint: string;
  port: number;
  database: string;
}) {
  const safeUser = encodeURIComponent(input.username);
  const safePassword = encodeURIComponent(input.password);
  return `mysql://${safeUser}:${safePassword}@${input.endpoint}:${input.port}/${input.database}`;
}

/**
 * Parses a secret string that may be either proper JSON or bare key:value format
 * e.g. {DATABASE:wellmind,DB_ENDPOINT:host.rds.amazonaws.com,...}
 */
function parseSecretPayload(raw: string): Record<string, string> {
  // Try standard JSON first
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    // Fall through to manual parsing for bare {KEY:VALUE,...} format
  }

  const result: Record<string, string> = {};
  // Strip outer braces
  const inner = raw.trim().replace(/^\{/, "").replace(/\}$/, "");
  // Split on commas that are immediately followed by an identifier + colon
  const pairs = inner.split(/,(?=[A-Za-z_][A-Za-z0-9_]*:)/);

  for (const pair of pairs) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) continue;
    const key = pair.substring(0, colonIdx).trim();
    let value = pair.substring(colonIdx + 1).trim();
    // Decode unicode escapes like \u0026 → &
    value = value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    result[key] = value;
  }

  return result;
}

export async function ensureDatabaseUrlFromSecrets() {
  const needsDb = !process.env.DATABASE_URL;
  const needsOrKey = !process.env.OPENROUTER_API_KEY;

  if (!needsDb && !needsOrKey) {
    return { databaseUrl: process.env.DATABASE_URL!, openRouterKey: process.env.OPENROUTER_API_KEY! };
  }

  if (resolving) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return ensureDatabaseUrlFromSecrets();
  }

  resolving = true;

  try {
    const env = getEnv();
    const client = new SecretsManagerClient({ region: env.AWS_REGION });

    let dbUrl = process.env.DATABASE_URL;

    if (needsDb) {
      // Fetch database credentials
      const dbResponse = await client.send(
        new GetSecretValueCommand({ SecretId: env.DB_SECRET_ARN }),
      );

      if (!dbResponse.SecretString) {
        throw new Error("DB secret has no SecretString payload.");
      }

      const dbPayload = parseSecretPayload(dbResponse.SecretString);

      const endpoint = dbPayload.DB_ENDPOINT;
      const username = dbPayload.DB_USERNAME;
      const password = dbPayload.DB_PASSWORD;
      // DB_NAME takes precedence over DATABASE (which may be a server alias, not the schema name)
      const database = dbPayload.DB_NAME ?? dbPayload.DATABASE_NAME ?? dbPayload.DATABASE;

      if (!endpoint || !username || !password || !database) {
        throw new Error("DB secret is missing one of DB_ENDPOINT, DB_USERNAME, DB_PASSWORD, DATABASE.");
      }

      dbUrl = toMysqlUrl({ endpoint, username, password, database, port: env.DB_PORT });
      process.env.DATABASE_URL = dbUrl;
    }

    // Fetch OpenRouter key from dedicated secret ARN
    let finalOpenRouterKey: string | undefined;
    if (env.OPENROUTER_SECRET_ARN && !process.env.OPENROUTER_API_KEY) {
      try {
        const orResponse = await client.send(
          new GetSecretValueCommand({ SecretId: env.OPENROUTER_SECRET_ARN }),
        );
        if (orResponse.SecretString) {
          const orPayload = parseSecretPayload(orResponse.SecretString);
          finalOpenRouterKey = orPayload.OPEN_ROUTER_API_KEY || orPayload.OPENROUTER_API_KEY;
        }
      } catch (fetchErr) {
        console.warn("Failed to fetch OpenRouter secret from dedicated ARN", fetchErr);
      }
    }

    // Inject OpenRouter key from Secrets Manager if not already in env
    if (finalOpenRouterKey && !process.env.OPENROUTER_API_KEY) {
      process.env.OPENROUTER_API_KEY = finalOpenRouterKey;
    }

    return { databaseUrl: dbUrl, openRouterKey: finalOpenRouterKey || process.env.OPENROUTER_API_KEY };
  } finally {
    resolving = false;
  }
}
