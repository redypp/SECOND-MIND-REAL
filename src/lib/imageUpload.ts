/**
 * Upload an image to Supabase Storage and return a long-lived signed URL.
 * The user-images bucket is private; signed URLs are required for display.
 * Falls back to base64 data URL if upload fails.
 */
import { supabase } from '@/integrations/supabase/app-client';

// 1 year in seconds. Supabase Storage signed URL max is typically ~1 year.
const SIGNED_URL_EXPIRY_SECONDS = 31_536_000;

export async function uploadImageToStorage(
  dataUrl: string,
  userId: string
): Promise<string> {
  try {
    // Convert data URL to blob
    const res = await fetch(dataUrl);
    const blob = await res.blob();

    const ext = blob.type === 'image/png' ? 'png' : 'jpg';
    const fileName = `${userId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from('user-images')
      .upload(fileName, blob, {
        contentType: blob.type,
        upsert: false,
      });

    if (error) {
      console.error('[imageUpload] Storage upload failed:', error.message);
      return dataUrl; // fallback to base64
    }

    const { data: signedData, error: signError } = await supabase.storage
      .from('user-images')
      .createSignedUrl(fileName, SIGNED_URL_EXPIRY_SECONDS);

    if (signError || !signedData) {
      console.error('[imageUpload] Failed to create signed URL:', signError?.message);
      return dataUrl; // fallback to base64
    }

    return signedData.signedUrl;
  } catch (err) {
    console.error('[imageUpload] Upload error:', err);
    return dataUrl; // fallback to base64
  }
}
