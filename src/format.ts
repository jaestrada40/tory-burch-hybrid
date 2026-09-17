export function parseServices(input: string): string[] {
  return [...new Set(input.split(/[\s,;]+/).filter(Boolean).map(value => {
    const v = value.toLowerCase().replace(/^0x/, '');
    if (/^[0-9a-f]{4}$/.test(v)) return `0000${v}-0000-1000-8000-00805f9b34fb`;
    if (/^[0-9a-f]{8}$/.test(v)) return `${v}-0000-1000-8000-00805f9b34fb`;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) return v;
    throw new Error(`UUID inválido: ${value}. Usa 4 u 8 dígitos hexadecimales, o un UUID completo.`);
  }))];
}
export function describeValue(value: DataView) {
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return { hex: [...bytes].map(b => b.toString(16).padStart(2, '0')).join(' '), bytes: [...bytes], text: new TextDecoder().decode(bytes).replace(/[\x00-\x1f\x7f]/g, '·') };
}
export function friendlyError(error: unknown): string {
  const e = error as Error;
  const messages: Record<string, string> = {
    NotFoundError: 'No se seleccionó un reloj o el servicio no está disponible. Puedes intentarlo de nuevo.',
    NetworkError: 'No pudimos comunicarnos con el reloj. Acércalo y cierra otras apps que lo estén usando.',
    SecurityError: 'El navegador no permite este servicio. Revisa sus permisos y los UUID en Opciones avanzadas.',
    NotAllowedError: 'Permite el acceso a Bluetooth en el navegador y en los ajustes del sistema.',
    NotSupportedError: 'Esta operación no está disponible en el reloj o en este navegador.',
    InvalidStateError: 'El reloj se desconectó. Vuelve a conectarlo para continuar.',
  };
  return messages[e?.name] ?? e?.message ?? 'Ocurrió un problema. Vuelve a intentarlo.';
}
