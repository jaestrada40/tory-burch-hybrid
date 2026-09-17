# Tory Hybrid Manager

Aplicación local en español para conectar un reloj BLE desde el navegador. TypeScript estricto + Vite, sin backend, sin cuentas y sin telemetría. Diseño responsive azul oscuro/dorado inspirado en el reloj de referencia. Proyecto independiente, sin afiliación con Tory Burch ni Fossil.

## Ejecutar

Requiere Node.js 20.19+ o 22.12+ y npm (verificado con Node 26).

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

Abrir http://127.0.0.1:5173 en **Chrome o Edge de escritorio**, con Bluetooth activo y permisos del sistema para el navegador. Vite escucha solo en la computadora local. Si el puerto está ocupado, detén la instancia anterior o elige otro puerto.

```sh
npm run build
npm run preview -- --port 4173
```

`dist/` contiene el build estático para servir por HTTPS. No abrir `index.html` directamente con file://.

## Uso sencillo

1. Acerca el reloj y cierra otras aplicaciones que estén conectadas a él. Activa su modo de emparejamiento según el manual del modelo.
2. Pulsa **Conectar reloj**, elige el dispositivo en el selector del navegador y concede permiso.
3. El estado cambia a conectado únicamente después de completar la conexión GATT. La batería aparece solo si el servicio estándar permite leer un valor válido de 0 a 100; no se inventan porcentajes.
4. Puedes desconectar desde la aplicación. Si el reloj se aleja o corta la conexión, se borran los valores actuales y puedes volver a conectarlo.

La ilustración es decorativa: sus manecillas no representan la hora reportada por el reloj.

## Sincronización de hora: pendiente de identificar el protocolo

**El botón está deshabilitado intencionalmente. No existe ninguna llamada a writeValue ni comandos propietarios en el código de producción.** Detectar Current Time Service o una característica con propiedad `write` NO demuestra que este modelo admita ese formato para ajustar las manecillas. Tampoco basta con reconocer el nombre comercial. Primero hay que verificar modelo/firmware, autenticación, UUID, formato exacto, zona horaria, efectos y respuesta de confirmación. No se presenta un éxito de sincronización ficticio.

Para añadirla más adelante, crear un adaptador específico y revisado para el modelo/firmware confirmado, con evidencia del protocolo y pruebas de sus bytes. Mantener deshabilitados los modelos desconocidos y no reportar éxito sin la confirmación apropiada del dispositivo. No hay un editor de bytes ni una opción para saltarse esta protección.

## Opciones avanzadas

- **Servicios adicionales:** admite UUID de servicio de 16/32 bits en hexadecimal (con o sin `0x`) y UUID completos de 128 bits, separados por espacios, comas o punto y coma. Son UUID de servicios, no de características.
- **Permisos:** se solicitan `battery_service`, `device_information`, `current_time`, `reference_time_update`, `next_dst_change` y los UUID introducidos. No se adivinan UUID Fossil/Tory Burch.
- **Inspección:** recorre servicios primarios y servicios incluidos que el navegador permita, enumera características y muestra UUID y propiedades read/write/writeWithoutResponse/notify/indicate y otras propiedades GATT.
- **Lectura:** botón individual para características legibles, muestra bytes HEX, decimal, texto UTF-8 orientativo y marca temporal. UTF-8 no interpreta el protocolo; los bytes hexadecimales son la fuente exacta.
- **Notificaciones:** iniciar/detener observación de notify/indicate. Suscribirse utiliza el mecanismo estándar de notificaciones GATT; no envía comandos propietarios. La batería inicial es una lectura puntual; las actualizaciones llegan al observar su característica.
- **Diagnóstico:** exportación JSON del nombre del dispositivo (sin su identificador del navegador), servicios, propiedades, últimas lecturas, notas y los últimos 300 eventos. No se sube a ningún servidor. El registro es acotado y no constituye una captura completa de tráfico BLE. Revisa su contenido antes de compartirlo.

### Por qué no aparecen todos los servicios

Web Bluetooth restringe el acceso a los servicios concedidos en `optionalServices` o en los filtros del selector. `acceptAllDevices` permite elegir un dispositivo, **no concede acceso a todos sus servicios**. Tampoco hay un comodín para UUID propietarios. Las listas son, por tanto, potencialmente parciales y pueden existir servicios bloqueados por el navegador.

Para encontrar UUID desconocidos, utiliza un explorador BLE nativo. Añade los UUID de servicio obtenidos en este panel, desconecta y vuelve a pulsar Conectar reloj para solicitar permisos ampliados. Algunos permisos concedidos previamente pueden persistir en el navegador. Si necesitas empezar desde cero, revócalos en sus ajustes del sitio.

### Próxima sesión con el reloj

