import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getCorsHeaders(_req: Request): Record<string, string> {
  return corsHeaders;
}

// ============================================================
// INPUT VALIDATION CONSTANTS
// ============================================================
const MAX_INPUT_LENGTH = 10000; // 10KB max input
const MAX_ITEMS = 50; // Max items in context
const MAX_SPACES = 100; // Max spaces in context
const MAX_BLOCK_CONTENT_LENGTH = 5000; // Max length per block content
const ALLOWED_TYPES = [
  "process_input",
  "ask_question", 
  "get_suggestions",
  "generate_insight",
  "find_connections",
  "daily_digest",
  "decision_helper",
  "auto_organize",
  "smart_rewrite",
  "semantic_search",
  "organize_note",
  "organize_all",
  "organize_dump",
  "journal_prompts",
  "life_subheadings",
  "intelligent_capture",
  "organize_archive",
  "ask_action_suggestions"
] as const;

type RequestType = typeof ALLOWED_TYPES[number];

interface Space {
  id: string;
  name: string;
  itemCount: number;
}

interface Item {
  id: string;
  title?: string;
  subCategory: string;
  content?: string;
  blocks: any[];
  spaceIds: string[];
  keywords?: string[];
  aiSummary?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  createdAt?: string;
  updatedAt?: string;
  importedContent?: string; // Content imported from linked sources (Google Docs, websites, etc.)
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface UserProfile {
  name?: string;
  location?: string;
  birthday?: string;
}

interface Personality {
  name?: string;
  tone?: 'concise' | 'friendly' | 'professional' | 'encouraging';
  verbosity?: 'brief' | 'balanced' | 'detailed';
  focusAreas?: string[];
}

interface AssistantRequest {
  type: RequestType;
  input: string;
  context: {
    spaces: Space[];
    items: Item[];
    currentTime: string;
    conversationHistory?: ConversationMessage[];
    answer?: string; // For ask_action_suggestions: the AI's previous answer
    profile?: UserProfile;
    personality?: Personality;
  };
}

// ============================================================
// INPUT VALIDATION FUNCTIONS
// ============================================================
function validateAndSanitizeInput(rawInput: unknown): { valid: false; error: string } | { valid: true; data: AssistantRequest } {
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

  // Validate input string
  if (!input.input || typeof input.input !== 'string') {
    return { valid: false, error: "Missing or invalid 'input' field" };
  }

  if (input.input.length > MAX_INPUT_LENGTH) {
    return { valid: false, error: `Input too long. Maximum ${MAX_INPUT_LENGTH} characters allowed` };
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

  // Sanitize spaces (only keep expected fields)
  const sanitizedSpaces: Space[] = context.spaces.slice(0, MAX_SPACES).map((s: any) => ({
    id: String(s.id || '').slice(0, 100),
    name: String(s.name || '').slice(0, 200),
    itemCount: typeof s.itemCount === 'number' ? s.itemCount : 0
  }));

  // Sanitize items (truncate content, limit blocks)
  const sanitizedItems: Item[] = context.items.slice(0, MAX_ITEMS).map((i: any) => ({
    id: String(i.id || '').slice(0, 100),
    title: i.title ? String(i.title).slice(0, 500) : undefined,
    subCategory: String(i.subCategory || 'misc').slice(0, 50),
    content: i.content ? String(i.content).slice(0, MAX_BLOCK_CONTENT_LENGTH) : undefined,
    blocks: Array.isArray(i.blocks) ? i.blocks.slice(0, 20).map((b: any) => ({
      ...b,
      content: b.content ? String(b.content).slice(0, MAX_BLOCK_CONTENT_LENGTH) : undefined,
      items: Array.isArray(b.items) ? b.items.slice(0, 50) : undefined
    })) : [],
    spaceIds: Array.isArray(i.spaceIds) ? i.spaceIds.slice(0, 20).map((id: any) => String(id).slice(0, 100)) : [],
    keywords: Array.isArray(i.keywords) ? i.keywords.slice(0, 20).map((k: any) => String(k).slice(0, 100)) : [],
    aiSummary: i.aiSummary ? String(i.aiSummary).slice(0, 500) : undefined,
    scheduledDate: i.scheduledDate ? String(i.scheduledDate).slice(0, 20) : undefined,
    scheduledTime: i.scheduledTime ? String(i.scheduledTime).slice(0, 10) : undefined,
    createdAt: i.createdAt ? String(i.createdAt).slice(0, 50) : undefined,
    updatedAt: i.updatedAt ? String(i.updatedAt).slice(0, 50) : undefined
  }));

  // Pass through optional conversation history (sanitize each message content)
  let sanitizedHistory: ConversationMessage[] | undefined;
  if (Array.isArray(context.conversationHistory)) {
    sanitizedHistory = (context.conversationHistory as any[])
      .slice(-10) // max last 5 turns
      .filter((m: any) => m?.role && m?.content && typeof m.role === 'string' && typeof m.content === 'string')
      .map((m: any) => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: String(m.content).slice(0, 2000),
      }));
  }

  // Pass through optional answer field for ask_action_suggestions
  const answer = context.answer ? String(context.answer).slice(0, 5000) : undefined;

  // Pass through optional profile for personalisation
  let sanitizedProfile: UserProfile | undefined;
  if (context.profile && typeof context.profile === 'object') {
    const p = context.profile as any;
    sanitizedProfile = {
      ...(p.name ? { name: String(p.name).slice(0, 200) } : {}),
      ...(p.location ? { location: String(p.location).slice(0, 200) } : {}),
      ...(p.birthday ? { birthday: String(p.birthday).slice(0, 20) } : {}),
    };
  }

  return {
    valid: true,
    data: {
      type: input.type as RequestType,
      input: sanitizeUserInput(input.input as string),
      context: {
        spaces: sanitizedSpaces,
        items: sanitizedItems,
        currentTime: String(context.currentTime).slice(0, 100),
        ...(sanitizedHistory !== undefined ? { conversationHistory: sanitizedHistory } : {}),
        ...(answer !== undefined ? { answer } : {}),
        ...(sanitizedProfile !== undefined ? { profile: sanitizedProfile } : {}),
      }
    }
  };
}

