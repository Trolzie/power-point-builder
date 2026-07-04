import { useCallback, useEffect, useState } from 'react';
import type { ProgressMap, TrapProgress } from '../types';

const STORAGE_KEY = 'london-trap-trainer:progress:v1';

const EMPTY: TrapProgress = { completed: false, attempts: 0 };

function readStore(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as ProgressMap) : {};
  } catch {
    // Corrupt/blocked storage: start fresh rather than crash.
    return {};
  }
}

function writeStore(map: ProgressMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage full or blocked (e.g. private mode) — progress just won't persist */
  }
}

/**
 * Per-trap progress in localStorage: how many times each trap was started
 * (`attempts`) and whether it's ever been completed. Returns helpers to bump
 * those counters plus the live map for the UI.
 */
export function useProgress() {
  const [progress, setProgress] = useState<ProgressMap>(() => readStore());

  useEffect(() => {
    writeStore(progress);
  }, [progress]);

  const get = useCallback(
    (trapId: string): TrapProgress => progress[trapId] ?? EMPTY,
    [progress],
  );

  const recordAttempt = useCallback((trapId: string) => {
    setProgress((prev) => {
      const cur = prev[trapId] ?? EMPTY;
      return { ...prev, [trapId]: { ...cur, attempts: cur.attempts + 1 } };
    });
  }, []);

  const recordCompletion = useCallback((trapId: string) => {
    setProgress((prev) => {
      const cur = prev[trapId] ?? EMPTY;
      return {
        ...prev,
        [trapId]: { ...cur, completed: true, lastCompletedAt: Date.now() },
      };
    });
  }, []);

  const reset = useCallback(() => setProgress({}), []);

  return { progress, get, recordAttempt, recordCompletion, reset };
}
