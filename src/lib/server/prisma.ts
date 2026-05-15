import type { PrismaClient } from "@prisma/client";
import { ensureDatabaseUrlFromSecrets } from "@/lib/server/secrets";

declare global {
  var __prismaClient: PrismaClient | undefined;
}

export async function getPrisma() {
  await ensureDatabaseUrlFromSecrets();

  if (global.__prismaClient) {
    return global.__prismaClient;
  }

  const { PrismaClient } = await import("@prisma/client");

  // Serverless tuning: each Lambda invocation reuses one connection.
  // connection_limit=1 prevents RDS connection exhaustion when many Lambda
  // instances are warm. pool_timeout=30 lets a request wait briefly for the
  // single slot. Adjust upward only if a single request needs parallel queries.
  const baseUrl = process.env.DATABASE_URL ?? "";
  const separator = baseUrl.includes("?") ? "&" : "?";
  const poolUrl = `${baseUrl}${separator}connection_limit=1&pool_timeout=30`;

  const prisma = new PrismaClient({ datasourceUrl: poolUrl });

  // Cache globally in ALL environments — including production Lambda — so
  // warm invocations reuse the same client instead of opening new connections.
  global.__prismaClient = prisma;

  return prisma;
}

const CONNECTION_ERROR_PATTERNS = [
  "server has closed the connection",
  "connection was forcibly closed",
  "closed the connection",
  "econnreset",
  "econnrefused",
  "connection refused",
  "socket hang up",
  "connection reset",
  "connect etimedout",
  "connection timed out",
  "can't reach database server",
  "unable to start a transaction",
  "timed out fetching a new connection from the connection pool",
];

const CONNECTION_ERROR_CODES = ["P1001", "P1002", "P1008", "P1009", "P1017"];

/** True for MySQL connection-drop errors (Prisma 6, any error shape). */
export function isConnectionClosedError(err: unknown): boolean {
  if (err == null) return false;

  // Check Prisma error codes (PrismaClientKnownRequestError / PrismaClientInitializationError)
  const code =
    (err as { code?: string }).code ??
    (err as { errorCode?: string }).errorCode ??
    "";
  if (CONNECTION_ERROR_CODES.includes(code)) return true;

  // Serialise to a string covering .message, .toString(), and any nested cause
  const parts: string[] = [];
  if (err instanceof Error) {
    parts.push(err.message);
    if (err.cause instanceof Error) parts.push(err.cause.message);
  }
  // String() gives "ClassName: message" which may differ from .message alone
  parts.push(String(err));

  const full = parts.join(" ").toLowerCase();
  return CONNECTION_ERROR_PATTERNS.some((p) => full.includes(p));
}

/**
 * Reconnect the global Prisma client after a connection drop.
 * Drops the cached client so the next getPrisma() call creates a fresh one.
 */
export async function reconnectPrisma(): Promise<void> {
  try {
    if (global.__prismaClient) {
      await global.__prismaClient.$disconnect();
    }
  } catch {
    // ignore disconnect errors
  } finally {
    global.__prismaClient = undefined;
  }
}
