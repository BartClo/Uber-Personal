'use client';

import { useRef, useState, type FormEvent } from 'react';
import {
  validateClientRequest,
  CLIENT_LIMITS,
  type ClientRequestErrors,
  type ClientRequestInput,
} from '@/domain/clientTrip';
import type { ClientRepo } from '@/data/clientRepo';
import styles from './Client.module.css';

interface Props {
  repo: ClientRepo;
  onSuccess: (token: string) => void;
}

const EMPTY: ClientRequestInput = { pickup: '', dropoff: '', name: '', phone: '' };

export function RequestForm({ repo, onSuccess }: Props) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<ClientRequestErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);

  const set = (k: keyof ClientRequestInput) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    setFormError(null);
    const v = validateClientRequest(values);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    inFlight.current = true;
    setSending(true);
    try {
      const r = await repo.requestTrip(v.value);
      if (r.ok) {
        onSuccess(r.token);
        return;
      }
      setFormError(
        r.error === 'too_many_requests'
          ? 'Ya tienes varios pedidos activos con este teléfono. Espera a que termine alguno.'
          : 'Revisa los datos del pedido e inténtalo de nuevo.',
      );
    } catch {
      setFormError('No pudimos enviar tu pedido. Revisa tu conexión e inténtalo de nuevo.');
    }
    inFlight.current = false;
    setSending(false);
  }

  const field = (
    k: keyof ClientRequestInput,
    label: string,
    max: number,
    extra: { type?: string; autoComplete?: string; inputMode?: 'tel' } = {},
  ) => {
    const err = errors[k];
    const id = `field-${k}`;
    return (
      <div className={styles.field}>
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          name={k}
          type={extra.type ?? 'text'}
          autoComplete={extra.autoComplete}
          inputMode={extra.inputMode}
          maxLength={max}
          value={values[k]}
          onChange={set(k)}
          aria-invalid={err ? 'true' : undefined}
          aria-describedby={err ? `${id}-error` : undefined}
        />
        {err ? (
          <p id={`${id}-error`} className={styles.error}>
            {err}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.brand}>Despacho</h1>
      <h2 className={styles.title}>Pide tu taxi</h2>
      <p className={styles.lead}>Un operador de la central asignará tu taxi.</p>
      <form className={styles.form} onSubmit={submit} noValidate>
        {field('pickup', 'Dónde te recogemos', CLIENT_LIMITS.address, {
          autoComplete: 'street-address',
        })}
        {field('dropoff', 'A dónde vas', CLIENT_LIMITS.address)}
        {field('name', 'Tu nombre', CLIENT_LIMITS.name, { autoComplete: 'name' })}
        {field('phone', 'Teléfono', CLIENT_LIMITS.phone, {
          type: 'tel',
          autoComplete: 'tel',
          inputMode: 'tel',
        })}
        {formError ? (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        ) : null}
        <button type="submit" className={styles.button} aria-disabled={sending}>
          {sending ? 'Enviando…' : 'Pedir taxi'}
        </button>
      </form>
    </main>
  );
}
