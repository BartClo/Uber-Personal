import type { ConnectionState } from '@/data/repo';
import styles from './Dashboard.module.css';

export function ConnectionBanner({ state }: { state: ConnectionState }) {
  if (state === 'connected') return null;
  return (
    <p role="status" className={styles.banner}>
      Reconectando…
    </p>
  );
}
