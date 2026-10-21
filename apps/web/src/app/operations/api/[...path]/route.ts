import { NextRequest, NextResponse } from "next/server";

const sessionCookie = "platform_operations_session";
const platformApiUrl = process.env.PLATFORM_API_URL ?? "http://127.0.0.1:8080";
const agencyPath = /^agencies\/[0-9a-f-]{36}\/(dashboard|orders(?:\/[0-9a-f-]{36}(?:\/transitions)?)?|delivery-staff(?:\/[0-9a-f-]{36}\/lifecycle)?|inventory(?:\/adjustments)?|accounts(?:\/[0-9a-f-]{36}\/(?:prices|payments))?|payments|credit-policy)$/;
const adminReadPath = /^admin\/(overview|dashboard|agencies|permissions|roles|team-members|tenants(?:\/[0-9a-f-]{36})?)$/;
const adminMutationPath = /^admin\/(roles(?:\/[0-9a-f-]{36})?|team-members(?:\/[0-9a-f-]{36}\/lifecycle)?|tenants|tenants\/[0-9a-f-]{36}\/(submit|reviews|lifecycle|credit-decisions))$/;
const dashboardDataPath = /^admin\/(support-cases(?:\/[0-9a-f-]{36}\/transitions)?|revenue-entries)$/;
const agencyAdminReadPath = /^admin\/agency-registry(?:\/[0-9a-f-]{36})?$/;
const agencyAdminMutationPath = /^admin\/agencies(?:\/[0-9a-f-]{36}\/(?:reviews|lifecycle))?$/;
const entityDocumentsPath = /^(?:admin\/)?(?:tenants|agencies)\/[0-9a-f-]{36}\/documents$/;
const documentContentPath = /^documents\/[0-9a-f-]{36}\/content$/;
const documentArchivePath = /^documents\/[0-9a-f-]{36}\/archive$/;

function allowed(path: string, method: string) {
  if (path === "auth/otp/request" && method === "POST") return true;
  if (path === "auth/otp/verify" && method === "POST") return true;
  if (["auth/mfa/enroll", "auth/mfa/enroll/verify", "auth/mfa/verify"].includes(path) && method === "POST") return true;
  if (path === "auth/mfa/step-up" && method === "POST") return true;
  if (path === "auth/session" && method === "GET") return true;
  if (path === "auth/logout" && method === "POST") return true;
  if (path === "admin/configuration" && ["GET", "POST"].includes(method)) return true;
  if (adminReadPath.test(path) && method === "GET") return true;
  if (adminMutationPath.test(path) && method === "POST") return true;
  if (dashboardDataPath.test(path) && ["GET", "POST"].includes(method)) return true;
  if (agencyAdminReadPath.test(path) && method === "GET") return true;
  if (agencyAdminMutationPath.test(path) && method === "POST") return true;
  if (entityDocumentsPath.test(path) && ["GET", "POST"].includes(method)) return true;
  if (documentContentPath.test(path) && method === "GET") return true;
  if (documentArchivePath.test(path) && method === "POST") return true;
  return agencyPath.test(path) && ["GET", "POST"].includes(method);
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return true;
  try { return new URL(origin).host === host; } catch { return false; }
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;
  const path = segments.join("/");
  if (!allowed(path, request.method)) return NextResponse.json({ error: { code: "not_found", message: "The operation is unavailable." } }, { status: 404 });
  if (request.method !== "GET" && !sameOrigin(request)) return NextResponse.json({ error: { code: "invalid_origin", message: "Cross-site requests are not allowed." } }, { status: 403 });

  const token = request.cookies.get(sessionCookie)?.value;
  const publicAuthPaths = ["auth/otp/request", "auth/otp/verify", "auth/mfa/enroll", "auth/mfa/enroll/verify", "auth/mfa/verify"];
  const isPublicAuth = publicAuthPaths.includes(path);
  if (!isPublicAuth && !token) return NextResponse.json({ error: { code: "authentication_required", message: "Sign in to continue." } }, { status: 401 });

  const target = new URL(`/v1/${path}`, platformApiUrl);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  const body = request.method === "GET" ? undefined : await request.arrayBuffer();
  const contentType = request.headers.get("content-type");
  const upstream = await fetch(target, {
    method: request.method,
    headers: {
      accept: "application/json",
      ...(contentType ? { "content-type": contentType } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(request.headers.get("idempotency-key") ? { "idempotency-key": request.headers.get("idempotency-key")! } : {}),
      ...(request.headers.get("x-document-type") ? { "x-document-type": request.headers.get("x-document-type")! } : {}),
      ...(request.headers.get("x-file-name") ? { "x-file-name": request.headers.get("x-file-name")! } : {}),
      ...(request.headers.get("x-upload-reason") ? { "x-upload-reason": request.headers.get("x-upload-reason")! } : {}),
      "x-request-id": request.headers.get("x-request-id") ?? crypto.randomUUID(),
    },
    body: body?.byteLength ? body : undefined,
    cache: "no-store",
  });
  if (documentContentPath.test(path) && upstream.ok) {
    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "content-disposition": upstream.headers.get("content-disposition") ?? "inline",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }
  const payload = await upstream.json().catch(() => ({}));

  const completesAuthentication = ["auth/otp/verify", "auth/mfa/enroll/verify", "auth/mfa/verify"].includes(path);
  if (completesAuthentication && upstream.ok && payload.status === "authenticated" && payload.accessToken) {
    const { accessToken, ...safePayload } = payload;
    const response = NextResponse.json(safePayload, { status: upstream.status });
    response.cookies.set(sessionCookie, accessToken, {
      httpOnly: true,
      secure: ["staging", "production"].includes(process.env.APP_ENV ?? "local"),
      sameSite: "lax",
      path: "/",
      maxAge: Number(payload.expiresInSeconds) || 2_592_000,
    });
    return response;
  }

  const response = upstream.status === 204
    ? new NextResponse(null, { status: 204 })
    : NextResponse.json(payload, { status: upstream.status });
  if (path === "auth/logout" || upstream.status === 401) response.cookies.delete(sessionCookie);
  return response;
}

export const GET = proxy;
export const POST = proxy;
