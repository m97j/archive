import { createRemoteJWKSet, jwtVerify } from "jose";

import { AuthenticationError, AuthorizationError, type BuildAppOptions } from "../app.js";

export interface JwtAuthenticatorOptions {
  jwksUrl: string;
  issuer?: string;
  audience?: string;
  requiredRole?: string;
}

interface AuthorizationHeaders {
  authorization?: string | undefined;
  "x-archive-user-authorization"?: string | string[] | undefined;
}

export function resolveUserAuthorization(headers: AuthorizationHeaders): string | undefined {
  const forwarded = headers["x-archive-user-authorization"];
  return typeof forwarded === "string" ? forwarded : headers.authorization;
}

function tokenRoles(payload: Record<string, unknown>): Set<string> {
  const roles = new Set<string>();
  if (typeof payload.role === "string") roles.add(payload.role);
  if (Array.isArray(payload.roles)) {
    for (const role of payload.roles) if (typeof role === "string") roles.add(role);
  }
  const metadata = payload.app_metadata;
  if (typeof metadata === "object" && metadata !== null && "roles" in metadata) {
    const metadataRoles = metadata.roles;
    if (Array.isArray(metadataRoles)) {
      for (const role of metadataRoles) if (typeof role === "string") roles.add(role);
    }
  }
  return roles;
}

export function createJwtAuthenticator(
  options: JwtAuthenticatorOptions,
): BuildAppOptions["authenticate"] {
  const jwks = createRemoteJWKSet(new URL(options.jwksUrl));

  return async (request) => {
    // Private upstream gateways may consume Authorization themselves. The frontend server
    // forwards the user's independently verified JWT in a separate, server-to-server header.
    const authorization = resolveUserAuthorization(request.headers);
    if (authorization === undefined || !authorization.startsWith("Bearer ")) {
      throw new AuthenticationError("A bearer token is required");
    }
    const token = authorization.slice("Bearer ".length).trim();
    if (token === "") throw new AuthenticationError("A bearer token is required");

    try {
      const result = await jwtVerify(token, jwks, {
        ...(options.issuer === undefined ? {} : { issuer: options.issuer }),
        ...(options.audience === undefined ? {} : { audience: options.audience }),
      });
      if (result.payload.sub === undefined || result.payload.sub.trim() === "") {
        throw new AuthenticationError("Token subject is missing");
      }
      if (
        options.requiredRole !== undefined &&
        !tokenRoles(result.payload).has(options.requiredRole)
      ) {
        throw new AuthorizationError("Publisher role is required");
      }
      return { id: result.payload.sub };
    } catch (error) {
      if (error instanceof AuthenticationError || error instanceof AuthorizationError) throw error;
      throw new AuthenticationError("Bearer token is invalid");
    }
  };
}
