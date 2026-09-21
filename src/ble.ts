import { describeValue, friendlyError } from './format';
import { FOSSIL_COMMAND, FOSSIL_SERVICE, encodeSetTime, moveHandRelative, releaseHandControl, requestHandControl, saveCalibration, timeSyncSupported, type Hand } from './fossil';
export { FOSSIL_SERVICE };
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
  identity?: { manufacturer?: string; firmware?: string };
  private command?: BluetoothRemoteGATTCharacteristic;
  handsControlled = false;
  busy = false;
  private generation = 0;
  private listeners = new Map<BluetoothRemoteGATTCharacteristic, EventListener>();
  get canSyncTime() { return this.connected && !!this.command; }
  get connected() { return !!this.device?.gatt?.connected; }
  emit() { this.dispatchEvent(new Event('change')); }
  log(message: string) { this.logs.push({ time: new Date().toISOString(), message }); this.logs = this.logs.slice(-300); this.emit(); }
  private clear() {
    this.listeners.forEach((handler, c) => c.removeEventListener('characteristicvaluechanged', handler));
    this.listeners.clear(); this.entries = []; this.services = []; this.battery = undefined; this.identity = undefined; this.command = undefined; this.handsControlled = false;
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
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [...new Set([...STANDARD_SERVICES, FOSSIL_SERVICE, ...extra])] });
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
      await this.detectTimeSupport(device, generation);
    } finally { if (generation === this.generation) { this.busy = false; this.emit(); } }
  }
  // Solo lectura: la hora se habilita únicamente para fabricante Misfit y firmware que Gadgetbridge trata con su adaptador Misfit.
  private async detectTimeSupport(device: BluetoothDevice, generation: number) {
    try {
      const info = await device.gatt!.getPrimaryService('device_information');
      const text = async (uuid: string) => new TextDecoder().decode(await (await info.getCharacteristic(uuid)).readValue());
      const identity = { manufacturer: await text('manufacturer_name_string'), firmware: await text('firmware_revision_string') };
      const command = await (await device.gatt!.getPrimaryService(FOSSIL_SERVICE)).getCharacteristic(FOSSIL_COMMAND);
      if (generation !== this.generation) return;
      this.identity = identity;
      if (command.properties.write && timeSyncSupported(identity.manufacturer, identity.firmware)) { this.command = command; this.log(`Sincronización de hora disponible (${identity.manufacturer} ${identity.firmware}).`); }
      else this.log(`Sincronización de hora no disponible para ${identity.manufacturer} ${identity.firmware}.`);
    } catch (error) { if (generation === this.generation) this.log(`Sincronización de hora no disponible: ${friendlyError(error)}`); }
  }
  /** Envía la hora actual. Gadgetbridge no espera respuesta a este comando, por lo que no hay confirmación del reloj. */
  async syncTime(now = new Date()) {
    const c = this.command;
    if (!c) throw new Error('Este reloj no está confirmado para sincronizar la hora.');
    await this.operation(async () => {
      await c.startNotifications();
      const payload = encodeSetTime(now);
      this.log(`Enviando hora: ${describeValue(new DataView(payload.buffer)).hex}`);
      await c.writeValue(payload);
    });
  }
  /** Diagnóstico: AnimationRequest de Gadgetbridge (02 f1 05), que Gadgetbridge envía en cada conexión. Solo mueve las manecillas de forma visible. */
  async testAnimation() {
    const c = this.command;
    if (!c) throw new Error('Este reloj no está confirmado para este comando.');
    await this.operation(async () => {
      const payload = new Uint8Array(new ArrayBuffer(3)); payload.set([2, 0xf1, 5]);
      this.log(`Enviando animación: ${describeValue(new DataView(payload.buffer)).hex}`);
      await c.writeValue(payload);
    });
  }
  private async send(label: string, payload: Uint8Array<ArrayBuffer>, after?: () => void) {
    const c = this.command;
    if (!c) throw new Error('Este reloj no está confirmado para este comando.');
    await this.operation(async () => {
      this.log(`${label}: ${describeValue(new DataView(payload.buffer)).hex}`);
      await c.writeValue(payload);
      after?.();
    });
  }
  /** Diagnóstico de solo lectura: petición 01 04 (según notas de la comunidad; formato de respuesta sin verificar). */
  async readWatchTime() {
    const c = this.command;
    if (!c) throw new Error('Este reloj no está confirmado para este comando.');
    let result: { hex: string; time?: Date } | undefined;
    await this.operation(async () => {
      let done!: () => void; const reply = new Promise<void>(resolve => { done = resolve; });
      const handler = () => {
        if (!c.value || result) return;
        const hex = describeValue(c.value).hex;
        result = { hex, time: c.value.byteLength >= 6 ? new Date(c.value.getInt32(2, true) * 1000) : undefined };
        this.log(`Respuesta a lectura de hora: ${hex}`); done();
      };
      const timer = setTimeout(done, 3000);
      c.addEventListener('characteristicvaluechanged', handler);
      try {
        await c.startNotifications();
        const payload = new Uint8Array([1, 4]); this.log(`Leyendo hora del reloj: ${describeValue(new DataView(payload.buffer)).hex}`);
        await c.writeValue(payload); await reply;
      } finally { clearTimeout(timer); c.removeEventListener('characteristicvaluechanged', handler); }
    });
    return result as { hex: string; time?: Date } | undefined;
  }
  takeHands() { return this.send('Tomar control de manecillas', requestHandControl(), () => { this.handsControlled = true; }); }
  releaseHands() { return this.send('Devolver control de manecillas', releaseHandControl(), () => { this.handsControlled = false; }); }
  moveHand(hand: Hand, degrees: number) {
    if (!this.handsControlled) throw new Error('Toma primero el control de las manecillas.');
    return this.send(`Mover ${hand === 'hour' ? 'hora' : 'minutero'} ${degrees}°`, moveHandRelative(hand, degrees));
  }
  saveHandCalibration() {
    if (!this.handsControlled) throw new Error('Toma primero el control de las manecillas.');
    return this.send('Guardar calibración', saveCalibration());
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
          if (typeof service.getIncludedServices !== 'function') return;
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
    return { schemaVersion: 1, exportedAt: new Date().toISOString(), deviceName: this.device?.name ?? null, connected: this.connected, battery: this.battery ?? null, identity: this.identity ?? null, protocol: this.command ? 'Misfit/Fossil (Gadgetbridge); time synchronization available' : 'unverified; time synchronization disabled', notes, services: this.services, characteristics: this.entries.map(({ characteristic: _, ...e }) => e), logs: this.logs };
  }
}
