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

/**
 * Assign a smart display category label for grouping in archives.
 * Priority: structural type → subCategory → content keyword analysis.
 */
export function getSmartCategory(item: Item): string {
  const mediaBlock = item.blocks?.find(b => b.type === 'media');

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

  // Content-aware classification using keyword patterns
  const text = extractItemText(item);

  if (item.subCategory === 'idea' || IDEAS_RE.test(text)) return 'Ideas';
  if (FUTURE_PLANS_RE.test(text)) return 'Future Plans';
  if (INSPIRATION_RE.test(text)) return 'Inspiration';
  if (REVISIT_RE.test(text)) return 'Things to Revisit';
  if (REMEMBER_RE.test(text)) return 'Stuff to Remember';

  // Default: Stuff to Remember (better than a generic "Notes" bucket)
  return 'Stuff to Remember';
}

const CATEGORY_ORDER = [
  'Ideas',
  'Future Plans',
  'Inspiration',
  'Stuff to Remember',
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
