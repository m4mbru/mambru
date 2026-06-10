import { writable, derived } from 'svelte/store';

// ── Types ─────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  created: number;
  updated: number;
}

export interface ConversationState {
  conversations: Conversation[];
  activeId: string | null;
  streaming: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────

let nextId = 1;
function uid(): string {
  return `msg_${Date.now()}_${nextId++}`;
}

function convId(): string {
  return `conv_${Date.now()}_${nextId++}`;
}

function createConversation(title = 'New conversation'): Conversation {
  const now = Date.now();
  return {
    id: convId(),
    title,
    messages: [],
    created: now,
    updated: now,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────

function createConversationStore() {
  const { subscribe, set, update } = writable<ConversationState>({
    conversations: [],
    activeId: null,
    streaming: false,
  });

  /** Derived store: the currently active conversation object. */
  const active = derived({ subscribe }, ($state) => {
    if (!$state.activeId) return null;
    return $state.conversations.find((c) => c.id === $state.activeId) ?? null;
  });

  return {
    subscribe,
    active,

    /** Initialise a blank conversation (or restore from history). */
    init(conversations: Conversation[] = [], activeId: string | null = null) {
      if (conversations.length === 0) {
        const fresh = createConversation();
        set({ conversations: [fresh], activeId: fresh.id, streaming: false });
      } else {
        set({ conversations, activeId, streaming: false });
      }
    },

    /** Create a new conversation and switch to it. */
    newConversation() {
      update((state) => {
        const fresh = createConversation();
        return {
          ...state,
          conversations: [...state.conversations, fresh],
          activeId: fresh.id,
        };
      });
    },

    /** Switch to a different conversation by ID. */
    switchConversation(id: string) {
      update((state) => ({
        ...state,
        activeId: id,
      }));
    },

    /** Append a message to the active conversation. */
    appendMessage(msg: Partial<Message> & { role: Message['role']; content: string }) {
      update((state) => {
        const message: Message = {
          id: msg.id ?? uid(),
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp ?? Date.now(),
        };
        return {
          ...state,
          conversations: state.conversations.map((c) =>
            c.id === state.activeId
              ? { ...c, messages: [...c.messages, message], updated: Date.now() }
              : c,
          ),
        };
      });
    },

    /**
     * Append a token to the last assistant message (for streaming).
     * Creates a new assistant message if none exists or the last message is not from the assistant.
     */
    appendToken(token: string) {
      update((state) => {
        return {
          ...state,
          conversations: state.conversations.map((c) => {
            if (c.id !== state.activeId) return c;
            const msgs = [...c.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === 'assistant') {
              msgs[msgs.length - 1] = { ...last, content: last.content + token };
            } else {
              msgs.push({
                id: uid(),
                role: 'assistant',
                content: token,
                timestamp: Date.now(),
              });
            }
            return { ...c, messages: msgs, updated: Date.now() };
          }),
        };
      });
    },

    /** Remove the last assistant message (used on stream cancellation). */
    discardPartialMessage() {
      update((state) => {
        return {
          ...state,
          conversations: state.conversations.map((c) => {
            if (c.id !== state.activeId) return c;
            const msgs = [...c.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === 'assistant') {
              msgs.pop();
            }
            return { ...c, messages: msgs, updated: Date.now() };
          }),
        };
      });
    },

    /** Set streaming flag. */
    setStreaming(streaming: boolean) {
      update((state) => ({ ...state, streaming }));
    },

    /** Rename the active conversation. */
    renameConversation(title: string) {
      update((state) => ({
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === state.activeId ? { ...c, title, updated: Date.now() } : c,
        ),
      }));
    },

    /** Delete a conversation by ID. */
    deleteConversation(id: string) {
      update((state) => {
        const filtered = state.conversations.filter((c) => c.id !== id);
        const newActive =
          state.activeId === id
            ? filtered.length > 0
              ? filtered[filtered.length - 1].id
              : null
            : state.activeId;
        return { ...state, conversations: filtered, activeId: newActive };
      });
    },
  };
}

export const conversation = createConversationStore();
