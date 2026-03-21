 import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/app-client';
 import { useAuth } from '@/contexts/AuthContext';

export interface AISettings {
  smartNotifications: boolean;
  notificationFrequency: number;
  chamberEnabled: boolean;
  autoConnections: boolean;
  isPremiumUnlocked: boolean;
  aiButtonHidden: boolean;
  /** Auto-send after voice transcription without requiring a manual tap. */
  voiceAutoSend: boolean;
}

const defaultSettings: AISettings = {
  smartNotifications: false,
  notificationFrequency: 5,
  chamberEnabled: true,
  autoConnections: true,
  isPremiumUnlocked: true, // AI features enabled via Lovable AI
  aiButtonHidden: false,
  voiceAutoSend: false,
};

interface AISettingsContextType {
  settings: AISettings;
   loading: boolean;
  updateSettings: (updates: Partial<AISettings>) => void;
}

const AISettingsContext = createContext<AISettingsContextType | undefined>(undefined);

export function AISettingsProvider({ children }: { children: ReactNode }) {
   const { user } = useAuth();
   const [settings, setSettings] = useState<AISettings>(defaultSettings);
   const [loading, setLoading] = useState(true);
 
   // Fetch settings from cloud
   const fetchSettings = useCallback(async () => {
     if (!user) {
       setSettings(defaultSettings);
       setLoading(false);
       return;
     }
 
     try {
       const { data, error } = await supabase
         .from('user_preferences')
         .select('ai_settings')
         .eq('user_id', user.id)
         .maybeSingle();
 
       if (error) throw error;
 
       if (data?.ai_settings) {
         setSettings({ ...defaultSettings, ...(data.ai_settings as Partial<AISettings>) });
       } else {
         // Create default preferences if none exist
         await supabase
           .from('user_preferences')
           .upsert([{ user_id: user.id, ai_settings: defaultSettings as any }], { onConflict: 'user_id' });
         setSettings(defaultSettings);
       }
     } catch (err) {
       console.error('Error loading AI settings:', err);
       setSettings(defaultSettings);
     } finally {
       setLoading(false);
     }
   }, [user]);

  useEffect(() => {
     fetchSettings();
   }, [fetchSettings]);

   const updateSettings = (updates: Partial<AISettings>) => {
     const newSettings = { ...settings, ...updates };
     setSettings(newSettings);
 
     // Save to cloud
     if (user) {
       supabase
         .from('user_preferences')
         .upsert([{ user_id: user.id, ai_settings: newSettings as any }], { onConflict: 'user_id' })
         .then(({ error }) => {
           if (error) {
             console.error('Error saving AI settings:', error);
           }
         });
     }
  };

  return (
     <AISettingsContext.Provider value={{ settings, loading, updateSettings }}>
      {children}
    </AISettingsContext.Provider>
  );
}

export function useAISettings() {
  const context = useContext(AISettingsContext);
  if (!context) {
    throw new Error('useAISettings must be used within an AISettingsProvider');
  }
  return context;
}
