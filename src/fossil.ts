// Protocolo de híbridos Fossil/Misfit según el adaptador "misfit" de Gadgetbridge
// (qhybrid/requests/misfit/SetTimeRequest.java y adapter/misfit/MisfitWatchAdapter.java).
export const FOSSIL_SERVICE = '3dda0001-957f-7d4a-34a6-74696673696d';
export const FOSSIL_COMMAND = '3dda0002-957f-7d4a-34a6-74696673696d';

/** SetTimeRequest: 02 04 | epoch s (i32) | ms (i16) | minutos de zona (i16), little-endian. */
export function encodeSetTime(now: Date): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(10));
  const view = new DataView(bytes.buffer);
  const ms = now.getTime();
  bytes[0] = 2; bytes[1] = 4;
  view.setInt32(2, Math.floor(ms / 1000), true);
  view.setInt16(6, ms % 1000, true);
  view.setInt16(8, -now.getTimezoneOffset(), true);
  return bytes;
}

/** Misma regla que WatchAdapterFactory de Gadgetbridge para elegir el adaptador Misfit. */
export function timeSyncSupported(manufacturer?: string, firmware?: string): boolean {
  if (manufacturer?.trim() !== 'Misfit' || !firmware) return false;
  const fw = firmware.trim();
  if (fw[2] === '1' || /^(IV0|VA|WA)/.test(fw)) return false;
  return fw[6] === '0' || fw[6] === '1';
}

// Calibración de manecillas (RequestHandControlRequest, MoveHandsRequest, SaveCalibrationRequest, ReleaseHandsControlRequest).
export type Hand = 'hour' | 'minute';
export const requestHandControl = () => new Uint8Array([2, 0x15, 1, 1, 0, 0]);
export const releaseHandControl = () => new Uint8Array([2, 0x15, 2, 0, 0]);
export const saveCalibration = () => new Uint8Array([2, 0xf2, 0x0e]);
/** MoveHandsRequest relativo para una sola manecilla: grados positivos = sentido horario. */
export function moveHandRelative(hand: Hand, degrees: number): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(degrees) || degrees === 0 || Math.abs(degrees) > 360) throw new Error('Movimiento no válido.');
  const magnitude = Math.abs(degrees);
  return new Uint8Array([2, 0x15, 3, 1, 1, hand === 'hour' ? 1 : 2, magnitude & 0xff, magnitude >> 8, degrees > 0 ? 1 : 2, 1]);
}
