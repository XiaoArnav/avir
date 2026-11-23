import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { AccessibleDialog } from '@/components/ui/AccessibleDialog';

describe('AccessibleDialog Component (Step 17 & 21 / UX05, UX33, UX34)', () => {
  it('1. Renders with accessible dialog role, title, and aria-modal="true"', () => {
    const html = ReactDOMServer.renderToString(
      <AccessibleDialog
        isOpen={true}
        onClose={vi.fn()}
        title="Test Modal Title"
        description="Test modal description"
      >
        <p>Modal body content</p>
      </AccessibleDialog>
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="accessible-dialog-title"');
    expect(html).toContain('aria-describedby="accessible-dialog-desc"');
    expect(html).toContain('Test Modal Title');
    expect(html).toContain('Test modal description');
    expect(html).toContain('Modal body content');
  });

  it('2. Does not render into DOM when isOpen is false', () => {
    const html = ReactDOMServer.renderToString(
      <AccessibleDialog
        isOpen={false}
        onClose={vi.fn()}
        title="Closed Modal"
      >
        <p>Should not exist</p>
      </AccessibleDialog>
    );

    expect(html).toBe('');
  });

  it('3. Renders close button with aria-label="Close dialog"', () => {
    const html = ReactDOMServer.renderToString(
      <AccessibleDialog
        isOpen={true}
        onClose={vi.fn()}
        title="Button Close Test"
      >
        <p>Content</p>
      </AccessibleDialog>
    );

    expect(html).toContain('aria-label="Close dialog"');
    expect(html).toContain('button');
  });

  it('4. Applies custom maxWidthClassName when provided', () => {
    const html = ReactDOMServer.renderToString(
      <AccessibleDialog
        isOpen={true}
        onClose={vi.fn()}
        title="Width Test"
        maxWidthClassName="max-w-4xl"
      >
        <p>Wide Content</p>
      </AccessibleDialog>
    );

    expect(html).toContain('max-w-4xl');
  });
});
