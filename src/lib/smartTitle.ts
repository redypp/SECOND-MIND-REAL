import { Item } from '@/types';

// ─── Content extraction ───────────────────────────────────────────────────────

function extractItemText(item: Item): string {
  const parts: string[] = [];
  if (item.title) parts.push(item.title);
  for (const block of item.blocks ?? []) {
    if (block.type === 'text') parts.push(block.content);
    else if (block.type === 'list') parts.push(...block.items);
    else if (block.type === 'checklist') parts.push(...block.items.map(i => i.text));
  }
  if (item.content) parts.push(item.content);
  return parts.join(' ');
}

// ─── Keyword pattern sets for smart categories ────────────────────────────────

const FUTURE_PLANS_RE = /\b(want to|plan to|going to|planning|will (do|try|make|build|start|create|get|visit|learn)|future|someday|one day|goal|aim|aspire|dream|aspiration|bucket list|wish list|life goal|long.?term|eventually|vision|roadmap|next (year|month|summer|time)|by (january|february|march|april|may|june|july|august|september|october|november|december))\b/i;

const IDEAS_RE = /\b(idea|concept|what if|imagine|brainstorm|could (be|work|try)|might work|potential|proposal|hypothesis|experiment|explore|prototype|rough idea|draft|shower thought|random thought|thought of|came up with)\b/i;

const INSPIRATION_RE = /\b(inspir(ed|ing|ation)?|amazing|beautiful|love this|gorgeous|stunning|incredible|wow|breathtaking|masterpiece|genius|quote|mantra|philosophy|perspective|mindset|lesson|wisdom|motivation|role model|admire|favorite|favourite|saved this|treasur|cherish)\b/i;

const REVISIT_RE = /\b(revisit|come back|check back|follow.?up|to review|in progress|half done|not sure yet|think about|reconsider|pending|unfinished|wip|work in progress|bookmark|saved for later|read later|watch later|to.?do later|figure out|still (deciding|unsure|thinking)|might|maybe|possibly|consider)\b/i;

