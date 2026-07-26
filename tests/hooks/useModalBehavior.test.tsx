import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useModalBehavior } from '@/hooks/useModalBehavior';

/**
 * Behaviour contract for the modal hook. These are the guarantees the ten
 * adopting modals rely on; they're easy to regress silently because nothing
 * about them is visible in a screenshot.
 */

function Harness({
    isOpen = true,
    onClose = () => { },
    closeOnEscape,
    withButtons = true,
}: {
    isOpen?: boolean;
    onClose?: () => void;
    closeOnEscape?: boolean;
    withButtons?: boolean;
}) {
    const { panelRef, dialogProps } = useModalBehavior({
        isOpen,
        onClose,
        closeOnEscape,
        labelledBy: 'title',
    });
    if (!isOpen) return null;
    return (
        <div ref={panelRef} {...dialogProps} data-testid="panel">
            <h2 id="title">Dialog title</h2>
            {withButtons && (
                <>
                    <button>first</button>
                    <button>last</button>
                </>
            )}
        </div>
    );
}

beforeEach(() => {
    document.body.style.overflow = '';
});

describe('useModalBehavior', () => {
    it('marks the panel as a modal dialog labelled by its heading', () => {
        render(<Harness />);
        const panel = screen.getByTestId('panel');
        expect(panel).toHaveAttribute('role', 'dialog');
        expect(panel).toHaveAttribute('aria-modal', 'true');
        expect(panel).toHaveAttribute('aria-labelledby', 'title');
    });

    it('closes on Escape by default', () => {
        const onClose = vi.fn();
        render(<Harness onClose={onClose} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close on Escape when closeOnEscape is false', () => {
        // The data-entry modals (calibration, cost correction, template editor)
        // opt out so a stray Escape can't bin dozens of typed lines.
        const onClose = vi.fn();
        render(<Harness onClose={onClose} closeOnEscape={false} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('does not fire onClose for other keys', () => {
        const onClose = vi.fn();
        render(<Harness onClose={onClose} />);
        fireEvent.keyDown(document, { key: 'Enter' });
        fireEvent.keyDown(document, { key: 'a' });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('locks body scroll while open and restores it on close', () => {
        const { rerender } = render(<Harness isOpen />);
        expect(document.body.style.overflow).toBe('hidden');
        rerender(<Harness isOpen={false} />);
        expect(document.body.style.overflow).toBe('');
    });

    it('keeps the body locked until the last stacked modal closes', () => {
        // ConfirmModal opens on top of the audit modals — the inner one closing
        // must not unlock scrolling for the one still open behind it.
        const { rerender } = render(
            <>
                <Harness isOpen />
                <Harness isOpen />
            </>,
        );
        expect(document.body.style.overflow).toBe('hidden');

        rerender(
            <>
                <Harness isOpen />
                <Harness isOpen={false} />
            </>,
        );
        expect(document.body.style.overflow).toBe('hidden');

        rerender(
            <>
                <Harness isOpen={false} />
                <Harness isOpen={false} />
            </>,
        );
        expect(document.body.style.overflow).toBe('');
    });

    it('wraps Tab from the last focusable back to the first', () => {
        render(<Harness />);
        const [first, last] = screen.getAllByRole('button');
        last.focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(document.activeElement).toBe(first);
    });

    it('wraps Shift+Tab from the first focusable back to the last', () => {
        render(<Harness />);
        const [first, last] = screen.getAllByRole('button');
        first.focus();
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(last);
    });

    it('holds focus on the panel when it contains nothing focusable', () => {
        render(<Harness withButtons={false} />);
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(document.activeElement).toBe(screen.getByTestId('panel'));
    });

    it('restores focus to the trigger after closing', async () => {
        const trigger = document.createElement('button');
        document.body.appendChild(trigger);
        trigger.focus();
        expect(document.activeElement).toBe(trigger);

        const { rerender } = render(<Harness isOpen />);
        // Initial focus moves into the dialog on the next frame.
        await act(async () => {
            await new Promise((r) => requestAnimationFrame(() => r(null)));
        });
        expect(trigger).not.toBe(document.activeElement);

        rerender(<Harness isOpen={false} />);
        expect(document.activeElement).toBe(trigger);

        trigger.remove();
    });
});
