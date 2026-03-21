/**
 * ai-notification-scheduler
 *
 * Cron-triggered Supabase Edge Function that runs the intelligent notification
 * pipeline for Second Mind.
 *
 * Schedule: every 30 minutes (configured via pg_cron or Supabase dashboard)
 *
 * Pipeline:
 *  1. Fetch all users who have AI notifications enabled
 *  2. For each user (in parallel, capped):
 *     a. Skip if in quiet hours
 *     b. Skip if daily cap already reached
 *     c. Build context: tasks, archives, habits, schedule, recent items
 *     d. Call Claude to generate 1-3 prioritised notification suggestions
 *     e. Deduplicate against recent notifications
 *     f. Insert new notifications with status='pending'
 *     g. Dispatch push via send-push edge function
 *
 * Environment vars required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY (or ANTHROPIC_API_KEY)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_USERS_PER_RUN = 50;          // hard cap to keep run time < 60 s
const MAX_NOTIFICATIONS_PER_USER = 3;  // per scheduler run
const LOOKBACK_HOURS = 6;              // minimum gap between same dedup_key
const MAX_CONTENT_LEN = 300;           // truncate item content before sending to AI

// Notification types the scheduler can generate
type NotificationType =
  | "ai_nudge"
  | "time_based"
  | "follow_up"
  | "insight"
  | "daily_digest";

type NotificationCategory =
  | "resurface"
  | "connection"
  | "decision"
  | "task"
  | "reminder";

type NotificationPriority = "low" | "medium" | "high";

interface GeneratedNotification {
  notification_type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  reason: string;
  suggested_action?: string;
  related_item_ids?: string[];
  dedup_key: string;
}

interface UserPrefs {
  user_id: string;
  max_daily_notifications: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
  push_enabled: boolean;
  ai_nudges_enabled: boolean;
  insights_enabled: boolean;
  follow_ups_enabled: boolean;
  time_based_enabled: boolean;
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!anthropicKey) {
    console.error("[ai-notification-scheduler] ANTHROPIC_API_KEY not set");
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const runStart = new Date().toISOString();

  let totalProcessed = 0;
  let totalInserted = 0;
  let totalPushed = 0;

  try {
    // ── 1. Fetch users with AI notifications enabled ──────────────────────
    const { data: prefsRows, error: prefsErr } = await supabase
      .from("notification_preferences")
      .select(
        "user_id, max_daily_notifications, quiet_hours_start, quiet_hours_end, " +
        "timezone, push_enabled, ai_nudges_enabled, insights_enabled, " +
        "follow_ups_enabled, time_based_enabled"
      )
      .or("ai_nudges_enabled.eq.true,insights_enabled.eq.true,follow_ups_enabled.eq.true,time_based_enabled.eq.true")
      .limit(MAX_USERS_PER_RUN);

    if (prefsErr) throw prefsErr;
    if (!prefsRows || prefsRows.length === 0) {
      return new Response(
        JSON.stringify({ message: "No users with AI notifications enabled", run_start: runStart }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ai-notification-scheduler] Processing ${prefsRows.length} users`);

    // ── 2. Process users in parallel (Promise.allSettled so one failure doesn't kill the run) ─
    const results = await Promise.allSettled(
      prefsRows.map((prefs: any) => processUser(supabase as any, supabaseUrl, serviceRoleKey, anthropicKey, prefs as UserPrefs))
    );

    for (const result of results) {
      totalProcessed++;
      if (result.status === "fulfilled") {
        totalInserted += result.value.inserted;
        totalPushed += result.value.pushed;
      } else {
        console.error("[ai-notification-scheduler] User processing error:", result.reason);
      }
    }

    return new Response(
      JSON.stringify({
        run_start: runStart,
        users_processed: totalProcessed,
        notifications_inserted: totalInserted,
        push_sent: totalPushed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[ai-notification-scheduler] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Per-user processing ────────────────────────────────────────────────────────

async function processUser(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  anthropicKey: string,
  prefs: UserPrefs
): Promise<{ inserted: number; pushed: number }> {
  const userId = prefs.user_id;

  // ── 2a. Check quiet hours ────────────────────────────────────────────────
  if (isInQuietHours(prefs)) {
    console.log(`[scheduler] ${userId}: in quiet hours, skipping`);
    return { inserted: 0, pushed: 0 };
  }

  // ── 2b. Check daily cap ──────────────────────────────────────────────────
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count: todayCount } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", todayStart.toISOString());

  const cap = prefs.max_daily_notifications ?? 5;
  if ((todayCount ?? 0) >= cap) {
    console.log(`[scheduler] ${userId}: daily cap (${cap}) reached`);
    return { inserted: 0, pushed: 0 };
  }

  const remainingSlots = Math.min(
    cap - (todayCount ?? 0),
    MAX_NOTIFICATIONS_PER_USER
  );

  // ── 2c. Gather context ───────────────────────────────────────────────────
  const context = await buildUserContext(supabase, userId, prefs);
  if (!context) return { inserted: 0, pushed: 0 };

  // ── 2d. Generate notifications via AI ────────────────────────────────────
  const suggestions = await generateNotifications(
    anthropicKey,
    context,
    prefs,
    remainingSlots
  );
  if (!suggestions.length) return { inserted: 0, pushed: 0 };

  // ── 2e. Deduplicate ──────────────────────────────────────────────────────
  const recentCutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const { data: recentNotifs } = await supabase
    .from("notifications")
    .select("dedup_key")
    .eq("user_id", userId)
    .gte("created_at", recentCutoff)
    .not("dedup_key", "is", null);

  const usedKeys = new Set((recentNotifs || []).map((n: any) => n.dedup_key));
  const fresh = suggestions.filter((s) => !usedKeys.has(s.dedup_key));

  if (!fresh.length) {
    console.log(`[scheduler] ${userId}: all suggestions are duplicates`);
    return { inserted: 0, pushed: 0 };
  }

  // ── 2f. Insert notifications ─────────────────────────────────────────────
  const now = new Date().toISOString();
  const rows = fresh.map((s) => ({
    user_id: userId,
    notification_type: s.notification_type,
    category: s.category,
    priority: s.priority,
    title: s.title,
    message: s.message,
    reason: s.reason,
    suggested_action: s.suggested_action,
    related_item_ids: s.related_item_ids,
    dedup_key: s.dedup_key,
    scheduled_for: now,
    status: "pending",
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from("notifications")
    .insert(rows)
    .select("id, notification_type, priority");

  if (insertErr) {
    // Gracefully handle dedup constraint violations
    if (insertErr.code === "23505") {
      console.log(`[scheduler] ${userId}: dedup constraint prevented duplicate insert`);
      return { inserted: 0, pushed: 0 };
    }
    throw insertErr;
  }

  const insertedCount = inserted?.length ?? 0;
  let pushedCount = 0;

  // ── 2g. Dispatch push for high/medium priority items ────────────────────
  if (prefs.push_enabled && insertedCount > 0) {
    const pushTargets = fresh.filter((s) =>
      s.priority === "high" || s.priority === "medium"
    );

    for (const notif of pushTargets) {
      try {
        const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            user_id: userId,
            title: notif.title,
            body: notif.message,
            data: {
              type: notif.notification_type,
              category: notif.category,
              priority: notif.priority,
            },
          }),
        });

        if (pushRes.ok) {
          pushedCount++;
          // Mark as push_sent in the notifications table
          const matched = (inserted ?? []).find(
            (i: any) => i.notification_type === notif.notification_type
          );
          if (matched) {
            await supabase
              .from("notifications")
              .update({ push_sent: true, status: "sent" })
              .eq("id", matched.id);
          }
        } else {
          console.warn(`[scheduler] ${userId}: push failed`, await pushRes.text());
        }
      } catch (e) {
        console.warn(`[scheduler] ${userId}: push exception`, e);
      }
    }
  }

  console.log(`[scheduler] ${userId}: inserted=${insertedCount}, pushed=${pushedCount}`);
  return { inserted: insertedCount, pushed: pushedCount };
}

// ── Context builder ────────────────────────────────────────────────────────────

interface UserContext {
  profile: { full_name: string };
  today: string;
  now: string;
  pendingTodos: { id: string; title: string; created_at: string }[];
  todayEvents: { title: string; scheduled_time: string }[];
  recentArchive: { id: string; title: string; content_snippet: string; updated_at: string }[];
  staleSavedItems: { id: string; title: string; days_old: number }[];
  habits: { name: string; streak: number; last_done: string | null }[];
  recentJournal: string[];
  enabledTypes: {
    ai_nudges: boolean;
    insights: boolean;
    follow_ups: boolean;
    time_based: boolean;
  };
}

async function buildUserContext(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  prefs: UserPrefs
): Promise<UserContext | null> {
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const results: any[] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .single(),

    supabase
      .from("items")
      .select("id, title, content, created_at")
      .eq("user_id", userId)
      .eq("sub_category", "todo")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20),

    supabase
      .from("items")
      .select("id, title, scheduled_time")
      .eq("user_id", userId)
      .eq("sub_category", "scheduling")
      .eq("scheduled_date", today)
      .is("deleted_at", null)
      .order("scheduled_time", { ascending: true })
      .limit(10),

    supabase
      .from("items")
      .select("id, title, content, updated_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(15),

    // Items saved > 7 days ago and never returned to
    supabase
      .from("items")
      .select("id, title, content, created_at, updated_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .lte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      // Use updated_at as proxy for "never revisited"
      .lte("updated_at", new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(10),

    supabase
      .from("habits")
      .select("id, name")
      .eq("user_id", userId)
      .limit(10),

    supabase
      .from("habit_entries")
      .select("habit_id, status, date")
      .eq("user_id", userId)
      .gte("date", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
      .limit(50),

    supabase
      .from("journal_entries")
      .select("content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const profile = results[0].data;
  const todos = results[1].data;
  const events = results[2].data;
  const recentItems = results[3].data;
  const staleItems = results[4].data;
  const habits = results[5].data;
  const habitEntries = results[6].data;
  const journal = results[7].data;

  if (!profile) return null;

  // Enrich habits with last_done info
  const enrichedHabits = (habits ?? []).map((h: any) => {
    const entries = (habitEntries ?? []).filter((e: any) => e.habit_id === h.id);
    const lastDone = entries
      .filter((e: any) => e.status === "done")
      .sort((a: any, b: any) => b.date.localeCompare(a.date))[0];
    return {
      name: h.name,
      streak: h.streak ?? 0,
      last_done: lastDone?.date ?? null,
    };
  });

  const recentArchive = (recentItems ?? []).map((i: any) => ({
    id: i.id,
    title: i.title || "Untitled",
    content_snippet: (i.content ?? "").slice(0, MAX_CONTENT_LEN),
    updated_at: i.updated_at,
  }));

  const staleSaved = (staleItems ?? []).map((i: any) => ({
    id: i.id,
    title: i.title || "Untitled",
    days_old: Math.floor(
      (Date.now() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));

  return {
    profile: { full_name: profile.full_name || "User" },
    today,
    now,
    pendingTodos: (todos ?? []).map((t: any) => ({
      id: t.id,
      title: t.title || t.content?.slice(0, 80) || "Untitled",
      created_at: t.created_at,
    })),
    todayEvents: (events ?? []).map((e: any) => ({
      title: e.title || "Untitled",
      scheduled_time: e.scheduled_time || "?",
    })),
    recentArchive,
    staleSavedItems: staleSaved,
    habits: enrichedHabits,
    recentJournal: (journal ?? [])
      .map((j: any) => (j.content ?? "").slice(0, 200))
      .filter(Boolean),
    enabledTypes: {
      ai_nudges: prefs.ai_nudges_enabled ?? true,
      insights: prefs.insights_enabled ?? true,
      follow_ups: prefs.follow_ups_enabled ?? true,
      time_based: prefs.time_based_enabled ?? true,
    },
  };
}

// ── AI notification generator ─────────────────────────────────────────────────

async function generateNotifications(
  anthropicKey: string,
  ctx: UserContext,
  prefs: UserPrefs,
  maxCount: number
): Promise<GeneratedNotification[]> {
  const enabledTypes: string[] = [];
  if (ctx.enabledTypes.ai_nudges) enabledTypes.push("ai_nudge");
  if (ctx.enabledTypes.insights) enabledTypes.push("insight");
  if (ctx.enabledTypes.follow_ups) enabledTypes.push("follow_up");
  if (ctx.enabledTypes.time_based) enabledTypes.push("time_based");

  if (!enabledTypes.length) return [];

  const systemPrompt = `You are Second Mind's intelligent notification assistant.
Your job is to generate helpful, personal, non-spammy notifications for a user based on their data.

Rules:
- Generate at most ${maxCount} notifications.
- Each notification must have a unique dedup_key that captures its intent (e.g. "follow_up:item_id_123", "insight:habit_sleep_streak").
- Only generate notifications of these enabled types: ${enabledTypes.join(", ")}.
- Notifications must feel personal and useful, NOT generic. Reference specific data.
- Prioritise: high = urgent/time-sensitive, medium = actionable today, low = nice-to-have.
- category must be one of: resurface, connection, decision, task, reminder.
- notification_type must be one of: ${enabledTypes.join(", ")}.
- Return ONLY valid JSON array. No markdown, no explanation.`;

  const contextText = buildContextPrompt(ctx);

  const userPrompt = `User context:
${contextText}

Generate up to ${maxCount} notifications. Return a JSON array of objects with this exact shape:
[{
  "notification_type": "...",
  "category": "...",
  "priority": "...",
  "title": "...",        (max 60 chars)
  "message": "...",      (max 200 chars, personal, references specific data)
  "reason": "...",       (internal reasoning, 1 sentence)
  "suggested_action": "...",  (optional, max 80 chars)
  "related_item_ids": ["..."],  (optional array of item UUIDs from context)
  "dedup_key": "..."     (unique key, use format: type:context_hint)
}]

If there is nothing genuinely useful to say, return an empty array [].`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      console.error("[scheduler] Anthropic API error:", await response.text());
      return [];
    }

    const data = await response.json();
    const raw = data?.content?.[0]?.text ?? "[]";

    // Parse and validate
    let parsed: any[];
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Try extracting JSON from markdown code block
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        console.warn("[scheduler] Failed to parse AI response:", raw.slice(0, 200));
        return [];
      }
    }

    if (!Array.isArray(parsed)) return [];

    // Validate and sanitize each notification
    return parsed
      .filter((n) => n && typeof n === "object")
      .slice(0, maxCount)
      .map((n) => ({
        notification_type: validateEnum(n.notification_type, enabledTypes, "ai_nudge") as NotificationType,
        category: validateEnum(n.category, ["resurface","connection","decision","task","reminder"], "resurface") as NotificationCategory,
        priority: validateEnum(n.priority, ["low","medium","high"], "medium") as NotificationPriority,
        title: String(n.title ?? "Second Mind").slice(0, 60),
        message: String(n.message ?? "").slice(0, 200),
        reason: String(n.reason ?? "").slice(0, 200),
        suggested_action: n.suggested_action ? String(n.suggested_action).slice(0, 80) : undefined,
        related_item_ids: Array.isArray(n.related_item_ids)
          ? n.related_item_ids.filter((id: any) => typeof id === "string").slice(0, 5)
          : undefined,
        dedup_key: String(n.dedup_key ?? `ai_nudge:${Date.now()}`).slice(0, 255),
      }));
  } catch (err) {
    console.error("[scheduler] generateNotifications error:", err);
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildContextPrompt(ctx: UserContext): string {
  const lines: string[] = [
    `User: ${ctx.profile.full_name}`,
    `Today: ${ctx.today} | Now: ${ctx.now}`,
  ];

  if (ctx.todayEvents.length) {
    lines.push("\nTODAY'S SCHEDULE:");
    ctx.todayEvents.forEach((e) =>
      lines.push(`  ${e.scheduled_time} - ${e.title}`)
    );
  }

  if (ctx.pendingTodos.length) {
    lines.push("\nPENDING TASKS (oldest first):");
    [...ctx.pendingTodos]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(0, 10)
      .forEach((t) => {
        const age = Math.floor(
          (Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        lines.push(`  [${t.id}] "${t.title}" (${age}d old)`);
      });
  }

  if (ctx.staleSavedItems.length) {
    lines.push("\nSAVED ITEMS NEVER REVISITED:");
    ctx.staleSavedItems.slice(0, 5).forEach((i) =>
      lines.push(`  [${i.id}] "${i.title}" (${i.days_old} days old)`)
    );
  }

  if (ctx.habits.length) {
    lines.push("\nHABITS:");
    ctx.habits.forEach((h) =>
      lines.push(
        `  ${h.name}: streak=${h.streak}, last_done=${h.last_done ?? "never"}`
      )
    );
  }

  if (ctx.recentArchive.length) {
    lines.push("\nRECENT ARCHIVE (most recent first):");
    ctx.recentArchive.slice(0, 8).forEach((a) =>
      lines.push(`  [${a.id}] "${a.title}": ${a.content_snippet.slice(0, 100)}`)
    );
  }

  if (ctx.recentJournal.length) {
    lines.push("\nRECENT JOURNAL SNIPPETS:");
    ctx.recentJournal.forEach((j) => lines.push(`  "${j}"`));
  }

  return lines.join("\n");
}

function validateEnum<T extends string>(
  value: unknown,
  allowed: string[],
  fallback: T
): T {
  return allowed.includes(String(value)) ? (String(value) as T) : fallback;
}

/**
 * Determine whether the current UTC time falls within the user's quiet hours,
 * accounting for their configured timezone and overnight ranges (e.g. 22:00-08:00).
 */
function isInQuietHours(prefs: UserPrefs): boolean {
  const start = prefs.quiet_hours_start ?? "22:00";
  const end = prefs.quiet_hours_end ?? "08:00";
  const tz = prefs.timezone ?? "UTC";

  // Get local time string in user's timezone
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
    // Overnight: quiet from e.g. 22:00 to 08:00
    return nowMins >= startMins || nowMins < endMins;
  } else {
    return nowMins >= startMins && nowMins < endMins;
  }
}
