// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

afterEach(cleanup);

function Dialog({ onClose = () => undefined }: { onClose?: () => void }) {
  return (
    <Modal open title="Sign in" closeLabel="Close" onClose={onClose}>
      <button type="button">Individual</button>
      <button type="button">Company</button>
      <input aria-label="Email" />
      <button type="submit">Continue</button>
    </Modal>
  );
}

describe('Modal focus', () => {
  it('focuses the first field even when buttons come before it', async () => {
    render(<Dialog />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Email')));
  });

  it('wraps Tab from the last element to the first', async () => {
    render(<Dialog />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Email')));
    screen.getByText('Continue').focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(document.activeElement).toBe(screen.getByLabelText('Close'));
  });

  it('pulls focus back inside when it has escaped the dialog', async () => {
    render(<Dialog />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Email')));
    (document.activeElement as HTMLElement).blur();

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('keeps focus where the user is when the parent re-renders with a new onClose', async () => {
    function Parent() {
      const [count, setCount] = useState(0);
      return (
        <Modal open title="T" closeLabel="Close" onClose={() => setCount(count + 1)}>
          <input aria-label="Email" />
          <input aria-label="Phone" onChange={() => setCount((c) => c + 1)} />
        </Modal>
      );
    }
    render(<Parent />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Email')));
    const phone = screen.getByLabelText('Phone');
    phone.focus();

    fireEvent.change(phone, { target: { value: '0' } });
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    expect(document.activeElement).toBe(phone);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
