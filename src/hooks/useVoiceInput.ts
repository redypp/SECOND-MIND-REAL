import { useState, useRef, useCallback, useEffect } from 'react';

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
  const isCommittingRef   = useRef(false); // guard against double-commit

  // Keep callback fresh without triggering restarts
  const onFinalRef = useRef(onFinalTranscript);
  useEffect(() => { onFinalRef.current = onFinalTranscript; }, [onFinalTranscript]);

  const SpeechRecognition =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  const isSupported = !!SpeechRecognition;

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

  const start = useCallback(() => {
    if (isActiveRef.current || isCommittingRef.current || !SpeechRecognition) return;

    setError(null);
    setInterimText('');
    finalTextRef.current = '';
    isCommittingRef.current = false;
    setState('requesting');

    const recognition = new SpeechRecognition();
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
      resetSilenceTimer(); // any speech activity resets the silence clock
    };

    recognition.onerror = (event: any) => {
      const { error: errCode } = event;
      if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
        isActiveRef.current = false;
        recognitionRef.current = null;
        clearSilenceTimer();
        setState('error');
        setError(
          'Microphone access denied. Please enable it in your browser or device settings and try again.',
        );
      } else if (errCode === 'no-speech' || errCode === 'aborted') {
        // Non-fatal — browser restarts on its own
      } else {
        console.warn('[useVoiceInput] SpeechRecognition error:', errCode);
      }
    };

    recognition.onend = () => {
      // Browser auto-stops on silence; restart if we're still supposed to be active
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
  }, [SpeechRecognition, resetSilenceTimer, clearSilenceTimer]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      clearSilenceTimer();
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, interimText, error, isSupported, start, stop, cancel };
}
