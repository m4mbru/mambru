import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { conversation } from './conversation';

describe('conversation store', () => {
  beforeEach(() => {
    // Reset to empty state before each test
    conversation.init([], null);
  });

  it('creates a default conversation on init with no args', () => {
    const state = get(conversation);
    expect(state.conversations).toHaveLength(1);
    expect(state.activeId).toBe(state.conversations[0].id);
    expect(state.streaming).toBe(false);
  });

  it('creates a fresh conversation on init with no args', () => {
    conversation.init();
    const state = get(conversation);
    expect(state.conversations).toHaveLength(1);
    expect(state.activeId).toBe(state.conversations[0].id);
    expect(state.conversations[0].title).toBe('New conversation');
  });

  it('initialises with existing conversations', () => {
    const existing = [{
      id: 'conv-1',
      title: 'Test',
      messages: [],
      created: 1000,
      updated: 1000,
    }];
    conversation.init(existing, 'conv-1');
    const state = get(conversation);
    expect(state.conversations).toHaveLength(1);
    expect(state.activeId).toBe('conv-1');
  });

  it('creates a new conversation and switches to it', () => {
    conversation.init();
    const initialId = get(conversation).activeId;

    conversation.newConversation();
    const state = get(conversation);
    expect(state.conversations).toHaveLength(2);
    expect(state.activeId).not.toBe(initialId);
  });

  it('switches between conversations', () => {
    conversation.init();
    conversation.newConversation();
    const ids = get(conversation).conversations.map(c => c.id);

    conversation.switchConversation(ids[0]);
    expect(get(conversation).activeId).toBe(ids[0]);

    conversation.switchConversation(ids[1]);
    expect(get(conversation).activeId).toBe(ids[1]);
  });

  it('appends messages to the active conversation', () => {
    conversation.init();
    const activeId = get(conversation).activeId!;

    conversation.appendMessage({ role: 'user', content: 'Hello' });
    conversation.appendMessage({ role: 'assistant', content: 'Hi there!' });

    const state = get(conversation);
    const active = state.conversations.find(c => c.id === activeId)!;
    expect(active.messages).toHaveLength(2);
    expect(active.messages[0].content).toBe('Hello');
    expect(active.messages[1].content).toBe('Hi there!');
  });

  it('assigns unique IDs to messages', () => {
    conversation.init();
    conversation.appendMessage({ role: 'user', content: 'A' });
    conversation.appendMessage({ role: 'user', content: 'B' });

    const state = get(conversation);
    const msgs = state.conversations[0].messages;
    expect(msgs[0].id).not.toBe(msgs[1].id);
  });

  it('sets timestamps on messages', () => {
    conversation.init();
    const before = Date.now();
    conversation.appendMessage({ role: 'user', content: 'test' });
    const after = Date.now();

    const msg = get(conversation).conversations[0].messages[0];
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
    expect(msg.timestamp).toBeLessThanOrEqual(after);
  });

  it('appends tokens to the last assistant message', () => {
    conversation.init();
    conversation.appendMessage({ role: 'user', content: 'Hello' });

    // Append first user message, then start streaming
    conversation.appendToken('Hello');
    conversation.appendToken(' ');
    conversation.appendToken('World');

    const state = get(conversation);
    const msgs = state.conversations[0].messages;
    // Should be: user, then assistant with accumulated tokens
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].content).toBe('Hello World');
  });

  it('appends first token as new assistant message when last is not assistant', () => {
    conversation.init();
    conversation.appendMessage({ role: 'user', content: 'Hi' });
    conversation.appendToken('First token');

    const msgs = get(conversation).conversations[0].messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].content).toBe('First token');
  });

  it('discards the last partial assistant message', () => {
    conversation.init();
    conversation.appendMessage({ role: 'user', content: 'Hi' });
    conversation.appendToken('Partial response...');
    expect(get(conversation).conversations[0].messages).toHaveLength(2);

    conversation.discardPartialMessage();
    const msgs = get(conversation).conversations[0].messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('user');
  });

  it('does not discard when last message is user', () => {
    conversation.init();
    conversation.appendMessage({ role: 'user', content: 'Hi' });

    conversation.discardPartialMessage();
    expect(get(conversation).conversations[0].messages).toHaveLength(1);
  });

  it('sets and clears the streaming flag', () => {
    expect(get(conversation).streaming).toBe(false);

    conversation.setStreaming(true);
    expect(get(conversation).streaming).toBe(true);

    conversation.setStreaming(false);
    expect(get(conversation).streaming).toBe(false);
  });

  it('renames the active conversation', () => {
    conversation.init();
    const id = get(conversation).activeId!;

    conversation.renameConversation('New Title');
    const conv = get(conversation).conversations.find(c => c.id === id)!;
    expect(conv.title).toBe('New Title');
  });

  it('deletes a conversation and switches to another', () => {
    conversation.init();
    conversation.newConversation();
    conversation.newConversation();

    const state = get(conversation);
    const ids = state.conversations.map(c => c.id);

    // Delete the active conversation
    conversation.deleteConversation(ids[2]);
    const afterState = get(conversation);
    expect(afterState.conversations).toHaveLength(2);
    // Should have switched to the last remaining conversation
    expect(afterState.conversations.some(c => c.id === ids[2])).toBe(false);
  });

  it('deleting the only conversation leaves empty state', () => {
    conversation.init();
    // This creates one conversation. Override to make just one.
    conversation.init([{
      id: 'only',
      title: 'Only',
      messages: [],
      created: 1,
      updated: 1,
    }], 'only');

    conversation.deleteConversation('only');
    const state = get(conversation);
    expect(state.conversations).toHaveLength(0);
    expect(state.activeId).toBeNull();
  });

  it('derived store `active` returns null when no conversations remain', () => {
    conversation.deleteConversation(get(conversation).conversations[0].id);
    const active = get(conversation.active);
    expect(active).toBeNull();
  });

  it('derived store `active` returns the active conversation object', () => {
    conversation.init();
    const state = get(conversation);
    const active = get(conversation.active);
    expect(active).not.toBeNull();
    expect(active!.id).toBe(state.activeId);
  });

  it('derived store `active` updates when switching conversations', () => {
    conversation.init();
    const firstId = get(conversation).activeId;
    conversation.newConversation();

    const active = get(conversation.active);
    expect(active!.id).not.toBe(firstId);
  });
});
