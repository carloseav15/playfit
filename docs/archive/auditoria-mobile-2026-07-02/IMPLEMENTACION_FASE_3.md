# Implementación Fase 3 — Local-first, errores y sincronización Android

Fecha: 2026-07-02  
Alcance: repositorio local-first, snapshots Room, outbox, errores tipados, reconciliación y estados UX.  
No se ejecutó la app ni se tomaron capturas.

## Resultado

- Las lecturas ya no convierten fallos de red en modelos o listas vacías.
- `RepositoryResult` diferencia éxito y fallo, e identifica origen `Network`, `Cache` o `Local`.
- Los errores distinguen red, sesión inválida, servidor, serialización y fallo desconocido.
- Recomendaciones de hoy, Picks, perfil construido y estado de perfil se guardan como snapshots Room.
- Ante un fallo, la app conserva el último snapshot y lo marca como stale.
- Un vacío devuelto correctamente por el servidor sigue siendo un éxito vacío; no se confunde con error.
- El estado remoto se reconcilia transaccionalmente con Room y nunca sobrescribe game states pendientes.
- Las selecciones locales pendientes se superponen sobre Picks remotos/cacheados.
- Onboarding se guarda en una outbox persistente antes de intentar red.
- Game states continúan siendo escrituras locales inmediatas con `syncPending`.
- El estado pending se observa desde Room, por lo que desaparece cuando el worker termina.
- La UI conserva datos anteriores ante refresh fallido y muestra si usa datos guardados o espera sync.
- El cache temporal en memoria `SessionCache` fue eliminado.

## Persistencia y migración

Room pasa de versión 2 a 3 con una migración no destructiva:

- `cache_entries`: snapshots JSON versionables por clave.
- `pending_operations`: outbox tipada, ordenada y con contador de intentos.

Los `game_states` pendientes sobreviven a una descarga remota. Los estados sincronizados se reemplazan como snapshot dentro de una transacción para evitar conservar entradas remotas obsoletas.

## Política de lectura

1. Intentar red.
2. Persistir una respuesta válida.
3. Si la red falla, leer snapshot Room.
4. Si hay snapshot, devolver éxito stale, sin borrar la UI existente.
5. Si no existe snapshot, devolver un error tipado.

La búsqueda no inventa resultados offline: devuelve error tipado porque todavía no tiene índice/cache local.

## Política de escritura y sync

- Game state: escribir Room → intentar API → marcar synced o mantener pendiente → programar WorkManager.
- Feedback/Picks: escribir Room y programar WorkManager inmediatamente.
- Onboarding: escribir outbox → intentar API → eliminar operación si confirma o reintentar después.
- `ExistingWorkPolicy.KEEP` evita reemplazar un worker ya programado.
- El worker marca `lastSyncAt` solamente cuando no queda ninguna operación pendiente.
- Red, HTTP 408/429 y 5xx reintentan; errores permanentes terminan como failure sin borrar la outbox.

No se cambió el esquema remoto de Supabase, RLS ni claves. Esta fase consume la API Playfit existente.

## Verificación

```sh
./gradlew --offline :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease :app:lintDebug
```

Resultado:

- 59 pruebas, 0 fallos, 0 errores.
- 4 pruebas nuevas del repositorio: network, cache stale, error sin cache y onboarding offline/outbox.
- 2 pruebas nuevas del ViewModel: refresh fallido conserva datos y cache stale se etiqueta.
- Debug APK generado.
- Release APK unsigned generado.
- `lintDebug`: exitoso.
- Migración Room y DAOs validados por compilación/KSP; no se ejecutó una migración en dispositivo.

## Límites pendientes

1. Falta una prueba instrumentada de migración Room 2→3 y process recreation.
2. Search Games no tiene cache o índice offline.
3. Los snapshots no tienen todavía política de expiración; se identifican como stale después de cualquier fallback.
4. El payload estructurado y las reglas estrictas del onboarding pertenecen a la siguiente fase.
5. No se validaron API, WorkManager ni reconexión en ejecución por la restricción de no correr la app.
