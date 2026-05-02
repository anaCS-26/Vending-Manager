import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AssignmentAckBanner } from '@/components/AssignmentAckBanner';

vi.mock('@/actions/driver-stock', () => ({
  acknowledgeAssignment: vi.fn(async () => ({ success: true })),
  denyAssignment: vi.fn(async () => ({ success: true })),
}));

import { acknowledgeAssignment, denyAssignment } from '@/actions/driver-stock';

const pending = [
  { id: 1, itemId: 10, quantity: 5, assigned_at: new Date('2026-05-02T10:00:00Z'), notes: null, item: { id: 10, name: 'Cola' } },
  { id: 2, itemId: 11, quantity: 3, assigned_at: new Date('2026-05-02T10:00:00Z'), notes: 'extra', item: { id: 11, name: 'Chips' } },
];

describe('AssignmentAckBanner', () => {
  it('renders nothing when there are no pending assignments', () => {
    const { container } = render(<AssignmentAckBanner pending={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the total units and item lines', () => {
    render(<AssignmentAckBanner pending={pending} />);
    expect(screen.getByText('+8')).toBeInTheDocument(); // 5 + 3
    expect(screen.getByText('Cola')).toBeInTheDocument();
    expect(screen.getByText('Chips')).toBeInTheDocument();
  });

  it('"Okay, Got It" calls acknowledgeAssignment for each pending row', async () => {
    render(<AssignmentAckBanner pending={pending} />);
    fireEvent.click(screen.getByText(/Okay, Got It/));
    await waitFor(() => {
      expect(acknowledgeAssignment).toHaveBeenCalledWith(1);
      expect(acknowledgeAssignment).toHaveBeenCalledWith(2);
    });
  });

  it('dispute mode submit calls denyAssignment per row', async () => {
    render(<AssignmentAckBanner pending={pending} />);
    fireEvent.click(screen.getByText(/Wait, the count is wrong/));
    fireEvent.click(screen.getByText(/Deny Assignment/));
    await waitFor(() => {
      expect(denyAssignment).toHaveBeenCalledWith(1);
      expect(denyAssignment).toHaveBeenCalledWith(2);
    });
  });
});
