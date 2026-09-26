-- ============================================================================
-- Short-lived, single-use OAuth requests for the native shell
-- ============================================================================
-- Google refuses OAuth inside an embedded WebView (`disallowed_useragent`), so
-- the Capacitor shell opens the flow in the system browser. That browser has its
-- own cookie jar, which means the PKCE code verifier cannot live in the cookie
-- the web flow uses — the verifier would be set in the WebView and looked for in
-- the system browser.
--
-- So the verifier is held here instead, against an opaque random `request_id`
-- that the WebView keeps only while a sign-in is pending. The system browser
-- never sees it, the client never sees the verifier, and the code exchange
-- happens back in the WebView's own request so the session cookies land in the
-- jar the app actually uses.
--
-- Deliberately minimal: no access token, no refresh token, no user id. Nothing
-- in this table is worth stealing on its own — a verifier is useless without the
-- `insforge_code`, and the code is useless without the verifier.
CREATE TABLE IF NOT EXISTS public.native_auth_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Opaque, cryptographically random, generated in `lib/auth/native.ts`.
  request_id    text NOT NULL UNIQUE,
  -- The PKCE verifier. Server-side only; never returned by any route.
  code_verifier text NOT NULL,
  -- Diagnostics only, and coarse: "ios" or "android".
  platform      text CHECK (platform IN ('ios', 'android', 'web')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Short by design. A sign-in that takes longer than this has failed.
  expires_at    timestamptz NOT NULL,
  -- Set exactly once, by the update that consumes the request.
  consumed_at   timestamptz
);

-- The only lookup the routes perform.
CREATE INDEX IF NOT EXISTS native_auth_requests_request_id_idx
  ON public.native_auth_requests (request_id);

-- Cleanup scans by expiry.
CREATE INDEX IF NOT EXISTS native_auth_requests_expires_at_idx
  ON public.native_auth_requests (expires_at);

-- Readable by nobody but the service role. RLS is enabled with **no policies**,
-- which denies every learner-scoped client by default: a learner cannot list
-- pending sign-ins, and cannot read another learner's verifier even if they
-- guessed a request id.
ALTER TABLE public.native_auth_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.native_auth_requests FROM anon;
REVOKE ALL ON public.native_auth_requests FROM authenticated;

COMMENT ON TABLE public.native_auth_requests IS
  'Single-use PKCE verifiers for the Capacitor shell. Service-role only; no learner-scoped access.';
