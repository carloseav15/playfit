# Implementación Fase 2 — Identidad, Auth y entornos Android

Fecha: 2026-07-02  
Alcance: Device ID, restauración de sesión Supabase, resultados de auth, OAuth/deep links y configuración debug/release.  
No se ejecutó la app ni se tomaron capturas.

## Resultado

- El Device ID es persistente, válido y síncrono para el interceptor HTTP.
- El arranque espera `awaitInitialization()` y restaura la sesión guardada antes de crear un usuario anónimo.
- El token cacheado se actualiza desde `sessionStatus`, incluyendo refresh y callbacks OAuth.
- `AuthResult` distingue éxito, operación pendiente y error; ya no reporta éxito falso.
- Google OAuth se mantiene pending hasta que llega `playfit://auth-callback`.
- `MainActivity` procesa deep links en `onCreate` y `onNewIntent`.
- Google linking usa `linkIdentity`, separado del sign-in normal.
- Sign-out conserva el perfil/onboarding local.
- Se eliminó el intento inseguro de usar `auth.admin.deleteUser` desde el cliente.
- Delete Account queda bloqueado con mensaje explícito hasta existir un endpoint backend autorizado.
- Debug apunta a `10.0.2.2`; release apunta a Playfit/Supabase producción.
- Developer Settings muestra el entorno real compilado y ya no contiene switch/cache placebo.

## Contrato de entornos

| Build type | API | Supabase | Entorno |
| --- | --- | --- | --- |
| debug | `http://10.0.2.2:3000` | `http://10.0.2.2:54321` | development |
| release | `https://playfit-gold.vercel.app` | proyecto Cloud Playfit | production |

El publishable key permanece en BuildConfig; es una clave pública de cliente, no `service_role` ni secret key.

## OAuth/deep link

- URI canónica compartida con iOS: `playfit://auth-callback`.
- Manifest: scheme `playfit`, host `auth-callback`, activity `singleTask`.
- Config local verificada en `product/supabase/config.toml`.
- La allowlist del dashboard remoto todavía debe comprobarse durante la validación en dispositivo.

## Verificación

```sh
./gradlew --offline :app:testDebugUnitTest :app:assembleDebug
./gradlew :app:assembleRelease :app:lintDebug
```

Resultado:

- 53 pruebas, 0 fallos.
- Debug APK generado correctamente.
- Release APK unsigned generado correctamente con URLs de producción.
- `lintDebug`: exitoso.
- Manifest debug/release contiene el deep link correcto.
- BuildConfig debug/release contiene los endpoints esperados.
- Health remoto de Supabase Auth: HTTP 200, GoTrue `v2.192.0`.
- Tres pruebas nuevas verifican persistencia, generación y reparación del Device ID.
- Una prueba nueva verifica que el guest solo se crea cuando no existe sesión guardada.

## Límites pendientes

1. No se completó un login OAuth real porque la app no se ejecutó por decisión de alcance.
2. Falta confirmar `playfit://auth-callback` en la allowlist remota de Supabase.
3. Delete Account requiere un endpoint backend que autentique al usuario y use privilegios server-side.
4. Tema y plataformas aún no actualizan todo el estado de producto; pertenecen a la fase de reparación de flujos.
5. El proyecto todavía necesita pruebas instrumentadas de deep links y process recreation.

## Fuentes verificadas

- Supabase Kotlin: inicialización, almacenamiento automático de sesión y `handleDeeplinks`.
- Supabase Kotlin: `sessionStatus` y restauración de sesión.
- Supabase Kotlin: OAuth retorna antes del callback en mobile.
- Supabase Auth: no se expone `service_role` en clientes públicos.