const REMEMBER_RE = /\b(remember|don't forget|keep in mind|note to self|important|must know|always|never forget|key (fact|point|insight|takeaway|lesson)|pro tip|tip|trick|hack|how to|cheat sheet|quick (note|reminder)|fyi|heads up|just (noted|learned|realized|found out)|learned that|discovered)\b/i;

// ─── Extended content patterns for keyword-less categorization ───────────────
const RESEARCH_RE = /\b(research|study|article|paper|thesis|analysis|findings|evidence|data shows|according to|journal|literature|report|survey|statistics|hypothesis|methodology|peer.?review|publication|citation|source|reference|learn(ed|ing)|course|class|lecture|tutorial|lesson|textbook|exam|test|quiz|training|workshop|seminar|degree|certificate)\b/i;

const HEALTH_RE = /\b(health|workout|exercise|gym|yoga|meditat(e|ion)|fitness|diet|nutrition|calories|protein|vitamin|supplement|weight|cardio|stretch|muscle|run(ning)?|jog|walk|step|sleep|rest|recovery|mental health|therap(y|ist)|doctor|appointment|prescription|medicine|symptom|diagnosis|blood pressure|cholesterol|heart rate|bmi|hydrat(e|ion)|water intake)\b/i;

const FINANCE_RE = /\b(budget|expense|income|salary|tax|invest(ment|ing)?|stock|crypto|bitcoin|savings|debt|loan|mortgage|credit|payment|billing|subscription|cost|price|afford|financial|money|bank|account|portfolio|dividend|roi|interest rate|net worth|retirement|401k|ira)\b/i;

const WORK_RE = /\b(meeting|project|deadline|client|presentation|report|sprint|standup|retro|review|feedback|performance|promotion|resign|interview|resume|cv|onboard|deliverable|milestone|kpi|okr|stakeholder|manager|team lead|scope|requirement|specification|deploy|launch|release|ship|prod(uction)?|staging|code review|pull request|pr|ticket|jira|sprint)\b/i;

const TRAVEL_RE = /\b(travel|trip|flight|hotel|airbnb|booking|itinerary|passport|visa|airport|airline|destination|vacation|holiday|road trip|backpack|luggage|suitcase|resort|beach|mountain|hiking|camping|tour|explore|sightsee|landmark|museum|attraction|cruise)\b/i;

const FOOD_RE = /\b(recipe|cook(ing|ed)?|bake|ingredient|tablespoon|teaspoon|cup|oven|preheat|simmer|saut[eé]|chop|dice|mince|marinate|season|spice|broth|sauce|dressing|meal prep|breakfast|lunch|dinner|snack|dessert|appetizer|entree|restaurant|cafe|bistro|menu|reservation|food|dish|cuisine)\b/i;

const REFLECTION_RE = /\b(reflect(ion|ing)?|journal|gratitude|grateful|thankful|thought(s)?|feeling(s)?|emotion|mood|process(ing)?|self.?care|mindful|aware(ness)?|introspect|insight|realization|growth|personal|experience|perspective|looking back|i (feel|think|believe|wonder|realized|noticed|learned)|today i|this week|lately|recently)\b/i;

const DECISION_RE = /\b(decid(e|ing)|decision|pros? (and|&|vs) cons?|compar(e|ison|ing)|option|alternative|trade.?off|choice|choose|pick|select|weigh(ing)?|evaluat(e|ing)|assess|should i|which (one|is)|between|versus|vs\.?)\b/i;

const PEOPLE_RE = /\b(birthday|anniversary|call|text|catch up|meet(ing)? with|coffee with|lunch with|dinner with|hang out|get together|reunion|party|wedding|baby shower|gift for|present for|invite|rsvp|contact|phone number|email|address|colleague|friend|family|relative|neighbor|classmate)\b/i;

/**
 * Derive a short, descriptive smart title for an archive item.
 * Priority: stored title → first text line → link domain → type label
 */
export function getSmartTitle(item: Item): string {
  if (item.title?.trim()) return item.title.trim();

  // First meaningful line of text content
  const textBlock = item.blocks?.find(b => b.type === 'text');
  const rawText = textBlock?.type === 'text' ? textBlock.content : item.content;
  if (rawText?.trim()) {
    const firstLine = rawText.trim().split('\n')[0].trim();
    if (firstLine) {
      // Strip leading markdown characters (headings, bold, italic, code)
      const clean = firstLine.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim();
      return clean.length > 52 ? clean.slice(0, 49) + '…' : clean;
    }
  }

  // Link block: use hostname
  const mediaBlock = item.blocks?.find(b => b.type === 'media');
  if (mediaBlock?.type === 'media' && mediaBlock.mediaType === 'link') {
    try {
      return new URL(mediaBlock.url).hostname.replace(/^www\./, '');
    } catch {
      return 'Link';
    }
  }

  // Legacy link
  if (item.type === 'link' && item.url) {
    try {
      return new URL(item.url).hostname.replace(/^www\./, '');
    } catch {
      return 'Link';
    }
  }

  // Image / video: caption or type label
  if (mediaBlock?.type === 'media') {
    if (mediaBlock.caption?.trim()) return mediaBlock.caption.trim();
    return mediaBlock.mediaType === 'video' ? 'Video' : 'Image';
  }

  // Checklist: first item text
  const checklistBlock = item.blocks?.find(b => b.type === 'checklist');
  if (checklistBlock?.type === 'checklist' && checklistBlock.items.length > 0) {
    return checklistBlock.items[0].text;
  }

  // List: first item
  const listBlock = item.blocks?.find(b => b.type === 'list');
  if (listBlock?.type === 'list' && listBlock.items.length > 0) {
    return listBlock.items[0];
  }

  // Fallback by subCategory
  const fallbacks: Record<string, string> = {
    idea: 'Idea',
    journal: 'Journal',
    todo: 'Task',
    task: 'Task',
    reminder: 'Reminder',
    scheduling: 'Event',
    notes: 'Note',
    misc: 'Note',
  };
  return fallbacks[item.subCategory] ?? 'Note';
}

// ─── Tag-to-category mapping ─────────────────────────────────────────────────
// Maps AI-generated tags (from keywords) to display category headers.
const TAG_CATEGORY_MAP: Record<string, string> = {
  // Ideas & creativity
  idea: 'Ideas', ideas: 'Ideas', concept: 'Ideas', brainstorm: 'Ideas',
  creative: 'Ideas', innovation: 'Ideas', experiment: 'Ideas',
  // Plans & goals
  plan: 'Plans & Goals', plans: 'Plans & Goals', goal: 'Plans & Goals',
  goals: 'Plans & Goals', future: 'Plans & Goals', strategy: 'Plans & Goals',
  roadmap: 'Plans & Goals', milestone: 'Plans & Goals', objective: 'Plans & Goals',
  // Research & learning
  research: 'Research & Learning', learning: 'Research & Learning',
  study: 'Research & Learning', education: 'Research & Learning',
  tutorial: 'Research & Learning', course: 'Research & Learning',
  lesson: 'Research & Learning', reading: 'Research & Learning',
  // Inspiration & quotes
  inspiration: 'Inspiration', quote: 'Inspiration', quotes: 'Inspiration',
  motivation: 'Inspiration', wisdom: 'Inspiration', philosophy: 'Inspiration',
  // People & contacts
  people: 'People & Contacts', contact: 'People & Contacts',
  network: 'People & Contacts', meeting: 'People & Contacts',
  // Recommendations
  recommendation: 'Recommendations', recommendations: 'Recommendations',
  review: 'Recommendations', suggestion: 'Recommendations',
  // Health & wellness
  health: 'Health & Wellness', wellness: 'Health & Wellness',
  fitness: 'Health & Wellness', nutrition: 'Health & Wellness',
  exercise: 'Health & Wellness', mental: 'Health & Wellness',
  // Finance & money
  finance: 'Finance', money: 'Finance', budget: 'Finance',
  investment: 'Finance', savings: 'Finance', expense: 'Finance',
  // Work & career
  work: 'Work & Career', career: 'Work & Career', job: 'Work & Career',
  professional: 'Work & Career', project: 'Work & Career',
  // Travel
  travel: 'Travel', trip: 'Travel', destination: 'Travel', vacation: 'Travel',
  // Food & cooking
  recipe: 'Food & Recipes', food: 'Food & Recipes', cooking: 'Food & Recipes',
  restaurant: 'Food & Recipes',
  // Decisions
  decision: 'Decisions', decide: 'Decisions', choice: 'Decisions',
  comparison: 'Decisions', 'pros-cons': 'Decisions',
  // Reflections
  reflection: 'Reflections', thought: 'Reflections', thoughts: 'Reflections',
  insight: 'Reflections', realization: 'Reflections', observation: 'Reflections',
};

/**
 * Assign a smart display category label for grouping in archives.
 * Priority: AI tags → structural type → subCategory → keyword tags → content analysis.
 */
export function getSmartCategory(item: Item): string {
  const mediaBlock = item.blocks?.find(b => b.type === 'media');

  // AI-classified category takes priority for media items
  if (item.aiTags && item.aiTags.length > 0 && mediaBlock?.type === 'media') {
    return item.aiTags[0];
  }

  // Structural: media type takes priority
  if (mediaBlock?.type === 'media') {
    if (mediaBlock.mediaType === 'image' || mediaBlock.mediaType === 'video') return 'Images';
    if (mediaBlock.mediaType === 'link') return 'References';
  }
  if (item.type === 'link' && item.url) return 'References';

  // Structural: checklist = task
  if (item.blocks?.some(b => b.type === 'checklist')) return 'Tasks';

  // subCategory overrides for unambiguous types
  switch (item.subCategory) {
    case 'todo':
    case 'task': return 'Tasks';
    case 'reminder': return 'Reminders';
    case 'scheduling': return 'Events';
    case 'journal': return 'Journal';
  }

  // Use AI-generated keyword tags to determine category
  if (item.keywords && item.keywords.length > 0) {
    for (const tag of item.keywords) {
      const category = TAG_CATEGORY_MAP[tag.toLowerCase()];
      if (category) return category;
    }
  }

  // Content-aware classification using keyword patterns
  const text = extractItemText(item);

  if (item.subCategory === 'idea' || IDEAS_RE.test(text)) return 'Ideas';
  if (FUTURE_PLANS_RE.test(text)) return 'Plans & Goals';
  if (DECISION_RE.test(text)) return 'Decisions';
  if (RESEARCH_RE.test(text)) return 'Research & Learning';
  if (FOOD_RE.test(text)) return 'Food & Recipes';
  if (HEALTH_RE.test(text)) return 'Health & Wellness';
  if (FINANCE_RE.test(text)) return 'Finance';
  if (TRAVEL_RE.test(text)) return 'Travel';
  if (WORK_RE.test(text)) return 'Work & Career';
  if (PEOPLE_RE.test(text)) return 'People & Contacts';
  if (REFLECTION_RE.test(text)) return 'Reflections';
  if (INSPIRATION_RE.test(text)) return 'Inspiration';
  if (REVISIT_RE.test(text)) return 'Things to Revisit';
  if (REMEMBER_RE.test(text)) return 'Notes';

  return 'Notes';
}

const CATEGORY_ORDER = [
  'Ideas',
  'Plans & Goals',
  'Research & Learning',
  'Reflections',
  'Inspiration',
  'Notes',
  'Recommendations',
  'Decisions',
  'People & Contacts',
  'Work & Career',
  'Health & Wellness',
  'Finance',
  'Travel',
  'Food & Recipes',
  'Things to Revisit',
  'References',
  'Tasks',
  'Journal',
  'Events',
  'Reminders',
  'Images',
];

/**
 * Group items by smart content category in a logical display order.
 */
export function groupBySmartCategory(items: Item[]): { label: string; items: Item[] }[] {
  const buckets = new Map<string, Item[]>();
  for (const item of items) {
    const cat = getSmartCategory(item);
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat)!.push(item);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .map(([label, items]) => ({ label, items }));
}
