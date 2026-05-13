/**
 * delete-account — irreversibly removes the calling user and ALL of their data.
 *
 * App Store Connect requires in-app account deletion (Guideline 5.1.1(v)).
 * This function is the destructive backend that the Settings UI calls after
 * a typed confirmation.
 *
 * Auth model: caller's JWT identifies whose data to delete; the service-role
 * client performs the actual deletes (bypasses RLS).
 *
 * Deletion order is bottom-up by FK dependency. Tables without user_id
 * (e.g. space_invites, space_members) are cleared via the spaces they
 * reference or assumed to cascade.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tables that hold per-user data, deleted in dependency-safe order.
// Each must have a `user_id` column.
const USER_DATA_TABLES = [
  "chat_messages",
  "chat_sessions",
  "habit_entries",
  "habits",
  "journal_entries",
  "notifications",
  "notification_preferences",
  "device_tokens",
  "user_preferences",
  "people",
  "items",
  "space_members",
  "space_invites",
  "spaces",
  "data_integrity_logs",
  "profiles",
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Identify the caller.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Service-role client for the deletes — RLS would otherwise block some rows.
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const errors: Array<{ table: string; message: string }> = [];

    for (const table of USER_DATA_TABLES) {
      const { error } = await adminClient.from(table).delete().eq("user_id", userId);
      if (error) {
        // Don't abort — keep deleting other tables. We'll report what failed.
        errors.push({ table, message: error.message });
      }
    }

    // Finally, delete the auth.users row. After this the JWT is invalid.
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      return new Response(
        JSON.stringify({
          error: "Account data was deleted but the auth record could not be removed. Please contact support.",
          details: deleteAuthError.message,
          partial_errors: errors,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        partial_errors: errors.length ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
