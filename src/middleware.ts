/**
 * 外网访问认证中间件（Basic Auth 多账号）
 *
 * 本地 localhost / 内网 192.168.x.x / Tailscale 直接放行（视为 admin）。
 * 公网访问需要 Basic Auth，通过后把用户名写入 x-auth-user 请求头，
 * API 层据此路由到对应用户的独立 Excel 文件。
 *
 * 在 .env.local 中设置 APP_AUTH=用户1:密码1,用户2:密码2 来启用。
 * 留空则跳过认证（所有请求视为 admin）。
 */

import { NextRequest, NextResponse } from "next/server";

function parseAccounts(auth: string | undefined): Record<string, string> {
  const accounts: Record<string, string> = {};
  if (!auth) return accounts;
  for (const entry of auth.split(",")) {
    const [u, p] = entry.split(":");
    if (u && u.trim()) accounts[u.trim()] = (p || "").trim();
  }
  return accounts;
}

function isInternal(host: string): boolean {
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.") ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    host.startsWith("172.16.") ||
    host.startsWith("172.17.") ||
    host.startsWith("172.18.") ||
    host.startsWith("172.19.") ||
    host.startsWith("172.20.") ||
    host.startsWith("172.21.") ||
    host.startsWith("172.22.") ||
    host.startsWith("172.23.") ||
    host.startsWith("172.24.") ||
    host.startsWith("172.25.") ||
    host.startsWith("172.26.") ||
    host.startsWith("172.27.") ||
    host.startsWith("172.28.") ||
    host.startsWith("172.29.") ||
    host.startsWith("172.30.") ||
    host.startsWith("172.31.") ||
    host.startsWith("100.") // Tailscale 虚拟网络
  );
}

function withUser(req: NextRequest, user: string): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-auth-user", user);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

function unauthorized(): NextResponse {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Health Tracker"',
    },
  });
}

export function middleware(req: NextRequest) {
  const accounts = parseAccounts(process.env.APP_AUTH);

  // 未配置账号 → 跳过认证（视为 admin）
  if (Object.keys(accounts).length === 0) {
    return withUser(req, "admin");
  }

  // 本地 / 内网直接放行（视为 admin）
  const host = req.headers.get("host") || "";
  if (isInternal(host)) {
    return withUser(req, "admin");
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return unauthorized();

  try {
    const [, encoded] = authHeader.split(" ");
    const decoded = atob(encoded);
    const [user, pass] = decoded.split(":");
    if (!user || !pass || accounts[user] !== pass) {
      return unauthorized();
    }
    return withUser(req, user);
  } catch {
    return unauthorized();
  }
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
