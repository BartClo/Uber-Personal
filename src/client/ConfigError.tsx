import styles from './Client.module.css';

export function ConfigError({ message }: { message: string }) {
  return (
    <main className={styles.configError}>
      <h1>Despacho</h1>
      <p role="alert">
        Error de configuración: no se puede conectar con Supabase. {message}. Copia .env.example a
        .env.local y completa los valores.
      </p>
    </main>
  );
}
