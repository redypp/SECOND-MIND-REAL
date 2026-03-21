import { Item } from '@/types';

interface GroupResult {
  label: string;
  item_ids: string[];
}

/**
 * Instantly groups items client-side by analyzing titles, keywords, tags,
 * and sub-categories. No network call required — runs synchronously.
 */
export function localGroupItems(items: Item[]): GroupResult[] {
  if (items.length === 0) return [];
  if (items.length <= 2) {
    return [{ label: 'All', item_ids: items.map(i => i.id) }];
  }

  // Collect signals per item
  const itemSignals = items.map(item => {
    const signals: string[] = [];
    // keywords and tags
    if (item.keywords) signals.push(...item.keywords.map(k => k.toLowerCase()));
    const aiTags = (item as any).ai_tags || (item as any).aiTags;
    if (aiTags) signals.push(...aiTags.map((t: string) => t.toLowerCase()));
    // title words (3+ chars)
    if (item.title) {
      item.title.toLowerCase().split(/\s+/).filter(w => w.length > 3).forEach(w => signals.push(w));
    }
    return { id: item.id, signals, subCategory: item.subCategory };
  });

  // Strategy 1: Group by subCategory if there's meaningful diversity
  const catGroups = new Map<string, string[]>();
  for (const is of itemSignals) {
    const cat = is.subCategory || 'misc';
    if (!catGroups.has(cat)) catGroups.set(cat, []);
    catGroups.get(cat)!.push(is.id);
  }

  const catLabels: Record<string, string> = {
    notes: 'Notes',
    todo: 'Tasks',
    scheduling: 'Events',
    misc: 'Other',
    habit: 'Habits',
    journal: 'Journal',
    reminder: 'Reminders',
  };

  // If we have 2+ categories, use category grouping
  if (catGroups.size >= 2) {
    const results: GroupResult[] = [];
    for (const [cat, ids] of catGroups) {
      results.push({ label: catLabels[cat] || cat, item_ids: ids });
    }
    return results.sort((a, b) => b.item_ids.length - a.item_ids.length);
  }

  // Strategy 2: Group by most common keywords/tags
  const wordCount = new Map<string, string[]>();
  const stopWords = new Set(['this', 'that', 'with', 'from', 'have', 'been', 'were', 'some', 'about', 'into', 'more', 'very', 'just', 'also', 'like', 'your', 'they', 'what', 'when', 'will', 'each', 'make', 'than']);

  for (const is of itemSignals) {
    const seen = new Set<string>();
    for (const s of is.signals) {
      if (stopWords.has(s) || s.length < 3) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      if (!wordCount.has(s)) wordCount.set(s, []);
      wordCount.get(s)!.push(is.id);
    }
  }

  // Find keywords that appear in 2+ items
  const clusters: { label: string; ids: Set<string> }[] = [];
  const sorted = [...wordCount.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);

  const assigned = new Set<string>();

  for (const [word, ids] of sorted) {
    if (clusters.length >= 5) break;
    const unassigned = ids.filter(id => !assigned.has(id));
    if (unassigned.length < 2) continue;

    const cluster = { label: word.charAt(0).toUpperCase() + word.slice(1), ids: new Set(unassigned) };
    unassigned.forEach(id => assigned.add(id));
    clusters.push(cluster);
  }

  // Remaining items
  const remaining = items.filter(i => !assigned.has(i.id));

  const results: GroupResult[] = clusters.map(c => ({
    label: c.label,
    item_ids: [...c.ids],
  }));

  if (remaining.length > 0) {
    results.push({ label: 'Other', item_ids: remaining.map(i => i.id) });
  }

  // If clustering produced only 1 group, just return all as one
  if (results.length <= 1) {
    return [{ label: 'All', item_ids: items.map(i => i.id) }];
  }

  return results;
}
