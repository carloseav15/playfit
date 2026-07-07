# Implementación Fase 4 — Onboarding, plataformas y tema Android

Fecha: 2026-07-02  
Alcance: contrato estricto de onboarding, payload de perfil, plataformas y tema Android.  
No se ejecutó la app ni se tomaron capturas. No se modificaron iOS, web, Supabase ni la base de datos remota.

## Resultado

- Android exige al menos una plataforma, exactamente tres juegos amados y exactamente un miss.
- Se rechazan plataformas/juegos duplicados y cualquier cruce loved/avoided.
- La UI limita loved a tres y miss a uno; un juego amado aparece bloqueado en el paso negativo.
- Se eliminó “Skip for now”: la app no marca onboarding completo sin calibración válida.
- El ViewModel vuelve a validar el contrato antes de persistir o avanzar.
- `onboardingCompletedAt` se genera y conserva explícitamente.
- Los juegos de calibración se incorporan al estado local antes de construir el perfil.
- Android llama primero a `/api/recommendations/profile` para construir el perfil y luego guarda el envelope completo en `/api/profile`.
- El outbox conserva el payload completo; si estaba offline, el worker construye el perfil antes de guardar al reconectar.
- El payload usa `deviceId` camelCase, no `device_id`.
- `platforms`, `likedGameIds` y `dislikedGameIds` son estructuras JSON reales, no strings con JSON embebido.
- Los game states incluyen los campos obligatorios del esquema web y omiten opcionales nulos.
- `SignalDto` consume `tone`, alineado con `productProfileSchema`.
- Cambiar plataformas desde Settings actualiza ProductState, DataStore, perfil remoto/outbox y recomendaciones.
- No se permite guardar cero plataformas.
- Cambios rápidos de plataforma se agrupan con debounce.
- Light, Dark y System ahora controlan `PlayfitTheme` desde la raíz de Compose.

## Contrato confirmado por lectura

Fuentes de referencia leídas, sin modificaciones:

- `product/apps/web/src/app/api/profile/route.ts`: envelope estricto con `deviceId`, `gameStates`, `profile` y `onboarding`.
- `product/apps/web/src/app/api/recommendations/profile/route.ts`: construcción del perfil desde onboarding y game states.
- `product/packages/core/src/schemas.ts`: nombres, campos y enums del estado persistido.
- `ios-swiftui/Sources/PlayfitAPI/HTTPPlayfitClient.swift`: envelope equivalente enviado por iOS.
- `ios-swiftui/Sources/PlayfitFeatures/OnboardingView.swift`: tres loved, un miss y exclusión cruzada.

No se realizó ningún cambio de esquema Supabase, RLS, Edge Function o migración.

## Verificación

```sh
./gradlew --offline :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease :app:lintDebug
```

Resultado:

- 70 pruebas, 0 fallos, 0 errores.
- Debug APK generado.
- Release APK unsigned generado.
- `lintDebug`: exitoso.
- Pruebas nuevas cubren reglas de onboarding, forma JSON exacta, omisión de nulls, pipeline build-profile/save-profile, rechazo de calibración inválida y persistencia de plataformas.
- `ios-swiftui`: cero cambios tracked.
- `product`: cero cambios tracked.

## Límites pendientes

1. Falta ejecutar onboarding real contra la API local/producción.
2. Falta validar visualmente el cambio de tema y process recreation.
3. Falta probar plataformas y refresh en dispositivo, incluyendo offline→online.
4. Los archivos untracked existentes en iOS/product no forman parte de este trabajo y se dejaron intactos.
