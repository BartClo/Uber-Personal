import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthGate, type AuthClient, type AuthSession } from './AuthGate';

afterEach(cleanup);

const session = (role: string): AuthSession => ({ user: { app_metadata: { role } } });

function fakeClient(initial: AuthSession | null, opts: { loginOk?: boolean } = {}) {
  let listener: ((s: AuthSession | null) => void) | null = null;
  const unsubscribe = vi.fn();
  const signOut = vi.fn(() => {
    listener?.(null);
    return Promise.resolve({ error: null });
  });
  const client: AuthClient = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: initial } }),
      onAuthStateChange: (cb) => {
        listener = (s) => cb('SIGNED_IN', s);
        return { data: { subscription: { unsubscribe } } };
      },
      signInWithPassword: () => {
        if (opts.loginOk) {
          listener?.(session('admin'));
          return Promise.resolve({ error: null });
        }
        return Promise.resolve({ error: { message: 'Invalid' } });
      },
      signOut,
    },
  };
  return { client, unsubscribe, signOut };
}

describe('AuthGate', () => {
  it('sesión admin renderiza children', async () => {
    const { client } = fakeClient(session('admin'));
    render(<AuthGate client={client}><p>Panel</p></AuthGate>);
    expect(await screen.findByText('Panel')).toBeInTheDocument();
  });

  it('rol distinto de admin no renderiza children', async () => {
    const { client, signOut } = fakeClient(session('driver'));
    render(<AuthGate client={client}><p>Panel</p></AuthGate>);
    expect(
      await screen.findByText('Esta cuenta no tiene acceso de administrador'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Panel')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(signOut).toHaveBeenCalled();
  });

  it("role='driver' deja pasar a un taxista", async () => {
    const { client } = fakeClient(session('driver'));
    render(<AuthGate client={client} role="driver"><p>App</p></AuthGate>);
    expect(await screen.findByText('App')).toBeInTheDocument();
  });

  it.each(['admin', 'otro'])("role='driver' bloquea a una cuenta %s", async (role) => {
    const { client } = fakeClient(session(role));
    render(<AuthGate client={client} role="driver"><p>App</p></AuthGate>);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta cuenta no tiene acceso de taxista',
    );
    expect(screen.queryByText('App')).not.toBeInTheDocument();
  });

  it('sin sesión muestra login; error con credenciales malas', async () => {
    const { client } = fakeClient(null);
    render(<AuthGate client={client}><p>Panel</p></AuthGate>);
    await userEvent.type(await screen.findByLabelText('Correo'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
    expect(screen.queryByText('Panel')).not.toBeInTheDocument();
  });

  it('login correcto deja pasar y se desuscribe al desmontar', async () => {
    const { client, unsubscribe } = fakeClient(null, { loginOk: true });
    const { unmount } = render(<AuthGate client={client}><p>Panel</p></AuthGate>);
    await userEvent.type(await screen.findByLabelText('Correo'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Panel')).toBeInTheDocument();
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
