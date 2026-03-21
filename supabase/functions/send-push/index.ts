import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Edge function to send native push notifications.
 *
 * Supports:
 *  - FCM v1 (Android + web) via FIREBASE_SERVICE_ACCOUNT_JSON
 *  - APNs HTTP/2 (iOS) via APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID
 *
 * Body: { user_id: string, title: string, body: string, data?: Record<string,string> }
 *
 * Platform routing:
 *  - device_tokens with platform='ios'  → APNs
 *  - all others (android, web, unknown) → FCM v1
 *
 * Invalid / expired tokens are automatically pruned from device_tokens.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { user_id, title, body, data } = await req.json();
    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "user_id, title, and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch device tokens ─────────────────────────────────────────────────
    const { data: tokens, error: tokenError } = await supabase
      .from("device_tokens")
      .select("token, platform")
      .eq("user_id", user_id);

    if (tokenError) throw tokenError;
    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "No device tokens registered for user" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const iosTokens  = tokens.filter((t: any) => t.platform === "ios");
    const fcmTokens  = tokens.filter((t: any) => t.platform !== "ios");

    let sent   = 0;
    let failed = 0;

    // ── FCM v1 (Android + web) ─────────────────────────────────────────────
    if (fcmTokens.length > 0) {
      const firebaseJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
      if (!firebaseJson) {
        console.warn("[send-push] FIREBASE_SERVICE_ACCOUNT_JSON not set – skipping FCM tokens");
        failed += fcmTokens.length;
      } else {
        const serviceAccount = JSON.parse(firebaseJson);
        const accessToken = await getFirebaseAccessToken(serviceAccount);
        const projectId = serviceAccount.project_id;

        const fcmResults = await Promise.allSettled(
          fcmTokens.map(async ({ token }: any) => {
            const res = await fetch(
              `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  message: {
                    token,
                    notification: { title, body },
                    data: stringifyValues(data || {}),
                  },
                }),
              }
            );

            if (!res.ok) {
              const errText = await res.text();
              if (errText.includes("NOT_FOUND") || errText.includes("UNREGISTERED")) {
                await supabase.from("device_tokens").delete().eq("token", token);
              }
              throw new Error(errText);
            }
            return res.json();
          })
        );

        sent   += fcmResults.filter((r) => r.status === "fulfilled").length;
        failed += fcmResults.filter((r) => r.status === "rejected").length;
      }
    }

    // ── APNs HTTP/2 (iOS) ──────────────────────────────────────────────────
    if (iosTokens.length > 0) {
      const apnsKeyP8    = Deno.env.get("APNS_KEY_P8");
      const apnsKeyId    = Deno.env.get("APNS_KEY_ID");
      const apnsTeamId   = Deno.env.get("APNS_TEAM_ID");
      const apnsBundleId = Deno.env.get("APNS_BUNDLE_ID");

      if (!apnsKeyP8 || !apnsKeyId || !apnsTeamId || !apnsBundleId) {
        console.warn("[send-push] APNs credentials not fully configured – skipping iOS tokens");
        failed += iosTokens.length;
      } else {
        const apnsJwt = await generateApnsJwt(apnsKeyP8, apnsKeyId, apnsTeamId);

        const apnsResults = await Promise.allSettled(
          iosTokens.map(async ({ token }: any) => {
            const res = await fetch(
              `https://api.push.apple.com/3/device/${token}`,
              {
                method: "POST",
                headers: {
                  authorization: `bearer ${apnsJwt}`,
                  "apns-topic": apnsBundleId,
                  "apns-push-type": "alert",
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  aps: {
                    alert: { title, body },
                    sound: "default",
                    badge: 1,
                  },
                  ...(data ? { data } : {}),
                }),
              }
            );

            if (!res.ok) {
              const errBody = await res.json().catch(() => ({}));
              const reason = (errBody as any).reason ?? res.statusText;
              if (reason === "Unregistered" || reason === "BadDeviceToken") {
                await supabase.from("device_tokens").delete().eq("token", token);
              }
              throw new Error(reason);
            }
          })
        );

        sent   += apnsResults.filter((r) => r.status === "fulfilled").length;
        failed += apnsResults.filter((r) => r.status === "rejected").length;
      }
    }

    return new Response(
      JSON.stringify({ sent, failed, total: tokens.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-push error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Generate a short-lived OAuth2 access token from a Firebase service account.
 */
async function getFirebaseAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj: any) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const unsignedToken = `${enc(header)}.${enc(payload)}`;

  // Import the private key
  const pemContents = serviceAccount.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signedToken = `${unsignedToken}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedToken}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

/**
 * Generate a short-lived JWT for APNs provider authentication (ES256).
 * The token is valid for up to 1 hour; Apple recommends refreshing every 20–30 min.
 * For a cron-driven edge function this is fine since each invocation is short-lived.
 *
 * Requires:
 *   keyP8   - the raw contents of the .p8 file (including PEM headers)
 *   keyId   - 10-char Key ID from Apple Developer portal
 *   teamId  - 10-char Team ID from Apple Developer portal
 */
async function generateApnsJwt(
  keyP8: string,
  keyId: string,
  teamId: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header  = { alg: "ES256", kid: keyId };
  const payload = { iss: teamId, iat: now };

  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const unsigned = `${b64url(header)}.${b64url(payload)}`;

  // Strip PEM headers and whitespace
  const pemContents = keyP8
    .replace(/-----BEGIN (EC )?PRIVATE KEY-----/, "")
    .replace(/-----END (EC )?PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsigned)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${unsigned}.${sig}`;
}

/**
 * FCM data payloads require all values to be strings.
 */
function stringifyValues(obj: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, String(v)])
  );
}
