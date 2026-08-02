/**
 * api/oauth/google/_shared.ts
 * Sakhi Clinic — shared helpers for the Google OAuth token-proxy endpoints.
 *
 * Files prefixed with "_" under /api are not deployed as routes by Vercel
 * -- this is purely internal, shared by exchange.ts and refresh.ts so the
 * two endpoints stay identical in how they validate input, log, and
 * translate errors, without duplicating that logic per grant type (each
 * endpoint file otherwise contains only the logic specific to its own
 * grant type -- see their own file comments).
 *
 * Web Handler contract: every exported endpoint is `{ fetch(request:
 * Request): Promise<Response> }` -- Vercel's currently-documented Node.js
 * function signature (see https://vercel.com/docs/functions/functions-api-reference).
 * It is plain ESM top to bottom (matches this project's root tsconfig.json,
 * which is what Vercel's function builder actually compiles against --
 * it does not read a tsconfig.json placed under api/) and needs no
 * package.json "type" field or Vercel-side experimental flags to load
 * correctly, unlike the legacy Node (req, res) callback style this file
 * used before.
 *
 * Logging contract: every log call in this file takes ONLY specific,
 * named, whitelisted fields -- never the request body, never the outgoing
 * request params (which can carry client_secret, code, code_verifier, or
 * refresh_token), and never a parsed *successful* Google response (which
 * carries access_token/refresh_token). Google's error responses ARE safe
 * to log in full -- they are documented OAuth error codes and human
 * descriptions, never token material. If you add a new log call anywhere
 * in api/oauth/google/, it must follow this same rule.
 */

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * googleOAuthService.ts sends both the exchange and refresh request bodies
 * as application/x-www-form-urlencoded (see exchangeAuthorizationCode() /
 * refreshAccessToken()), matching what Google's own token endpoint expects
 * -- so that's what's parsed here too. (A prior version of this file used
 * request.json(), which silently failed on this form-encoded body: the
 * catch below swallowed the parse error and returned {}, so every field
 * downstream read as empty and validation rejected the request before it
 * ever reached Google. Every caller here now sends and reads the same
 * format on purpose.)
 */
export async function readFormBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    const params = new URLSearchParams(text);
    const body: Record<string, unknown> = {};
    for (const [key, value] of params) body[key] = value;
    return body;
  } catch {
    return {};
  }
}

export function readStringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function errorResponse(status: number, error: string, message: string): Response {
  return jsonResponse(status, { error, message });
}

/**
 * A short, safe, doctor-facing message for a Google token-endpoint error
 * code -- never Google's raw error_description, which is a
 * developer-oriented string ("Bad Request") that means nothing to a
 * doctor. Google's `error` codes are a stable, documented set (RFC 6749
 * §5.2 plus Google's own additions), safe to switch on directly. The full
 * original error is never lost -- forwardToGoogle logs it server-side
 * regardless of which message is chosen here.
 */
const SAFE_ERROR_MESSAGES: Record<string, string> = {
  invalid_grant: "Authorization expired. Please reconnect Google Drive.",
  invalid_client: "Google Drive configuration error.",
  unauthorized_client: "Google Drive configuration error.",
  access_denied: "Permission denied.",
  invalid_request: "Google Drive sign-in request was invalid. Please try reconnecting.",
};
const DEFAULT_SAFE_ERROR_MESSAGE = "Google Drive sign-in failed. Please try reconnecting.";

export function safeMessageFor(googleErrorCode: string | undefined): string {
  if (googleErrorCode && SAFE_ERROR_MESSAGES[googleErrorCode]) return SAFE_ERROR_MESSAGES[googleErrorCode];
  return DEFAULT_SAFE_ERROR_MESSAGE;
}

/**
 * Validates the server-side secret is configured. Logs (safely -- no
 * value, ever) when it's missing; returns the secret to the caller
 * otherwise. Centralized so exchange.ts and refresh.ts can't drift on this
 * check. Callers turn a null return into a 500 via errorResponse.
 */
export function requireClientSecret(endpointName: string): string | null {
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!secret) {
    console.error(`[api/oauth/google/${endpointName}] GOOGLE_OAUTH_CLIENT_SECRET is not configured on the server`);
    return null;
  }
  return secret;
}

/**
 * Sends `params` (already including client_secret) to Google's token
 * endpoint and relays the outcome:
 *  - success: Google's JSON is passed through as-is -- it's the caller's
 *    own tokens, not a secret this server needs to hide from them.
 *  - Google rejected it: Google's full error is logged here, server-side,
 *    in full -- never lost -- and the browser instead gets a short, safe,
 *    structured { error, message } it can show a doctor directly.
 *  - network failure: reported as a safe 502, also logged server-side.
 */
export async function forwardToGoogle(params: URLSearchParams, endpointName: string, grantType: string): Promise<Response> {
  let googleResponse: Response;
  try {
    googleResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (error) {
    console.error(`[api/oauth/google/${endpointName}] Network error contacting Google`, {
      message: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(502, "upstream_unavailable", "Could not reach Google. Please check your connection and try again.");
  }

  const text = await googleResponse.text();

  if (googleResponse.ok) {
    console.info(`[api/oauth/google/${endpointName}] Google responded`, { status: googleResponse.status, grant_type: grantType });
    let json: unknown = {};
    try {
      json = JSON.parse(text);
    } catch {
      // Google returning a non-JSON 2xx would be unprecedented, but don't
      // throw over it -- pass through an empty object rather than crash.
    }
    return jsonResponse(googleResponse.status, json);
  }

  let googleError: string | undefined;
  let googleErrorDescription: string | undefined;
  try {
    const parsed = JSON.parse(text);
    googleError = typeof parsed.error === "string" ? parsed.error : undefined;
    googleErrorDescription = typeof parsed.error_description === "string" ? parsed.error_description : undefined;
  } catch {
    // Not JSON -- googleError/googleErrorDescription stay undefined below.
  }

  // The ONLY place Google's full error is preserved -- server-side logs
  // only, never sent to the browser as-is (see safeMessageFor above).
  console.error(`[api/oauth/google/${endpointName}] Google rejected the request`, {
    status: googleResponse.status,
    statusText: googleResponse.statusText,
    grant_type: grantType,
    error: googleError,
    error_description: googleErrorDescription,
  });

  return errorResponse(googleResponse.status, googleError || "token_request_failed", safeMessageFor(googleError));
}
