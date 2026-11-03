import type { ConnectionState } from '@/data/repo';
import styles from './Dashboard.module.css';

/** Permanent live region; only the text changes so screen readers announce it. */
export function ConnectionBanner({ state }: { state: ConnectionState }) {
  const reconnecting = state === 'reconnecting';
  return (
    <p role="status" className={reconnecting ? styles.banner : styles.bannerEmpty}>
      {reconnecting ? 'Reconectando…' : null}
    </p>
  );
}
