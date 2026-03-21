import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// INPUT VALIDATION CONSTANTS
// ============================================================
const MAX_ITEMS = 50;
const MAX_SPACES = 100;
const MAX_CONTENT_LENGTH = 5000;
const MAX_BLOCK_CONTENT_LENGTH = 5000;
const ALLOWED_TYPES = ['daily_digest', 'generate_smart', 'plan_day', 'unstuck'] as const;

// Notification categories
type NotificationCategory = 'resurface' | 'connection' | 'decision' | 'task' | 'reminder';
type NotificationPriority = 'low' | 'medium' | 'high';
type RequestType = typeof ALLOWED_TYPES[number];

interface Notification {
  user_id: string;
  title: string;
  message: string;
  reason: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  suggested_action?: string;
  related_item_ids?: string[];
  scheduled_for: string;
}

interface SanitizedSpace {
  id: string;
  name: string;
  itemCount: number;
}

interface SanitizedItem {
  id: string;
  title?: string;
  subCategory: string;
  content?: string;
  blocks?: any[];
  spaceIds?: string[];
  scheduledDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface UserContext {
  spaces: SanitizedSpace[];
  items: SanitizedItem[];
  currentTime: string;
}

interface GenerateRequest {
  type: RequestType;
  context: UserContext;
}

// ============================================================
// INPUT VALIDATION AND SANITIZATION FUNCTIONS
// ============================================================

// Sanitize text input to prevent prompt injection
function sanitizeTextInput(input: string): string {
  // Normalize Unicode to prevent homoglyph attacks
  let sanitized = input.normalize("NFKC");
  
  // Remove potential system prompt injection attempts
  const injectionPatterns = [
    /\[SYSTEM\]/gi,
    /\[INST\]/gi,
    /\[\/INST\]/gi,
    /<\|system\|>/gi,
    /<\|user\|>/gi,
    /<\|assistant\|>/gi,
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
    /<<SYS>>/gi,
    /<\/SYS>/gi,
    /###\s*(System|User|Assistant|Human|AI):/gi,
    /\n(System|Human|Assistant|User):\s*/gi,
    /<system>/gi,
    /<\/system>/gi,
    /\bignore\s+(previous|above|all)\s+(instructions?|prompts?)\b/gi,
    /\bforget\s+(everything|all|your)\s+(above|previous)?\s*(instructions?|rules?)?\b/gi,
    /\byou\s+are\s+now\s+(a|an|in)\b/gi,
    /\bact\s+as\s+(a|an|if)\b/gi,
    /\bpretend\s+(to\s+be|you\s+are)\b/gi,
    /\bnew\s+instructions?:/gi,
    /\boverride\s+(system|instructions?|rules?)\b/gi,
  ];
  
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '[FILTERED]');
  }
  
  // Remove null bytes and other control characters (except newlines and tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  return sanitized;
}

