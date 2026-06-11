import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ── Types ─────────────────────────────────────────────────────────────────

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export type TokenCallback = (token: string) => void;
export type DoneCallback = (fullResponse: string) => void;
export type ErrorCallback = (error: string) => void;

// ── IPC wrappers ──────────────────────────────────────────────────────────

/**
 * Send a user message and stream the response via event listeners.
 *
 * The backend emits:
 * - `chat-token` — each content delta
 * - `chat-done` — when streaming completes (with full response)
 * - `chat-error` — on failure
 *
 * @param content     The user's message text.
 * @param conversationId  Optional conversation ID. If omitted a new one is created.
 * @returns The conversation ID (useful when a new one was auto-created).
 */
export async function sendMessage(
  content: string,
  conversationId?: string,
): Promise<string> {
  return invoke('send_message', {
    content,
    conversationId: conversationId ?? null,
  });
}

/** Fetch all persisted conversations (summaries). */
export async function getHistory(): Promise<ConversationSummary[]> {
  return invoke('get_history');
}

/** Create a new blank conversation and return its ID. */
export async function newConversation(): Promise<string> {
  return invoke('new_conversation');
}

/** Delete a conversation by ID. */
export async function deleteConversation(id: string): Promise<void> {
  return invoke('delete_conversation', { id });
}

// ── Event listeners ───────────────────────────────────────────────────────

/**
 * Listen for streaming tokens from the backend.
 * Returns an `UnlistenFn` to stop listening.
 */
export function listenForTokens(callback: TokenCallback): Promise<UnlistenFn> {
  return listen<string>('chat-token', (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for the stream-completed signal.
 * Returns an `UnlistenFn` to stop listening.
 */
export function listenForDone(callback: DoneCallback): Promise<UnlistenFn> {
  return listen<string>('chat-done', (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for streaming errors.
 * Returns an `UnlistenFn` to stop listening.
 */
export function listenForError(callback: ErrorCallback): Promise<UnlistenFn> {
  return listen<string>('chat-error', (event) => {
    callback(event.payload);
  });
}
