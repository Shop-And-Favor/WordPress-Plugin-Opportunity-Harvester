import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  STATE_COOKIE_NAME,
  type CognitoTokens,
  appBaseUrl,
  cognitoConfig,
  cookieOptions,
  decodeIdTokenClaims,
  encodeSession,
} from "@/lib/server/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new NextResponse(`Auth error: ${error} - ${url.searchParams.get("error_description") ?? ""}`, {
      status: 400,
    });
  }
  if (!code || !state) {
    return new NextResponse("Missing code/state", { status: 400 });
  }

  // Verify state cookie
  const cookieHeader = request.headers.get("cookie") ?? "";
  const stateCookieMatch = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${STATE_COOKIE_NAME}=`));
  if (!stateCookieMatch) {
    return new NextResponse("Missing state cookie", { status: 400 });
  }
  let returnTo = "/";
  try {
    const decoded = JSON.parse(
      Buffer.from(stateCookieMatch.split("=")[1], "base64url").toString(),
    ) as { state: string; returnTo: string };
    if (decoded.state !== state) {
      return new NextResponse("State mismatch", { status: 400 });
    }
    if (decoded.returnTo && decoded.returnTo.startsWith("/")) {
      returnTo = decoded.returnTo;
    }
  } catch {
    return new NextResponse("Invalid state cookie", { status: 400 });
  }

  const { domain, clientId, clientSecret } = cognitoConfig();
  const base = appBaseUrl(request.url);
  const redirectUri = `${base}/api/auth/callback`;

  const tokenRes = await fetch(`${domain}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return new NextResponse(`Token exchange failed: ${text}`, { status: 502 });
  }

  const tokens = (await tokenRes.json()) as CognitoTokens;
  const claims = decodeIdTokenClaims(tokens.id_token);
  if (!claims?.sub) {
    return new NextResponse("Invalid id_token", { status: 502 });
  }

  const session = encodeSession({
    sub: claims.sub,
    email: claims.email ?? claims["cognito:username"] ?? "",
    name: claims.name,
  });

  const res = NextResponse.redirect(`${base}${returnTo}`);
  res.cookies.set(SESSION_COOKIE_NAME, session, cookieOptions(60 * 60 * 8));
  res.cookies.set(STATE_COOKIE_NAME, "", { ...cookieOptions(0), maxAge: 0 });
  return res;
}
