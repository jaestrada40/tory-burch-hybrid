import { test, expect, Page } from '@playwright/test';
async function mockBLE(page: Page, mode = 'success') {
  await page.addInitScript(({ mode }) => {
    const batteryUUID = '00002a19-0000-1000-8000-00805f9b34fb';
    class Characteristic extends EventTarget {
      uuid = batteryUUID;
      properties = { read: true, notify: true, write: true };
      value = new DataView(new Uint8Array([73]).buffer);
      async readValue() { if (mode === 'read-error') throw new DOMException('Failed', 'NetworkError'); return this.value; }
      async startNotifications() { return this; }
      async stopNotifications() { return this; }
      async writeValue() { throw new Error('Writing must never be called'); }
    }
    const characteristic = new Characteristic();
    const service = { uuid: '0000180f-0000-1000-8000-00805f9b34fb', isPrimary: true, getCharacteristics: async () => [characteristic], getCharacteristic: async () => characteristic, getIncludedServices: async () => [] };
    const device = new EventTarget() as any;
    device.name = '<script>unsafe</script> Tory';
    device.gatt = {
      connected: false,
      async connect() { if (mode === 'connect-error') throw new DOMException('Failed', 'NetworkError'); this.connected = true; return this; },
      disconnect() { this.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); },
      async getPrimaryService() { if (mode === 'no-battery') throw new DOMException('Missing', 'NotFoundError'); return service; },
      async getPrimaryServices() { return [service]; }
    };
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { async requestDevice(options: unknown) { (window as any).requested = options; if (mode === 'cancel') throw new DOMException('Cancelled', 'NotFoundError'); return device; } } });
    (window as any).mockDevice = device;
    (window as any).emitBattery = () => { characteristic.value = new DataView(new Uint8Array([61]).buffer); characteristic.dispatchEvent(new Event('characteristicvaluechanged')); };
  }, { mode });
}
test('unsupported browser explains next step, sync is locked', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true }));
  await page.goto('/');
  await expect(page.locator('#message')).toContainText('Chrome o Edge');
  await expect(page.locator('#connect')).toBeDisabled();
  await expect(page.locator('#sync')).toBeDisabled();
});
test('real API flow, battery, inspection, notifications, export and disconnect', async ({ page }) => {
  await mockBLE(page); await page.goto('/');
  await page.locator('#connect').click();
  await expect(page.locator('#status-text')).toHaveText('Reloj conectado');
  await expect(page.locator('#battery')).toHaveText('73%');
  await expect(page.locator('#description')).toHaveText('<script>unsafe</script> Tory');
  await expect(page.locator('#sync')).toBeDisabled();
  await page.locator('#advanced > summary').click();
  await page.locator('#inspect').click();
  await expect(page.locator('#counts')).toContainText('1 servicios · 1 características');
  await page.locator('.service > summary').click();
  await page.getByRole('button', { name: 'Leer valor' }).click();
  await expect(page.locator('.characteristic pre')).toContainText('HEX  49');
  await page.getByRole('button', { name: 'Observar notificaciones' }).click();
  await page.evaluate(() => (window as any).emitBattery());
  await expect(page.locator('#battery')).toHaveText('61%');
  await expect(page.locator('.characteristic pre')).toContainText('HEX  3d');
  await page.getByRole('button', { name: 'Detener notificaciones' }).click();
  const download = page.waitForEvent('download'); await page.locator('#export').click();
  expect((await download).suggestedFilename()).toMatch(/tory-diagnostico.*\.json/);
  await page.evaluate(() => (window as any).mockDevice.gatt.disconnect());
  await expect(page.locator('#status-text')).toHaveText('Sin conectar');
  await expect(page.locator('#battery')).toHaveText('—');
  await expect(page.locator('.service')).toHaveCount(0);
  await expect(page.locator('#connect')).toBeEnabled();
  await page.locator('#connect').click(); await expect(page.locator('#status-text')).toHaveText('Reloj conectado');
});
for (const mode of ['cancel', 'connect-error', 'no-battery', 'read-error']) {
  test(`handles ${mode}`, async ({ page }) => {
    await mockBLE(page, mode); await page.goto('/'); await page.locator('#connect').click();
    if (mode === 'cancel' || mode === 'connect-error') {
      await expect(page.locator('#message')).toHaveClass(/error/); await expect(page.locator('#connect')).toBeEnabled();
    } else {
      await expect(page.locator('#status-text')).toHaveText('Reloj conectado'); await expect(page.locator('#battery')).toHaveText('—');
      if (mode === 'read-error') {
        await page.locator('#advanced > summary').click(); await page.locator('#inspect').click(); await page.locator('.service > summary').click(); await page.getByRole('button', { name: 'Leer valor' }).click(); await expect(page.locator('.characteristic .error')).toBeVisible();
      }
    }
    await expect(page.locator('#sync')).toBeDisabled();
  });
}
test('validates UUIDs and forwards explicit additional permissions', async ({ page }) => {
  await mockBLE(page); await page.goto('/'); await page.locator('#advanced > summary').click();
  await page.locator('#uuids').fill('invalid'); await page.locator('#connect').click();
  await expect(page.locator('#message')).toContainText('UUID inválido');
  await page.locator('#uuids').fill('180f, 12345678-1234-1234-1234-123456789abc'); await page.locator('#connect').click();
  await expect(page.locator('#status-text')).toHaveText('Reloj conectado');
  const options = await page.evaluate(() => (window as any).requested);
  expect(options.acceptAllDevices).toBe(true);
  expect(options.optionalServices).toContain('12345678-1234-1234-1234-123456789abc');
  await expect(page.locator('#uuids')).toBeDisabled();
});
test('mobile layout fits viewport', async ({ page }) => {
  await mockBLE(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator('#connect')).toBeVisible();
});
test('encodes the Misfit set-time command exactly', async () => {
  const { encodeSetTime } = await import('../src/fossil');
  const bytes = encodeSetTime(new Date(1700000000123));
  const offset = -new Date(1700000000123).getTimezoneOffset();
  const expected = [2, 4, 0x00, 0xf1, 0x53, 0x65, 123, 0, offset & 0xff, (offset >> 8) & 0xff];
  expect([...bytes]).toEqual(expected);
});
test('time sync only for Misfit firmware handled by the misfit adapter', async () => {
  const { timeSyncSupported } = await import('../src/fossil');
  expect(timeSyncSupported('Misfit', 'HL0.0.0.16r.v7')).toBe(true);
  expect(timeSyncSupported('Misfit', 'DN1.0.2.19r.v5')).toBe(false);
  expect(timeSyncSupported('Misfit', 'IV0.0.0.0r.v1')).toBe(false);
  expect(timeSyncSupported('Fossil', 'HL0.0.0.16r.v7')).toBe(false);
  expect(timeSyncSupported(undefined, undefined)).toBe(false);
});
async function mockMisfit(page: Page, respond = true) {
  await page.addInitScript(({ respond }) => {
    const enc = (s: string) => new DataView(new TextEncoder().encode(s).buffer);
    const std = (uuid: string, value: DataView) => ({ uuid, properties: { read: true }, value, readValue: async () => value });
    class Command extends EventTarget {
      uuid = '3dda0002-957f-7d4a-34a6-74696673696d'; properties = { write: true, notify: true };
      value: DataView | undefined; writes: number[][] = [];
      async startNotifications() { return this; } async stopNotifications() { return this; }
      async writeValue(data: Uint8Array) { this.writes.push([...data]); if (respond) { this.value = new DataView(new Uint8Array([3, 4, 0]).buffer); this.dispatchEvent(new Event('characteristicvaluechanged')); } }
    }
    const command = new Command();
    const info: Record<string, DataView> = { manufacturer_name_string: enc('Misfit'), firmware_revision_string: enc('HL0.0.0.16r.v7') };
    const services: Record<string, any> = {
      battery_service: { uuid: '0000180f', isPrimary: true, getCharacteristic: async () => std('2a19', new DataView(new Uint8Array([100]).buffer)), getCharacteristics: async () => [], getIncludedServices: async () => [] },
      device_information: { uuid: '0000180a', isPrimary: true, getCharacteristic: async (n: string) => std(n, info[n]), getCharacteristics: async () => [], getIncludedServices: async () => [] },
      '3dda0001-957f-7d4a-34a6-74696673696d': { uuid: '3dda0001', isPrimary: true, getCharacteristic: async () => command, getCharacteristics: async () => [command], getIncludedServices: async () => [] }
    };
    const device = new EventTarget() as any; device.name = 'Misfit';
    device.gatt = { connected: false, async connect() { this.connected = true; return this; }, disconnect() { this.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); }, async getPrimaryService(n: string) { if (!services[n]) throw new DOMException('Missing', 'NotFoundError'); return services[n]; }, async getPrimaryServices() { return Object.values(services); } };
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { async requestDevice() { return device; } } });
    (window as any).writes = command.writes;
  }, { respond });
}
test('syncs time on a Misfit watch: exact bytes written', async ({ page }) => {
  await mockMisfit(page); await page.goto('/'); await page.locator('#connect').click();
  await expect(page.locator('#status-text')).toHaveText('Reloj conectado');
  await expect(page.locator('#sync')).toBeEnabled();
  const before = Math.floor(Date.now() / 1000);
  await page.locator('#sync').click();
  await expect(page.locator('#message')).toContainText('no devuelve confirmación');
  const writes: number[][] = await page.evaluate(() => (window as any).writes);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toHaveLength(10);
  expect(writes[0].slice(0, 2)).toEqual([2, 4]);
  const epoch = writes[0][2] | (writes[0][3] << 8) | (writes[0][4] << 16) | (writes[0][5] << 24);
  await page.locator('#animate').click();
  await expect.poll(() => page.evaluate(() => (window as any).writes.length)).toBe(2);
  expect(await page.evaluate(() => (window as any).writes[1])).toEqual([2, 0xf1, 5]);
  expect(epoch).toBeGreaterThanOrEqual(before); expect(epoch).toBeLessThanOrEqual(before + 60);
});

