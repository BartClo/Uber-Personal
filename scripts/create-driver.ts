/**
 * Crea la cuenta de un taxista y la vincula a su fila en drivers.
 *
 * Variables: SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY y DRIVER_PASSWORD.
 * Uso: npm run create-driver -- --email a@b.c --name "Carlos Rojas" --taxi 07 --phone "+56 9 5555 0100"
 */
import { createClient } from '@supabase/supabase-js';
import { createDriver, parseArgs, type DriverAdmin } from './createDriver';

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Faltan SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  }
  const input = parseArgs(process.argv.slice(2), process.env);
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const admin: DriverAdmin = {
    async createUser(email, password) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: 'driver' },
      });
      if (error) throw new Error(`No se pudo crear el usuario: ${error.message}`);
      return { id: data.user.id };
    },
    async deleteUser(id) {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) console.error(`No se pudo borrar el usuario ${id}: ${error.message}`);
    },
    async findDriversByTaxi(taxiNumber) {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, user_id')
        .eq('taxi_number', taxiNumber);
      if (error) throw new Error(error.message);
      return data as Array<{ id: string; user_id: string | null }>;
    },
    async insertDriver(row) {
      const { data, error } = await supabase.from('drivers').insert(row).select('id').single();
      if (error) throw new Error(error.message);
      return data as { id: string };
    },
    async updateDriver(id, patch) {
      const { error } = await supabase.from('drivers').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
    },
  };

  const res = await createDriver(admin, input);
  console.log(
    `Taxista ${input.taxiNumber} ${res.linked ? 'vinculado a su fila existente' : 'creado'}. ` +
      `Usuario ${res.userId}, fila ${res.driverId}.`,
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