function validateAndSanitizeRequest(rawInput: unknown): { valid: false; error: string } | { valid: true; data: GenerateRequest } {
  if (!rawInput || typeof rawInput !== 'object') {
    return { valid: false, error: "Invalid request body" };
  }

  const input = rawInput as Record<string, unknown>;

  // Validate type
  if (!input.type || typeof input.type !== 'string') {
    return { valid: false, error: "Missing or invalid 'type' field" };
  }
  
  if (!ALLOWED_TYPES.includes(input.type as RequestType)) {
    return { valid: false, error: `Invalid type. Allowed: ${ALLOWED_TYPES.join(', ')}` };
  }

  // Validate context
  if (!input.context || typeof input.context !== 'object') {
    return { valid: false, error: "Missing or invalid 'context' field" };
  }

  const context = input.context as Record<string, unknown>;

  // Validate context.spaces
  if (!Array.isArray(context.spaces)) {
    return { valid: false, error: "context.spaces must be an array" };
  }

  if (context.spaces.length > MAX_SPACES) {
    return { valid: false, error: `Too many spaces. Maximum ${MAX_SPACES} allowed` };
  }

  // Validate context.items
  if (!Array.isArray(context.items)) {
    return { valid: false, error: "context.items must be an array" };
  }

  if (context.items.length > MAX_ITEMS) {
    return { valid: false, error: `Too many items. Maximum ${MAX_ITEMS} allowed` };
  }

  // Validate currentTime
  if (typeof context.currentTime !== 'string') {
    return { valid: false, error: "context.currentTime must be a string" };
  }

  // Sanitize spaces (only keep expected fields, truncate values)
  const sanitizedSpaces: SanitizedSpace[] = context.spaces.slice(0, MAX_SPACES).map((s: any) => ({
    id: String(s.id || '').slice(0, 100),
    name: sanitizeTextInput(String(s.name || '').slice(0, 200)),
    itemCount: typeof s.itemCount === 'number' ? Math.min(s.itemCount, 10000) : 0
  }));

  // Sanitize items (truncate content, limit blocks, sanitize text)
  const sanitizedItems: SanitizedItem[] = context.items.slice(0, MAX_ITEMS).map((i: any) => ({
    id: String(i.id || '').slice(0, 100),
    title: i.title ? sanitizeTextInput(String(i.title).slice(0, 500)) : undefined,
    subCategory: String(i.subCategory || 'misc').slice(0, 50),
    content: i.content ? sanitizeTextInput(String(i.content).slice(0, MAX_CONTENT_LENGTH)) : undefined,
    blocks: Array.isArray(i.blocks) ? i.blocks.slice(0, 20).map((b: any) => ({
      ...b,
      content: b.content ? sanitizeTextInput(String(b.content).slice(0, MAX_BLOCK_CONTENT_LENGTH)) : undefined,
      items: Array.isArray(b.items) ? b.items.slice(0, 50) : undefined
    })) : [],
    spaceIds: Array.isArray(i.spaceIds) ? i.spaceIds.slice(0, 20).map((id: any) => String(id).slice(0, 100)) : [],
    scheduledDate: i.scheduledDate ? String(i.scheduledDate).slice(0, 20) : undefined,
    createdAt: i.createdAt ? String(i.createdAt).slice(0, 50) : undefined,
    updatedAt: i.updatedAt ? String(i.updatedAt).slice(0, 50) : undefined
  }));

  return {
    valid: true,
    data: {
      type: input.type as RequestType,
      context: {
        spaces: sanitizedSpaces,
        items: sanitizedItems,
        currentTime: String(context.currentTime).slice(0, 100)
      }
    }
  };
}

// Build searchable content from user's items
function buildSearchableContent(context: UserContext): string {
  const lines: string[] = [];
  
  context.items.forEach((item, index) => {
    const title = item.title || getItemPreview(item);
    const spaces = item.spaceIds 
      ? context.spaces.filter(s => item.spaceIds!.includes(s.id)).map(s => s.name) 
      : [];
    const date = item.scheduledDate || item.createdAt || "";
    const fullContent = getFullItemContent(item);
    
    lines.push(`[ITEM ${index + 1}]`);
    lines.push(`ID: ${item.id}`);
    lines.push(`Title: ${title}`);
    lines.push(`Type: ${item.subCategory}`);
    if (spaces.length) lines.push(`Spaces: ${spaces.join(", ")}`);
    if (date) lines.push(`Date: ${date}`);
    lines.push(`Content: ${fullContent}`);
    lines.push("");
  });
  
  return lines.join("\n");
}

function getItemPreview(item: SanitizedItem): string {
  if (item.content) return item.content.slice(0, 50);
  if (item.blocks && item.blocks.length > 0) {
    const firstBlock = item.blocks[0];
    if (firstBlock.content) return firstBlock.content.slice(0, 50);
  }
  return "Untitled";
}