1. Registrar el modelo exacto y leer Device Information (fabricante, modelo y firmware), si lo expone.
2. Enumerar servicios con un explorador nativo y copiar los UUID propietarios al campo adicional.
3. Inspeccionar, leer solo características legibles y observar notificaciones mientras se pulsan botones físicos.
4. Anotar acciones y tiempos, exportar diagnóstico y comparar con documentación/código verificable para ese modelo.
5. Solo después implementar y probar un adaptador de hora específico. La pertenencia aparente a la familia Fossil no prueba compatibilidad de protocolo.

## Compatibilidad y límites

- Web Bluetooth necesita un contexto seguro: **HTTPS o localhost/127.0.0.1**, una acción del usuario y permisos Bluetooth del sistema/navegador.
- Usar Chrome/Edge en macOS o Windows para esta primera versión. La disponibilidad depende también del adaptador, sistema operativo y políticas del navegador.
- Safari no ofrece esta API. En iPhone/iPad no debe asumirse soporte por instalar Chrome/Edge: las versiones basadas en WebKit tampoco ofrecen Web Bluetooth. Instalar como PWA no añade acceso Bluetooth. Un puente nativo sería otro proyecto.
- La vista integrada de un editor puede no permitir Bluetooth: abrir la URL en Chrome o Edge externo.
- Abrir una IP de la red local por HTTP desde otro equipo no equivale a localhost. Para acceso remoto se necesita HTTPS y configuración de servidor adecuada.
- La conexión real, servicios propietarios y sincronización del reloj requieren verificar el dispositivo físico. Los tests automatizados utilizan un doble de la API; no prueban la radio ni el firmware.

Fuentes: [Chrome: Web Bluetooth](https://developer.chrome.com/docs/capabilities/bluetooth), [MDN: Web Bluetooth y compatibilidad](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API).

## Desarrollo y pruebas

```sh
npm run build
npx playwright install chromium
npm test
```

Los tests cubren compatibilidad, cancelación del selector, fallo de conexión, ausencia de batería, error de lectura, permisos UUID adicionales, inspección, notificaciones, exportación, desconexión/reconexión y ancho móvil. La sincronización permanece bloqueada en todos los estados.

- `src/ble.ts`: transporte, estado GATT, serialización de operaciones, limpieza y diagnóstico.
- `src/format.ts`: validación de UUID, representación de bytes y mensajes.
- `src/main.ts`: interfaz y eventos; datos BLE insertados como texto o escapados.
- `src/style.css`: diseño responsive, estados y foco visible.
- `tests/app.spec.ts`: pruebas funcionales con Bluetooth simulado.

No hay dependencias de ejecución ni fuentes remotas. `package-lock.json` fija las dependencias de desarrollo para poder continuar con `npm ci`.

## Desplegar en Coolify desde GitHub

Repositorio: https://github.com/jaestrada40/tory-burch-hybrid

1. En tu proyecto/entorno de Coolify, crea una aplicación desde este repositorio de GitHub. Si es privado, usa la integración de GitHub o una deploy key con acceso de lectura.
2. Selecciona la rama **main** y el build pack **Dockerfile**.
3. Configura **Base Directory: /**, **Dockerfile Location: /Dockerfile** y **Ports Exposes: 80**. No hace falta publicar un puerto del host ni configurar comandos npm en Coolify; el Dockerfile compila la aplicación.
4. Asigna el dominio completo con **https://**, apunta su DNS al servidor y permite al proxy de Coolify emitir el certificado. Los puertos 80/443 del servidor deben estar disponibles para el proxy.
5. Despliega. Si configuras un health check HTTP en Coolify, usa **GET /health**, puerto **80**, respuesta **200**.
6. Abre el dominio HTTPS en Chrome/Edge y comprueba que aparece Conectar reloj. En ese origen nuevo tendrás que conceder de nuevo permisos Bluetooth.

No requiere variables de entorno, base de datos, volúmenes ni acceso del servidor al adaptador Bluetooth. **El navegador se conecta al reloj cercano al usuario; Coolify solo sirve los archivos web.** Alojarla no añade soporte de Bluetooth a Safari/iPhone ni desbloquea la sincronización pendiente.

La imagen utiliza Node 22 para compilar y Nginx para servir `dist/`. La terminación HTTPS la gestiona el proxy de Coolify. No desplegar el servidor de desarrollo Vite en producción.

Validación local del contenedor:

```sh
docker build -t tory-hybrid-manager .
docker run --rm -p 127.0.0.1:8080:80 tory-hybrid-manager
# En otra terminal:
curl -f http://127.0.0.1:8080/health
```

Documentación oficial: [Dockerfile en Coolify](https://coolify.io/docs/applications/builds/dockerfile), [dominios y HTTPS](https://coolify.io/docs/core/networking/domains).
