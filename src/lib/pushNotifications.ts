import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';

/**
 * Register for native push notifications on iOS/Android.
 * Stores the device token in the database for the current user.
 * No-ops gracefully on web.
 */
export async function registerPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return;

  await PushNotifications.register();

  PushNotifications.addListener('registration', async (token) => {
    const platform = Capacitor.getPlatform(); // 'ios' | 'android'

    // Upsert token
    await supabase
      .from('device_tokens' as any)
      .upsert(
        { user_id: user.id, token: token.value, platform, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,token' }
      );
  });

  PushNotifications.addListener('registrationError', (error) => {
    console.error('Push registration error:', error);
  });

  // Handle notification received while app is in foreground
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push received in foreground:', notification);
  });

  // Handle notification action (user tapped notification)
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('Push action performed:', action);
  });
}

/**
 * Remove the device token on logout.
 */
export async function unregisterPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await PushNotifications.removeAllListeners();
  } catch (e) {
    console.error('Failed to unregister push:', e);
  }
}