function getFullItemContent(item: SanitizedItem): string {
  const parts: string[] = [];
  if (item.content) parts.push(item.content);
  if (item.blocks && item.blocks.length > 0) {
    item.blocks.forEach((block: any) => {
      if (block.content) parts.push(block.content);
    });
  }
  return parts.join(" | ") || "No content";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // INPUT VALIDATION
    // ============================================================
    const rawBody = await req.json();
    const validationResult = validateAndSanitizeRequest(rawBody);
    
    if (!validationResult.valid) {
      console.warn(`Input validation failed: ${validationResult.error}`);
      return new Response(
        JSON.stringify({ error: validationResult.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { type, context } = validationResult.data;

    // Check anti-spam: count today's notifications
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { count: todayCount } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", today.toISOString());

    // Get user preferences
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single();

    const maxDaily = prefs?.max_daily_notifications || 10;

    // Anti-spam check (skip for user-triggered actions)
    if (type !== 'plan_day' && type !== 'unstuck' && (todayCount || 0) >= maxDaily) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          notifications: [],
          message: "Daily notification limit reached" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build system prompt for notification generation
    const searchableContent = buildSearchableContent(context);
    
    const systemPrompt = `You are the notification intelligence for Second Mind.

CRITICAL RULES:
1. Before creating any notification, search the user's stored memories thoroughly.
2. Only notify when at least one is true:
   - Unfinished decision: user debated/asked a question without resolution
   - Forgotten value: saved idea hasn't been revisited in 7-21 days and is still relevant
   - Strong connection: two+ saved items relate meaningfully
   - Clear next step: actionable task that reduces friction today
3. NEVER generate generic motivational messages
4. Every notification MUST cite specific stored items
5. Prefer 1 high-quality notification over many mediocre ones

NOTIFICATION QUALITY REQUIREMENTS:
- Title: max 60 characters, specific and actionable
- Message: 1-3 short sentences
- Reason: concrete, grounded in user's stored data
- Suggested action: one clickable prompt or step

USER'S KNOWLEDGE BASE:
${searchableContent}

SPACES:
${context.spaces.map(s => `- "${s.name}" (${s.itemCount} items)`).join('\n')}

Current time: ${context.currentTime}`;

    let userPrompt = "";
    let toolName = "generate_notifications";

    if (type === "daily_digest") {
      userPrompt = `Generate a daily digest with exactly 3 notifications:
1. One "resurface" - a forgotten but valuable memory
2. One "connection" - link two relevant memories and explain why
3. One "task" - one task-sized step the user can do today

If you cannot find enough stored data for high-quality notifications, create one low-priority notification asking a clarifying question instead.`;
    } else if (type === "generate_smart") {
      userPrompt = `Analyze the user's knowledge base and generate 1-2 high-quality notifications that provide real value. Focus on:
- Ideas that haven't been revisited but are still relevant
- Connections between items the user may have missed
- Unfinished decisions or questions

If there's not enough data for quality notifications, ask one clarifying question instead.`;
    } else if (type === "plan_day") {
      userPrompt = `The user wants to plan their day. Generate 1-3 notifications that help them:
1. What's most important to focus on today
2. Any unfinished items that need attention
3. One connection that might spark new ideas

Be specific and reference their actual items.`;
    } else if (type === "unstuck") {
      userPrompt = `The user is feeling stuck. Generate 1-2 notifications to help:
1. Resurface a past idea or note that might provide fresh perspective
2. Suggest one small, actionable step based on their pending items

Be encouraging but specific - cite their actual content.`;
    }

    // Call AI to generate notifications
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        tools: [{
          name: "generate_notifications",
          description: "Generate smart notifications for the user",
          input_schema: {
            type: "object",
            properties: {
              notifications: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Short title, max 60 chars" },
                    message: { type: "string", description: "1-3 short sentences" },
                    reason: { type: "string", description: "Why this notification now, citing specific items" },
                    category: {
                      type: "string",
                      enum: ["resurface", "connection", "decision", "task", "reminder"]
                    },
                    priority: { type: "string", enum: ["low", "medium", "high"] },
                    suggested_action: { type: "string", description: "One actionable next step" },
                    related_item_ids: {
                      type: "array",
                      items: { type: "string" },
                      description: "IDs of items this notification references"
                    }
                  },
                  required: ["title", "message", "reason", "category", "priority"],
                  additionalProperties: false
                }
              }
            },
            required: ["notifications"],
            additionalProperties: false
          }
        }],
        tool_choice: { type: "tool", name: "generate_notifications" }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Anthropic API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate notifications" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await aiResponse.json();
    const toolUse = aiResult.content?.find((b: any) => b.type === "tool_use");

    if (!toolUse?.input) {
      return new Response(
        JSON.stringify({ error: "No notifications generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { notifications: generatedNotifications } = toolUse.input;

    // Limit to max allowed
    const remainingSlots = maxDaily - (todayCount || 0);
    const notificationsToInsert = generatedNotifications.slice(0, Math.max(remainingSlots, 1));

    // Insert notifications into database
    const now = new Date().toISOString();
    const notificationRecords: Notification[] = notificationsToInsert.map((n: any) => ({
      user_id: user.id,
      title: n.title.slice(0, 60),
      message: n.message,
      reason: n.reason,
      category: n.category,
      priority: n.priority,
      suggested_action: n.suggested_action,
      related_item_ids: n.related_item_ids || [],
      scheduled_for: now,
    }));

    const { data: insertedNotifications, error: insertError } = await supabase
      .from("notifications")
      .insert(notificationRecords)
      .select();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save notifications" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fire native push notifications for each inserted notification
    try {
      for (const n of insertedNotifications || []) {
        await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            user_id: user.id,
            title: n.title,
            body: n.message,
            data: { notification_id: n.id, category: n.category },
          }),
        });
      }
    } catch (pushError) {
      // Push is best-effort, don't fail the whole request
      console.warn("Push notification send failed:", pushError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        notifications: insertedNotifications,
        count: insertedNotifications?.length || 0
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Smart notifications error:", error);
    return new Response(
      JSON.stringify({ error: "Unable to process request" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
