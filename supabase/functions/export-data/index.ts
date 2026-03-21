import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Use service role client for full access
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Use user JWT to get authenticated user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // Export all tables for this user
    const exportData: Record<string, unknown[]> = {};

    const tables: Array<{ name: string; userColumn: string }> = [
      { name: "profiles", userColumn: "id" },
      { name: "user_preferences", userColumn: "user_id" },
      { name: "notification_preferences", userColumn: "user_id" },
      { name: "spaces", userColumn: "user_id" },
      { name: "items", userColumn: "user_id" },
      { name: "habits", userColumn: "user_id" },
      { name: "habit_entries", userColumn: "user_id" },
      { name: "journal_entries", userColumn: "user_id" },
      { name: "chat_sessions", userColumn: "user_id" },
      { name: "chat_messages", userColumn: "user_id" },
      { name: "notifications", userColumn: "user_id" },
      { name: "scheduled_reminders", userColumn: "user_id" },
      { name: "archive_sources", userColumn: "user_id" },
      { name: "device_tokens", userColumn: "user_id" },
      { name: "data_integrity_logs", userColumn: "user_id" },
      { name: "shared_archive_prototype", userColumn: "author_id" },
    ];

    const errors: Record<string, string> = {};

    for (const table of tables) {
      const { data, error } = await adminClient
        .from(table.name)
        .select("*")
        .eq(table.userColumn, userId);

      if (error) {
        // Table might not exist yet — skip gracefully
        errors[table.name] = error.message;
      } else {
        exportData[table.name] = data ?? [];
      }
    }

    // Build export payload
    const payload = {
      exported_at: new Date().toISOString(),
      user_id: userId,
      user_email: user.email,
      tables: exportData,
      ...(Object.keys(errors).length > 0 ? { skipped_tables: errors } : {}),
    };

    // Parse URL params for format
    const url = new URL(req.url);
    const format = url.searchParams.get("format") ?? "json";

    if (format === "sql") {
      // Generate SQL INSERT statements for each table
      const sqlLines: string[] = [
        `-- Second Mind Data Export`,
        `-- Exported at: ${payload.exported_at}`,
        `-- User: ${payload.user_email}`,
        ``,
      ];

      for (const [tableName, rows] of Object.entries(exportData)) {
        if (rows.length === 0) continue;
        sqlLines.push(`-- Table: ${tableName} (${rows.length} rows)`);
        for (const row of rows) {
          const record = row as Record<string, unknown>;
          const cols = Object.keys(record)
            .map((k) => `"${k}"`)
            .join(", ");
          const vals = Object.values(record)
            .map((v) => {
              if (v === null) return "NULL";
              if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
              if (typeof v === "number") return String(v);
              if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
              return `'${String(v).replace(/'/g, "''")}'`;
            })
            .join(", ");
          sqlLines.push(`INSERT INTO public."${tableName}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;`);
        }
        sqlLines.push(``);
      }

      return new Response(sqlLines.join("\n"), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/plain",
          "Content-Disposition": `attachment; filename="secondmind-export-${Date.now()}.sql"`,
        },
      });
    }

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="secondmind-export-${Date.now()}.json"`,
      },
    });
  } catch (err) {
    console.error("Export error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
