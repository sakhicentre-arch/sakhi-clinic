/**
 * api/oauth/google/refresh.ts
 * Sakhi Clinic — Vercel Serverless Function: Google OAuth access-token refresh.
 *
 * One responsibility only: given a stored refresh_token and client_id, add
 * client_secret (server-only) and forward to Google's token endpoint.
 * Never handles an authorization code -- see exchange.ts for that.
 */

import { errorResponse, forwardToGoogle, readJsonBody, readStringField, requireClientSecret } from "./_shared.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return errorResponse(405, "method_not_allowed", "Only POST is supported.");
    }

    const body = await readJsonBody(request);
    const clientId = readStringField(body, "client_id");
    const refreshToken = readStringField(body, "refresh_token");

    if (!clientId || !refreshToken) {
      return errorResponse(400, "invalid_request", "client_id and refresh_token are both required.");
    }

    const clientSecret = requireClientSecret("refresh");
    if (!clientSecret) {
      return errorResponse(500, "server_configuration_error", "Google Drive is not fully configured on the server.");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      client_secret: clientSecret,
    });

    return forwardToGoogle(params, "refresh", "refresh_token");
  },
};
