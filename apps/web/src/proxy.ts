import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  // Temporary internal-audit entry points. The audit pages are isolated from the
  // production API, contain fictional data, and expose no write operations.
  // Remove these two redirects when the audit closes to restore the authenticated
  // dashboards as the default entry points; OTP/MFA remains implemented below.
  if (process.env.INTERNAL_AUDIT_MODE !== "false" && (request.nextUrl.pathname === "/control" || request.nextUrl.pathname === "/operations")) {
    const destination = request.nextUrl.clone();
    destination.search = "";
    destination.pathname = request.nextUrl.pathname === "/control" ? "/review/control" : "/review/operations";
    return NextResponse.redirect(destination);
  }

  if (process.env.APP_ENV !== "production") return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.search = "";
  destination.pathname = request.nextUrl.pathname.startsWith("/agency") || request.nextUrl.searchParams.get("as") === "agency"
    ? "/operations/login"
    : "/control/login";
  return NextResponse.redirect(destination);
}

export const config = {
  matcher: ["/control", "/operations", "/admin/:path*", "/agency/:path*", "/login"],
};
