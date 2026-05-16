import { NextResponse } from "next/server";
import {
  STATE_COOKIE_NAME,
  appBaseUrl,
  cognitoConfig,
  cookieOptions,
  randomState,
} from "@/lib/server/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { domain, clientId } = cognitoConfig();
  const base = appBaseUrl(request.url);
  const redirectUri = `${base}/api/auth/callback`;

  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/";

  const state = randomState();
  const statePayload = Buffer.from(JSON.stringify({ state, returnTo })).toString("base64url");

  const authorize = new URL(`${domain}/oauth2/authorize`);
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "openid email profile");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set(STATE_COOKIE_NAME, statePayload, cookieOptions(600));
  return res;
}
