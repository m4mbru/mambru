import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ── Types ─────────────────────────────────────────────────────────────────

export interface Command {
  name: string;
  trigger: string;
  action: CommandAction;
  risk: 'Safe' | 'Medium' | 'Dangerous';
  confirm?: string | null;
  enabled: boolean;
}

export type CommandAction =
  | { type: 'exec'; command: string; args: string[] }
  | { type: 'script'; path: string; args: string[] }
  | { type: 'api'; url: string; method: string; body?: string | null };

export interface CommandMatch {
  command: Command;
  params: Record<string, string>;
  raw_input: string;
}

export interface ExecResult {
  output: string;
  exit_code: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ToolCall {
  Search?: { query: string };
  Execute?: {
    action: CommandAction;
    params: Record<string, string>;
    risk: 'Safe' | 'Medium' | 'Dangerous';
  };
  GetWeather?: { location: string };
  ReadFile?: { path: string };
}

export interface ToolResult {
  tool: string;
  success: boolean;
  output: string;
  data?: unknown;
}

export interface PendingExecutionEvent {
  id: string;
  command: string;
  trigger: string;
  params: Record<string, string>;
  risk: 'Safe' | 'Medium' | 'Dangerous';
  preview: string;
  confirm_message?: string | null;
}

export interface ConfirmResult {
  id: string;
  command: string;
  result: ExecResult;
}

// ── IPC wrappers ──────────────────────────────────────────────────────────

/**
 * List all user-defined custom commands.
 */
export async function getCommands(): Promise<Command[]> {
  return invoke('get_commands');
}

/**
 * Save a command (create or update).
 * If a command with the same name already exists, it is replaced.
 */
export async function saveCommand(cmd: Command): Promise<void> {
  return invoke('save_command', { cmd });
}

/**
 * Delete a command by name.
 */
export async function deleteCommand(name: string): Promise<void> {
  return invoke('delete_command', { name });
}

/**
 * Build a command suggestion from a natural language description.
 * The returned command is a best-effort suggestion — review before saving.
 */
export async function buildCommand(nl: string): Promise<Command> {
  return invoke('build_command', { nl });
}

/**
 * Confirm or reject a pending command execution (Medium / Dangerous).
 * Called when the user interacts with a confirmation or preview dialog.
 */
export async function confirmExecution(
  id: string,
  approved: boolean,
): Promise<ExecResult> {
  return invoke('confirm_execution', { id, approved });
}

/**
 * Perform a web search using the configured provider (Tavily / SerpAPI).
 */
export async function searchWeb(query: string): Promise<SearchResult[]> {
  return invoke('search_web', { query });
}

/**
 * Execute a ToolCall (used when the LLM decides to invoke a tool).
 * @param toolCall JSON-serialised ToolCall
 */
export async function executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
  return invoke('execute_tool_call', {
    toolCall: JSON.stringify(toolCall),
  });
}

// ── Event listeners ───────────────────────────────────────────────────────

/**
 * Listen for auto-executed Safe command results.
 * Called when a Safe command matches and executes automatically.
 */
export function listenForCmdAutoResult(
  callback: (payload: { command: string; result: ExecResult }) => void,
): Promise<UnlistenFn> {
  return listen<{ command: string; result: ExecResult }>(
    'cmd:auto-result',
    (event) => callback(event.payload),
  );
}

/**
 * Listen for Medium-risk command confirmation requests.
 * Shows a confirmation dialog when triggered.
 */
export function listenForCmdConfirm(
  callback: (payload: PendingExecutionEvent) => void,
): Promise<UnlistenFn> {
  return listen<PendingExecutionEvent>('cmd:confirm', (event) =>
    callback(event.payload),
  );
}

/**
 * Listen for Dangerous-risk command preview requests.
 * Shows a full preview and requires explicit approval.
 */
export function listenForCmdPreview(
  callback: (payload: PendingExecutionEvent) => void,
): Promise<UnlistenFn> {
  return listen<PendingExecutionEvent>('cmd:preview', (event) =>
    callback(event.payload),
  );
}

/**
 * Listen for command approval events (user approved).
 */
export function listenForCmdApproved(
  callback: (payload: ConfirmResult) => void,
): Promise<UnlistenFn> {
  return listen<ConfirmResult>('cmd:approved', (event) =>
    callback(event.payload),
  );
}

/**
 * Listen for command rejection events (user rejected).
 */
export function listenForCmdRejected(
  callback: (payload: { id: string; command: string }) => void,
): Promise<UnlistenFn> {
  return listen<{ id: string; command: string }>('cmd:rejected', (event) =>
    callback(event.payload),
  );
}
