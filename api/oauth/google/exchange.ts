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
  const code = readStringField(body, "code");
  const codeVerifier = readStringField(body, "code_verifier");
  const redirectUri = readStringField(body, "redirect_uri");

  if (!clientId || !code || !codeVerifier || !redirectUri) {
    sendError(res, 400, "invalid_request", "client_id, code, code_verifier, and redirect_uri are all required.");
    return;
  }

  const clientSecret = requireClientSecret(res, "exchange");
  if (!clientSecret) return;

  const params = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    client_secret: clientSecret,
  });

  await forwardToGoogle(res, params, "exchange", "authorization_code");
}
