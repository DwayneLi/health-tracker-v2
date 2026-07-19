/**
 * 外网访问认证中间件（Basic Auth）
 *
 * 只有通过 Cloudflare Tunnel 外网访问时才需要密码。
 * 本地 localhost / 内网 192.168.x.x 直接放行。
 *
 * 在 .env.local 中设置 APP_AUTH=用户名:密码 来启用。
 * 留空则完全跳过认证。
 */

import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const auth = process.env.APP_AUTH;
  if (!auth) return NextResponse.next(); // 未设置密码，跳过

  const host = req.headers.get("host") || "";
  // 本地 / 内网请求直接放行
  if (
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
    host.startsWith("172.31.")
  ) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Health Tracker"',
      },
    });
  }

  try {
    const [, encoded] = authHeader.split(" ");
    const decoded = atob(encoded);
    if (decoded !== auth) {
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Health Tracker"',
        },
      });
    }
  } catch {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Health Tracker"',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
