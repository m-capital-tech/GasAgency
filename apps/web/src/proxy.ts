import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (process.env.APP_ENV !== "production") return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.search = "";
  destination.pathname = request.nextUrl.pathname.startsWith("/agency") || request.nextUrl.searchParams.get("as") === "agency"
    ? "/operations/login"
    : "/control/login";
  return NextResponse.redirect(destination);
}

export const config = {
  matcher: ["/admin/:path*", "/agency/:path*", "/login"],
};
