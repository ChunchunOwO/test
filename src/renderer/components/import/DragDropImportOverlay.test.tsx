// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { DragDropImportOverlay } from './DragDropImportOverlay';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const enterFileDrag = (): void => {
  fireEvent.dragEnter(window, {
    dataTransfer: {
      files: [],
      types: ['Files'],
    },
  });
};

describe('DragDropImportOverlay', () => {
  it.each(['Escape', 'Esc'])('dismisses the drag import overlay when %s is pressed', (key) => {
    const { container } = render(<DragDropImportOverlay onNotice={vi.fn()} />);

    enterFileDrag();
    expect(container.querySelector('.drag-import-overlay')).toBeTruthy();

    fireEvent.keyDown(window, { key });

    expect(container.querySelector('.drag-import-overlay')).toBeNull();
  });

  it('leaves file drags owned by the lyrics page to that page', () => {
    const { container } = render(
      <>
        <div data-file-drop-owner="lyrics">
          <span data-testid="lyrics-drop-target" />
        </div>
        <DragDropImportOverlay onNotice={vi.fn()} />
      </>,
    );

    fireEvent.dragEnter(container.querySelector('[data-testid="lyrics-drop-target"]') as Element, {
      dataTransfer: {
        files: [],
        types: ['Files'],
      },
    });

    expect(container.querySelector('.drag-import-overlay')).toBeNull();
  });
});
