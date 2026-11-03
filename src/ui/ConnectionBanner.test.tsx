import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionBanner } from './ConnectionBanner';

afterEach(cleanup);

describe('ConnectionBanner', () => {
  it('sin texto cuando está conectado', () => {
    const { container } = render(<ConnectionBanner state="connected" />);
    expect(container.textContent).toBe('');
  });
  it('muestra "Reconectando…" con role=status', () => {
    render(<ConnectionBanner state="reconnecting" />);
    expect(screen.getByRole('status')).toHaveTextContent('Reconectando…');
  });
});
