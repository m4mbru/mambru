import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ModelProgressPayload {
  name: string;
  bytes: number;
  total: number;
}

export interface ModelDonePayload {
  name: string;
  success: boolean;
}

/**
 * Model state as serialised by the Rust backend.
 * - `"Missing"` — model files not found on disk
 * - `"Downloading"` — not used directly; progress is tracked via events
 * - `"Ready"` — model files are present
 * - `{ Failed: string }` — download / extraction failed
 */
export type ModelState = 'Missing' | 'Downloading' | 'Ready' | { Failed: string };

export type ModelKind = 'Whisper' | 'Piper';

// ── IPC wrappers ──────────────────────────────────────────────────────────

/**
 * Check which models are already present on disk.
 * @returns A map of ModelKind → ModelState (e.g. `{ Whisper: "Ready", Piper: "Missing" }`)
 */
export async function checkModels(): Promise<Record<string, ModelState>> {
  return invoke('check_models');
}

/**
 * Start downloading the given model in the background.
 * Progress is reported via `listenForModelProgress` / `listenForModelDone`.
 */
export async function startDownload(kind: ModelKind): Promise<void> {
  return invoke('start_download', { kind });
}

// ── Event listeners ───────────────────────────────────────────────────────

/**
 * Listen for model download progress updates.
 * Returns an `UnlistenFn` to stop listening.
 */
export function listenForModelProgress(
  callback: (p: ModelProgressPayload) => void,
): Promise<UnlistenFn> {
  return listen<ModelProgressPayload>('model:progress', (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for model download completion (success or failure).
 * Returns an `UnlistenFn` to stop listening.
 */
export function listenForModelDone(
  callback: (p: ModelDonePayload) => void,
): Promise<UnlistenFn> {
  return listen<ModelDonePayload>('model:done', (event) => {
    callback(event.payload);
  });
}
