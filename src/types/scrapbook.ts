export interface ContentBlock {
  id: string;
  type: 'text' | 'list' | 'image' | 'checklist';
  content: string; // For text/image URL
  items?: ListItem[]; // For lists/checklists
}

export interface ListItem {
  id: string;
  text: string;
  checked?: boolean;
}

export interface ScrapbookEntry {
  id: string;
  blocks: ContentBlock[];
  createdAt: Date;
  updatedAt: Date;
  linkPreview?: LinkPreview;
}

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
}
