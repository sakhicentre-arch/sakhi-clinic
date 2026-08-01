/**
 * api/oauth/google/refresh.ts
 * Sakhi Clinic — Vercel Serverless Function: Google OAuth access-token refresh.
 *
 * One responsibility only: given a stored refresh_token and client_id, add
 * client_secret (server-only) and forward to Google's token endpoint.
 * Never handles an authorization code -- see exchange.ts for that.
 */

import {
  type MinimalRequest,
  type MinimalResponse,
  forwardToGoogle,
  readBody,
  readStringField,
  requireClientSecret,
  sendError,
} from "./_shared";

export default async function handler(req: MinimalRequest, res: MinimalResponse): Promise<void> {
  if (req.method !== "POST") {
    sendError(res, 405, "method_not_allowed", "Only POST is supported.");
    return;
  }

  const body = readBody(req);
  const clientId = readStringField(body, "client_id");
  const refreshToken = readStringField(body, "refresh_token");

  if (!clientId || !refreshToken) {
    sendError(res, 400, "invalid_request", "client_id and refresh_token are both required.");
    return;
  }

  const clientSecret = requireClientSecret(res, "refresh");
  if (!clientSecret) return;

  const params = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    client_secret: clientSecret,
  });

  await forwardToGoogle(res, params, "refresh", "refresh_token");
}
