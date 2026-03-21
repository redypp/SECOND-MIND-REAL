import { useState, useEffect } from 'react';

export interface UrlMetadata {
  title?: string;
  favicon?: string;
  description?: string;
  isLoading: boolean;
}

// Cache to avoid refetching
const metadataCache = new Map<string, Omit<UrlMetadata, 'isLoading'>>();

export function useUrlMetadata(url: string | undefined): UrlMetadata {
  const [metadata, setMetadata] = useState<UrlMetadata>({
    isLoading: !!url,
  });

  useEffect(() => {
    if (!url) {
      setMetadata({ isLoading: false });
      return;
    }

    // Check cache first
    const cached = metadataCache.get(url);
    if (cached) {
      setMetadata({ ...cached, isLoading: false });
      return;
    }

    const fetchMetadata = async () => {
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace('www.', '');
        
        // Get favicon using Google's favicon service (most reliable)
        const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        
        // For title, we'll use the domain as fallback since we can't fetch cross-origin
        // In a real app, you'd use a backend service or edge function
        const title = formatDomainAsTitle(domain);
        
        const result = { title, favicon };
        metadataCache.set(url, result);
        setMetadata({ ...result, isLoading: false });
      } catch {
        setMetadata({ isLoading: false });
      }
    };

    fetchMetadata();
  }, [url]);

  return metadata;
}

function formatDomainAsTitle(domain: string): string {
  // Remove TLD and format nicely
  const parts = domain.split('.');
  if (parts.length > 1) {
    // Get main domain name (e.g., "youtube" from "youtube.com")
    const main = parts[parts.length - 2];
    // Capitalize first letter
    return main.charAt(0).toUpperCase() + main.slice(1);
  }
  return domain;
}

export function getDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export function getFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return '';
  }
}
