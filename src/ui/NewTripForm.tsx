'use client';

import { useState, type FormEvent } from 'react';
import type { NewTripInput } from '@/data/repo';
import styles from './NewTripForm.module.css';

type Key = 'name' | 'phone' | 'from' | 'to';
const FIELDS: { key: Key; label: string; error: string; type?: string }[] = [
  { key: 'name', label: 'Nombre del cliente', error: 'Falta el nombre del cliente' },
  { key: 'phone', label: 'Teléfono', error: 'Falta el teléfono', type: 'tel' },
  { key: 'from', label: 'Dirección de origen', error: 'Falta la dirección de origen' },
  { key: 'to', label: 'Dirección de destino', error: 'Falta la dirección de destino' },
];
const EMPTY: Record<Key, string> = { name: '', phone: '', from: '', to: '' };

export function NewTripForm({ onSubmit }: { onSubmit: (input: NewTripInput) => Promise<void> }) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const v = {
      name: values.name.trim(),
      phone: values.phone.trim(),
      from: values.from.trim(),
      to: values.to.trim(),
    };
    const next: Partial<Record<Key, string>> = {};
    for (const f of FIELDS) if (!v[f.key]) next[f.key] = f.error;
    setErrors(next);
    setFailed(false);
    if (Object.keys(next).length > 0) return;
    setSubmitting(true);
    try {
      await onSubmit({
        customerName: v.name,
        customerPhone: v.phone,
        pickupAddress: v.from,
        pickupLat: null,
        pickupLng: null,
        dropoffAddress: v.to,
      });
      setValues(EMPTY);
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form} aria-label="Nuevo pedido">
      <h2 className={styles.title}>Nuevo pedido</h2>
      {FIELDS.map((f) => (
        <div key={f.key} className={styles.field}>
          <label htmlFor={`trip-${f.key}`}>{f.label}</label>
          <input
            id={`trip-${f.key}`}
            type={f.type ?? 'text'}
            value={values[f.key]}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            aria-invalid={errors[f.key] ? true : undefined}
            aria-describedby={errors[f.key] ? `trip-${f.key}-error` : undefined}
          />
          {errors[f.key] && (
            <span id={`trip-${f.key}-error`} className={styles.error}>
              {errors[f.key]}
            </span>
          )}
        </div>
      ))}
      {failed && (
        <p role="alert" className={styles.error}>
          No se pudo crear el pedido. Intenta de nuevo.
        </p>
      )}
      <button type="submit" disabled={submitting} className={styles.button}>
        {submitting ? 'Creando…' : 'Crear pedido'}
      </button>
    </form>
  );
}
