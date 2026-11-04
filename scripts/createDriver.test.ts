// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDriver, parseArgs, type DriverAdmin } from './createDriver';

const input = {
  email: 'carlos@example.test',
  password: 'secreto-largo',
  name: 'Carlos Rojas',
  taxiNumber: '07',
  phone: '555',
};

function fakeAdmin(existing: Array<{ id: string; user_id: string | null }> = []) {
  const admin: DriverAdmin = {
    createUser: vi.fn(() => Promise.resolve({ id: 'user-1' })),
    deleteUser: vi.fn(() => Promise.resolve()),
    findDriversByTaxi: vi.fn(() => Promise.resolve(existing)),
    insertDriver: vi.fn(() => Promise.resolve({ id: 'driver-new' })),
    updateDriver: vi.fn(() => Promise.resolve()),
  };
  return admin;
}

describe('parseArgs', () => {
  it('lee los argumentos y toma la contraseña solo del entorno', () => {
    const argv = ['--email', 'a@b.c', '--name', 'Ana Díaz', '--taxi', '07', '--phone', '555'];
    expect(parseArgs(argv, { DRIVER_PASSWORD: 'pw-larga' })).toEqual({
      email: 'a@b.c',
      password: 'pw-larga',
      name: 'Ana Díaz',
      taxiNumber: '07',
      phone: '555',
    });
  });

  it('falla si falta un argumento o DRIVER_PASSWORD', () => {
    expect(() => parseArgs(['--email', 'a@b.c'], { DRIVER_PASSWORD: 'x' })).toThrow(/--name/);
    const argv = ['--email', 'a', '--name', 'b', '--taxi', 'c', '--phone', 'd'];
    expect(() => parseArgs(argv, {})).toThrow(/DRIVER_PASSWORD/);
  });

  it('rechaza una contraseña pasada por argumento', () => {
    expect(() => parseArgs(['--password', 'x'], { DRIVER_PASSWORD: 'x' })).toThrow(/DRIVER_PASSWORD/);
  });
});

describe('createDriver', () => {
  it('crea el usuario con rol driver y una fila nueva', async () => {
    const admin = fakeAdmin();
    expect(await createDriver(admin, input)).toEqual({
      userId: 'user-1',
      driverId: 'driver-new',
      linked: false,
    });
    expect(admin.createUser).toHaveBeenCalledWith(input.email, input.password);
    expect(admin.insertDriver).toHaveBeenCalledWith({
      name: input.name,
      taxi_number: '07',
      phone: '555',
      user_id: 'user-1',
    });
  });

  it('vincula la fila existente del taxi si está libre', async () => {
    const admin = fakeAdmin([{ id: 'd1', user_id: null }]);
    expect(await createDriver(admin, input)).toEqual({
      userId: 'user-1',
      driverId: 'd1',
      linked: true,
    });
    expect(admin.updateDriver).toHaveBeenCalledWith('d1', {
      name: input.name,
      phone: '555',
      user_id: 'user-1',
    });
    expect(admin.insertDriver).not.toHaveBeenCalled();
  });

  it.each([
    ['ya vinculado', [{ id: 'd1', user_id: 'otro' }]],
    ['ambiguo', [{ id: 'd1', user_id: null }, { id: 'd2', user_id: null }]],
  ])('taxi %s: no crea el usuario', async (_name, rows) => {
    const admin = fakeAdmin(rows);
    await expect(createDriver(admin, input)).rejects.toThrow(/07/);
    expect(admin.createUser).not.toHaveBeenCalled();
  });

  it('si falla la fila, borra el usuario recién creado', async () => {
    const admin = fakeAdmin();
    vi.mocked(admin.insertDriver).mockRejectedValueOnce(new Error('db'));
    await expect(createDriver(admin, input)).rejects.toThrow('db');
    expect(admin.deleteUser).toHaveBeenCalledWith('user-1');
  });
});
