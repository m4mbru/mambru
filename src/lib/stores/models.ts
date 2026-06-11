import { writable, derived } from 'svelte/store';
import { checkModels, startDownload, listenForModelProgress, listenForModelDone } from '../api/models';
import type { ModelKind, ModelProgressPayload } from '../api/models';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ModelState {
  kind: ModelKind;
  status: 'missing' | 'downloading' | 'ready' | 'failed';
  bytes?: number;
  total?: number;
  error?: string;
}

// ── Store ─────────────────────────────────────────────────────────────────

/**
 * Reactive model download state store.
 *
 * Each model (Whisper, Piper) has its own entry keyed by its ModelKind string.
 */
export const modelStates = writable<Record<string, ModelState>>({});

/** True when all known models are ready. */
export const allReady = derived(modelStates, ($s) => {
  const entries = Object.values($s);
  return entries.length > 0 && entries.every((m) => m.status === 'ready');
});

/** True when at least one model is missing. */
export const hasMissing = derived(modelStates, ($s) => {
  return Object.values($s).some((m) => m.status === 'missing');
});

/** True when any model is currently downloading. */
export const isDownloading = derived(modelStates, ($s) => {
  return Object.values($s).some((m) => m.status === 'downloading');
});

// ── Internal listener handles ─────────────────────────────────────────────

let unlistenProgress: (() => void) | null = null;
let unlistenDone: (() => void) | null = null;

// ── Actions ───────────────────────────────────────────────────────────────

/**
 * Initialise the store: check which models are on disk and register event
 * listeners for download progress / completion.
 */
export async function init(): Promise<void> {
  // Register event listeners
  unlistenProgress = await listenForModelProgress(onProgress);
  unlistenDone = await listenForModelDone(onDone);

  // Check current model state
  const result = await checkModels();
  const entries: Record<string, ModelState> = {};
  for (const [kind, state] of Object.entries(result)) {
    entries[kind] = {
      kind: kind as ModelKind,
      status: mapState(state),
    };
  }
  modelStates.set(entries);
}

/**
 * Start downloading a model.
 * The store will update reactively as progress events arrive.
 */
export async function downloadModel(kind: ModelKind): Promise<void> {
  modelStates.update((s) => ({
    ...s,
    [kind]: {
      ...s[kind],
      kind,
      status: 'downloading',
    },
  }));

  try {
    await startDownload(kind);
  } catch (err) {
    modelStates.update((s) => ({
      ...s,
      [kind]: {
        kind,
        status: 'failed',
        error: String(err),
      },
    }));
  }
}

/**
 * Teardown: unregister event listeners.
 * Call this in `onDestroy` if the store is used from a component lifecycle.
 */
export function destroy(): void {
  unlistenProgress?.();
  unlistenProgress = null;
  unlistenDone?.();
  unlistenDone = null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function mapState(state: string | { Failed: string }): ModelState['status'] {
  if (state === 'Ready') return 'ready';
  if (state === 'Missing') return 'missing';
  if (state === 'Downloading') return 'downloading';
  if (typeof state === 'object' && 'Failed' in state) return 'failed';
  return 'missing';
}

function onProgress(payload: ModelProgressPayload): void {
  modelStates.update((s) => ({
    ...s,
    [payload.name]: {
      kind: payload.name as ModelKind,
      status: 'downloading' as const,
      bytes: payload.bytes,
      total: payload.total,
    },
  }));
}

function onDone(payload: { name: string; success: boolean }): void {
  modelStates.update((s) => {
    const existing = s[payload.name];
    return {
      ...s,
      [payload.name]: {
        ...existing,
        kind: payload.name as ModelKind,
        status: payload.success ? ('ready' as const) : ('failed' as const),
        error: payload.success ? undefined : 'Download failed',
        bytes: undefined,
        total: undefined,
      },
    };
  });
}
