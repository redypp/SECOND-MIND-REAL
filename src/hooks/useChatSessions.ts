import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/app-client';
import { useAuth } from '@/contexts/AuthContext';

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export function useChatSessions() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messagesMap, setMessagesMap] = useState<Record<string, ChatMessageRow[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const initRef = useRef(false);

  // ── Load sessions on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!userId || initRef.current) return;
    initRef.current = true;

    (async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('chat_sessions')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
          setSessions(data as ChatSession[]);
          setActiveSessionId(data[0].id);
          // Load messages for the most recent session
          await loadMessages(data[0].id);
        } else {
          // No sessions — create one
          const newSession = await createSession();
          if (newSession) {
            setActiveSessionId(newSession.id);
          }
        }
      } catch (err) {
        console.error('Could not load chat sessions, creating new one:', err);
        // Fallback: create a fresh session
        try {
          const newSession = await createSession();
          if (newSession) setActiveSessionId(newSession.id);
        } catch (err2) {
          console.error('Could not create fallback chat session:', err2);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load messages for a session ───────────────────────────────────────
  const loadMessages = useCallback(async (sessionId: string) => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessagesMap(prev => ({ ...prev, [sessionId]: data as ChatMessageRow[] }));
    }
  }, [userId]);

  // ── Create a new session ──────────────────────────────────────────────
  const createSession = useCallback(async (title?: string): Promise<ChatSession | null> => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({ user_id: userId, title: title || 'New conversation' })
      .select()
      .single();

    if (error || !data) {
      console.error('Failed to create chat session:', error);
      return null;
    }
    const s = data as ChatSession;
    setSessions(prev => [s, ...prev]);
    setMessagesMap(prev => ({ ...prev, [s.id]: [] }));
    return s;
  }, [userId]);

  // ── Save a message ────────────────────────────────────────────────────
  const saveMessage = useCallback(async (
    sessionId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<ChatMessageRow | null> => {
    if (!userId || !content.trim()) return null;
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ session_id: sessionId, user_id: userId, role, content })
      .select()
      .single();

    if (error || !data) {
      console.error('Failed to save chat message:', error);
      return null;
    }

    const msg = data as ChatMessageRow;
    setMessagesMap(prev => ({
      ...prev,
      [sessionId]: [...(prev[sessionId] || []), msg],
    }));

    // Update session's updated_at
    supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .then(() => {});

    return msg;
  }, [userId]);

  // ── Start a new conversation ──────────────────────────────────────────
  const startNewSession = useCallback(async () => {
    const s = await createSession();
    if (s) setActiveSessionId(s.id);
    return s;
  }, [createSession]);

  // ── Switch to existing session ────────────────────────────────────────
  const switchSession = useCallback(async (sessionId: string) => {
    setActiveSessionId(sessionId);
    if (!messagesMap[sessionId]) {
      await loadMessages(sessionId);
    }
  }, [messagesMap, loadMessages]);

  const activeMessages = activeSessionId ? (messagesMap[activeSessionId] || []) : [];

  return {
    sessions,
    activeSessionId,
    activeMessages,
    isLoading,
    createSession,
    saveMessage,
    startNewSession,
    switchSession,
    loadMessages,
  };
}
