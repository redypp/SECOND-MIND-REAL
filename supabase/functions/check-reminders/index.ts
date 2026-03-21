import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Cron-triggered edge function that checks for due scheduled_reminders
 * and sends native push notifications via the send-push function.
 *
 * Runs every minute via pg_cron. Uses service_role to bypass RLS.
 *
 * Enhanced:
 *  - Respects user quiet hours from notification_preferences
 *  - Sets notification_type='scheduled_reminder' and tracks push_sent status
 *  - Skips push (but still creates in-app notification) during quiet hours
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date().toISOString();

    // ── 1. Find all due, unfired reminders ──────────────────────────────────
    const { data: dueReminders, error: fetchError } = await supabase
      .from("scheduled_reminders")
      .select("*")
      .eq("is_fired", false)
      .eq("dismissed", false)
      .lte("remind_at", now)
      .limit(50);

    if (fetchError) throw fetchError;
    if (!dueReminders || dueReminders.length === 0) {
      return new Response(
        JSON.stringify({ message: "No due reminders", checked_at: now }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[check-reminders] Found ${dueReminders.length} due reminders`);

    // ── 2. Fetch notification_preferences for all affected users ─────────────
    const userIds = [...new Set(dueReminders.map((r: any) => r.user_id))];
    const { data: prefsRows } = await supabase
      .from("notification_preferences")
      .select("user_id, push_enabled, quiet_hours_start, quiet_hours_end, timezone")
      .in("user_id", userIds);

    const prefsMap = new Map<string, any>(
      (prefsRows ?? []).map((p: any) => [p.user_id, p])
    );

    let sent = 0;
    let failed = 0;
    let quietSkipped = 0;

    for (const reminder of dueReminders) {
      try {
        const prefs = prefsMap.get(reminder.user_id);
        const inQuiet = prefs ? checkQuietHours(prefs) : false;

        // ── 3. Always create in-app notification ─────────────────────────────
        const { data: notifRow } = await supabase
          .from("notifications")
          .insert({
            user_id: reminder.user_id,
            notification_type: "scheduled_reminder",
            title: "Reminder",
            message: reminder.message,
            category: "reminder",
            reason: "Scheduled reminder",
            priority: "medium",
            scheduled_for: now,
            status: "pending",
            push_sent: false,
          })
          .select("id")
          .single();

        // ── 4. Send push unless in quiet hours or push disabled ───────────────
        if (!inQuiet && prefs?.push_enabled !== false) {
          const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              user_id: reminder.user_id,
              title: "Reminder",
              body: reminder.message,
              data: { type: "scheduled_reminder", reminder_id: reminder.id },
            }),
          });

          if (!pushRes.ok) {
            const errText = await pushRes.text();
            console.warn(`[check-reminders] Push failed for ${reminder.id}:`, errText);
            failed++;
          } else {
            sent++;
            if (notifRow?.id) {
              await supabase
                .from("notifications")
                .update({ push_sent: true, status: "sent" })
                .eq("id", notifRow.id);
            }
          }
        } else if (inQuiet) {
          quietSkipped++;
          console.log(`[check-reminders] ${reminder.user_id}: push skipped (quiet hours)`);
        }

        // ── 5. Mark reminder as fired ────────────────────────────────────────
        await supabase
          .from("scheduled_reminders")
          .update({ is_fired: true, fired_at: now })
          .eq("id", reminder.id);

      } catch (err) {
        console.error(`[check-reminders] Error processing reminder ${reminder.id}:`, err);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        checked_at: now,
        total: dueReminders.length,
        push_sent: sent,
        push_failed: failed,
        quiet_hours_skipped: quietSkipped,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[check-reminders] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Returns true if current time (in user's timezone) falls within quiet hours.
 * Handles overnight ranges, e.g. 22:00 – 08:00.
 */
function checkQuietHours(prefs: {
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  timezone?: string;
}): boolean {
  const start = prefs.quiet_hours_start ?? "22:00";
  const end = prefs.quiet_hours_end ?? "08:00";
  const tz = prefs.timezone ?? "UTC";

  const localTimeStr = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });

  const [lh, lm] = localTimeStr.split(":").map(Number);
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  const nowMins = lh * 60 + lm;
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;

  if (startMins > endMins) {
    // Overnight range (e.g. 22:00 → 08:00)
    return nowMins >= startMins || nowMins < endMins;
  }
  return nowMins >= startMins && nowMins < endMins;
}
