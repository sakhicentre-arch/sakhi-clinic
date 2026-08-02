/**
 * api/oauth/google/exchange.ts
 * Sakhi Clinic — Vercel Serverless Function: Google OAuth authorization-code exchange.
 *
 * One responsibility only: given the PKCE values the browser already has
 * (client_id, code, code_verifier, redirect_uri), add client_secret
 * (server-only -- see docs/GOOGLE_DRIVE_SETUP.md for why Google requires
 * it here despite PKCE) and forward to Google's token endpoint. Never
 * handles a refresh_token request -- see refresh.ts for that.
 */

import { errorResponse, forwardToGoogle, readFormBody, readStringField, requireClientSecret } from "./_shared.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return errorResponse(405, "method_not_allowed", "Only POST is supported.");
    }

    const body = await readFormBody(request);
    const clientId = readStringField(body, "client_id");
    const code = readStringField(body, "code");
    const codeVerifier = readStringField(body, "code_verifier");
    const redirectUri = readStringField(body, "redirect_uri");

    // Temporary diagnostic logging -- presence/absence only, never the
    // values themselves (see the logging contract at the top of
    // _shared.ts). Safe to leave in or remove once the proxy's field
    // handling is confirmed stable in production.
    console.info("[api/oauth/google/exchange] request fields", {
      hasClientId: Boolean(clientId),
      hasCode: Boolean(code),
      hasVerifier: Boolean(codeVerifier),
      hasRedirectUri: Boolean(redirectUri),
      grantType: "authorization_code",
    });

    if (!clientId || !code || !codeVerifier || !redirectUri) {
      return errorResponse(400, "invalid_request", "client_id, code, code_verifier, and redirect_uri are all required.");
    }

    const clientSecret = requireClientSecret("exchange");
    if (!clientSecret) {
      return errorResponse(500, "server_configuration_error", "Google Drive is not fully configured on the server.");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      client_secret: clientSecret,
    });

    return forwardToGoogle(params, "exchange", "authorization_code");
  },
};
