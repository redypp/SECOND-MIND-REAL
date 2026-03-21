import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Registers the device for native push notifications using Capacitor
 * and persists the FCM/APNs token in the `device_tokens` Supabase table.
 *
 * Platform detection:
 *  - Capacitor.isNativePlatform() → true  → use @capacitor/push-notifications
 *  - Web browser → no-op (web push not yet wired; can add later with VAPID)
 *
 * Usage: call `register()` when the user enables push in settings.
 *        The hook also auto-registers on mount if push was previously enabled.
 */
export function usePushRegistration() {
  const { user } = useAuth();
  const registeredRef = useRef(false);

  const upsertToken = useCallback(
    async (token: string, platform: 'ios' | 'android' | 'web') => {
      if (!user) return;
      try {
        await supabase
          .from('device_tokens')
          .upsert(
            { user_id: user.id, token, platform, updated_at: new Date().toISOString() },
            { onConflict: 'user_id, token' }
          );
        console.log('[usePushRegistration] token upserted for', platform);
      } catch (err) {
        console.error('[usePushRegistration] upsert error:', err);
      }
    },
    [user]
  );

  const register = useCallback(async () => {
    if (!user || registeredRef.current) return;

    try {
      // Dynamic import so non-Capacitor web builds don't fail
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const { Capacitor } = await import('@capacitor/core');

      if (!Capacitor.isNativePlatform()) {
        console.log('[usePushRegistration] Not a native platform; skipping registration');
        return;
      }

      // Request permission
      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== 'granted') {
        console.log('[usePushRegistration] Push permission denied');
        return;
      }

      // Register with OS / FCM
      await PushNotifications.register();

      // Handle FCM/APNs token
      PushNotifications.addListener('registration', async (token) => {
        const platform = Capacitor.getPlatform() as 'ios' | 'android';
        await upsertToken(token.value, platform);
        registeredRef.current = true;
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('[usePushRegistration] registration error:', err.error);
      });

      // Forward received push notifications to in-app handling
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[usePushRegistration] foreground push received:', notification);
        // Dispatching a browser custom event lets other parts of the app react
        window.dispatchEvent(
          new CustomEvent('secondmind:push', { detail: notification })
        );
      });

    } catch (err) {
      console.error('[usePushRegistration] setup error:', err);
    }
  }, [user, upsertToken]);

  const unregister = useCallback(async () => {
    if (!user) return;
    try {
      // Remove all tokens for this user from the DB
      await supabase
        .from('device_tokens')
        .delete()
        .eq('user_id', user.id);

      const { PushNotifications } = await import('@capacitor/push-notifications');
      await PushNotifications.removeAllListeners();
      registeredRef.current = false;
      console.log('[usePushRegistration] unregistered');
    } catch (err) {
      console.error('[usePushRegistration] unregister error:', err);
    }
  }, [user]);

  // On mount, check if user already has tokens registered (meaning they opted in before)
  useEffect(() => {
    if (!user) return;
    supabase
      .from('device_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count }) => {
        if ((count ?? 0) > 0) {
          // Re-register to refresh token (tokens can rotate)
          register();
        }
      });
  }, [user, register]);

  return { register, unregister };
}
