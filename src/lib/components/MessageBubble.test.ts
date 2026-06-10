import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import MessageBubble from './MessageBubble.svelte';

describe('MessageBubble', () => {
  it('renders a user message', () => {
    const { container } = render(MessageBubble, {
      props: {
        message: {
          id: 'msg-1',
          role: 'user',
          content: 'Hello Mambru!',
          timestamp: Date.now(),
        },
        isStreaming: false,
      },
    });

    expect(container.textContent).toContain('Hello Mambru!');
    expect(container.querySelector('.user')).toBeTruthy();
  });

  it('renders an assistant message', () => {
    const { container } = render(MessageBubble, {
      props: {
        message: {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hola, che! How can I help?',
          timestamp: Date.now(),
        },
        isStreaming: false,
      },
    });

    expect(container.textContent).toContain('Hola, che! How can I help?');
    expect(container.querySelector('.assistant')).toBeTruthy();
  });

  it('shows streaming cursor when isStreaming is true', () => {
    const { container } = render(MessageBubble, {
      props: {
        message: {
          id: 'msg-3',
          role: 'assistant',
          content: 'Thinking...',
          timestamp: Date.now(),
        },
        isStreaming: true,
      },
    });

    // The streaming cursor element should be present
    const cursor = container.querySelector('.cursor');
    expect(cursor).toBeTruthy();
  });

  it('does not show streaming cursor when not streaming', () => {
    const { container } = render(MessageBubble, {
      props: {
        message: {
          id: 'msg-4',
          role: 'assistant',
          content: 'Done!',
          timestamp: Date.now(),
        },
        isStreaming: false,
      },
    });

    const cursor = container.querySelector('.cursor');
    expect(cursor).toBeNull();
  });

  it('renders markdown content for assistant messages', () => {
    const { container } = render(MessageBubble, {
      props: {
        message: {
          id: 'msg-5',
          role: 'assistant',
          content: '**bold text** and `code`',
          timestamp: Date.now(),
        },
        isStreaming: false,
      },
    });

    // Markdown should be rendered into HTML
    const markdown = container.querySelector('.markdown-content');
    expect(markdown).toBeTruthy();
    // The bold text should be rendered as <strong>
    expect(markdown!.innerHTML).toContain('<strong>');
  });

  it('renders user role label', () => {
    const { container } = render(MessageBubble, {
      props: {
        message: {
          id: 'msg-6',
          role: 'user',
          content: 'Hi',
          timestamp: Date.now(),
        },
        isStreaming: false,
      },
    });

    expect(container.textContent).toContain('You');
  });

  it('renders assistant role label', () => {
    const { container } = render(MessageBubble, {
      props: {
        message: {
          id: 'msg-7',
          role: 'assistant',
          content: 'Hi',
          timestamp: Date.now(),
        },
        isStreaming: false,
      },
    });

    expect(container.textContent).toContain('Mambru');
  });
});