test('hand calibration sends exact bytes and guards saving', async ({ page }) => {
  await mockMisfit(page); await page.goto('/'); await page.locator('#connect').click();
  await page.locator('#advanced > summary').click();
  await expect(page.locator('#hands-controls')).toBeHidden();
  await page.locator('#hands-take').click();
  await expect(page.locator('#hands-controls')).toBeVisible();
  await expect(page.locator('#hands-save')).toBeDisabled();
  await page.locator('[data-hand="minute"][data-deg="-10"]').click();
  await page.locator('[data-hand="hour"][data-deg="1"]').click();
  await page.locator('#hands-ok').check();
  await expect(page.locator('#hands-save')).toBeEnabled();
  await page.locator('#hands-save').click();
  await expect(page.locator('#hands-save')).toBeDisabled();
  await page.locator('#hands-release').click();
  await expect(page.locator('#hands-controls')).toBeHidden();
  const writes: number[][] = await page.evaluate(() => (window as any).writes);
  expect(writes).toEqual([[2, 21, 1, 1, 0, 0], [2, 21, 3, 1, 1, 2, 10, 0, 2, 1], [2, 21, 3, 1, 1, 1, 1, 0, 1, 1], [2, 0xf2, 0x0e], [2, 21, 2, 0, 0]]);
});
test('rejects invalid hand movements', async () => {
  const { moveHandRelative } = await import('../src/fossil');
  expect(() => moveHandRelative('hour', 0)).toThrow();
  expect(() => moveHandRelative('hour', 361)).toThrow();
  expect(() => moveHandRelative('minute', 1.5)).toThrow();
});

test('read-only time diagnostic sends 01 04 and reports the response', async ({ page }) => {
  await mockMisfit(page); await page.goto('/'); await page.locator('#connect').click();
  await page.locator('#read-time').click();
  await expect(page.locator('#message')).toContainText('03 04 00');
  expect(await page.evaluate(() => (window as any).writes)).toEqual([[1, 4]]);
});
