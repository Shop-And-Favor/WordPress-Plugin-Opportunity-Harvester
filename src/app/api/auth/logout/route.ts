import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, appBaseUrl, cognitoConfig, cookieOptions } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { domain, clientId } = cognitoConfig();
  const base = appBaseUrl(request.url);

  const logoutUrl = new URL(`${domain}/logout`);
  logoutUrl.searchParams.set("client_id", clientId);
  logoutUrl.searchParams.set("logout_uri", `${base}/`);

  const res = NextResponse.redirect(logoutUrl.toString());
  res.cookies.set(SESSION_COOKIE_NAME, "", { ...cookieOptions(0), maxAge: 0 });
  return res;
}
