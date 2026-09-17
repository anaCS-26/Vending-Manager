import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { entryKeyNav } from '@/lib/entry-keys';

function Grid({ enter = true }: { enter?: boolean }) {
  return (
    <div data-entry-group>
      <input aria-label="a" data-entry defaultValue="1" onKeyDown={e => entryKeyNav(e, { enter })} />
      <button>stepper</button>
      <input aria-label="price" defaultValue="9" onKeyDown={e => entryKeyNav(e, { enter })} />
      <input aria-label="b" data-entry defaultValue="2" onKeyDown={e => entryKeyNav(e, { enter })} />
      <input aria-label="off" data-entry disabled defaultValue="3" />
      <input aria-label="c" data-entry defaultValue="4" onKeyDown={e => entryKeyNav(e, { enter })} />
    </div>
  );
}

describe('entryKeyNav', () => {
  it('Enter skips buttons and unmarked fields and lands on the next entry field', () => {
    render(<Grid />);
    screen.getByLabelText('a').focus();
    fireEvent.keyDown(screen.getByLabelText('a'), { key: 'Enter' });
    expect(document.activeElement).toBe(screen.getByLabelText('b'));
  });

  it('skips disabled fields', () => {
    render(<Grid />);
    screen.getByLabelText('b').focus();
    fireEvent.keyDown(screen.getByLabelText('b'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByLabelText('c'));
  });

  it('Shift+Enter and ArrowUp go back', () => {
    render(<Grid />);
    screen.getByLabelText('c').focus();
    fireEvent.keyDown(screen.getByLabelText('c'), { key: 'Enter', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByLabelText('b'));
    fireEvent.keyDown(screen.getByLabelText('b'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByLabelText('a'));
  });

  it('stays put at the end of the run', () => {
    render(<Grid />);
    screen.getByLabelText('c').focus();
    fireEvent.keyDown(screen.getByLabelText('c'), { key: 'Enter' });
    expect(document.activeElement).toBe(screen.getByLabelText('c'));
  });

  it('selects the target so typing replaces the old number', () => {
    render(<Grid />);
    screen.getByLabelText('a').focus();
    fireEvent.keyDown(screen.getByLabelText('a'), { key: 'Enter' });
    const b = screen.getByLabelText('b') as HTMLInputElement;
    expect([b.selectionStart, b.selectionEnd]).toEqual([0, 1]);
  });

  it('leaves Enter to the caller when enter is false, but still walks with arrows', () => {
    render(<Grid enter={false} />);
    screen.getByLabelText('a').focus();
    fireEvent.keyDown(screen.getByLabelText('a'), { key: 'Enter' });
    expect(document.activeElement).toBe(screen.getByLabelText('a'));
    fireEvent.keyDown(screen.getByLabelText('a'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByLabelText('b'));
  });
});
