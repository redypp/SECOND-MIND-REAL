export interface ArchiveCategory {
  id: string;
  name: string;
  emoji: string;
  group: string;
  /** Curated Unsplash photo URL — no API key required */
  photoUrl: string;
  /** GIF search keyword for auto-assigning an animated background */
  gifKeyword?: string;
}

/** Builds a sized Unsplash image URL from a raw photo ID. */
function u(id: string): string {
  return `https://images.unsplash.com/photo-${id}?w=600&h=400&fit=crop&auto=format&q=80`;
}

/**
 * Builds an Unsplash Source URL for arbitrary keyword queries.
 * Used as a fallback for custom-titled archives.
 * Note: source.unsplash.com is best-effort; a color fallback is shown if it fails to load.
 */
export function unsplashSourceUrl(keyword: string): string {
  const safe = encodeURIComponent(keyword.trim().toLowerCase());
  return `https://source.unsplash.com/featured/600x400/?${safe}`;
}

export const ARCHIVE_CATEGORIES: ArchiveCategory[] = [
  // ─── Sports ──────────────────────────────────────────────────────────────
  { id: 'soccer',          name: 'Soccer',           emoji: '⚽', group: 'Sports',         photoUrl: u('1579952363873-27f3bade9f55'),  gifKeyword: 'soccer goal' },
  { id: 'basketball',      name: 'Basketball',       emoji: '🏀', group: 'Sports',         photoUrl: u('1546519638-68e109498ffc'),      gifKeyword: 'basketball dunk' },
  { id: 'tennis',          name: 'Tennis',           emoji: '🎾', group: 'Sports',         photoUrl: u('1554068865-24cecd4e34b8'),      gifKeyword: 'tennis match' },
  { id: 'swimming',        name: 'Swimming',         emoji: '🏊', group: 'Sports',         photoUrl: u('1530549387789-4c1017266635'),   gifKeyword: 'swimming pool' },
  { id: 'running',         name: 'Running',          emoji: '🏃', group: 'Sports',         photoUrl: u('1571008887538-b36bb32f4571'),   gifKeyword: 'running track' },
  { id: 'cycling',         name: 'Cycling',          emoji: '🚴', group: 'Sports',         photoUrl: u('1558618666-fcd25c85cd64'),      gifKeyword: 'cycling race' },
  { id: 'golf',            name: 'Golf',             emoji: '⛳', group: 'Sports',         photoUrl: u('1535131749006-b7f58c99034b'),   gifKeyword: 'golf swing' },
  { id: 'baseball',        name: 'Baseball',         emoji: '⚾', group: 'Sports',         photoUrl: u('1508344928928-7165b67de128'),   gifKeyword: 'baseball pitch' },
  { id: 'football',        name: 'Football',         emoji: '🏈', group: 'Sports',         photoUrl: u('1566577739112-5180d4bf9390'),   gifKeyword: 'football touchdown' },
  { id: 'volleyball',      name: 'Volleyball',       emoji: '🏐', group: 'Sports',         photoUrl: u('1612872087720-bb876e2e67d1'),   gifKeyword: 'volleyball spike' },
  { id: 'boxing',          name: 'Boxing',           emoji: '🥊', group: 'Sports',         photoUrl: u('1549719386-74dfcbf7dbed'),      gifKeyword: 'boxing fight' },
  { id: 'skiing',          name: 'Skiing',           emoji: '⛷️', group: 'Sports',         photoUrl: u('1551698618-1dfe5d97d256'),      gifKeyword: 'skiing slope' },
  { id: 'surfing',         name: 'Surfing',          emoji: '🏄', group: 'Sports',         photoUrl: u('1455752558859-c56f3f8c5dc7'),   gifKeyword: 'surfing wave' },
  { id: 'rock-climbing',   name: 'Rock Climbing',    emoji: '🧗', group: 'Sports',         photoUrl: u('1522163182402-834f871fd851'),   gifKeyword: 'rock climbing' },
  { id: 'martial-arts',    name: 'Martial Arts',     emoji: '🥋', group: 'Sports',         photoUrl: u('1555597673-b21d5c935865'),      gifKeyword: 'martial arts fight' },
  { id: 'dance',           name: 'Dance',            emoji: '💃', group: 'Sports',         photoUrl: u('1547153760-18fc86324498'),      gifKeyword: 'dance performance' },

  // ─── Fitness & Wellness ───────────────────────────────────────────────────
  { id: 'yoga',            name: 'Yoga',             emoji: '🧘', group: 'Fitness',        photoUrl: u('1544367567-0f2fcb009e0b'),   gifKeyword: 'yoga pose flow' },
  { id: 'gym',             name: 'Gym',              emoji: '🏋️', group: 'Fitness',        photoUrl: u('1534438327276-14e5300c3a48'), gifKeyword: 'gym workout weightlifting' },
  { id: 'meditation',      name: 'Meditation',       emoji: '🪷', group: 'Fitness',        photoUrl: u('1506126613408-eca07ce68773'), gifKeyword: 'meditation calm' },
  { id: 'health',          name: 'Health',           emoji: '❤️', group: 'Fitness',        photoUrl: u('1571019613454-1cb2f99b2d8b'), gifKeyword: 'health wellness' },
  { id: 'mental-health',   name: 'Mental Health',    emoji: '🧠', group: 'Fitness',        photoUrl: u('1544027993-37dbfe43562a'),   gifKeyword: 'mindfulness breathe' },
  { id: 'sleep',           name: 'Sleep',            emoji: '😴', group: 'Fitness',        photoUrl: u('1541781774459-bb2af2f05b55'), gifKeyword: 'sleeping cozy night' },
  { id: 'nutrition',       name: 'Nutrition',        emoji: '🥗', group: 'Fitness',        photoUrl: u('1512621776951-a57141f2eefd'), gifKeyword: 'healthy food nutrition' },

  // ─── Food & Drink ─────────────────────────────────────────────────────────
  { id: 'cooking',         name: 'Cooking',          emoji: '🍳', group: 'Food & Drink',   photoUrl: u('1556909114-f6e7ad7d3136'),   gifKeyword: 'cooking kitchen chef' },
  { id: 'baking',          name: 'Baking',           emoji: '🧁', group: 'Food & Drink',   photoUrl: u('1486427944299-d1955d23e34d'), gifKeyword: 'baking cake bread' },
  { id: 'coffee',          name: 'Coffee',           emoji: '☕', group: 'Food & Drink',   photoUrl: u('1495474472287-4d71bcdd2085'), gifKeyword: 'coffee pour latte art' },
  { id: 'wine',            name: 'Wine',             emoji: '🍷', group: 'Food & Drink',   photoUrl: u('1510812431401-41d2bd2722f3'), gifKeyword: 'wine pouring vineyard' },
  { id: 'cocktails',       name: 'Cocktails',        emoji: '🍹', group: 'Food & Drink',   photoUrl: u('1551024709-8f23befc9d79'),   gifKeyword: 'cocktail bartender mixing' },
  { id: 'restaurants',     name: 'Restaurants',      emoji: '🍽️', group: 'Food & Drink',   photoUrl: u('1517248135467-4c7edcad34c4'), gifKeyword: 'restaurant fine dining' },
  { id: 'recipes',         name: 'Recipes',          emoji: '📖', group: 'Food & Drink',   photoUrl: u('1466637574441-749b8f19452f'), gifKeyword: 'food recipe cooking' },
  { id: 'meal-prep',       name: 'Meal Prep',        emoji: '🥡', group: 'Food & Drink',   photoUrl: u('1498837167922-ddd27525d352'), gifKeyword: 'meal prep food containers' },

  // ─── Travel & Outdoors ────────────────────────────────────────────────────
  { id: 'travel',          name: 'Travel',           emoji: '✈️', group: 'Travel',         photoUrl: u('1488646953014-85cb44e25828'), gifKeyword: 'travel airplane clouds' },
  { id: 'hiking',          name: 'Hiking',           emoji: '🥾', group: 'Travel',         photoUrl: u('1483728642387-6c3bdd6c93e5'), gifKeyword: 'hiking mountain trail' },
  { id: 'road-trip',       name: 'Road Trip',        emoji: '🚗', group: 'Travel',         photoUrl: u('1469854523086-cc02fe5d8800'), gifKeyword: 'road trip driving highway' },
  { id: 'camping',         name: 'Camping',          emoji: '⛺', group: 'Travel',         photoUrl: u('1478131143081-80f7f84ca84d'), gifKeyword: 'camping bonfire nature' },
  { id: 'beach',           name: 'Beach',            emoji: '🏖️', group: 'Travel',         photoUrl: u('1507525428034-b723cf961d3e'), gifKeyword: 'ocean waves beach sunset' },
  { id: 'mountains',       name: 'Mountains',        emoji: '🏔️', group: 'Travel',         photoUrl: u('1464822759023-fed622ff2c3b'), gifKeyword: 'mountain landscape clouds' },
  { id: 'cities',          name: 'Cities',           emoji: '🌆', group: 'Travel',         photoUrl: u('1477959858617-67f85cf4f1df'), gifKeyword: 'city timelapse skyline' },
  { id: 'national-parks',  name: 'National Parks',   emoji: '🌲', group: 'Travel',         photoUrl: u('1426604966848-d7adac402bff'), gifKeyword: 'national park forest waterfall' },

  // ─── Work & Productivity ──────────────────────────────────────────────────
  { id: 'work',            name: 'Work',             emoji: '💼', group: 'Work',           photoUrl: u('1497366216548-37526070297c'), gifKeyword: 'office work productivity' },
  { id: 'projects',        name: 'Projects',         emoji: '📋', group: 'Work',           photoUrl: u('1454165804606-c3d57bc86b40'), gifKeyword: 'project planning team' },
  { id: 'goals',           name: 'Goals',            emoji: '🎯', group: 'Work',           photoUrl: u('1484480974693-6ca0a78fb36b'), gifKeyword: 'goals achievement success' },
  { id: 'coding',          name: 'Coding',           emoji: '💻', group: 'Work',           photoUrl: u('1461749280684-dccba630e2f6'), gifKeyword: 'coding programming computer' },
  { id: 'design',          name: 'Design',           emoji: '🎨', group: 'Work',           photoUrl: u('1558655146-9f40138edfeb'),   gifKeyword: 'design creative digital art' },
  { id: 'marketing',       name: 'Marketing',        emoji: '📣', group: 'Work',           photoUrl: u('1533750349088-cd871a92f312'), gifKeyword: 'marketing social media digital' },
  { id: 'business',        name: 'Business',         emoji: '🏢', group: 'Work',           photoUrl: u('1507679799987-c73779587ccf'), gifKeyword: 'business corporate meeting' },
  { id: 'meetings',        name: 'Meetings',         emoji: '🤝', group: 'Work',           photoUrl: u('1573164713988-8665fc963095'), gifKeyword: 'meeting conference handshake' },

  // ─── Finance ─────────────────────────────────────────────────────────────
  { id: 'finance',         name: 'Finance',          emoji: '💰', group: 'Finance',        photoUrl: u('1611974789855-9c2a0a7236a3'), gifKeyword: 'stock market finance chart' },
  { id: 'investing',       name: 'Investing',        emoji: '📈', group: 'Finance',        photoUrl: u('1611974789855-9c2a0a7236a3'), gifKeyword: 'stock chart investing trading' },
  { id: 'real-estate',     name: 'Real Estate',      emoji: '🏠', group: 'Finance',        photoUrl: u('1560518883-ce09059eeffa'),   gifKeyword: 'real estate house property' },
  { id: 'budgeting',       name: 'Budgeting',        emoji: '🪙', group: 'Finance',        photoUrl: u('1554224155-8d04cb21cd6c'),   gifKeyword: 'budgeting money savings' },

  // ─── Home & Lifestyle ─────────────────────────────────────────────────────
  { id: 'home-decor',      name: 'Home Decor',       emoji: '🛋️', group: 'Home',           photoUrl: u('1493809842364-78817add7ffb'), gifKeyword: 'interior design home decor' },
  { id: 'gardening',       name: 'Gardening',        emoji: '🌱', group: 'Home',           photoUrl: u('1416879595882-3373a0480b5b'), gifKeyword: 'gardening plants flowers' },
  { id: 'cleaning',        name: 'Cleaning',         emoji: '🧹', group: 'Home',           photoUrl: u('1558618047-3c8c76ca7d13'),   gifKeyword: 'cleaning house organizing' },
  { id: 'pets',            name: 'Pets',             emoji: '🐾', group: 'Home',           photoUrl: u('1450778869180-41d0601e046e'), gifKeyword: 'cute pets animals dogs cats' },
  { id: 'parenting',       name: 'Parenting',        emoji: '👨‍👩‍👧', group: 'Home',           photoUrl: u('1476703993599-0035a21b17a9'), gifKeyword: 'family parenting children' },

  // ─── Fashion & Beauty ─────────────────────────────────────────────────────
  { id: 'fashion',         name: 'Fashion',          emoji: '👗', group: 'Fashion',        photoUrl: u('1483985988355-763728e1935b'), gifKeyword: 'fashion runway model catwalk' },
  { id: 'beauty',          name: 'Beauty',           emoji: '💄', group: 'Fashion',        photoUrl: u('1522335789203-aabd1fc54bc9'), gifKeyword: 'makeup beauty cosmetics' },
  { id: 'skincare',        name: 'Skincare',         emoji: '🧴', group: 'Fashion',        photoUrl: u('1556228720-195a672e8a03'),   gifKeyword: 'skincare routine beauty' },

  // ─── Arts & Entertainment ─────────────────────────────────────────────────
  { id: 'music',           name: 'Music',            emoji: '🎵', group: 'Arts',           photoUrl: u('1511671782779-c97d3d27a1d4'), gifKeyword: 'music studio soundwave concert' },
  { id: 'movies',          name: 'Movies & TV',      emoji: '🎬', group: 'Arts',           photoUrl: u('1489599849927-2ee91cede3ba'), gifKeyword: 'movie cinema film' },
  { id: 'books',           name: 'Books',            emoji: '📚', group: 'Arts',           photoUrl: u('1507842217343-583bb7270b66'), gifKeyword: 'books reading library' },
  { id: 'gaming',          name: 'Gaming',           emoji: '🎮', group: 'Arts',           photoUrl: u('1542751371-adc38448a05e'),   gifKeyword: 'gaming video game esports' },
  { id: 'photography',     name: 'Photography',      emoji: '📷', group: 'Arts',           photoUrl: u('1452587925148-ce544e77e70d'), gifKeyword: 'photography camera shoot' },
  { id: 'art-drawing',     name: 'Art & Drawing',    emoji: '🖌️', group: 'Arts',           photoUrl: u('1513364776144-60967b0f800f'), gifKeyword: 'art painting drawing creative' },
  { id: 'podcasts',        name: 'Podcasts',         emoji: '🎙️', group: 'Arts',           photoUrl: u('1589903308904-1010c2294adc'), gifKeyword: 'podcast microphone recording' },
  { id: 'writing',         name: 'Writing',          emoji: '✍️', group: 'Arts',           photoUrl: u('1455390582262-044cdead277a'), gifKeyword: 'writing typing notebook' },

  // ─── Learning ─────────────────────────────────────────────────────────────
  { id: 'education',       name: 'Education',        emoji: '🎓', group: 'Learning',       photoUrl: u('1503676260728-1c00da094a0b'), gifKeyword: 'education school study' },
  { id: 'languages',       name: 'Languages',        emoji: '🌍', group: 'Learning',       photoUrl: u('1543286386-713bdd548da4'),   gifKeyword: 'language world globe' },
  { id: 'science',         name: 'Science',          emoji: '🔬', group: 'Learning',       photoUrl: u('1507413245164-6160d8298b31'), gifKeyword: 'science lab experiment' },
  { id: 'history',         name: 'History',          emoji: '🏛️', group: 'Learning',       photoUrl: u('1461360228754-6e81c478b882'), gifKeyword: 'history ancient architecture' },
  { id: 'philosophy',      name: 'Philosophy',       emoji: '💭', group: 'Learning',       photoUrl: u('1507003211169-0a1dd7228f2d'), gifKeyword: 'thinking philosophy mind' },
  { id: 'technology',      name: 'Technology',       emoji: '🤖', group: 'Learning',       photoUrl: u('1518770660439-4636190af475'), gifKeyword: 'technology innovation digital' },

  // ─── Social & Events ──────────────────────────────────────────────────────
  { id: 'events',          name: 'Events',           emoji: '🎉', group: 'Social',         photoUrl: u('1540575467063-178a50c2df87'), gifKeyword: 'party celebration confetti' },
  { id: 'weddings',        name: 'Weddings',         emoji: '💍', group: 'Social',         photoUrl: u('1519225421980-715cb0215aed'), gifKeyword: 'wedding ceremony love' },
  { id: 'holidays',        name: 'Holidays',         emoji: '🎄', group: 'Social',         photoUrl: u('1513147122760-ad1d5bf68cdb'), gifKeyword: 'holiday celebration festive' },
  { id: 'friends',         name: 'Friends',          emoji: '👫', group: 'Social',         photoUrl: u('1529156069898-49953e39b3ac'), gifKeyword: 'friends hanging out fun' },
  { id: 'dating',          name: 'Dating',           emoji: '💕', group: 'Social',         photoUrl: u('1516589178581-6cd7833ae3b2'), gifKeyword: 'romance love couple' },
  { id: 'family',          name: 'Family',           emoji: '👨‍👩‍👧‍👦', group: 'Social',         photoUrl: u('1511895426328-dc8714191011'), gifKeyword: 'family together home' },

  // ─── Cars & Tech ──────────────────────────────────────────────────────────
  { id: 'cars',            name: 'Cars',             emoji: '🚗', group: 'Hobbies',        photoUrl: u('1494976388531-d1058494cdd8'), gifKeyword: 'cars driving racing speed' },
  { id: 'astronomy',       name: 'Astronomy',        emoji: '🔭', group: 'Hobbies',        photoUrl: u('1462331940025-496dfbfc7564'), gifKeyword: 'space stars galaxy cosmos' },
  { id: 'fishing',         name: 'Fishing',          emoji: '🎣', group: 'Hobbies',        photoUrl: u('1498019559366-a1755b1a2795'), gifKeyword: 'fishing lake river nature' },
  { id: 'crafts',          name: 'Crafts & DIY',     emoji: '🔨', group: 'Hobbies',        photoUrl: u('1504917595217-d4dc5ebe6122'), gifKeyword: 'crafts diy handmade' },
  { id: 'board-games',     name: 'Board Games',      emoji: '♟️', group: 'Hobbies',        photoUrl: u('1611996575749-79a3a250f948'), gifKeyword: 'board games chess strategy' },
];

/** All unique group names in the order they first appear. */
export const ARCHIVE_GROUPS: string[] = Array.from(
  new Set(ARCHIVE_CATEGORIES.map((c) => c.group))
);

/**
 * Returns the GIF search keyword for a given archive name.
 * Matches against predefined categories first; falls back to the name itself.
 */
export function getGifKeywordForName(name: string): string {
  const normalized = name.trim().toLowerCase();
  const match = ARCHIVE_CATEGORIES.find(
    (c) => c.name.toLowerCase() === normalized
  );
  return match?.gifKeyword ?? name.trim();
}
