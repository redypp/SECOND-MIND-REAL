import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { question } = await req.json();
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Missing question" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch shared archive entries (keyword search + recent)
    const searchTerms = question
      .toLowerCase()
      .split(/\s+/)
      .filter((w: string) => w.length > 2)
      .slice(0, 8);

    // Get recent shared entries
    const { data: allEntries } = await supabase
      .from("shared_archive_prototype")
      .select("id, title, content, tags, created_at, visibility")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!allEntries || allEntries.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            summary: "No shared entries found yet. Share some notes to start building the collective archive.",
            sources: [],
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Simple relevance scoring
    const scored = allEntries.map((entry: any) => {
      const text = `${entry.title || ""} ${entry.content || ""} ${(entry.tags || []).join(" ")}`.toLowerCase();
      let score = 0;
      for (const term of searchTerms) {
        if (text.includes(term)) score += 1;
      }
      return { ...entry, score };
    });

    scored.sort((a: any, b: any) => b.score - a.score);
    const topResults = scored.slice(0, 10);

    // Build context for AI
    const notesContext = topResults
      .map(
        (e: any, i: number) =>
          `[${i + 1}] Title: ${e.title || "Untitled"}\nContent: ${(e.content || "").slice(0, 500)}\nTags: ${(e.tags || []).join(", ")}`
      )
      .join("\n\n");

    // Call AI
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 503,
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
        system: `You are a research assistant summarizing shared notes from a collective archive. Given a user's question and relevant shared notes, provide:
1. A concise summary of patterns and insights found across the notes (2-4 sentences)
2. Key themes or commonalities

Be factual. Only reference information present in the notes. Do not hallucinate. Keep the tone calm and informative. Do not use exclamation marks.`,
        messages: [
          {
            role: "user",
            content: `Question: ${question.slice(0, 500)}\n\nShared notes:\n${notesContext}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Anthropic API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const summary = aiData.content?.[0]?.text || "Unable to generate summary.";

    const sources = topResults
      .filter((e: any) => e.score > 0)
      .slice(0, 5)
      .map((e: any) => ({
        id: e.id,
        title: e.title || "Untitled",
        excerpt: (e.content || "").slice(0, 120),
        tags: e.tags || [],
      }));

    return new Response(
      JSON.stringify({ success: true, data: { summary, sources } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("shared-archive-ask error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
