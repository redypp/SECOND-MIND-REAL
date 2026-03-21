import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const today = new Date().toISOString().split("T")[0];

    // Fetch all relevant data in parallel
    const [
      { data: profile },
      { data: todosRaw },
      { data: eventsRaw },
      { data: habitsRaw },
      { data: habitEntriesRaw },
      { data: journalRaw },
      { data: recentItems },
    ] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("user_id", userId).single(),
      supabase.from("items").select("id, title, content, sub_category, scheduled_date").eq("user_id", userId).eq("sub_category", "todo").is("deleted_at", null).limit(30),
      supabase.from("items").select("id, title, content, scheduled_date, scheduled_time").eq("user_id", userId).eq("sub_category", "scheduling").eq("scheduled_date", today).is("deleted_at", null).order("scheduled_time", { ascending: true }).limit(20),
      supabase.from("habits").select("id, name").eq("user_id", userId).limit(10),
      supabase.from("habit_entries").select("habit_id, status").eq("user_id", userId).eq("date", today),
      supabase.from("journal_entries").select("content, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(3),
      supabase.from("items").select("id, title, content, sub_category, ai_summary, ai_tags").eq("user_id", userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(15),
    ]);

    const todos = todosRaw || [];
    const events = eventsRaw || [];
    const habits = habitsRaw || [];
    const habitEntries = habitEntriesRaw || [];
    const journal = journalRaw || [];
    const recent = recentItems || [];
    const firstName = profile?.full_name?.split(" ")[0] || "";

    // Build context for AI
    const todayEvents = events.map(e => `- ${e.scheduled_time || "?"} ${e.title || e.content || "Untitled"}`).join("\n");
    const todoList = todos.slice(0, 15).map(t => `- ${t.title || t.content || "Untitled"}`).join("\n");
    const habitStatus = habits.map(h => {
      const entry = habitEntries.find((he: any) => he.habit_id === h.id);
      return `- ${h.name}: ${entry ? entry.status : "not done"}`;
    }).join("\n");
    const recentJournal = journal.map(j => j.content?.slice(0, 200)).filter(Boolean).join("\n---\n");
    const recentNotes = recent.slice(0, 10).map(r => `- ${r.title || r.ai_summary || r.content?.slice(0, 80) || "Untitled"}`).join("\n");

    const prompt = `You are a calm, thoughtful daily briefing assistant for a personal organization app called "Second Mind". Generate a morning briefing for the user.

USER: ${firstName || "User"}
DATE: ${today}

TODAY'S SCHEDULE:
${todayEvents || "No events scheduled."}

PENDING TASKS:
${todoList || "No tasks."}

HABITS STATUS:
${habitStatus || "No habits tracked."}

RECENT JOURNAL:
${recentJournal || "No recent entries."}

RECENT NOTES:
${recentNotes || "No recent notes."}

Generate a daily briefing with EXACTLY this JSON structure. Be concise, warm, and actionable. Each focus item should be 1 short sentence max. The greeting should be personal and reference the day. The insight should connect something from their data in a thoughtful way.

Return a JSON object with these fields:
- greeting: A warm, short greeting (no exclamation marks)
- focusItems: Array of 3-5 objects with { icon: string (one of: "calendar", "check", "flame", "pen", "lightbulb", "star"), label: string (max 8 words) }
- insight: One thoughtful sentence connecting patterns from their data
- encouragement: One calm, grounding sentence to start the day`;

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: "You are a briefing generator. Return ONLY valid JSON, no markdown fences, no extra text.",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("Anthropic API error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.content?.[0]?.text || "";

    // Parse JSON from response (strip markdown fences if present)
    let briefing;
    try {
      const cleaned = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      briefing = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", rawContent);
      // Fallback briefing
      briefing = {
        greeting: `Good morning${firstName ? `, ${firstName}` : ""}`,
        focusItems: [
          { icon: "calendar", label: `${events.length} event${events.length !== 1 ? "s" : ""} today` },
          { icon: "check", label: `${todos.length} task${todos.length !== 1 ? "s" : ""} pending` },
          { icon: "flame", label: "Check in on your habits" },
        ],
        insight: "Take things one step at a time today.",
        encouragement: "You have everything you need to have a good day.",
      };
    }

    return new Response(JSON.stringify(briefing), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("daily-briefing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
