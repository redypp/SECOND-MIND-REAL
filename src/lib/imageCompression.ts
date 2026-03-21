/**
 * Client-side image compression utility.
 * Resizes images to a max dimension and compresses quality
 * to keep base64 payloads small for database storage.
 */

const MAX_DIMENSION = 1200; // px — largest side
const QUALITY = 0.7;        // JPEG quality (0-1)

export function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;

        // Only resize if larger than max
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl); // fallback to original
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', QUALITY);
        resolve(compressed);
      } catch {
        resolve(dataUrl); // fallback on any error
      }
    };
    img.onerror = () => resolve(dataUrl); // fallback
    img.src = dataUrl;
  });
}

/**
 * Compress multiple images in parallel
 */
export function compressImages(dataUrls: string[]): Promise<string[]> {
  return Promise.all(dataUrls.map(compressImage));
}
