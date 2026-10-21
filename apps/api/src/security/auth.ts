import type pg from "pg";
import type { NextFunction, Request, Response } from "express";
import { loadPrincipalBySessionHash, type AuthPrincipal } from "@platform/database";
import { HttpError } from "../http/error";
import { hashSessionToken } from "./token";

const bearerPattern = /^Bearer ([A-Za-z0-9._~-]{32,512})$/;

export function requireAuthentication(options: { pool: pg.Pool; tokenPepper: string }) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const authorization = request.header("authorization") ?? "";
      const match = bearerPattern.exec(authorization);
      if (!match) throw new HttpError(401, "authentication_required", "A valid bearer session is required.");

      const principal = await loadPrincipalBySessionHash(options.pool, hashSessionToken(match[1]!, options.tokenPepper));
      if (!principal) throw new HttpError(401, "invalid_session", "The session is invalid or has expired.");
      if (principal.mfaRequired && !principal.mfaVerifiedAt) {
        throw new HttpError(403, "mfa_required", "Multi-factor verification is required for this session.");
      }

      response.locals.principal = principal;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function authenticatedPrincipal(response: Response): AuthPrincipal {
  const principal = response.locals.principal as AuthPrincipal | undefined;
  if (!principal) throw new HttpError(401, "authentication_required", "A valid bearer session is required.");
  return principal;
}

export function assertFreshMfa(principal: AuthPrincipal, maximumAgeMs = 10 * 60 * 1_000): void {
  if (!principal.mfaVerifiedAt || Date.now() - principal.mfaVerifiedAt.getTime() > maximumAgeMs) {
    throw new HttpError(403, "step_up_required", "Verify your authenticator again to continue with this privileged action.");
  }
}
