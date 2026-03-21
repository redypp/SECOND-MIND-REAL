import { spaces } from '@/data/mockData';

interface OrganizationResult {
  type: 'note' | 'link' | 'image' | 'video';
  detectedSpaceIds: string[];
  keywords: string[];
}

// Keywords mapped to space IDs
const spaceKeywords: Record<string, string[]> = {
  '1': ['skateboard', 'skate', 'ollie', 'kickflip', 'trick', 'board', 'ramp', 'park', 'grind', 'halfpipe', 'skating'],
  '2': ['idea', 'thought', 'concept', 'what if', 'maybe', 'could', 'app', 'startup', 'project', 'innovation', 'brainstorm'],
  '3': ['music', 'song', 'album', 'artist', 'band', 'playlist', 'listen', 'spotify', 'soundcloud', 'beat', 'melody', 'concert'],
  '4': ['design', 'ui', 'ux', 'typography', 'color', 'layout', 'figma', 'logo', 'brand', 'visual', 'aesthetic', 'font'],
  '5': ['book', 'read', 'author', 'novel', 'chapter', 'story', 'writing', 'library', 'literature', 'kindle'],
  '6': ['travel', 'trip', 'flight', 'hotel', 'destination', 'vacation', 'explore', 'country', 'city', 'adventure', 'tokyo', 'paris'],
};

// Common stop words to filter out
const stopWords = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
  'we', 'they', 'my', 'your', 'his', 'her', 'our', 'their', 'what', 'which',
  'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only',
  'same', 'so', 'than', 'too', 'very', 'just', 'about', 'into', 'over',
  'after', 'before', 'between', 'through', 'during', 'without', 'again',
  'http', 'https', 'www', 'com', 'org', 'net'
]);

function detectType(content: string): 'note' | 'link' | 'image' | 'video' {
  const trimmed = content.trim().toLowerCase();
  
  // Check for URLs
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    // Check for video platforms
    if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be') || 
        trimmed.includes('vimeo.com') || trimmed.includes('tiktok.com')) {
      return 'video';
    }
    // Check for image extensions
    if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(trimmed)) {
      return 'image';
    }
    return 'link';
  }
  
  return 'note';
}

function extractKeywords(content: string): string[] {
  // Clean and tokenize
  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  // Count word frequency
  const wordCount: Record<string, number> = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  // Sort by frequency and return top keywords
  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

function detectSpaces(content: string): string[] {
  const lowerContent = content.toLowerCase();
  const matchedSpaces: { id: string; score: number }[] = [];
  
  Object.entries(spaceKeywords).forEach(([spaceId, keywords]) => {
    let score = 0;
    keywords.forEach(keyword => {
      if (lowerContent.includes(keyword)) {
        score += 1;
      }
    });
    
    if (score > 0) {
      matchedSpaces.push({ id: spaceId, score });
    }
  });
  
  // Sort by score and return top matches
  return matchedSpaces
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(m => m.id);
}

export function autoOrganize(content: string): OrganizationResult {
  if (!content.trim()) {
    return {
      type: 'note',
      detectedSpaceIds: [],
      keywords: [],
    };
  }
  
  return {
    type: detectType(content),
    detectedSpaceIds: detectSpaces(content),
    keywords: extractKeywords(content),
  };
}

export function getSpaceNames(spaceIds: string[]): string[] {
  return spaceIds
    .map(id => spaces.find(s => s.id === id)?.name)
    .filter((name): name is string => !!name);
}
