import { useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoiceState =
  | 'idle'
  | 'requesting'   // waiting for mic permission
  | 'listening'    // actively capturing speech
  | 'processing'   // brief commit phase after stop
  | 'error';

interface UseVoiceInputOptions {
  /** Called with the accumulated final transcript when recording stops. */
  onFinalTranscript: (text: string) => void;
  /**
   * Milliseconds of silence after which recording auto-stops.
   * Default: 2200 ms. Set to 0 to disable.
   */
  silenceMs?: number;
}

interface UseVoiceInputReturn {
  state: VoiceState;
  /** Live in-progress speech not yet finalised by the recogniser. */
  interimText: string;
  error: string | null;
  isSupported: boolean;
  /** Begin recording — no-op if already recording. */
  start: () => void;
  /** Stop recording and commit transcript — no-op if idle. */
  stop: () => void;
  /** Cancel and discard everything — no-op if idle. */
  cancel: () => void;
}

// ─── Detect platform ─────────────────────────────────────────────────────────

const isNative = Capacitor.isNativePlatform();

// Lazy-load the Capacitor plugin only on native to avoid import errors on web
let SpeechRecognitionPlugin: any = null;
if (isNative) {
  import('@capacitor-community/speech-recognition').then(mod => {
    SpeechRecognitionPlugin = mod.SpeechRecognition;
  }).catch(() => {});
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceInput({
  onFinalTranscript,
  silenceMs = 2200,
}: UseVoiceInputOptions): UseVoiceInputReturn {
  const [state, setState] = useState<VoiceState>('idle');
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Refs survive re-renders without causing them
  const recognitionRef    = useRef<any>(null);
  const finalTextRef      = useRef('');
  const silenceTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveRef       = useRef(false);
  const isCommittingRef   = useRef(false);
  const listenerRef       = useRef<any>(null); // Capacitor listener handle

  // Keep callback fresh without triggering restarts
  const onFinalRef = useRef(onFinalTranscript);
  useEffect(() => { onFinalRef.current = onFinalTranscript; }, [onFinalTranscript]);

  // Web Speech API detection
  const WebSpeechRecognition =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  const isSupported = isNative || !!WebSpeechRecognition;

  // ── Silence timer helpers ──────────────────────────────────────────────────

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // ── Core commit (shared by stop, cancel, silence-timeout) ─────────────────

  const commit = useCallback((discard: boolean) => {
    if (isCommittingRef.current) return;
    isCommittingRef.current = true;

    isActiveRef.current = false;
    clearSilenceTimer();
    setInterimText('');

    // Stop native plugin
    if (isNative && SpeechRecognitionPlugin) {
      SpeechRecognitionPlugin.stop().catch(() => {});
      if (listenerRef.current) {
        listenerRef.current.remove().catch(() => {});
        listenerRef.current = null;
      }
    }

    // Stop web recognition
    const rec = recognitionRef.current;
    if (rec) {
      recognitionRef.current = null;
      try { rec.abort(); } catch { /* ignore */ }
    }

    const text = finalTextRef.current.trim();
    finalTextRef.current = '';

    if (discard || !text) {
      setState('idle');
      setError(null);
      isCommittingRef.current = false;
      return;
    }

    // Brief "processing" beat so the user sees feedback
    setState('processing');
    setTimeout(() => {
      setState('idle');
      isCommittingRef.current = false;
      onFinalRef.current(text);
    }, 280);
  }, [clearSilenceTimer]);

  // ── Silence timer reset ────────────────────────────────────────────────────

  const resetSilenceTimer = useCallback(() => {
    if (silenceMs <= 0) return;
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      if (isActiveRef.current) commit(false);
    }, silenceMs);
  }, [silenceMs, clearSilenceTimer, commit]);

  // ── Public API ─────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    if (!isActiveRef.current) return;
    commit(false);
  }, [commit]);

  const cancel = useCallback(() => {
    commit(true);
  }, [commit]);

  const startNative = useCallback(async () => {
    if (isActiveRef.current || isCommittingRef.current) return;
    if (!SpeechRecognitionPlugin) {
      // Plugin not loaded yet — try loading again
      try {
        const mod = await import('@capacitor-community/speech-recognition');
        SpeechRecognitionPlugin = mod.SpeechRecognition;
      } catch {
        setState('error');
        setError('Speech recognition is not available on this device.');
        return;
      }
    }

    setError(null);
    setInterimText('');
    finalTextRef.current = '';
    isCommittingRef.current = false;
    setState('requesting');

    try {
      // Check and request permissions
      const { speechRecognition } = await SpeechRecognitionPlugin.checkPermissions();
      if (speechRecognition !== 'granted') {
        const result = await SpeechRecognitionPlugin.requestPermissions();
        if (result.speechRecognition !== 'granted') {
          setState('error');
          setError('Microphone permission is required. Please allow it in Settings.');
          return;
        }
      }

      // Check availability
      const { available } = await SpeechRecognitionPlugin.available();
      if (!available) {
        setState('error');
        setError('Speech recognition is not available on this device.');
        return;
      }

      // Listen for partial results
      listenerRef.current = await SpeechRecognitionPlugin.addListener(
        'partialResults',
        (data: { matches: string[] }) => {
          if (!isActiveRef.current) return;
          const text = data.matches?.[0] || '';
          if (text) {
            finalTextRef.current = text;
            setInterimText(text);
            resetSilenceTimer();
          }
        }
      );

      // Start recognition
      await SpeechRecognitionPlugin.start({
        language: navigator.language || 'en-US',
        maxResults: 5,
        partialResults: true,
        popup: false,
      });

      isActiveRef.current = true;
      setState('listening');
      resetSilenceTimer();
    } catch (err: any) {
      console.warn('[useVoiceInput] Native speech error:', err);
      setState('error');
      setError('Could not start voice input. Please try again.');
    }
  }, [resetSilenceTimer]);

  const startWeb = useCallback(() => {
    if (isActiveRef.current || isCommittingRef.current || !WebSpeechRecognition) return;

    setError(null);
    setInterimText('');
    finalTextRef.current = '';
    isCommittingRef.current = false;
    setState('requesting');

    const recognition = new WebSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      isActiveRef.current = true;
      setState('listening');
      resetSilenceTimer();
    };

    recognition.onresult = (event: any) => {
      if (!isActiveRef.current) return;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTextRef.current += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimText(interim);
      resetSilenceTimer();
    };

    recognition.onerror = (event: any) => {
      const { error: errCode } = event;
      if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
        isActiveRef.current = false;
        recognitionRef.current = null;
        clearSilenceTimer();
        setState('error');
        setError('Microphone permission is required. Please allow it in Settings.');
      } else if (errCode === 'no-speech' || errCode === 'aborted') {
        // Non-fatal — browser restarts on its own
      } else {
        console.warn('[useVoiceInput] SpeechRecognition error:', errCode);
      }
    };

    recognition.onend = () => {
      if (isActiveRef.current && recognitionRef.current === recognition) {
        try { recognition.start(); } catch { /* already stopped externally */ }
      }
    };

    try {
      recognition.start();
    } catch {
      setState('error');
      setError('Could not start voice input. Please try again.');
      recognitionRef.current = null;
    }
  }, [WebSpeechRecognition, resetSilenceTimer, clearSilenceTimer]);

  const start = useCallback(() => {
    if (isNative) {
      startNative();
    } else {
      startWeb();
    }
  }, [startNative, startWeb]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      clearSilenceTimer();
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
      if (isNative && SpeechRecognitionPlugin) {
        SpeechRecognitionPlugin.stop().catch(() => {});
        if (listenerRef.current) {
          listenerRef.current.remove().catch(() => {});
          listenerRef.current = null;
        }
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, interimText, error, isSupported, start, stop, cancel };
}
