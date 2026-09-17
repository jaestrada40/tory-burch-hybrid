import './style.css';
import { WatchBluetooth } from './ble';
import { friendlyError, parseServices } from './format';
const bluetooth = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12-6 4V2l6 4L6 18"/></svg>`;
const clock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>`;
const watch = new WatchBluetooth();
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
$('app').innerHTML = `
<header class="header"><a class="brand" href="#"><span class="brand-title">TORY <i>HYBRID</i></span><span class="brand-sub">TU RELOJ. A TU RITMO.</span></a><span class="private">Conexión privada · Bluetooth</span></header>
<main>
<section class="intro"><span class="eyebrow">MI RELOJ</span><h1>El tiempo, contigo.</h1><p>Un pequeño paso para volver a conectar.</p></section>
<section class="dashboard" aria-label="Mi reloj">
<div class="watch-panel"><span class="collection">THE HYBRID COLLECTION</span><div class="watch-art" role="img" aria-label="Ilustración de un reloj dorado con esfera azul oscuro"><div class="strap top"></div><div class="strap bottom"></div><div class="crown"></div><div class="dial"><div class="ticks"></div><span class="twelve">12</span><span class="three">3</span><span class="six">6</span><span class="nine">9</span><span class="dial-brand">TORY BURCH</span><div class="subdial"></div><div class="hand hour"></div><div class="hand minute"></div><div class="pin"></div><span class="hybrid-label">HYBRID</span></div></div><div class="watch-caption"><h2>Tory Burch Hybrid</h2><p>Diseño de siempre. Una nueva conexión.</p></div></div>
<div class="control-panel"><div class="status" id="status"><span class="dot"></span><span id="status-text">Sin conectar</span></div><h2 id="greeting">Tu reloj, más cerca.</h2><p class="description" id="description">Acerca tu reloj a la computadora.<br>Nos encargamos del primer paso.</p><button class="primary" id="connect">${bluetooth}<span>Conectar reloj</span><span class="arrow">→</span></button><button class="text-button" id="disconnect" hidden>Desconectar reloj</button><p class="hint" id="connect-hint">Selecciona tu reloj en la ventana del navegador.</p><div class="message" id="message" role="status" aria-live="polite">Todo listo para empezar.</div><div class="divider"></div><div class="metric"><div class="metric-icon">▱</div><div><h3>Batería del reloj</h3><p id="battery-help">Disponible después de conectar, si el reloj la comparte.</p></div><strong id="battery">—</strong></div><div class="sync-block"><div class="sync-title">${clock}<h3>La hora, siempre a mano</h3></div><p id="sync-help">Primero necesitamos confirmar cómo se ajusta la hora de este reloj.</p><button class="secondary" id="sync" disabled aria-describedby="sync-help">${clock}Sincronizar hora<span class="soon">Pendiente</span></button></div></div>
</section>
<section class="steps" aria-label="Cómo conectar"><div><span>01</span><p><strong>Acerca tu reloj</strong>Mantenlo junto a la computadora.</p></div><div><span>02</span><p><strong>Conecta por Bluetooth</strong>Elige tu reloj y permite la conexión.</p></div><div><span>03</span><p><strong>Consulta su estado</strong>Todo lo importante, en un solo lugar.</p></div></section>
<details class="advanced" id="advanced"><summary><span>Opciones avanzadas <small>Para conocer mejor tu reloj</small></span><span class="plus" aria-hidden="true">+</span></summary><div class="advanced-body"><h2>Explorador Bluetooth</h2><p>Inspecciona los servicios autorizados y sus características. Este panel no envía comandos de hora ni escribe valores.</p><div class="notice">El navegador no revela automáticamente todos los servicios propietarios. Si falta alguno, obtén su UUID con un explorador BLE nativo, añádelo aquí y vuelve a conectar. La lista puede ser parcial.</div><label for="uuids">UUID de servicios adicionales</label><textarea id="uuids" rows="2" spellcheck="false" placeholder="Ejemplo de formato: 180f o xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></textarea><p class="field-help">Separados por comas o espacios. Se incluyen batería, información del dispositivo y servicios estándar de hora; su presencia no habilita la sincronización.</p><div class="toolbar"><button id="inspect" class="small-button" disabled>Inspeccionar servicios</button><button id="export" class="small-button" disabled>Exportar diagnóstico</button></div><p id="counts">Conecta el reloj para explorar sus servicios.</p><div id="services"></div><label for="notes">Notas del diagnóstico</label><textarea id="notes" rows="3" placeholder="Modelo, firmware, botón pulsado y cambios observados…"></textarea><details class="protocol"><summary>¿Cómo identificaremos el protocolo?</summary><ol><li>Leer fabricante, modelo y firmware en Device Information, si están disponibles.</li><li>Comparar UUID y firmware con documentación o código verificable de Tory Burch/Fossil.</li><li>Observar notificaciones al pulsar los botones físicos y anotar los cambios.</li><li>Verificar el comando, formato, zona horaria, autenticación y respuesta esperada antes de implementar la hora.</li></ol><p>Una característica con permiso write no demuestra que sirva para ajustar la hora.</p></details><details><summary>Registro de esta sesión</summary><pre id="logs">Sin actividad.</pre></details></div></details>
<footer><span>TORY HYBRID MANAGER <span class="version">/ 01</span></span><p>Hecho para reconectar. Proyecto independiente, sin afiliación con Tory Burch o Fossil.</p><span class="browser-note">Chrome o Edge · Computadora</span></footer>
</main>`;
function message(text: string, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function render() {
  $('status-text').textContent = watch.connected ? 'Reloj conectado' : watch.busy ? 'Conectando…' : 'Sin conectar';
  $('status').classList.toggle('connected', watch.connected);
  $('greeting').textContent = watch.connected ? 'Ya están conectados.' : 'Tu reloj, más cerca.';
  $('description').textContent = watch.connected ? (watch.device?.name || 'Tu reloj Bluetooth') : 'Acerca tu reloj a la computadora. Nos encargamos del primer paso.';
  $<HTMLButtonElement>('connect').disabled = watch.busy || watch.connected || !navigator.bluetooth || !window.isSecureContext;
  $('connect').querySelector('span')!.textContent = watch.connected ? 'Reloj conectado' : watch.busy ? 'Conectando…' : 'Conectar reloj';
  $('disconnect').hidden = !watch.connected;
  $<HTMLTextAreaElement>('uuids').disabled = watch.connected || watch.busy;
  $<HTMLButtonElement>('inspect').disabled = !watch.connected || watch.busy;
  $<HTMLButtonElement>('export').disabled = !watch.device;
  $('battery').textContent = watch.battery === undefined ? '—' : `${watch.battery}%`;
  $('battery-help').textContent = watch.battery !== undefined ? 'Última lectura del reloj.' : watch.connected ? 'El reloj no compartió un nivel de batería válido.' : 'Disponible después de conectar, si el reloj la comparte.';
  $('counts').textContent = watch.services.length ? `${watch.services.length} servicios · ${watch.entries.length} características · Solo servicios autorizados` : watch.connected ? 'Pulsa Inspeccionar servicios para empezar.' : 'Conecta el reloj para explorar sus servicios.';
  // Keep expanded services and keyboard focus stable when values or busy state change.
  const open = new Set([...$('services').querySelectorAll<HTMLDetailsElement>('details[open]')].map(d => d.dataset.uuid));
  const active = document.activeElement as HTMLElement | null;
  const focused = active?.closest('#services') ? active.dataset.action + ':' + active.dataset.id : null;
  $('services').innerHTML = watch.services.map(s => `<details class="service" data-uuid="${escape(s.uuid)}" ${open.has(s.uuid) ? 'open' : ''}><summary><code>${escape(s.uuid)}</code><small>${s.primary ? 'Primario' : 'Incluido'}</small></summary>${s.error ? `<p class="error">${escape(s.error)}</p>` : ''}${watch.entries.filter(e => e.service === s.uuid).map(e => `<article class="characteristic"><code>${escape(e.uuid)}</code><div class="badges">${e.properties.map(p => `<span>${p}</span>`).join('')}</div><div class="toolbar">${e.properties.includes('read') ? `<button class="small-button" data-action="read" data-id="${e.id}" ${watch.busy ? 'disabled' : ''}>Leer valor</button>` : ''}${e.properties.some(p => p === 'notify' || p === 'indicate') ? `<button class="small-button" data-action="notify" data-id="${e.id}" ${watch.busy ? 'disabled' : ''}>${e.notifying ? 'Detener notificaciones' : 'Observar notificaciones'}</button>` : ''}</div><pre>${e.value ? escape(`HEX  ${e.value.hex || '(vacío)'}\nDEC  ${e.value.bytes.join(' ')}\nUTF8 ${e.value.text}\n${e.updated}`) : 'Sin lectura. Usa Leer valor u observa notificaciones.'}</pre>${e.error ? `<p class="error">${escape(e.error)}</p>` : ''}</article>`).join('')}</details>`).join('');
  if (focused) { const [action, id] = focused.split(':'); $('services').querySelector<HTMLElement>(`[data-action="${action}"][data-id="${id}"]`)?.focus(); }
  $('logs').textContent = watch.logs.map(l => `${l.time}  ${l.message}`).join('\n') || 'Sin actividad.';
}
watch.addEventListener('change', render);
watch.addEventListener('disconnected', () => message('El reloj se desconectó. Acércalo y pulsa Conectar reloj.'));
async function run(action: () => Promise<void>, success: string) {
  try { await action(); if (watch.connected) message(success); }
  catch (error) { message(friendlyError(error), true); watch.log(`Error: ${friendlyError(error)}`); }
  finally { render(); }
}
$('connect').addEventListener('click', () => {
  let extra: string[];
  try { extra = parseServices($<HTMLTextAreaElement>('uuids').value); } catch (error) { message(friendlyError(error), true); return; }
  message('Selecciona tu reloj en la ventana de Bluetooth.');
  void run(() => watch.connect(extra), 'Tu reloj está conectado. Ya puedes consultar su estado.');
});
$('disconnect').addEventListener('click', () => watch.disconnect());
$('inspect').addEventListener('click', () => void run(() => watch.inspect(), 'Inspección terminada. Puedes abrir cada servicio para ver sus detalles.'));
$('services').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
  if (!button) return;
  const entry = watch.entries.find(e => e.id === Number(button.dataset.id));
  if (!entry) return;
  void run(() => button.dataset.action === 'read' ? watch.read(entry) : watch.toggleNotifications(entry), 'Operación completada.');
});
$('export').addEventListener('click', () => {
  const report = { ...watch.exportReport($<HTMLTextAreaElement>('notes').value), requestedExtraServices: $<HTMLTextAreaElement>('uuids').value };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = `tory-diagnostico-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  message('Diagnóstico descargado. Incluye el nombre del reloj y los valores leídos.');
});
if (!window.isSecureContext) message('Abre la aplicación desde localhost o una dirección HTTPS para conectar tu reloj.', true);
else if (!navigator.bluetooth) message('Para conectar tu reloj, abre esta página en Chrome o Edge en una computadora. Safari y iPhone no ofrecen esta conexión.', true);
render();
