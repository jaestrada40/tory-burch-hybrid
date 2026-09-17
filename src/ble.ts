import { describeValue, friendlyError } from './format';
export const STANDARD_SERVICES = ['battery_service', 'device_information', 'current_time', 'reference_time_update', 'next_dst_change'];
export const PROPERTY_KEYS = ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate', 'authenticatedSignedWrites', 'reliableWrite', 'writableAuxiliaries', 'broadcast'] as const;
export interface Entry { id: number; service: string; uuid: string; properties: string[]; value?: ReturnType<typeof describeValue>; updated?: string; error?: string; notifying: boolean; characteristic: BluetoothRemoteGATTCharacteristic }
export interface Service { uuid: string; primary: boolean; error?: string }
export class WatchBluetooth extends EventTarget {
  device?: BluetoothDevice;
  entries: Entry[] = [];
  services: Service[] = [];
  logs: { time: string; message: string }[] = [];
  battery?: number;
  busy = false;
  private generation = 0;
  private listeners = new Map<BluetoothRemoteGATTCharacteristic, EventListener>();
  get connected() { return !!this.device?.gatt?.connected; }
  emit() { this.dispatchEvent(new Event('change')); }
  log(message: string) { this.logs.push({ time: new Date().toISOString(), message }); this.logs = this.logs.slice(-300); this.emit(); }
  private clear() {
    this.listeners.forEach((handler, c) => c.removeEventListener('characteristicvaluechanged', handler));
    this.listeners.clear(); this.entries = []; this.services = []; this.battery = undefined;
  }
  private disconnected = () => {
    this.generation++; this.clear(); this.busy = false;
    this.log('Reloj desconectado. Los valores anteriores ya no están disponibles.');
    this.dispatchEvent(new Event('disconnected'));
  };
  async connect(extra: string[]) {
    if (this.busy || this.connected) return;
    if (!window.isSecureContext || !navigator.bluetooth) throw new Error('Abre esta página en Chrome o Edge en una computadora, usando localhost o HTTPS.');
    this.busy = true; this.emit();
    const generation = ++this.generation;
    try {
      // Called directly from the click handler, preserving transient user activation.
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [...STANDARD_SERVICES, ...extra] });
      if (generation !== this.generation) return;
      this.device?.removeEventListener('gattserverdisconnected', this.disconnected);
      this.clear(); this.logs = []; this.device = device;
      device.addEventListener('gattserverdisconnected', this.disconnected);
      if (!device.gatt) throw new Error('Este dispositivo no ofrece una conexión Bluetooth GATT.');
      await device.gatt.connect();
      if (generation !== this.generation) return;
      this.log('Reloj conectado.');
      // Battery failure must not invalidate an otherwise successful connection.
      try {
        const service = await device.gatt.getPrimaryService('battery_service');
        const c = await service.getCharacteristic('battery_level');
        if (c.properties.read) {
          const value = await c.readValue();
          if (generation === this.generation) this.updateBattery(value);
        }
      } catch (error) { if (generation === this.generation) this.log(`Batería no disponible: ${friendlyError(error)}`); }
    } finally { if (generation === this.generation) { this.busy = false; this.emit(); } }
  }
  disconnect() { this.device?.gatt?.disconnect(); }
  private updateBattery(value: DataView) { if (value.byteLength === 1 && value.getUint8(0) <= 100) this.battery = value.getUint8(0); }
  private capture(entry: Entry, value: DataView) {
    entry.value = describeValue(value); entry.updated = new Date().toISOString(); entry.error = undefined;
    if (entry.service === '0000180f-0000-1000-8000-00805f9b34fb' && entry.uuid === '00002a19-0000-1000-8000-00805f9b34fb') this.updateBattery(value);
    this.log(`${entry.uuid}: ${entry.value.hex || '(vacío)'}`);
  }
  private async operation(action: (generation: number) => Promise<void>) {
    if (this.busy) return;
    if (!this.connected) throw new DOMException('Disconnected', 'InvalidStateError');
    const generation = this.generation;
    this.busy = true; this.emit();
    try { await action(generation); }
    finally { if (generation === this.generation) { this.busy = false; this.emit(); } }
  }
  async inspect() {
    await this.operation(async generation => {
      // Preserve existing notification listeners on repeated scans.
      const services = await this.device!.gatt!.getPrimaryServices();
      if (generation !== this.generation) return;
      const visited = new Set<string>();
      const visit = async (service: BluetoothRemoteGATTService): Promise<void> => {
        if (generation !== this.generation || visited.has(service.uuid)) return;
        visited.add(service.uuid);
        let record = this.services.find(s => s.uuid === service.uuid);
        if (!record) { record = { uuid: service.uuid, primary: service.isPrimary }; this.services.push(record); }
        record.error = undefined;
        try {
          const characteristics = await service.getCharacteristics();
          if (generation !== this.generation) return;
          for (const c of characteristics) {
            if (!this.entries.some(e => e.service === service.uuid && e.uuid === c.uuid)) this.entries.push({ id: this.entries.length, service: service.uuid, uuid: c.uuid, properties: PROPERTY_KEYS.filter(p => c.properties[p]), characteristic: c, notifying: false });
          }
        } catch (error) { if (generation === this.generation) record.error = friendlyError(error); }
        try {
          const included = await service.getIncludedServices();
          for (const child of included) await visit(child);
        } catch (error) { if (generation === this.generation) this.log(`Servicios incluidos de ${service.uuid}: ${friendlyError(error)}`); }
      };
      for (const service of services) await visit(service);
      if (generation === this.generation) this.log(`Inspección: ${this.services.length} servicios autorizados, ${this.entries.length} características.`);
    });
  }
  async read(entry: Entry) {
    await this.operation(async generation => {
      try { const v = await entry.characteristic.readValue(); if (generation === this.generation) this.capture(entry, v); }
      catch (error) { if (generation === this.generation) entry.error = friendlyError(error); throw error; }
    });
  }
  async toggleNotifications(entry: Entry) {
    await this.operation(async generation => {
      const c = entry.characteristic;
      if (entry.notifying) {
        await c.stopNotifications();
        const handler = this.listeners.get(c); if (handler) c.removeEventListener('characteristicvaluechanged', handler);
        this.listeners.delete(c); entry.notifying = false;
      } else {
        const handler: EventListener = () => { if (generation === this.generation && c.value) this.capture(entry, c.value); };
        c.addEventListener('characteristicvaluechanged', handler); this.listeners.set(c, handler);
        try { await c.startNotifications(); if (generation === this.generation) entry.notifying = true; }
        catch (error) { c.removeEventListener('characteristicvaluechanged', handler); this.listeners.delete(c); throw error; }
      }
      if (generation === this.generation) this.log(`${entry.uuid}: notificaciones ${entry.notifying ? 'activadas' : 'detenidas'}.`);
    });
  }
  exportReport(notes: string) {
    return { schemaVersion: 1, exportedAt: new Date().toISOString(), deviceName: this.device?.name ?? null, connected: this.connected, battery: this.battery ?? null, protocol: 'unverified; time synchronization disabled', notes, services: this.services, characteristics: this.entries.map(({ characteristic: _, ...e }) => e), logs: this.logs };
  }
}