// Sanitize user input to prevent prompt injection
function sanitizeUserInput(input: string): string {
  // Normalize Unicode to prevent homoglyph attacks (e.g., Cyrillic 'а' vs Latin 'a')
  let sanitized = input.normalize("NFKC");
  
  // Remove potential system prompt injection attempts - common patterns
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
    /\[INST\]/gi,
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
  
  // Decode common encoding attempts and re-filter
  try {
    // Check for base64-encoded injection attempts (only if it looks like base64)
    if (/^[A-Za-z0-9+/]+=*$/.test(sanitized.trim()) && sanitized.length > 20) {
      // Don't decode, just flag suspicious long base64 strings
      sanitized = '[FILTERED: Suspicious encoded content]';
    }
  } catch {
    // Ignore decoding errors
  }
  
  return sanitized.slice(0, MAX_INPUT_LENGTH);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ============================================================
    // JWT AUTHENTICATION - Validate user is authenticated
    // ============================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client and validate JWT token
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase environment variables");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Validate JWT and get authenticated user
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData?.user) {
      console.warn("JWT validation failed:", userError?.message || "No user returned");
      return new Response(
        JSON.stringify({ error: "Invalid or expired authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;

    console.log(`AI Assistant request from authenticated user: ${userId.substring(0, 8)}...`);

    console.log("AI Assistant request received");

    // ============================================================
    // INPUT VALIDATION
    // ============================================================
    const rawBody = await req.json();
    const validationResult = validateAndSanitizeInput(rawBody);
    
    if (!validationResult.valid) {
      console.warn(`Input validation failed: ${validationResult.error}`);
      return new Response(
        JSON.stringify({ error: validationResult.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { type, input, context } = validationResult.data;

    // ============================================================
    // SERVER-SIDE CONTEXT ENRICHMENT for ask_question
    // The client only sends up to 50 items. For questions, we fetch
    // ALL user items + spaces directly from the database so the AI
    // has the full archive to search through.
    // ============================================================
    if (type === "ask_question" || type === "find_connections" || type === "semantic_search") {
      try {
        // Fetch items, spaces, and profile in parallel
        const [itemsResult, spacesResult, profileResult] = await Promise.allSettled([
          supabase
            .from("items")
            .select("id, title, sub_category, content, blocks, space_ids, scheduled_date, scheduled_time, keywords, ai_summary, created_at, updated_at")
            .eq("user_id", userId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("spaces")
            .select("id, name, item_count")
            .eq("user_id", userId)
            .is("deleted_at", null),
          supabase
            .from("profiles")
            .select("full_name, location, birthday")
            .eq("user_id", userId)
            .maybeSingle(),
        ]);

        const { data: dbItems, error: itemsErr } = itemsResult.status === "fulfilled" ? itemsResult.value : { data: null, error: "Query failed" };
        const { data: dbSpaces, error: spacesErr } = spacesResult.status === "fulfilled" ? spacesResult.value : { data: null, error: "Query failed" };
        const { data: dbProfile } = profileResult.status === "fulfilled" ? profileResult.value : { data: null };

        if (!itemsErr && dbItems && dbItems.length > 0) {
          context.items = dbItems.map((row: any) => ({
            id: row.id,
            title: row.title || "",
            subCategory: row.sub_category,
            content: row.content || "",
            blocks: row.blocks || [],
            spaceIds: row.space_ids || [],
            keywords: row.keywords || [],
            aiSummary: row.ai_summary || undefined,
            scheduledDate: row.scheduled_date,
            scheduledTime: row.scheduled_time,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }));
          console.log(`Enriched context with ${dbItems.length} items from database (was ${context.items.length} from client)`);
        }

        if (!spacesErr && dbSpaces && dbSpaces.length > 0) {
          context.spaces = dbSpaces.map((row: any) => ({
            id: row.id,
            name: row.name,
            itemCount: row.item_count || 0,
          }));
        }

        // Merge server-fetched profile (overrides client-sent, more authoritative)
        if (dbProfile) {
          context.profile = {
            name: dbProfile.full_name || undefined,
            location: (dbProfile as any).location || undefined,
            birthday: dbProfile.birthday || undefined,
          };
        }

        // Fetch imported source content for items
        const itemIds = context.items.slice(0, 100).map((i: any) => i.id);
        if (itemIds.length > 0) {
          const { data: sources, error: srcErr } = await supabase
            .from("archive_sources")
            .select("item_id, imported_text")
            .eq("status", "ready")
            .in("item_id", itemIds);

          if (!srcErr && sources) {
            const sourceMap: Record<string, string> = {};
            for (const s of sources as any[]) {
              if (s.imported_text) {
                sourceMap[s.item_id] = (sourceMap[s.item_id] || "") + "\n" + s.imported_text.slice(0, 2000);
              }
            }
            for (const item of context.items) {
              if (sourceMap[item.id]) {
                (item as any).importedContent = sourceMap[item.id];
              }
            }
          }
        }
      } catch (enrichErr) {
        console.warn("Context enrichment failed, using client context:", enrichErr);
        // Fall through — use whatever the client sent
      }
    }

    // ============================================================
    // PROCESS REQUEST - Use Anthropic Claude
    // ============================================================
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    if (!ANTHROPIC_API_KEY) {
      console.error("No ANTHROPIC_API_KEY configured");
      return new Response(
        JSON.stringify({ error: "AI service temporarily unavailable. Please try again later." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let systemPrompt = "";
    let tools: any[] = [];
    let toolChoice: any = undefined;
    let noStream = false;

    // ── Per-task model routing ─────────────────────────────────────────────
    // Haiku: fast structured tasks that don't need deep reasoning
    // Sonnet: recall, search, planning, multi-step reasoning
    const HAIKU_TYPES = new Set<RequestType>([
      "life_subheadings", "smart_rewrite", "process_input", "get_suggestions",
      "ask_action_suggestions", "journal_prompts", "organize_note", "intelligent_capture",
    ]);
    const selectedModel = HAIKU_TYPES.has(type) ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";

    // ── Per-task max_tokens ────────────────────────────────────────────────
    const MAX_TOKENS: Partial<Record<RequestType, number>> = {
      life_subheadings: 200,
      smart_rewrite: 500,
      process_input: 600,
      get_suggestions: 400,
      ask_action_suggestions: 450,
      journal_prompts: 600,
      organize_note: 900,
      intelligent_capture: 900,
      ask_question: 2048,
      semantic_search: 1500,
      find_connections: 1500,
      daily_digest: 1500,
      decision_helper: 1500,
      generate_insight: 1000,
      organize_dump: 2000,
      organize_all: 2000,
      organize_archive: 2000,
      auto_organize: 2000,
    };
    const selectedMaxTokens = MAX_TOKENS[type] ?? 2048;

    // ── Per-task temperature ───────────────────────────────────────────────
    // 0 = deterministic/accurate for structured extraction
    // 0.3-0.6 = slight creativity for conversational/generative tasks
    const TEMPERATURE: Partial<Record<RequestType, number>> = {
      ask_question: 0.5,
      journal_prompts: 0.6,
      decision_helper: 0.5,
      daily_digest: 0.3,
      generate_insight: 0.3,
    };
    const selectedTemperature = TEMPERATURE[type] ?? 0;

    // ── Build context strings lazily — only for types that need them ────────
    // Avoid computing a large string index for tasks that ignore it
    const NEEDS_FULL_CONTEXT = new Set<RequestType>([
      "ask_question", "find_connections", "semantic_search", "organize_all",
      "organize_archive", "daily_digest", "decision_helper", "generate_insight",
      "get_suggestions", "journal_prompts", "organize_dump",
    ]);
    const contextSummary = NEEDS_FULL_CONTEXT.has(type) ? buildFullContextSummary(context) : "";
    const searchableContent = NEEDS_FULL_CONTEXT.has(type) ? buildSearchableContent(context) : "";

    // ============================================================
    // PERSONALITY PROMPT BUILDER
    // ============================================================
    const personality = context.personality ?? {};
    const assistantName = personality.name || 'Second Mind';

    function buildPersonalityPrompt(p: Personality): string {
      const lines: string[] = [];

      // Tone
      switch (p.tone) {
        case 'concise':
          lines.push('- Be direct and efficient. No filler words or unnecessary pleasantries.');
          lines.push('- Lead with the answer, then context only if needed.');
          break;
        case 'professional':
          lines.push('- Use clear, structured language. Be thorough and well-organized.');
          lines.push('- Present information in a business-ready format when relevant.');
          break;
        case 'encouraging':
          lines.push('- Be warm, supportive, and motivating. Celebrate progress.');
          lines.push('- Frame challenges positively and highlight what the user is doing well.');
          break;
        case 'friendly':
        default:
          lines.push('- Be warm and conversational, like a smart friend who knows them well.');
          lines.push('- Be clear, concise, and honest.');
          break;
      }

      // Verbosity
      switch (p.verbosity) {
        case 'brief':
          lines.push('- Keep responses short — 2-3 sentences when possible. Only elaborate if asked.');
          break;
        case 'detailed':
          lines.push('- Provide thorough, detailed responses with examples and context.');
          break;
        case 'balanced':
        default:
          lines.push('- Give enough detail to be helpful without being overwhelming.');
          break;
      }

      // Focus areas
      if (p.focusAreas && p.focusAreas.length > 0) {
        lines.push(`- When relevant, prioritize topics related to: ${p.focusAreas.join(', ')}.`);
      }

      lines.push('- If you are uncertain or lack data, say so directly.');
      lines.push('- Your success is measured by whether the user: Remembers more, Thinks more clearly, Makes better decisions faster');

      return lines.join('\n');
    }

    const personalityBlock = buildPersonalityPrompt(personality);

    // ============================================================
    // SECOND MIND SYSTEM PROMPT FOUNDATION
    // ============================================================
    const secondMindCore = `You are ${assistantName} — a long-term personal thinking and memory assistant.

Your core responsibility is to help the user store, retrieve, connect, and act on information over time. You are NOT a generic chatbot. You must prioritize memory accuracy, relevance, and practical value.

═══════════════════════════════════════════════════════════════
MEMORY RULES
═══════════════════════════════════════════════════════════════
When a user inputs anything, you must:
1. Classify it into a clear type: idea, task, note, person, link, decision, or question
2. Summarize it in ONE concise sentence
3. Extract relevant tags and domains (e.g., fashion, work, health, relationships)
4. Store it persistently so it can be retrieved later
5. Never lose or overwrite existing memory unless explicitly told to
6. If information is vague, ask ONE clarifying question before saving

═══════════════════════════════════════════════════════════════
RETRIEVAL RULES
═══════════════════════════════════════════════════════════════
Before answering any question, you must:
1. Search stored memory FIRST
2. Reference specific past entries when relevant
3. Explain WHY a memory is relevant to the current question
4. If nothing relevant exists, clearly say so
5. Do NOT hallucinate memory. Do NOT guess.

═══════════════════════════════════════════════════════════════
VALUE RULES
═══════════════════════════════════════════════════════════════
Your goal is not just to respond, but to add insight by:
- Surfacing forgotten ideas
- Connecting related thoughts across time
- Suggesting next actions or decisions
- Highlighting patterns in the user's thinking

When appropriate, proactively suggest:
- "This relates to something you saved before…"
- "You may want to revisit…"
- "A next step could be…"

═══════════════════════════════════════════════════════════════
DAILY VALUE PRIORITIES
═══════════════════════════════════════════════════════════════
When asked for summaries, reviews, or digests, prioritize:
- Most important or recurring ideas
- Unfinished tasks or decisions
- Connections the user may have missed

═══════════════════════════════════════════════════════════════
TONE & PERSONALITY
═══════════════════════════════════════════════════════════════
${personalityBlock}

Current time: ${context.currentTime}
${context.profile ? `
═══════════════════════════════════════════════════════════════
USER PROFILE
═══════════════════════════════════════════════════════════════
${context.profile.name ? `Name: ${context.profile.name}` : ''}
${context.profile.location ? `Location: ${context.profile.location}` : ''}
${context.profile.birthday ? `Birthday: ${context.profile.birthday}` : ''}
Address the user by their first name naturally when it fits. Factor in their location for local events, time zones, and relevant context.` : ''}

USER'S COMPLETE KNOWLEDGE BASE:
${searchableContent}

SPACES/CATEGORIES:
${context.spaces.map(s => `- "${s.name}" (${s.itemCount} items)`).join('\n')}`;

    // Lightweight version — just identity + time + profile + spaces, no full knowledge base.
    // Use this for tasks that operate on a single note or only need space routing.
    const secondMindCoreLite = `You are ${assistantName} — a personal thinking and memory assistant.
Current time: ${context.currentTime}${context.profile?.name ? `\nUser: ${context.profile.name}` : ''}

SPACES/CATEGORIES:
${context.spaces.map(s => `- "${s.name}" (${s.itemCount} items)`).join('\n')}`;

    if (type === "process_input") {
      systemPrompt = `${secondMindCoreLite}

When processing user input, you must:
1. Classify into type: idea, task, note, person, link, decision, or question
2. Summarize in ONE concise sentence
3. Extract any dates/times mentioned (today, tomorrow, next week, at 3pm, etc.)
4. Identify which existing spaces this might belong to based on keywords
5. Extract relevant tags and domains
6. If information is vague, set needsClarification to true with a clarifying question

Be smart about understanding natural language:
- "remind me to call mom tomorrow at 3pm" → task with schedule
- "meeting with John next Monday 10am" → task (scheduling)
- "I should work on my surfing technique" → idea, link to surfing space if exists
- "what was that hoodie idea?" → question (search their notes)
- "groceries: milk, eggs, bread" → task (checklist)
- "John is a designer at Nike" → person
- "should I take the job offer?" → decision`;

      tools = [
        {
          type: "function",
          function: {
            name: "process_input",
            description: "Process and categorize the user's input",
            parameters: {
              type: "object",
              properties: {
                isQuestion: {
                  type: "boolean",
                  description: "True if this is a question the assistant should answer (including recall questions like 'what was that idea about...')"
                },
                category: {
                  type: "string",
                  enum: ["todo", "scheduling", "notes", "misc"],
                  description: "The category of this input"
                },
                title: {
                  type: "string",
                  description: "A concise title for this item (for tasks/events)"
                },
                content: {
                  type: "string",
                  description: "The main content or cleaned up version of the input"
                },
                isChecklist: {
                  type: "boolean",
                  description: "True if this should be a checklist with multiple items"
                },
                checklistItems: {
                  type: "array",
                  items: { type: "string" },
                  description: "If isChecklist is true, the individual items"
                },
                scheduledDate: {
                  type: "string",
                  description: "ISO date string (YYYY-MM-DD) if a date was mentioned"
                },
                scheduledTime: {
                  type: "string",
                  description: "Time in HH:MM format if a time was mentioned"
                },
                suggestedSpaceIds: {
                  type: "array",
                  items: { type: "string" },
                  description: "IDs of existing spaces this might belong to"
                },
                suggestedSpaceName: {
                  type: "string",
                  description: "Name for a new space if none of the existing ones fit"
                },
                keywords: {
                  type: "array",
                  items: { type: "string" },
                  description: "Key topics/keywords extracted from the input"
                }
              },
              required: ["isQuestion", "category", "content"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "process_input" } };

    } else if (type === "ask_question") {
      // ============================================================
      // SECOND MIND CHAT (Recall & Search)
      // ============================================================

      // Build a quick user snapshot to prime personalization
      const totalItems = context.items.length;
      const todoItems = context.items.filter(i => i.subCategory === 'todo');
      const noteItems = context.items.filter(i => ['notes', 'misc', 'idea'].includes(i.subCategory));
      const todayStr = context.currentTime.slice(0, 10);
      const todayEvents = context.items.filter(i => i.subCategory === 'scheduling' && i.scheduledDate === todayStr);
      const recentItems = [...context.items]
        .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 5);

      const userSnapshot = [
        `Total saved items: ${totalItems} across ${context.spaces.length} collection${context.spaces.length !== 1 ? 's' : ''}`,
        todoItems.length > 0 ? `Open tasks: ${todoItems.length} (${todoItems.slice(0, 3).map(t => `"${t.title || 'untitled'}"`).join(', ')}${todoItems.length > 3 ? '…' : ''})` : 'No open tasks',
        todayEvents.length > 0 ? `Today's events: ${todayEvents.map(e => `"${e.title || 'untitled'}"${e.scheduledTime ? ` at ${e.scheduledTime}` : ''}`).join(', ')}` : 'No events today',
        noteItems.length > 0 ? `Notes/ideas saved: ${noteItems.length}` : '',
        recentItems.length > 0 ? `Recently saved: ${recentItems.slice(0, 3).map(i => `"${i.title || 'untitled'}"`).join(', ')}` : '',
      ].filter(Boolean).join('\n');

      systemPrompt = `${secondMindCore}

USER SNAPSHOT (use this to personalise responses):
${userSnapshot}

The user is asking a question. You have full access to everything they have ever saved. Search it carefully before responding.

RESPONSE TYPES — detect and adapt:

1. RECALL / SEARCH (e.g. "do I have notes on X", "what did I save about Y", "remind me about Z"):
   - Search the full knowledge base above
   - Reference specific items by their topic/title casually: "You have a note about X that mentions…"
   - If nothing relevant exists, say so clearly in one sentence — never make things up
   - Keep answers concise (2-4 sentences) unless listing multiple items

2. PLANNING / ADVICE (e.g. "help me plan", "what should I focus on", "how do I approach"):
   - Build the plan around their ACTUAL saved items, tasks, and goals
   - Reference real items from their knowledge base as building blocks
   - Use numbered steps + headers for structure
   - Be specific and actionable — no generic advice

3. DIRECT FACTUAL (e.g. "what tasks are due", "what's on my schedule", "how many notes"):
   - Give a direct answer using their real data (names, dates, counts)
   - No fluff — one clear response

4. PRIORITISATION / REFLECTION (e.g. "what should I do today", "what patterns do you notice", "what am I missing"):
   - Look at their tasks, notes, and recent saves holistically
   - Surface connections they might have missed
   - Highlight what seems most important based on recency and volume
   - Frame insights as observations: "Looking at what you've saved…"

5. CAPTURE / TELLING (e.g. "I have a meeting on Friday", "remind me to call John", "I need to buy groceries", "just so you know I'm going to…"):
   - The user is telling you something new, not asking a question
   - Acknowledge it briefly and confirm what you've noted: "Got it — I've noted that down as an event on Friday."
   - Be concise (1-2 sentences max) — the action chips below will handle the actual saving
   - Do NOT ask clarifying questions unless the event/task is completely ambiguous

STRICT RULES:
- NEVER include raw UUIDs, item IDs, or technical identifiers in responses
- Do NOT dump raw note content verbatim — always summarise or quote briefly
- Do NOT repeat the question back or start with "Great question!"
- Do NOT hallucinate items that don't exist in their knowledge base
- Write like a smart friend who knows them well — warm, direct, personal
- If you reference a specific item, mention it naturally: "You saved a note about X…" or "Your task 'Y' is still open"
- For multi-part answers, use markdown (numbered lists, **bold headers**) to structure clearly
- Keep informational answers SHORT (2-4 sentences) unless a list is genuinely needed
- If their knowledge base is sparse on a topic, acknowledge it and still give a useful general answer`;

    } else if (type === "get_suggestions") {
      systemPrompt = `${secondMindCore}

Generate 2-3 quick, actionable suggestions. Prioritize:
- Most important or recurring ideas
- Unfinished tasks or decisions
- Connections the user may have missed
- Pending tasks and what's scheduled today`;

      tools = [
        {
          type: "function",
          function: {
            name: "get_suggestions",
            description: "Provide helpful suggestions",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string" },
                      type: { type: "string", enum: ["task", "reminder", "idea"] }
                    },
                    required: ["text", "type"],
                    additionalProperties: false
                  }
                }
              },
              required: ["suggestions"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "get_suggestions" } };

    } else if (type === "generate_insight") {
      // ============================================================
      // AUTO SUMMARIES → INSIGHT CARDS
      // ============================================================
      systemPrompt = `${secondMindCore}

Generate an Insight Card for this content:
- Title: A clear, catchy title
- Summary: ONE concise sentence capturing the essence
- Key Points: 3–5 key points extracted from the content
- Why This Matters: One sentence explaining the significance
- Connections: Note any patterns or links to other ideas

CRITICAL RULES:
- Preserve the user's original tone and intent
- Never remove important nuance or creative phrasing
- Keep their voice, just organize it better`;

      tools = [
        {
          type: "function",
          function: {
            name: "generate_insight",
            description: "Generate an insight card from content",
            parameters: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Clear, catchy title for this insight"
                },
                keyPoints: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-5 key points extracted from the content"
                },
                whyThisMatters: {
                  type: "string",
                  description: "One sentence explaining the significance"
                },
                originalTone: {
                  type: "string",
                  description: "Brief note on the user's tone/intent preserved"
                }
              },
              required: ["title", "keyPoints", "whyThisMatters"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "generate_insight" } };

    } else if (type === "find_connections") {
      // ============================================================
      // CONNECTION ENGINE (Idea Linking)
      // ============================================================
      systemPrompt = `${secondMindCore}

Your goal: Connect related thoughts across time and highlight patterns in the user's thinking.

Find 2-5 related notes or ideas from their knowledge base. For each connection:
- WHAT: Which note/idea it connects to
- WHY: One sentence explaining the overlap

Always say: "This relates to something you saved before…" followed by the connection.

Look for:
- Thematic overlaps (same topic, similar concepts)
- Temporal connections (around the same time, related projects)
- Conceptual links (underlying principles, shared goals)
- Complementary ideas (one solves what the other questions)
- Patterns in thinking (recurring themes, evolving ideas)`;

      tools = [
        {
          type: "function",
          function: {
            name: "find_connections",
            description: "Find related notes and ideas",
            parameters: {
              type: "object",
              properties: {
                connections: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      relatedItemId: { type: "string", description: "ID of the related item" },
                      relatedItemTitle: { type: "string", description: "Title or preview of the related item" },
                      connectionReason: { type: "string", description: "One sentence explaining why they're connected" },
                      connectionType: { 
                        type: "string", 
                        enum: ["thematic", "temporal", "conceptual", "complementary"],
                        description: "Type of connection"
                      }
                    },
                    required: ["relatedItemTitle", "connectionReason", "connectionType"],
                    additionalProperties: false
                  }
                },
                summary: {
                  type: "string",
                  description: "Brief summary of the connection patterns found"
                }
              },
              required: ["connections"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "find_connections" } };

    } else if (type === "daily_digest") {
      // ============================================================
      // DAILY MIND DIGEST (Resurfacing Intelligence)
      // ============================================================
      systemPrompt = `${secondMindCore}

Generate a Daily Mind Digest. Your goal: Surface forgotten ideas and help the user remember more.

PRIORITIZE (in order):
1. Most important or recurring ideas
2. Unfinished tasks or decisions
3. Connections the user may have missed
4. High-intent notes (ambitious ideas, strong opinions)

PRESENT AS:
- "You may want to revisit…"
- "This connects to what you're working on now…"
- "From [time ago]: [brief quote or summary]"

TONE:
- Be clear, concise, and honest
- 3-5 items maximum
- Make it feel like a gentle nudge, not a task list`;

      tools = [
        {
          type: "function",
          function: {
            name: "daily_digest",
            description: "Generate a daily digest of relevant ideas to resurface",
            parameters: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      itemId: { type: "string", description: "ID of the item to resurface" },
                      itemTitle: { type: "string", description: "Title or preview of the item" },
                      reason: { type: "string", description: "Why this is being resurfaced now" },
                      prompt: { type: "string", description: "The gentle nudge text (e.g., 'You might want to revisit...')" },
                      priority: { type: "string", enum: ["high", "medium", "low"] }
                    },
                    required: ["itemTitle", "reason", "prompt"],
                    additionalProperties: false
                  }
                },
                greeting: {
                  type: "string",
                  description: "A brief, warm greeting for the day"
                }
              },
              required: ["items", "greeting"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "daily_digest" } };

    } else if (type === "decision_helper") {
      // ============================================================
      // DECISION HELPER (Thinking Partner)
      // ============================================================
      systemPrompt = `${secondMindCore}

The user is making a decision. Help them think through it WITHOUT telling them what to do.

Your goal: Help them think more clearly and make better decisions faster.

Your job:
1. Search their memory for relevant notes, ideas, constraints, and goals
2. Generate clear Pros and Cons
3. Surface hidden tradeoffs the user hasn't explicitly stated
4. Highlight patterns in their past thinking
5. End with a short reflection question (NOT a command)

CRITICAL: Never tell the user what to do — help them think better.

Say things like:
- "Based on your past notes, you value [X] more than [Y]. How much does that matter here?"
- "This relates to a decision you made before about [topic]…"
- "A next step could be…"`;

      tools = [
        {
          type: "function",
          function: {
            name: "decision_helper",
            description: "Help the user think through a decision",
            parameters: {
              type: "object",
              properties: {
                decision: {
                  type: "string",
                  description: "Summary of the decision being made"
                },
                relevantContext: {
                  type: "array",
                  items: { type: "string" },
                  description: "Relevant notes/ideas from their knowledge base"
                },
                pros: {
                  type: "array",
                  items: { type: "string" },
                  description: "Clear pros/advantages"
                },
                cons: {
                  type: "array",
                  items: { type: "string" },
                  description: "Clear cons/disadvantages"
                },
                hiddenTradeoffs: {
                  type: "array",
                  items: { type: "string" },
                  description: "Tradeoffs the user may not have considered"
                },
                reflectionQuestion: {
                  type: "string",
                  description: "A thoughtful question to help them decide (NOT a command)"
                }
              },
              required: ["decision", "pros", "cons", "reflectionQuestion"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "decision_helper" } };

    } else if (type === "auto_organize") {
      // ============================================================
      // AUTO-ORGANIZE ON CAPTURE (live suggestions while typing)
      // ============================================================
      systemPrompt = `${secondMindCore}

The user is typing a note. Based on the note content (which may be incomplete), suggest:
1. A concise title (max 8 words, no quotes, no punctuation at end)
2. Which existing spaces/collections it fits (by ID) — pick 1-2 max, only if confident
3. 2-4 relevant tags (lowercase, no #, single words or hyphenated)

Be smart and brief. If the note is ambiguous, suggest the most likely match.
Do NOT suggest a new space unless none of the existing ones remotely match.`;

      tools = [
        {
          type: "function",
          function: {
            name: "auto_organize",
            description: "Suggest organization for a note being typed",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Concise title, max 8 words" },
                suggestedSpaceIds: {
                  type: "array",
                  items: { type: "string" },
                  description: "IDs of 1-2 existing spaces that best fit this note"
                },
                suggestedSpaceName: {
                  type: "string",
                  description: "Name for a new space only if no existing space fits at all"
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "2-4 tags, lowercase, no #"
                }
              },
              required: ["title", "suggestedSpaceIds", "tags"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "auto_organize" } };

    } else if (type === "smart_rewrite") {
      // ============================================================
      // SMART REWRITE + COMPRESS
      // ============================================================
      const rewriteMode = input.split('|||')[0].trim();
      const noteContent = input.split('|||')[1]?.trim() || input;

      if (rewriteMode === "bullets") {
        systemPrompt = `Transform the note into a clean, scannable bullet list.
- Each bullet = one clear point or idea
- Keep the user's voice and intent
- Remove filler words and redundancy
- 3-8 bullets max
- Prefix each bullet with "• ", no extra dashes`;
      } else if (rewriteMode === "actions") {
        systemPrompt = `Transform the note into a clear list of actionable next steps.
- Each action starts with a strong verb (Do, Write, Call, Research, Buy, etc.)
- Extract implied tasks, not just what was written
- 3-6 action steps max
- Ordered by priority/urgency`;
      } else {
        systemPrompt = `Compress the note into a tight 1-3 sentence summary.
- Capture the core idea in plain language
- Cut everything redundant
- Keep the user's original intent and tone
- Never exceed 3 sentences`;
      }

      tools = [
        {
          type: "function",
          function: {
            name: "smart_rewrite",
            description: "Rewrite/compress a note",
            parameters: {
              type: "object",
              properties: {
                result: {
                  type: "string",
                  description: "The rewritten content. For bullets/actions, separate each item with a newline and prefix with '• '. For summary, plain text."
                },
                mode: {
                  type: "string",
                  enum: ["bullets", "actions", "summary"]
                }
              },
              required: ["result", "mode"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "smart_rewrite" } };

    } else if (type === "semantic_search") {
      // ============================================================
      // SEMANTIC SEARCH — Find anything by meaning
      // ============================================================
      systemPrompt = `${secondMindCore}

The user is searching for something using natural language. Your job:
1. Search the ENTIRE knowledge base provided
2. Find items that match the query by MEANING, not just keywords
3. Return the most relevant items ranked by relevance (1 = most relevant)
4. Also provide a direct answer if the search implies a recall question
5. Be thorough — check titles, content, tags, and even implied topics

Search examples:
- "that hoodie idea" → Find any note about hoodies, wishlist items, fashion ideas
- "travel plans" → Find anything about trips, flights, hotels, destinations
- "work stuff I need to do" → Find todos related to work, meetings, deadlines`;

      // For semantic search, use non-streaming mode (set on body later)
      noStream = true;
      tools = [
        {
          type: "function",
          function: {
            name: "semantic_search",
            description: "Find relevant items from the knowledge base",
            parameters: {
              type: "object",
              properties: {
                answer: {
                  type: "string",
                  description: "Direct answer to the search query in 1-2 sentences, or empty string if just listing results"
                },
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      itemId: { type: "string" },
                      itemTitle: { type: "string" },
                      relevanceScore: { type: "number", description: "0-1 relevance score" },
                      snippet: { type: "string", description: "The most relevant excerpt (max 100 chars)" },
                      matchReason: { type: "string", description: "One short phrase: why this matches" }
                    },
                    required: ["itemId", "itemTitle", "relevanceScore", "snippet", "matchReason"],
                    additionalProperties: false
                  }
                }
              },
              required: ["answer", "results"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "semantic_search" } };

    } else if (type === "organize_note") {
      // ============================================================
      // ORGANIZE NOTE — Strict structured JSON output
      // ============================================================
      systemPrompt = `${secondMindCore}

The user wants to organize a note. You must analyze it and return a STRICT structured response.

Your job:
1. Generate a clear, concise title (max 8 words, no punctuation at end)
2. Write a 1–2 sentence summary capturing the core idea
3. Suggest the best existing collection/space from the user's list — if none match well, suggest "New Collection: [Name]"
4. Generate 3–8 short lowercase tags (no # prefix, single words or hyphenated)
5. If the note contains action items or tasks, extract them as a bullet list (optional)

RULES:
- Only use the user's actual spaces for suggested_collection; don't invent spaces that already exist under a different name
- Tags must be short, lowercase, relevant keywords
- action_items only if tasks are clearly implied
- Be grounded — no hallucination, only what's in the note
- Return ONLY the structured tool call — no extra text`;

      tools = [
        {
          type: "function",
          function: {
            name: "organize_note",
            description: "Organize a user's note into structured metadata",
            parameters: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Clear, concise title, max 8 words, no punctuation at end"
                },
                summary: {
                  type: "string",
                  description: "1–2 sentence summary of the note's core idea"
                },
                suggested_collection: {
                  type: "string",
                  description: "Name of the best matching existing space/collection, or 'New Collection: [Name]' if none match"
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "3–8 short lowercase tags, no # prefix"
                },
                action_items: {
                  type: "array",
                  items: { type: "string" },
                  description: "Optional: extracted action items if the note contains tasks"
                }
              },
              required: ["title", "summary", "suggested_collection", "tags"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "organize_note" } };

    } else if (type === "organize_all") {
      // ============================================================
      // ORGANIZE ALL — Batch reorganize items across the app
      // ============================================================
      systemPrompt = `${secondMindCore}

The user wants to reorganize their existing notes/items. Analyze each item and suggest improvements.

For each item that needs changes, return a suggestion with:
- The item's ID (must match exactly from the provided context)
- A better title if the current one is missing, vague, or too long
- The best matching collection/space ID from the user's existing spaces (only if it should change or be assigned)
- 2-4 short lowercase keyword tags

STRICT RULES:
- Only suggest changes that are genuinely useful — skip items that are already well-organized
- Never invent space IDs — only use IDs from the provided spaces list
- If an item already has a good title and is in the right space, do NOT include it in suggestions
- Focus on items with no title, no space, or clearly wrong categorization
- Keep titles concise: max 8 words, no punctuation at end
- Tags: lowercase, no #, single words or short phrases
- Return max 20 suggestions (prioritize the most disorganized items)
- Return ONLY the structured tool call — no extra text`;

      tools = [
        {
          type: "function",
          function: {
            name: "organize_all",
            description: "Batch organization suggestions for existing items",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      itemId: { type: "string", description: "Exact ID of the item to update" },
                      currentTitle: { type: "string", description: "The item's current title or a short preview of its content" },
                      suggestedTitle: { type: "string", description: "Improved title, max 8 words. Omit if current title is fine." },
                      suggestedSpaceId: { type: "string", description: "ID of the best matching existing space. Omit if already correct." },
                      suggestedSpaceName: { type: "string", description: "Name of the space (for display)" },
                      tags: { type: "array", items: { type: "string" }, description: "2-4 lowercase tags" },
                      reason: { type: "string", description: "One short sentence explaining why this change helps" }
                    },
                    required: ["itemId", "currentTitle", "tags", "reason"],
                    additionalProperties: false
                  }
                },
                summary: { type: "string", description: "1-2 sentence summary of what was found and what will change" }
              },
              required: ["suggestions", "summary"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "organize_all" } };

    } else if (type === "organize_dump") {
      // ============================================================
      // ORGANIZE DUMP — Parse messy brain dump into structured items
      // ============================================================
      systemPrompt = `${secondMindCore}

The user is dumping messy, unstructured text — a brain dump of mixed thoughts, tasks, ideas, reminders, or random notes.

Your job:
1. Parse the raw input and identify each DISTINCT item (note, task, idea, reminder, habit, journal reflection, scheduled event, etc.)
2. Decide the best DESTINATION for each item:
   - "archive" → goes into a collection/space (for notes, ideas, references, links, knowledge, thoughts, misc items — THIS IS THE DEFAULT)
   - "todo" → goes into the Todos list (ONLY for explicitly actionable tasks like "buy milk", "call John", "finish report")
   - "habit" → goes into Habits (ONLY for recurring behaviors the user wants to track daily, like "meditate", "exercise")
   - "journal" → goes into the Journal (ONLY for clearly personal reflections, feelings, diary-like entries)
   - "daily_plan" → goes into the Daily Planner calendar (ONLY for events with SPECIFIC times mentioned, e.g. "surf from 2-5pm")
   - "reminder" → schedules a notification reminder (ONLY for explicit "remind me to..." or "don't forget to... at 3pm" requests)
3. For "archive" items, assign to the BEST matching existing collection/space from the user's list
4. If an archive item clearly doesn't fit ANY existing space, suggest a new space name with "New: [Name]"
5. If an archive item could fit multiple spaces and it's ambiguous, mark needs_clarification as true
6. Generate a clean title for each item (max 8 words)
7. OPTIMIZE the content text: fix grammar, improve clarity, remove filler words, tighten the language — but PRESERVE the original meaning and voice. Make it read cleanly and professionally.
8. Categorize each item's sub_category: "notes", "todo", "scheduling", or "misc"
9. For the tags array, the FIRST tag must be a CATEGORY TAG that determines how items are grouped under headers in the archive. Choose from: idea, plan, research, learning, reflection, thought, inspiration, recommendation, decision, people, work, career, health, fitness, finance, travel, recipe, food, quote. This is critical for smart organization — items with the same first tag will be grouped together under a meaningful header.

CRITICAL — ARCHIVE IS THE DEFAULT DESTINATION:
Most user input is knowledge, ideas, thoughts, or information that should be SAVED in the archive.
Only route to todo/habit/journal/daily_plan/reminder when the intent is EXPLICITLY clear.
If there is ANY ambiguity, default to "archive" — the user's collections are their primary knowledge base.

Examples of ARCHIVE items (not todos):
- "I should look into surfing techniques" → archive (it's an idea/interest, not a task)
- "The best coffee shops in LA are..." → archive (knowledge/reference)
- "I think I want to change careers" → archive (thought/reflection about a topic)
- "Python is better than JavaScript for data science" → archive (opinion/note)
- "Meeting went well, John mentioned the Q3 targets" → archive (meeting notes)
- "I have to decide if I am going to play or not" → archive (thought about a decision)

Examples of TODO items (explicitly actionable):
- "Buy groceries" → todo
- "Call the dentist" → todo  
- "Submit the report by Friday" → todo
- "Pick up dry cleaning" → todo

CRITICAL — SPLITTING SCHEDULED ACTIVITIES:
When a user mentions an activity with BOTH a time AND additional context/notes (e.g. "I will surf tomorrow from 2-5pm, and will focus on turning"):
- Create TWO items:
  1. A "daily_plan" item for the calendar event ("Surf" scheduled 14:00-17:00)
  2. An "archive" item for the contextual note ("Currently focusing on turning" → into the relevant space like Surfing)
- This ensures the schedule appears on the planner AND the knowledge is saved in the right collection

DESTINATION HINTS:
- "I will [activity] from [time] to [time]" / "Meeting at 3pm" / "Gym 6-7am" → daily_plan
- "Buy..." / "Call..." / "Pick up..." / "Submit..." / "Send..." → todo (clear action verbs)
- "Remind me to..." / "Remember to... at [time]" → reminder
- "Every day I want to..." / "Start tracking..." → habit
- "I feel..." / "Today was..." / "I'm grateful for..." → journal
- Everything else → archive (ideas, thoughts, knowledge, references, opinions, plans, notes)

DAILY PLAN RULES:
- Always extract scheduled_date (YYYY-MM-DD), scheduled_time (start time HH:MM in 24h), and scheduled_end_time (end time HH:MM in 24h)
- "tomorrow" = next day from current time
- "2-5pm" → scheduled_time: "14:00", scheduled_end_time: "17:00"
- "at 3pm" with no end time → default 1 hour duration
- The title should be the activity name only (e.g. "Surf", "Gym", "Meeting with John")

STRICT RULES:
- DEFAULT TO ARCHIVE — only use other destinations when the intent is unmistakable
- Match archive items to EXISTING spaces by name — use exact space names from the provided list
- Only suggest new spaces if nothing remotely fits
- Keep the user's original meaning — don't invent information
- For tasks, keep them actionable
- For habits, extract just the habit name (short, e.g. "Meditate", "Read 30 min")
- For journal entries, preserve the reflective/personal tone
- If a single dump mentions items for multiple different destinations, split them correctly
- Be thorough — don't miss any distinct item in the dump`;

      tools = [
        {
          type: "function",
          function: {
            name: "organize_dump",
            description: "Parse a messy brain dump into structured, organized items routed to the right destination",
            parameters: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Clean, concise title, max 8 words" },
                      content: { type: "string", description: "Optimized, polished content — fix grammar, improve clarity, tighten language while preserving original meaning" },
                      sub_category: { type: "string", enum: ["notes", "todo", "scheduling", "misc"], description: "Item category" },
                      destination: { type: "string", enum: ["archive", "todo", "habit", "journal", "daily_plan", "reminder"], description: "Where this item should be saved" },
                      target_space: { type: "string", description: "For archive items: exact name of best matching existing space, or 'New: [Name]'. For non-archive items, use empty string." },
                      needs_clarification: { type: "boolean", description: "True if this archive item could fit multiple spaces and it's unclear which" },
                      clarification_options: { 
                        type: "array", 
                        items: { type: "string" },
                        description: "If needs_clarification, list 2-3 space names it could belong to"
                      },
                      tags: { type: "array", items: { type: "string" }, description: "2-4 lowercase tags. The FIRST tag MUST be a category tag for smart grouping headers. Use one of: idea, plan, research, learning, reflection, thought, inspiration, recommendation, decision, people, work, career, health, fitness, finance, travel, recipe, food, quote. Pick the single most relevant category as the first tag, then add 1-3 topic-specific tags." },
                      scheduled_date: { type: "string", description: "ISO date YYYY-MM-DD if mentioned" },
                      scheduled_time: { type: "string", description: "Start time HH:MM in 24h format" },
                      scheduled_end_time: { type: "string", description: "End time HH:MM in 24h format (for daily_plan events)" }
                    },
                    required: ["title", "content", "sub_category", "destination", "target_space", "needs_clarification", "tags"],
                    additionalProperties: false
                  }
                },
                summary: { type: "string", description: "One sentence summary of what was parsed" }
              },
              required: ["items", "summary"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "organize_dump" } };
    } else if (type === "journal_prompts") {
      // Build a focused context: recent notes/ideas + journal entries only
      const recentItems = [...context.items]
        .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 15)
        .map(i => `- ${i.title || i.content?.slice(0, 60) || 'untitled'} [${i.subCategory}]`)
        .join('\n');

      systemPrompt = `${secondMindCoreLite}

RECENT NOTES & IDEAS:
${recentItems || 'None yet.'}

You are generating personalized journal prompts for the user based on their spaces, notes, and ideas.

RULES:
- Generate exactly 3 prompts
- Each prompt should feel personal and grounded in their actual life/interests
- Draw from their spaces, recent notes, unresolved decisions, recurring themes
- Vary the type: one reflective, one forward-looking, one creative/unexpected
- Keep each prompt to 1-2 sentences max
- Never use exclamation marks
- Tone: calm, thoughtful, like a wise friend nudging them to think deeper
- Do NOT mention AI, do NOT say "based on your data"
- Make it feel like the prompt naturally emerged from knowing them well`;

      tools = [
        {
          type: "function",
          function: {
            name: "journal_prompts",
            description: "Generate 3 personalized journal prompts",
            parameters: {
              type: "object",
              properties: {
                prompts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string", description: "The journal prompt text, 1-2 sentences" },
                      seed: { type: "string", description: "A 2-3 word label for the theme, e.g. 'creative vision', 'open question', 'self check-in'" }
                    },
                    required: ["text", "seed"],
                    additionalProperties: false
                  }
                }
              },
              required: ["prompts"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "journal_prompts" } };
    } else if (type === "life_subheadings") {
      // ── Pre-compute all signals from the rich context ──────────────────────
      // Use localDate/localTime from context (client's local timezone) to correctly
      // match scheduled dates/times that are stored in the user's local timezone.
      // Fall back to slicing currentTime only as a last resort (UTC, may be off by one day).
      const todayStr: string = (context as any).localDate ?? context.currentTime.slice(0, 10);
      const nowTime: string = (context as any).localTime ?? context.currentTime.slice(11, 16);

      // Daily Plan signals
      const todayEvents = context.items.filter(
        (i: any) => i.subCategory === 'scheduling' && i.scheduledDate === todayStr
      );
      const upcomingEvents = todayEvents
        .filter((e: any) => !e.scheduledTime || e.scheduledTime >= nowTime)
        .sort((a: any, b: any) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));
      const nextEvent = upcomingEvents[0] ?? null;
      const pastEvents = todayEvents.length - upcomingEvents.length;

      // To-Do signals — count todo, task, and reminder subcategories
      const pendingTodos = context.items.filter(
        (i: any) => i.subCategory === 'todo' || i.subCategory === 'task'
      );

      // Habits signals — from dedicated habits + today's entries
      const habits: Array<{ id: string; name: string }> = (context as any).habits || [];
      const habitsCompleted: number = (context as any).habitsCompletedToday ?? 0;
      const totalHabits = habits.length;
      const habitsLeft = Math.max(0, totalHabits - habitsCompleted);

      // Journal signals — from pre-computed counts
      const journalCount7Days: number = (context as any).journalCount7Days ?? 0;
      const lastJournalDate: string | null = (context as any).lastJournalDate ?? null;
      const daysSinceJournal = lastJournalDate
        ? Math.round((new Date(todayStr).getTime() - new Date(lastJournalDate).getTime()) / 86400000)
        : null;

      // Recent notes
      const recentNoteCount: number = (context as any).recentNoteCount ?? 0;

      // Rotation seed cycles 0-4 to vary phrasing across restarts
      const seed: number = (context as any).rotationSeed ?? 0;

      // ── Build plain-English signal strings for each section ────────────────
      const dailyPlanFact = nextEvent
        ? `Next event: "${nextEvent.title || 'untitled'}" at ${nextEvent.scheduledTime ?? 'unknown time'}. Total today: ${todayEvents.length} (${pastEvents} done, ${upcomingEvents.length} upcoming).`
        : todayEvents.length > 0
          ? `${todayEvents.length} event${todayEvents.length !== 1 ? 's' : ''} today, all past.`
          : 'No events scheduled today.';

      const todoFact = pendingTodos.length === 0
        ? 'No tasks on the list.'
        : `${pendingTodos.length} task${pendingTodos.length !== 1 ? 's' : ''} on the list.`;

      const habitsFact = totalHabits === 0
        ? 'No habits set up yet.'
        : habitsCompleted === totalHabits
          ? `All ${totalHabits} habit${totalHabits !== 1 ? 's' : ''} completed today.`
          : `${habitsCompleted} of ${totalHabits} habit${totalHabits !== 1 ? 's' : ''} logged today. ${habitsLeft} left.`;

      const journalFact = journalCount7Days === 0
        ? (lastJournalDate ? `Last journal entry was ${daysSinceJournal} day${daysSinceJournal !== 1 ? 's' : ''} ago.` : 'No journal entries yet.')
        : daysSinceJournal === 0
          ? `Wrote today. ${journalCount7Days} entr${journalCount7Days !== 1 ? 'ies' : 'y'} this week.`
          : `${journalCount7Days} entr${journalCount7Days !== 1 ? 'ies' : 'y'} this week. Last written ${daysSinceJournal} day${daysSinceJournal !== 1 ? 's' : ''} ago.`;

      systemPrompt = `You generate extremely short, factual subheadings for a personal dashboard. Each subheading is one concise line — no more than 7 words — that tells the user something real and useful about their data right now.

Rotation variant: ${seed} (use this to subtly vary your phrasing style. 0=count-first, 1=action-first, 2=time-first, 3=status-first, 4=minimal).

Rules:
- Use ONLY the facts provided below — never invent numbers, names, or dates
- Lowercase only, no punctuation at the end, no exclamation marks, no emojis
- If a section has no data, give a short helpful prompt like "nothing here yet" or "add your first task"
- Maximum 7 words per subheading
- Sound like a calm, minimal dashboard — not a chatbot or motivational poster

DATA FOR EACH SECTION:

Daily Plan — ${dailyPlanFact}
To-Do — ${todoFact}
Habits — ${habitsFact}
Journal — ${journalFact}${recentNoteCount > 0 ? `\nRecent notes — ${recentNoteCount} note${recentNoteCount !== 1 ? 's' : ''} added in the last 24h.` : ''}

Write one subheading per section using only the facts above.`;

      tools = [
        {
          type: "function",
          function: {
            name: "life_subheadings",
            description: "Generate short, factual subheadings for the 4 life sections",
            parameters: {
              type: "object",
              properties: {
                daily_plan: { type: "string", description: "Subheading for Daily Plan section, max 7 words, lowercase" },
                todo: { type: "string", description: "Subheading for To-Do section, max 7 words, lowercase" },
                habits: { type: "string", description: "Subheading for Habits section, max 7 words, lowercase" },
                journal: { type: "string", description: "Subheading for Journal section, max 7 words, lowercase" }
              },
              required: ["daily_plan", "todo", "habits", "journal"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "life_subheadings" } };

    } else if (type === "intelligent_capture") {
      // ============================================================
      // INTELLIGENT CAPTURE — "dump anything, it organizes itself"
      // ============================================================
      systemPrompt = `${secondMindCoreLite}

The user has dumped raw content — text, a thought, a photo description, a voice note transcript, or a mix. Your job is to transform this messy input into a clean, structured knowledge entry.

ANALYSIS STEPS:
1. Detect intent: is this a task, idea, plan, knowledge note, experiment, reference, journal entry, or archive item?
2. Generate a clear, descriptive title (max 10 words, natural language, no quotes)
3. Write a 1-sentence summary capturing the core idea
4. Classify into one of these categories: task, idea, plan, knowledge, experiment, reference, journal, recipe, project, creative, health, finance, travel, learning
5. Extract 3-6 relevant tags (lowercase, no #)
6. Detect any date references and convert to ISO format
6b. Extract any person names mentioned in the content (first names, full names, or nicknames). Include people being referenced, talked about, or addressed. Return as an array. If no people are mentioned, return an empty array.
7. Suggest the best existing space/collection from the user's list — or suggest "New: [Name]" if none fit
8. Determine the sub_category for storage:
   - "notes": general ideas, knowledge, references (default)
   - "todo": explicit action items without a specific date/time
   - "task": named tasks with clear deliverables
   - "scheduling": events or meetings with specific dates/times
   - "reminder": time-sensitive follow-ups and alerts
   - "habit": recurring routines or tracked behaviours
   - "journal": personal reflections, diary entries, mood logs
   - "idea": creative or exploratory concepts
   - "misc": links, media, and uncategorised items

EXAMPLES:
Input: "I have a recipe I want to make Tuesday"
→ title: "Recipe to make Tuesday", category: "recipe", sub_category: "notes", scheduled_date from "Tuesday"

Input: "experimenting with different nootropics for cognitive function"
→ title: "Nootropics experiment for cognition", category: "experiment", tags: ["nootropics", "cognitive", "health", "supplements"]

Input: "Idea for a clothing brand hoodie stripe pattern"  
→ title: "Hoodie stripe pattern concept", category: "creative", tags: ["fashion", "clothing", "brand", "design"]

Input: "Reminder to follow up with the Ocean Partners team"
→ title: "Follow up with Ocean Partners", category: "task", sub_category: "reminder"

Input: "Do 10 minutes of journaling every morning"
→ title: "Daily morning journaling habit", category: "habit", sub_category: "habit"

Input: "Today I felt overwhelmed but pushed through — proud of myself"
→ title: "Reflection on a tough but productive day", category: "journal", sub_category: "journal"

Input: "What if I started a subscription box for indie artists?"
→ title: "Subscription box idea for indie artists", category: "idea", sub_category: "idea"

Input: [image description: photo of a recipe card for chicken curry]
→ title: "Chicken Curry Recipe", category: "recipe", tags: ["recipe", "cooking", "dinner", "curry"]

RULES:
- ALWAYS generate a title, even for short inputs
- Default sub_category to "notes" unless clearly a task or scheduled event
- Be generous with tags — they help with future search
- If image content is described, treat it as knowledge/reference
- Preserve the user's original content as-is in the cleaned_content field
- Keep the summary factual and concise`;

      tools = [
        {
          type: "function",
          function: {
            name: "intelligent_capture",
            description: "Transform raw user input into a structured knowledge entry",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Clear descriptive title, max 10 words" },
                summary: { type: "string", description: "One-sentence summary of the core idea" },
                category: { 
                  type: "string", 
                  enum: ["task", "idea", "plan", "knowledge", "experiment", "reference", "journal", "recipe", "project", "creative", "health", "finance", "travel", "learning"],
                  description: "Content category" 
                },
                sub_category: {
                  type: "string",
                  enum: ["notes", "todo", "task", "scheduling", "reminder", "habit", "journal", "idea", "misc"],
                  description: "Storage sub-category routing the item to the right section"
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-6 relevant lowercase tags"
                },
                cleaned_content: {
                  type: "string",
                  description: "The original content cleaned up but preserving meaning"
                },
                scheduled_date: {
                  type: "string",
                  description: "ISO date YYYY-MM-DD if a date was mentioned. Use current time context to resolve relative dates."
                },
                scheduled_time: {
                  type: "string",
                  description: "Time HH:MM in 24h format if mentioned"
                },
                suggested_space: {
                  type: "string",
                  description: "Name of best matching existing space, or 'New: [Name]' if none fit"
                },
                suggested_space_id: {
                  type: "string",
                  description: "ID of the best matching existing space, empty string if suggesting new"
                },
                image_description: {
                  type: "string",
                  description: "If input includes image context, a brief description of the image content"
                },
                extracted_people: {
                  type: "array",
                  items: { type: "string" },
                  description: "Person names mentioned in the content (first names, full names, or nicknames). Empty array if none."
                }
              },
              required: ["title", "summary", "category", "sub_category", "tags", "cleaned_content", "suggested_space", "extracted_people"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "intelligent_capture" } };
    } else if (type === "organize_archive") {
      // ============================================================
      // ORGANIZE ARCHIVE — Group items within a single collection by theme
      // ============================================================
      const archiveName: string = typeof context.archiveName === "string" ? context.archiveName : "";
      const existingGroups: string[] = Array.isArray(context.existingGroups)
        ? context.existingGroups.filter((l: unknown) => typeof l === "string" && l.trim().length > 0)
        : [];
      const hasExistingGroups = existingGroups.length > 0;

      systemPrompt = `${secondMindCore}

The user wants to organize entries within a single archive collection. You will receive a list of items that all belong to the same collection${archiveName ? ` called "${archiveName}"` : ""}.

Your job:
1. Analyze all items and identify thematic groups based on semantic similarity and intent
2. Assign each item to exactly ONE group
3. Within each group, order items by recency (newest first) — use createdAt dates
4. Give each group a natural, human-friendly label (2-5 words, Title Case)
5. Order the groups themselves by relevance/importance (most active/recent group first)

THEME-FIRST, NOT MEDIA-TYPE:
- Group items by WHAT they are about, not by whether they are images, links, or text.
- An image of a pasta dish belongs in a food/cooking group, not a generic "Images" bucket.
- A link to a climbing-gear review belongs in a gear or fitness group, not "Links" or "References".
- Only fall back to media-based labels like "Photos" or "Saved Links" when items are genuinely unrelated in subject matter AND share no stronger theme.

LABEL STYLE GUIDE — use natural labels that feel like a smart memory space, not filing cabinet buckets:
✓ Good labels: "Future Plans", "Stuff to Remember", "Ideas", "Inspiration", "Things to Revisit", "References", "Quick Notes", "Project Ideas", "Places to Go", "Things I Learned", "Books to Read", "Goals", "Research"
✗ Avoid: "Notes", "General", "Misc", "Other", "Items", "Entries", raw dates like "March 2024", and media-type labels ("Images", "Links", "Photos", "Videos") unless no stronger theme exists

RULES:
- Every item must appear in exactly one group — no items should be lost
- Use the item IDs exactly as provided — do not modify them
- If items are all very similar, use fewer groups rather than forcing artificial distinctions
- Do NOT default to a single "Notes" or "General" bucket — find meaningful distinctions
- Do NOT merge, edit, or summarize any items — only group and reorder them
- Return ALL item IDs from the input${
  hasExistingGroups
    ? `

PRESERVE USER-CUSTOMISED HEADERS:
The user has already defined these headers in this archive: ${existingGroups.map((l) => `"${l}"`).join(", ")}.
- Reuse these labels VERBATIM (exact casing, exact wording) whenever an item plausibly fits.
- Keep them in the same relative order.
- Only introduce a brand-new header if at least 2 items clearly don't fit ANY existing header. Never rename or split an existing header.
- It is OK for an existing header to end up empty — still return it so the user doesn't lose their structure.`
    : ""
}`;

      tools = [
        {
          type: "function",
          function: {
            name: "organize_archive",
            description: "Group and order items within an archive collection by theme",
            parameters: {
              type: "object",
              properties: {
                groups: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string", description: "Natural, human-friendly label in Title Case (e.g. 'Future Plans', 'Stuff to Remember', 'Ideas', 'Inspiration', 'Things to Revisit'). Never use generic labels like 'Notes', 'General', or 'Misc'." },
                      item_ids: {
                        type: "array",
                        items: { type: "string" },
                        description: "IDs of items in this group, ordered by recency (newest first)"
                      }
                    },
                    required: ["label", "item_ids"],
                    additionalProperties: false
                  }
                },
                summary: { type: "string", description: "One sentence describing the organization" }
              },
              required: ["groups", "summary"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "organize_archive" } };
    } else if (type === "ask_action_suggestions") {
      // ============================================================
      // ASK ACTION SUGGESTIONS — Follow-up actions after an Ask response
      // ============================================================
      const previousAnswer = context.answer || "";
      const now = new Date(context.currentTime);
      const todayISO = now.toISOString().slice(0, 10);
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
      // Helper to get ISO date for a named day relative to today
      const daysUntil = (target: number) => ((target - dayOfWeek + 7) % 7) || 7;
      const nextMonday = new Date(now); nextMonday.setDate(now.getDate() + daysUntil(1));
      const nextTuesday = new Date(now); nextTuesday.setDate(now.getDate() + daysUntil(2));
      const nextWednesday = new Date(now); nextWednesday.setDate(now.getDate() + daysUntil(3));
      const nextThursday = new Date(now); nextThursday.setDate(now.getDate() + daysUntil(4));
      const nextFriday = new Date(now); nextFriday.setDate(now.getDate() + daysUntil(5));
      const nextSaturday = new Date(now); nextSaturday.setDate(now.getDate() + daysUntil(6));
      const nextSunday = new Date(now); nextSunday.setDate(now.getDate() + daysUntil(0));
      const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);

      systemPrompt = `You are analyzing a Q&A exchange from a personal knowledge assistant to suggest concrete follow-up actions.

TODAY IS: ${todayISO} (${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek]})

RELATIVE DATE REFERENCE (use these exact ISO dates in payload.date):
- "today" → ${todayISO}
- "tomorrow" → ${tomorrow.toISOString().slice(0,10)}
- "Monday" / "next Monday" → ${nextMonday.toISOString().slice(0,10)}
- "Tuesday" / "next Tuesday" → ${nextTuesday.toISOString().slice(0,10)}
- "Wednesday" / "next Wednesday" → ${nextWednesday.toISOString().slice(0,10)}
- "Thursday" / "next Thursday" → ${nextThursday.toISOString().slice(0,10)}
- "Friday" / "next Friday" → ${nextFriday.toISOString().slice(0,10)}
- "Saturday" / "next Saturday" → ${nextSaturday.toISOString().slice(0,10)}
- "Sunday" / "next Sunday" → ${nextSunday.toISOString().slice(0,10)}

The user said: "${input}"
The assistant responded: "${previousAnswer.slice(0, 1000)}"

USER'S SPACES:
${context.spaces.map(s => `- "${s.name}" (${s.itemCount} items)`).join('\n')}

Based on this exchange, suggest 0–3 concrete actions. Prioritise actions that directly reflect what the user told you (events they mentioned, tasks they need to do). Only suggest actions that add genuine value.

Available action types:
- "create_task": Something explicitly actionable the user should do (e.g., research, write, call, buy)
- "schedule_event": Something with a specific date/time — ALWAYS resolve relative dates to ISO format using the reference above and extract the event title from what the user said
- "add_to_archive": New knowledge or insight worth saving to their notes
- "view_related": Point to a specific existing item (only if you can reference an exact title from their archive)

CRITICAL for schedule_event:
- Set payload.title to the event name the user mentioned (e.g. "Team meeting", "Doctor appointment")
- Set payload.date to the resolved ISO date (e.g. "2026-03-28" not "Friday")
- Set payload.time to HH:MM if the user mentioned a time, otherwise leave empty

Be conservative: if the answer was purely factual, suggest nothing or at most one action.
Never fabricate item IDs or titles that don't exist in context.`;

      tools = [
        {
          type: "function",
          function: {
            name: "ask_action_suggestions",
            description: "Suggest follow-up actions after an Ask Q&A exchange",
            parameters: {
              type: "object",
              properties: {
                actions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["create_task", "schedule_event", "add_to_archive", "view_related"],
                        description: "The type of action to suggest"
                      },
                      label: {
                        type: "string",
                        description: "Short action label shown on the button, max 6 words"
                      },
                      description: {
                        type: "string",
                        description: "One-sentence description of what this action does"
                      },
                      payload: {
                        type: "object",
                        properties: {
                          title: { type: "string", description: "Pre-filled title for the new item" },
                          content: { type: "string", description: "Pre-filled content for the new item" },
                          date: { type: "string", description: "ISO date YYYY-MM-DD if relevant" },
                          time: { type: "string", description: "Time HH:MM if relevant" },
                          spaceName: { type: "string", description: "Suggested archive space/collection name" }
                        },
                        additionalProperties: false
                      }
                    },
                    required: ["type", "label", "payload"],
                    additionalProperties: false
                  }
                }
              },
              required: ["actions"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "ask_action_suggestions" } };
    }

    // Build messages array — include conversation history for ask_question (multi-turn)
    const conversationHistory = Array.isArray(context.conversationHistory) ? context.conversationHistory : [];
    const historyMessages = type === "ask_question"
      ? conversationHistory.slice(-6).map((m: ConversationMessage) => ({
          role: m.role,
          content: m.content,
        }))
      : [];

    // Build Anthropic request body
    const anthropicBody: any = {
      model: selectedModel,
      max_tokens: selectedMaxTokens,
      temperature: selectedTemperature,
      system: systemPrompt,
      messages: [
        ...historyMessages,
        { role: "user", content: input }
      ],
    };

    // Convert OpenAI-format tools to Anthropic format
    if (tools.length > 0) {
      anthropicBody.tools = tools.map((t: any) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
      if (toolChoice?.function?.name) {
        anthropicBody.tool_choice = { type: "tool", name: toolChoice.function.name };
      }
    }

    const anthropicHeaders = {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    };

    // For questions, stream the response (transform Anthropic SSE → OpenAI SSE for client)
    if (type === "ask_question" && !noStream) {
      console.log("Starting streaming response for ask_question");

      const streamController = new AbortController();
      const streamTimeout = setTimeout(() => {
        console.error("Streaming request timed out after 30s");
        streamController.abort();
      }, 30000);

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: anthropicHeaders,
        body: JSON.stringify({ ...anthropicBody, stream: true }),
        signal: streamController.signal,
      });

      clearTimeout(streamTimeout);

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const errorText = await response.text();
        console.error("Anthropic API error (streaming):", response.status, errorText);
        throw new Error("AI_GATEWAY_ERROR");
      }

      // Transform Anthropic SSE format → OpenAI SSE format (client expects choices[0].delta.content)
      const transformedStream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const decoder = new TextDecoder();
          const reader = response.body!.getReader();
          let buffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });

              let newlineIndex;
              while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex).trimEnd();
                buffer = buffer.slice(newlineIndex + 1);

                if (!line.startsWith('data: ')) continue;
                const jsonStr = line.slice(6).trim();

                try {
                  const event = JSON.parse(jsonStr);
                  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                    const chunk = JSON.stringify({ choices: [{ delta: { content: event.delta.text } }] });
                    controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                  } else if (event.type === 'message_stop') {
                    controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                  }
                } catch {
                  // skip malformed SSE lines
                }
              }
            }
          } finally {
            try { reader.releaseLock(); } catch { /* already released */ }
            controller.close();
          }
        },
      });

      return new Response(transformedStream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // For structured responses (tool calls) — with timeout
    const structuredController = new AbortController();
    const structuredTimeout = setTimeout(() => structuredController.abort(), 55000);

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: anthropicHeaders,
        body: JSON.stringify(anthropicBody),
        signal: structuredController.signal,
      });
    } catch (fetchError) {
      clearTimeout(structuredTimeout);
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
        console.error("Anthropic API call timed out after 55s");
        return new Response(
          JSON.stringify({ error: "Request timed out. Please try again." }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw fetchError;
    }

    clearTimeout(structuredTimeout);

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("Anthropic API error (structured):", response.status, errorText);
      throw new Error("AI_GATEWAY_ERROR");
    }

    const result = await response.json();

    // Extract tool use result (Anthropic format: content[].type === "tool_use")
    const toolUse = result.content?.find((b: any) => b.type === "tool_use");
    if (toolUse?.input) {
      return new Response(JSON.stringify({ success: true, data: toolUse.input }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback to text content
    const content = result.content?.find((b: any) => b.type === "text")?.text;
    return new Response(JSON.stringify({ success: true, data: { content } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    // Log detailed error for debugging (server-side only)
    console.error("AI assistant error:", error instanceof Error ? error.message : "Unknown error");
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack available");
    
    // Return generic error message to client (no implementation details)
    return new Response(
      JSON.stringify({ error: "Unable to process your request. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Build a comprehensive searchable content index
function buildSearchableContent(context: AssistantRequest["context"]): string {
  const lines: string[] = [];

  // Sort by createdAt descending so most recent items appear first
  const sorted = [...context.items].sort((a: any, b: any) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );

  sorted.forEach((item, index) => {
    const title = item.title || getItemPreview(item);
    const spaces = item.spaceIds ? context.spaces.filter(s => item.spaceIds!.includes(s.id)).map(s => s.name) : [];
    const fullContent = getFullItemContent(item);
    const isRecent = item.createdAt && (Date.now() - new Date(item.createdAt).getTime()) < 7 * 24 * 3600 * 1000;

    lines.push(`[ITEM ${index + 1}${isRecent ? ' 🆕' : ''}]`);
    lines.push(`Title: ${title}`);
    lines.push(`Type: ${item.subCategory}`);
    if (spaces.length) lines.push(`Collection: ${spaces.join(", ")}`);
    if (item.scheduledDate) lines.push(`Date: ${item.scheduledDate}${item.scheduledTime ? ` at ${item.scheduledTime}` : ''}`);
    if (item.createdAt) lines.push(`Saved: ${item.createdAt.slice(0, 10)}`);
    if (item.keywords?.length) lines.push(`Tags: ${item.keywords.join(", ")}`);
    if (item.aiSummary) lines.push(`Summary: ${item.aiSummary}`);
    // Include more content per item for richer retrieval
    const contentSnippet = fullContent.slice(0, 800);
    lines.push(`Content: ${contentSnippet}${fullContent.length > 800 ? '…' : ''}`);
    if ((item as any).importedContent) {
      lines.push(`Linked Source: ${(item as any).importedContent.slice(0, 2000)}`);
    }
    lines.push("");
  });

  return lines.join("\n");
}

// Get the full content of an item for search
function getFullItemContent(item: Item): string {
  const parts: string[] = [];
  
  if (item.content) parts.push(item.content);
  
  if (item.blocks?.length > 0) {
    item.blocks.forEach(block => {
      if (block.content) parts.push(block.content);
      if (block.items?.length > 0) {
        const items = block.items.map((i: any) => {
          if (typeof i === 'string') return i;
          return i.text || i.content || JSON.stringify(i);
        });
        parts.push(items.join(", "));
      }
      if (block.type === "image" && block.caption) {
        parts.push(`[Image: ${block.caption}]`);
      }
    });
  }
  
  return parts.join(" | ") || "No content";
}

function buildFullContextSummary(context: AssistantRequest["context"]): string {
  const lines: string[] = [];
  
  lines.push(`Current time: ${context.currentTime}`);
  lines.push("");
  
  // Spaces
  if (context.spaces.length > 0) {
    lines.push("User's spaces/categories:");
    context.spaces.forEach(s => {
      lines.push(`- "${s.name}" (id: ${s.id}, ${s.itemCount} items)`);
    });
    lines.push("");
  }
  
  // All items with full detail
  const scheduledItems = context.items.filter(i => i.scheduledDate || i.scheduledTime);
  const todoItems = context.items.filter(i => i.subCategory === "todo");
  const noteItems = context.items.filter(i => i.subCategory === "notes" || i.subCategory === "misc");
  
  if (scheduledItems.length > 0) {
    lines.push("Scheduled events:");
    scheduledItems.forEach(i => {
      const title = i.title || getItemPreview(i);
      lines.push(`- ${title} (${i.scheduledDate || ""} ${i.scheduledTime || ""}) [id: ${i.id}]`);
    });
    lines.push("");
  }
  
  if (todoItems.length > 0) {
    lines.push("Todo items:");
    todoItems.forEach(i => {
      const title = i.title || getItemPreview(i);
      lines.push(`- ${title} [id: ${i.id}]`);
    });
    lines.push("");
  }
  
  if (noteItems.length > 0) {
    lines.push("Notes and ideas:");
    noteItems.forEach(i => {
      const title = i.title || getItemPreview(i);
      const content = getFullItemContent(i);
      const spaces = i.spaceIds ? context.spaces.filter(s => i.spaceIds!.includes(s.id)).map(s => s.name) : [];
      lines.push(`- ${title}${spaces.length ? ` [${spaces.join(", ")}]` : ""} [id: ${i.id}]`);
      if (content !== title && content !== "No content") {
        lines.push(`  Content: ${content.slice(0, 200)}${content.length > 200 ? "..." : ""}`);
      }
    });
    lines.push("");
  }
  
  return lines.join("\n");
}

function getItemPreview(item: Item): string {
  if (item.content) return item.content.slice(0, 50);
  if (item.blocks?.length > 0) {
    const firstBlock = item.blocks[0];
    if (firstBlock.content) return firstBlock.content.slice(0, 50);
    if (firstBlock.items?.length > 0) {
      return firstBlock.items.map((i: any) => i.text || i).slice(0, 3).join(", ");
    }
  }
  return "Untitled";
}
