import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const auditModeEnabled = process.env.INTERNAL_AUDIT_MODE !== "false";
  const operationsSessionCookie = "platform_operations_session";

  // Temporary internal-audit entry points. The audit pages are isolated from the
  // production API, contain fictional data, and expose no write operations.
  if (auditModeEnabled && (request.nextUrl.pathname === "/control" || request.nextUrl.pathname === "/operations")) {
    const destination = request.nextUrl.clone();
    destination.search = "";
    destination.pathname = request.nextUrl.pathname === "/control" ? "/review/control" : "/review/operations";
    return NextResponse.redirect(destination);
  }

  // Audit links were intentionally shareable during review. Once audit mode is
  // closed, old direct links must not keep the fictional dashboards reachable.
  if (!auditModeEnabled && request.nextUrl.pathname.startsWith("/review")) {
    const destination = request.nextUrl.clone();
    destination.search = "";
    destination.pathname = request.nextUrl.pathname.startsWith("/review/operations") ? "/operations/login" : "/control/login";
    return NextResponse.redirect(destination);
  }

  if (process.env.APP_ENV !== "production") return NextResponse.next();

  // The dashboard pages perform the authoritative session and RBAC checks
  // against the API. Proxy only makes the optimistic routing decision needed
  // to let an authenticated browser reach those pages in production.
  const pathname = request.nextUrl.pathname;
  const publicAuthenticationPath = pathname === "/control/login"
    || pathname === "/operations/login"
    || pathname.startsWith("/operations/api/");
  if (publicAuthenticationPath) return NextResponse.next();

  const protectedDashboard = pathname === "/control"
    || pathname.startsWith("/control/")
    || pathname === "/operations"
    || pathname.startsWith("/operations/")
    || pathname.startsWith("/admin")
    || pathname.startsWith("/agency");
  if (protectedDashboard && request.cookies.has(operationsSessionCookie)) return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.search = "";
  destination.pathname = request.nextUrl.pathname.startsWith("/operations")
    || request.nextUrl.pathname.startsWith("/agency")
    || request.nextUrl.searchParams.get("as") === "agency"
    ? "/operations/login"
    : "/control/login";
  return NextResponse.redirect(destination);
}

export const config = {
  matcher: ["/control/:path*", "/operations/:path*", "/review/:path*", "/admin/:path*", "/agency/:path*", "/login"],
};
