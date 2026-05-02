import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import DriverSettingsForm from '@/components/DriverSettingsForm';

vi.mock('@/actions/auth', () => ({
  changeDriverPin: vi.fn(async () => ({ success: true, data: undefined })),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { changeDriverPin } from '@/actions/auth';

function fillFields(current: string, next: string, confirm: string) {
  const inputs = screen.getAllByPlaceholderText('••••') as HTMLInputElement[];
  fireEvent.change(inputs[0], { target: { value: current } });
  fireEvent.change(inputs[1], { target: { value: next } });
  fireEvent.change(inputs[2], { target: { value: confirm } });
}

describe('DriverSettingsForm', () => {
  it('errors when fields are empty', () => {
    render(<DriverSettingsForm driverName="Ali" />);
    fireEvent.click(screen.getByText(/Update PIN/));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/required/i));
  });

  it('errors when new PIN does not match confirmation', () => {
    render(<DriverSettingsForm driverName="Ali" />);
    fillFields('1234', '5678', '9999');
    fireEvent.click(screen.getByText(/Update PIN/));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/do not match/i));
  });

  it('strips non-digits from input', () => {
    render(<DriverSettingsForm driverName="Ali" />);
    const input = screen.getAllByPlaceholderText('••••')[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12ab34' } });
    expect(input.value).toBe('1234');
  });

  it('happy path calls changeDriverPin with current+new', async () => {
    render(<DriverSettingsForm driverName="Ali" />);
    fillFields('1234', '5678', '5678');
    fireEvent.click(screen.getByText(/Update PIN/));
    await waitFor(() => {
      expect(changeDriverPin).toHaveBeenCalledWith('1234', '5678');
      expect(toast.success).toHaveBeenCalled();
    });
  });
});
