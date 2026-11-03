'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import styles from './AuthGate.module.css';

/** Minimal structural slice of the Supabase session we rely on. */
export interface AuthSession {
  user: { app_metadata: Record<string, unknown> };
}

/**
 * Only the auth methods AuthGate uses. `SupabaseClient` satisfies it
 * structurally, and tests can provide a small typed fake.
 */
export interface AuthClient {
  auth: {
    getSession(): Promise<{ data: { session: AuthSession | null } }>;
    onAuthStateChange(cb: (event: string, session: AuthSession | null) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
    signInWithPassword(credentials: { email: string; password: string }): Promise<{
      error: unknown;
    }>;
    signOut(): Promise<unknown>;
  };
}

type State = { kind: 'loading' } | { kind: 'ready'; session: AuthSession | null };

export function AuthGate({ client, children }: { client: AuthClient; children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    client.auth.getSession().then(
      ({ data }) => {
        if (active) setState({ kind: 'ready', session: data.session });
      },
      () => {
        if (active) setState({ kind: 'ready', session: null });
      },
    );
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ kind: 'ready', session });
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  if (state.kind === 'loading') {
    return (
      <p role="status" className={styles.center}>
        Cargando…
      </p>
    );
  }
  const { session } = state;
  if (!session) return <LoginForm client={client} />;
  if (session.user.app_metadata.role !== 'admin') {
    return (
      <main className={styles.center}>
        <p role="alert">Esta cuenta no tiene acceso de administrador</p>
        <button type="button" className={styles.button} onClick={() => void client.auth.signOut()}>
          Cerrar sesión
        </button>
      </main>
    );
  }
  return <>{children}</>;
}

function LoginForm({ client }: { client: AuthClient }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: err } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (err) setError('Correo o contraseña incorrectos');
    } catch {
      setError('No se pudo conectar. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.center}>
      <form onSubmit={handleSubmit} className={styles.form} aria-labelledby="login-title">
        <h1 id="login-title">Despacho</h1>
        <label htmlFor="login-email">Correo</label>
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="login-password">Contraseña</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <button type="submit" className={styles.button} disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
