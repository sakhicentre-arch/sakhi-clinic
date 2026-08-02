/**
 * api/oauth/google/health.ts
 * Sakhi Clinic — Vercel Serverless Function: Google OAuth configuration health check.
 *
 * Pure configuration check -- never calls Google, never exposes secret
 * values. Always returns HTTP 200: this endpoint being reachable and able
 * to answer the question IS the "healthy" response; whether OAuth is
 * actually configured is reported as data in the body (`status` /
 * `oauthConfigured`), not via the HTTP status code. Useful right after a
 * deploy to confirm environment variables actually took effect, without
 * spending a real OAuth attempt (and a real doctor's patience) to find out.
 */

import { errorResponse, jsonResponse } from "./_shared.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return errorResponse(405, "method_not_allowed", "Only GET is supported.");
    }

    // VITE_-prefixed variables are normally a build-time-only concept (Vite
    // inlines them into the client bundle) -- but Vercel injects every
    // environment variable configured for a project into every runtime,
    // including Serverless Functions, so this reads the exact same variable
    // googleOAuthService.ts's getClientId() reads at build time, just from
    // the server side at request time. Client IDs aren't secret, so
    // reporting whether one is present is safe; neither value is ever
    // included in the response, only booleans.
    const clientIdConfigured = Boolean(process.env.VITE_GOOGLE_OAUTH_CLIENT_ID);
    const clientSecretConfigured = Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
    const oauthConfigured = clientIdConfigured && clientSecretConfigured;

    return jsonResponse(200, {
      status: oauthConfigured ? "ok" : "error",
      oauthConfigured,
      checks: {
        clientIdConfigured,
        clientSecretConfigured,
      },
    });
  },
};
