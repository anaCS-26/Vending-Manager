import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { DriverReturnSheet } from '@/components/DriverReturnSheet';

vi.mock('@/actions/driver-stock', () => ({
  submitDriverReturn: vi.fn(async () => ({ success: true, data: { returnIds: [1] } })),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { submitDriverReturn } from '@/actions/driver-stock';

const bag = [
  { id: 1, itemId: 10, quantity_on_hand: 5, item: { id: 10, name: 'Cola', sku: 'COLA' } },
];

describe('DriverReturnSheet', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<DriverReturnSheet bag={bag} open={false} onClose={() => {}} />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('shows empty state when bag is empty', () => {
    render(<DriverReturnSheet bag={[]} open onClose={() => {}} />);
    expect(screen.getByText(/bag is empty/i)).toBeInTheDocument();
  });

  it('disables submit when no lines are selected', () => {
    render(<DriverReturnSheet bag={bag} open onClose={() => {}} />);
    const submitBtn = screen.getByText(/Submit returns/).closest('button')!;
    expect(submitBtn).toBeDisabled();
  });

  it('happy path: pick a bag item and submit calls submitDriverReturn', async () => {
    const onClose = vi.fn();
    render(<DriverReturnSheet bag={bag} open onClose={onClose} />);
    fireEvent.click(screen.getByText('Cola')); // tap the bag-picker tile
    fireEvent.click(screen.getByText(/Submit returns/));
    await waitFor(() => {
      expect(submitDriverReturn).toHaveBeenCalledWith([
        expect.objectContaining({ itemId: 10, quantity: 1, reason: 'SURPLUS' }),
      ]);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
