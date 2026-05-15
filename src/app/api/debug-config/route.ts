import { NextResponse } from "next/server";

/**
 * Non-secret diagnostic endpoint.
 * Returns only boolean flags — never exposes actual values.
 * DELETE this route once the production DB connectivity is confirmed working.
 */
export async function GET() {
  const vars = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    DATABASE_URL_length: process.env.DATABASE_URL?.length ?? 0,
    OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
    DB_SECRET_ARN: !!process.env.DB_SECRET_ARN,
    OPENROUTER_SECRET_ARN: !!process.env.OPENROUTER_SECRET_ARN,
    AWS_REGION: process.env.AWS_REGION ?? "(not set)",
    NODE_ENV: process.env.NODE_ENV ?? "(not set)",
    // AWS Lambda injects these — if missing the IAM role isn't working
    AWS_ACCESS_KEY_ID: !!process.env.AWS_ACCESS_KEY_ID,
    AWS_SESSION_TOKEN: !!process.env.AWS_SESSION_TOKEN,
  };
  return NextResponse.json(vars);
}
