import { NextResponse } from "next/server";

/**
 * Non-secret diagnostic endpoint.
 * Returns only boolean flags — never exposes actual values.
 * DELETE this route once the production DB connectivity is confirmed working.
 */
export async function GET() {
  // Dynamic access — Next.js cannot inline these at build time
  const env = process.env as Record<string, string | undefined>;
  const get = (k: string) => env[k];

  const vars = {
    DATABASE_URL: !!get("DATABASE_URL"),
    DATABASE_URL_length: get("DATABASE_URL")?.length ?? 0,
    OPENROUTER_API_KEY: !!get("OPENROUTER_API_KEY"),
    DB_SECRET_ARN: !!get("DB_SECRET_ARN"),
    OPENROUTER_SECRET_ARN: !!get("OPENROUTER_SECRET_ARN"),
    CATEGORIZE_QUEUE_URL: !!get("CATEGORIZE_QUEUE_URL"),
    AWS_REGION: get("AWS_REGION") ?? "(not set)",
    NODE_ENV: get("NODE_ENV") ?? "(not set)",
    AWS_ACCESS_KEY_ID: !!get("AWS_ACCESS_KEY_ID"),
    AWS_SECRET_ACCESS_KEY: !!get("AWS_SECRET_ACCESS_KEY"),
    AWS_SESSION_TOKEN: !!get("AWS_SESSION_TOKEN"),
    AWS_LAMBDA_FUNCTION_NAME: get("AWS_LAMBDA_FUNCTION_NAME") ?? "(not set)",
    AWS_CONTAINER_CREDENTIALS_FULL_URI: !!get("AWS_CONTAINER_CREDENTIALS_FULL_URI"),
    AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: !!get("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI"),
    AWS_WEB_IDENTITY_TOKEN_FILE: !!get("AWS_WEB_IDENTITY_TOKEN_FILE"),
    AWS_ROLE_ARN: get("AWS_ROLE_ARN") ?? "(not set)",
    AWS_AMPLIFY_CREDENTIAL_LISTENER_HOST: get("AWS_AMPLIFY_CREDENTIAL_LISTENER_HOST") ?? "(not set)",
    AWS_AMPLIFY_CREDENTIAL_LISTENER_PORT: get("AWS_AMPLIFY_CREDENTIAL_LISTENER_PORT") ?? "(not set)",
    AWS_AMPLIFY_CREDENTIAL_LISTENER_PATH: get("AWS_AMPLIFY_CREDENTIAL_LISTENER_PATH") ?? "(not set)",
    AWS_AMPLIFY_CREDENTIAL_LISTENER_ENABLED: get("AWS_AMPLIFY_CREDENTIAL_LISTENER_ENABLED") ?? "(not set)",
    AWS_AMPLIFY_CREDENTIAL_LISTENER_TIMEOUT: get("AWS_AMPLIFY_CREDENTIAL_LISTENER_TIMEOUT") ?? "(not set)",
    AWS_LAMBDA_EXEC_WRAPPER: get("AWS_LAMBDA_EXEC_WRAPPER") ?? "(not set)",
    awsKeysInEnv: Object.keys(env).filter((k) => k.startsWith("AWS_")).sort(),
  };
  return NextResponse.json(vars);
}
