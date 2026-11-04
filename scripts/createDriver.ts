/** Lógica de `npm run create-driver`, separada del arranque para poder probarla. */

export interface CreateDriverInput {
  email: string;
  password: string;
  name: string;
  taxiNumber: string;
  phone: string;
}

export interface DriverAdmin {
  /** Crea el usuario con app_metadata.role = 'driver'. */
  createUser(email: string, password: string): Promise<{ id: string }>;
  deleteUser(id: string): Promise<void>;
  findDriversByTaxi(taxiNumber: string): Promise<Array<{ id: string; user_id: string | null }>>;
  insertDriver(row: {
    name: string;
    taxi_number: string;
    phone: string;
    user_id: string;
  }): Promise<{ id: string }>;
  updateDriver(id: string, patch: { name: string; phone: string; user_id: string }): Promise<void>;
}

const REQUIRED = ['--email', '--name', '--taxi', '--phone'] as const;

export function parseArgs(
  argv: string[],
  env: Record<string, string | undefined>,
): CreateDriverInput {
  if (argv.includes('--password')) {
    throw new Error('La contraseña no va en los argumentos: usa la variable DRIVER_PASSWORD.');
  }
  const value = (flag: (typeof REQUIRED)[number]): string => {
    const at = argv.indexOf(flag);
    const found = at === -1 ? undefined : argv[at + 1];
    if (!found) throw new Error(`Falta el argumento ${flag}. Requeridos: ${REQUIRED.join(' ')}`);
    return found;
  };
  const input = {
    email: value('--email'),
    name: value('--name'),
    taxiNumber: value('--taxi'),
    phone: value('--phone'),
  };
  const password = env.DRIVER_PASSWORD;
  if (!password) throw new Error('Falta la variable de entorno DRIVER_PASSWORD.');
  return { ...input, password };
}

export async function createDriver(
  admin: DriverAdmin,
  input: CreateDriverInput,
): Promise<{ userId: string; driverId: string; linked: boolean }> {
  const { email, password, name, taxiNumber, phone } = input;
  // Valida antes de crear el usuario, para no dejar cuentas huérfanas.
  const rows = await admin.findDriversByTaxi(taxiNumber);
  if (rows.length > 1) {
    throw new Error(`Hay ${rows.length} filas con el taxi ${taxiNumber}: resuélvelo a mano.`);
  }
  const existing = rows[0];
  if (existing?.user_id) throw new Error(`El taxi ${taxiNumber} ya tiene una cuenta vinculada.`);

  const user = await admin.createUser(email, password);
  try {
    if (existing) {
      await admin.updateDriver(existing.id, { name, phone, user_id: user.id });
      return { userId: user.id, driverId: existing.id, linked: true };
    }
    const row = { name, taxi_number: taxiNumber, phone, user_id: user.id };
    const created = await admin.insertDriver(row);
    return { userId: user.id, driverId: created.id, linked: false };
  } catch (e) {
    await admin.deleteUser(user.id);
    throw e;
  }
}
