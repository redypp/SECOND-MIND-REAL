import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
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

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Parse body ──────────────────────────────────────────────────────────
    const body = await req.json() as {
      type: "image" | "link";
      imageUrl?: string;
      linkUrl?: string;
      linkTitle?: string;
      spaceName?: string;
    };

    if (!body.type || !["image", "link"].includes(body.type)) {
      return new Response(JSON.stringify({ error: "Invalid type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const spaceName = (body.spaceName || "").slice(0, 100);

    // ── Build Claude messages ────────────────────────────────────────────────
    let messages: any[];

    if (body.type === "image") {
      if (!body.imageUrl) {
        return new Response(JSON.stringify({ error: "imageUrl required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch the image and convert to base64
      let imageBase64: string;
      let mediaType: string;
      try {
        const imgRes = await fetch(body.imageUrl, { signal: AbortSignal.timeout(10000) });
        if (!imgRes.ok) throw new Error(`Fetch failed: ${imgRes.status}`);
        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        mediaType = contentType.split(";")[0].trim();
        if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType)) {
          mediaType = "image/jpeg";
        }
        const arrayBuf = await imgRes.arrayBuffer();
        // Limit to 4MB to stay within Claude's limits
        if (arrayBuf.byteLength > 4 * 1024 * 1024) {
          throw new Error("Image too large");
        }
        const bytes = new Uint8Array(arrayBuf);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        imageBase64 = btoa(binary);
      } catch (e) {
        console.warn("[classify-media] Image fetch failed:", e);
        return new Response(
          JSON.stringify({ success: false, error: "Could not fetch image" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const archiveContext = spaceName
        ? `The user is saving this into an archive called "${spaceName}".`
        : "The user is saving this into a personal archive.";

      messages = [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            {
              type: "text",
              text: `${archiveContext}

Look at this image and determine what it is about. Then suggest the best short category label for organizing it inside that archive (e.g. "Chord Progressions", "Recipe Ideas", "Workout Plans", "Travel Inspiration", "Design References").

Respond with ONLY valid JSON — no markdown, no code block:
{"category":"<2-5 word label>","tags":["<keyword1>","<keyword2>","<keyword3>"]}

Rules:
- category must be specific and descriptive (NOT generic like "Image" or "Photo")
- tags should be 3-5 relevant keywords
- Be concise and precise`,
            },
          ],
        },
      ];
    } else {
      // Link classification
      if (!body.linkUrl) {
        return new Response(JSON.stringify({ error: "linkUrl required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const url = body.linkUrl.slice(0, 500);
      const title = (body.linkTitle || "").slice(0, 200);
      const archiveContext = spaceName
        ? `The user is saving this link into an archive called "${spaceName}".`
        : "The user is saving this into a personal archive.";

      let hostname = "";
      try {
        hostname = new URL(url).hostname.replace(/^www\./, "");
      } catch { /* ignore */ }

      messages = [
        {
          role: "user",
          content: `${archiveContext}

Classify this link and suggest the best short category label for organizing it.

URL: ${url}${hostname ? `\nDomain: ${hostname}` : ""}${title ? `\nTitle: ${title}` : ""}

Respond with ONLY valid JSON — no markdown, no code block:
{"category":"<2-5 word label>","tags":["<keyword1>","<keyword2>","<keyword3>"]}

Rules:
- category must be specific and descriptive (NOT generic like "Link" or "Reference" or "Website")
- Infer content type from domain and title (e.g. YouTube → "Video Resources", GitHub → "Code & Tools", recipe site → "Recipes", news → "Articles & News")
- tags should be 3-5 relevant keywords`,
        },
      ];
    }

    // ── Call Claude ──────────────────────────────────────────────────────────
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    let claudeRes: Response;
    try {
      claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 256,
          messages,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("[classify-media] Claude error:", claudeRes.status, errText);
      return new Response(
        JSON.stringify({ success: false, error: "AI classification failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData?.content?.[0]?.text ?? "";

    // Parse JSON from Claude's response
    let category = "";
    let tags: string[] = [];
    try {
      // Strip potential markdown fences
      const jsonStr = rawText.replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      category = (parsed.category || "").trim().slice(0, 80);
      tags = Array.isArray(parsed.tags)
        ? parsed.tags.slice(0, 5).map((t: any) => String(t).trim().slice(0, 50)).filter(Boolean)
        : [];
    } catch (e) {
      console.warn("[classify-media] Failed to parse Claude response:", rawText);
      return new Response(
        JSON.stringify({ success: false, error: "Could not parse AI response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!category) {
      return new Response(
        JSON.stringify({ success: false, error: "No category returned" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, category, tags }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[classify-media] Unhandled error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
