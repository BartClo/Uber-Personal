'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Geocoder } from '@/data/geocoder';
import type { AddressSuggestion } from '@/domain/addressSuggestion';
import styles from './AddressField.module.css';

export interface Coords {
  lat: number;
  lng: number;
}

interface Props {
  id: string;
  label: string;
  value: string;
  /** coords es null siempre que el texto lo escribió la persona: texto y pin no pueden divergir. */
  onChange: (text: string, coords: Coords | null) => void;
  geocoder: Geocoder;
  error?: string;
  maxLength?: number;
  autoComplete?: string;
  /** Muestra "Ubicación encontrada" / "Sin ubicación exacta". Desactívalo si no se guardan coordenadas. */
  showHint?: boolean;
  className?: string;
}

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

export function AddressField({
  id,
  label,
  value,
  onChange,
  geocoder,
  error,
  maxLength,
  autoComplete,
  showHint = true,
  className,
}: Props) {
  const listId = useId();
  const [options, setOptions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Texto de la sugerencia elegida: hay ubicación solo mientras el texto siga siendo ese.
  const [picked, setPicked] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    controller.current?.abort();
    controller.current = null;
  };
  useEffect(() => cancel, []);

  const located = picked !== null && picked === value;

  function handleInput(text: string) {
    cancel();
    setPicked(null);
    setActive(-1);
    onChange(text, null);
    const q = text.trim();
    if (q.length < MIN_CHARS) {
      setOptions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(() => {
      const ctrl = new AbortController();
      controller.current = ctrl;
      geocoder.search(q, ctrl.signal).then(
        (found) => {
          if (ctrl.signal.aborted) return;
          setOptions(found);
          setActive(-1);
          setOpen(found.length > 0);
        },
        () => {
          // Sin geocodificador el texto libre sigue siendo válido.
          if (ctrl.signal.aborted) return;
          setOptions([]);
          setOpen(false);
        },
      );
    }, DEBOUNCE_MS);
  }

  function choose(s: AddressSuggestion) {
    cancel();
    setPicked(s.label);
    setOpen(false);
    setActive(-1);
    onChange(s.label, { lat: s.lat, lng: s.lng });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (options.length === 0) return;
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const n = options.length;
      setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    } else if (e.key === 'Enter') {
      const s = open ? options[active] : undefined;
      if (s) {
        e.preventDefault();
        choose(s);
      }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  }

  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const showHintNow = showHint && value.trim() !== '';
  const describedBy = [error ? errorId : null, showHintNow ? hintId : null].filter(Boolean).join(' ');
  const expanded = open && options.length > 0;

  return (
    <div className={`${styles.root} ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.control}>
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy || undefined}
          autoComplete={autoComplete ?? 'off'}
          maxLength={maxLength}
          value={value}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setOpen(false)}
        />
        <ul id={listId} role="listbox" aria-label={`Sugerencias: ${label}`} className={styles.list} hidden={!expanded}>
          {options.map((o, i) => (
            <li
              key={`${o.label}-${o.lat}-${o.lng}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`${styles.option} ${i === active ? styles.active : ''}`}
              // mousedown evita que el input pierda el foco antes del clic.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      </div>
      <span role="status" className={styles.srOnly}>
        {expanded ? `${options.length} sugerencias disponibles` : ''}
      </span>
      {showHintNow && (
        <span id={hintId} className={styles.hint}>
          {located ? '✓ Ubicación encontrada' : 'Sin ubicación exacta'}
        </span>
      )}
      {error && (
        <span id={errorId} className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}
