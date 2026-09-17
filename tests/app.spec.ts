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
