import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const FRAME_PROTECTED_PREFIXES = ["/dashboard", "/affiliate"];

function shouldProtectFromFraming(pathname: string) {
  return FRAME_PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function middleware(request: NextRequest) {
  if (!shouldProtectFromFraming(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  return response;
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/affiliate", "/affiliate/:path*"],
};
