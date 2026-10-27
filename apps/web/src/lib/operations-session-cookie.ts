const publicAuthenticationPaths = new Set([
  "auth/otp/request",
  "auth/otp/verify",
  "auth/mfa/enroll",
  "auth/mfa/enroll/verify",
  "auth/mfa/verify",
]);

export function isPublicAuthenticationPath(path: string): boolean {
  return publicAuthenticationPaths.has(path);
}

export function shouldClearOperationsSessionCookie(path: string, status: number): boolean {
  if (path === "auth/logout") return true;
  return status === 401 && !isPublicAuthenticationPath(path);
}
