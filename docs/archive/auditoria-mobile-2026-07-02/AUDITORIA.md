# Auditoría estática Playfit iOS y Android

Fecha: 2026-07-02  
Alcance: `ios-swiftui` y `android-compose`  
Método: lectura de código, configuración, modelos, navegación, persistencia, red, autenticación y pruebas. No se ejecutaron las apps ni se tomaron capturas.

Actualización: las Fases 1 a 4B fueron implementadas el mismo día. Véanse [IMPLEMENTACION_FASE_1.md](IMPLEMENTACION_FASE_1.md), [IMPLEMENTACION_FASE_2.md](IMPLEMENTACION_FASE_2.md), [IMPLEMENTACION_FASE_3.md](IMPLEMENTACION_FASE_3.md), [IMPLEMENTACION_FASE_4.md](IMPLEMENTACION_FASE_4.md) e [IMPLEMENTACION_FASE_4B.md](IMPLEMENTACION_FASE_4B.md). Los hallazgos conservan el estado observado durante la auditoría; los documentos de implementación identifican qué puntos ya fueron corregidos.

## 1. Conclusión ejecutiva

Android ya replica gran parte de la **forma** de iOS: tiene onboarding, autenticación, Play Next, dossier, Picks, Taste, mapa, Settings, Room, DataStore, WorkManager y los mismos tokens visuales generales. No parte de cero.

Sin embargo, todavía no replica de forma confiable el **comportamiento** de iOS. La cobertura de pantallas es alta, pero varias acciones visibles no cumplen el mismo contrato de producto o no persisten correctamente. El riesgo principal no es visual: es que Android confirme acciones que no se guardaron, pierda la identidad anónima al reiniciar, genere señales incorrectas o muestre controles de configuración que no hacen nada real.

Estimación estática, no métrica de producción:

| Dimensión | Paridad Android respecto de iOS | Evaluación |
| --- | ---: | --- |
| Pantallas y navegación | 85% | Casi todas las superficies existen. |
| Contenido y jerarquía visual | 75% | Copys, secciones y tokens son similares. |
| Interacciones principales | 60% | Picks y feedback existen, pero varias semánticas difieren. |
| Datos, persistencia y sincronización | 40% | Es la brecha más importante. |
| Autenticación y ciclo de cuenta | 45% | Implementado, pero con identidad y borrado problemáticos. |
| Accesibilidad verificable por código | 35% | iOS tiene una base claramente más madura. |
| Pruebas automatizadas | 50% | Android tiene unit tests, pero cero pruebas instrumentadas/UI. |
| Preparación global para considerarlo “versión Android de iOS” | **55%** | Buen prototipo estructural; aún no equivalente funcional. |

Recomendación: no invertir primero en pulido visual. La secuencia correcta es **contrato funcional → persistencia/sync → estados UX → accesibilidad → paridad visual**.

## 2. Fuentes de verdad y límites

### Confirmado

- Se inspeccionaron todos los archivos fuente relevantes de ambas apps.
- Se trazaron acciones visibles hasta ViewModel, repositorio, almacenamiento y API.
- `swift test`: 15 pruebas, 0 fallos.
- Auditoría inicial: `./gradlew --offline :app:testDebugUnitTest`: 36 pruebas, 0 fallos.
- Después de Fase 4B: 77 pruebas, 0 fallos; debug/release assemble y `lintDebug` exitosos.
- No se ejecutaron las apps ni se tomaron capturas.

### No comprobado todavía

- Render final, clipping, contraste real, animaciones o comportamiento por tamaño de dispositivo.
- VoiceOver, TalkBack, navegación por teclado, Switch Access o tamaños de fuente en ejecución.
- OAuth real, deep links, backend local/producción o recuperación tras pérdida de red.
- Rendimiento, consumo de memoria, recomposición, tiempos de arranque o estabilidad prolongada.
- Flujos de instalación, actualización y migración de base de datos.

Por tanto, esta auditoría identifica garantías y riesgos del código, pero no certifica calidad visual ni cumplimiento WCAG.

## 3. Auditoría del proyecto iOS

### Estado actual

iOS es la implementación de referencia más madura. Ya no es la app “mock-only” descrita por parte de su README: cuenta con API real, Supabase Auth, refresh de sesión, Keychain, SwiftData, cola local de acciones, experiencia offline, onboarding real y pruebas UI.

Arquitectura principal:

- `PlayfitRootView`: arranque, intro/onboarding, tabs, splash y estado de sync.
- `PlayViewModel`: estado de producto, acciones, auth, sync y reconstrucción de perfil.
- `HTTPPlayfitClient`: contrato con la API de Playfit.
- `SupabaseAuthClient` y `AuthSessionStore`: auth y sesión segura.
- `LocalStorageService`: SwiftData y acciones pendientes.
- `PlayfitLogic`: reglas puras de feedback, perfil, historial y Taste.

### Fortalezas

1. **Flujo raíz coherente.** Intro → onboarding → cuatro tabs, con recuperación de loading/error y estado de sincronización.
2. **Contrato de calibración estricto.** Exige plataforma, exactamente tres juegos amados y un miss; evita que el mismo juego quede simultáneamente como amado y evitado.
3. **Semántica correcta de decisiones.** “Show me another” es un skip local; “Not for me” sí crea una señal negativa.
4. **Local-first real.** Persiste perfil, game states, recomendaciones y una cola de acciones pendientes.
5. **Auth más sólida.** Device ID persistente, tokens en Keychain y refresh de sesión antes de requests.
6. **Estados UX completos.** Loading, demora, error, vacío, offline/pending sync y retry están contemplados.
7. **Accesibilidad considerada.** Dynamic Type, reduce motion, labels específicos y pruebas UI con categoría de texto XXXL.
8. **Pruebas útiles.** Hay tests de reglas de feedback, coding, API/auth y navegación UI básica.

### Riesgos y defectos iOS

#### P0 — Reset de perfil no cumple lo que promete

La UI afirma que elimina preferencias, ratings, historial y plataformas, pero el handler solo vacía plataformas, cambia flags de onboarding y vuelve a guardar el mismo perfil. No borra game states, recomendaciones cacheadas ni acciones pendientes.

Impacto: al recalibrar, señales antiguas pueden sobrevivir o reaparecer. Es un defecto de confianza y privacidad.

Acción: crear una operación única `resetTasteKeepingSession()` que use el borrado completo local, conserve explícitamente la sesión y defina cómo evitar que el siguiente sync restaure datos antiguos del cloud.

#### P1 — Cache de recomendaciones puede conservar entradas obsoletas

`cacheRecommendations` hace upsert, pero no elimina recomendaciones que dejaron de pertenecer al conjunto vigente. `loadCachedRecommendations` carga todo sin orden explícito.

Impacto: un arranque offline puede usar candidatos antiguos, con primary no determinista.

Acción: reemplazo transaccional del snapshot, versión de estado y orden/rank persistido.

#### P1 — Errores de SwiftData se silencian

La mayoría de operaciones usan `try?`; una escritura fallida puede producir confirmación visual sin persistencia. Además, si el `ModelContainer` no inicializa, la app termina con `fatalError`.

Acción: propagar errores relevantes al ViewModel, instrumentar fallos y definir recuperación/migración segura.

#### P1 — El perfil local pierde `signals`

`loadProfile` reconstruye `UserProfile` con `signals: []`. El resto del resumen se conserva, pero la representación offline no es íntegra.

Acción: persistir signals o documentar y probar que siempre se derivan de game states.

#### P1 — Reset y borrado no comparten una política de datos formal

Existe `resetAllLocalState()`, pero también borra auth; la pantalla de privacidad necesita conservarla para reset de taste. El resultado es lógica duplicada e incompleta.

Acción: separar operaciones de dominio: reset taste, delete local data, delete cloud profile y sign out.

#### P2 — OAuth usa una URI distinta a la documentación y Android

iOS construye `playfit://auth-callback`; la documentación y Android usan `playfit://auth/callback`.

Impacto: requiere comprobar el allowlist real de Supabase. No puede asumirse que ambos clientes tienen el mismo deep-link contract.

#### P2 — Componentes grandes y alta concentración de responsabilidades

`SettingsView.swift` ronda 1,448 líneas, `OnboardingView.swift` 803 y `PlayViewModel.swift` 717.

Acción: extraer subfeatures y casos de uso después de corregir comportamiento; no hacer una refactorización cosmética antes.

#### P2 — Riesgos visuales estáticos

- El selector de cuatro razones usa un `HStack` fijo y puede comprimir o cortar texto grande.
- Algunas cuadrículas mantienen columnas fijas con Dynamic Type.
- Los glows custom se repiten en varias pantallas.

Estos puntos necesitan validación en dispositivo/simulador.

### Evaluación UI/UX iOS

La jerarquía responde bien al objetivo “¿qué juego debo jugar ahora?”: primary dominante, razones visibles, warnings separados y acciones claras. Los estados vacíos y errores suelen incluir una salida. La principal deuda UX es de **honestidad operacional**: reset y algunos fallos de persistencia pueden mostrar éxito sin haber aplicado el resultado prometido.

## 4. Auditoría del proyecto Android

### Estado actual

Android es una app Compose monomódulo con una cobertura visual considerable:

- Hilt, Retrofit/OkHttp y Kotlin Serialization.
- Supabase Auth.
- Room para game states y picks.
- DataStore para onboarding, tema, plataformas y timestamps.
- WorkManager para reintentos de sync.
- ViewModel con StateFlow.
- Material 3, tema light/dark y componentes Playfit.

La documentación también está atrasada: ya no es solo un scaffold mock.

### Fortalezas

1. **Cobertura de superficies alta.** Intro, onboarding, auth, Play Next, dossier, Picks, Taste/Activity, mapa y Settings existen.
2. **Lenguaje visual alineado.** Misma paleta semántica, fondos, cards, score/reason components y copys principales.
3. **Arquitectura reconocible.** UI → ViewModel → Repository → API/Room/DataStore.
4. **Offline foundation presente.** Room, WorkManager y red observable ya están incluidos.
5. **Feedback principal presente.** Picks, already played, not for me y refresh están cableados.
6. **Tests unitarios existentes.** ViewModel, utilidades y coordenadas del mapa tienen 36 tests verdes.

### Defectos Android prioritarios

#### P0 — Device ID no es persistente

**Estado posterior: corregido en Fase 2.** El ID usa almacenamiento persistente síncrono, se valida como UUID y queda disponible antes de que OkHttp construya la primera petición.

`AuthManager` genera `UUID.randomUUID()` en memoria. Aunque DataStore define `device_id`, ese valor no se usa.

Impacto: una sesión anónima puede convertirse en un usuario distinto después de matar/reabrir el proceso. Perfil, onboarding y recomendaciones pueden fragmentarse.

Acción: un único `DeviceIdProvider` persistido en DataStore, inicializado antes de cualquier request y cubierto por tests de reinicio.

#### P0 — El onboarding puede crear estados inválidos

**Estado posterior: corregido en Fase 4.** Android exige ≥1 plataforma, exactamente 3 loved y exactamente 1 miss, impide duplicados/cruces, elimina skip y envía el envelope estructurado que exige la API.

- “Skip for now” marca onboarding como completado sin plataformas ni señales.
- Loved usa un `Set` y permite más de tres juegos.
- Missed permite más de uno.
- El payload envía plataformas y listas como strings JSON dentro de un `Map<String, String>`, en vez del contrato estructurado que usa iOS/backend.
- `saveOnboarding` ignora errores y aun así la UI avanza.

Impacto: el usuario llega a tabs sin perfil útil y recibe una aparente finalización aunque el servidor no haya aceptado el estado.

Acción: copiar el contrato iOS: ≥1 plataforma, exactamente 3 liked, exactamente 1 miss, sin duplicados cruzados, payload tipado, confirmación local y sincronización explícita.

#### P0 — Feedback destruye información y usa semánticas incorrectas

**Estado posterior: corregido en Fase 1.** Se portaron las transiciones puras de iOS, el merge preserva campos no relacionados, skip es neutral y los estados se serializan con valores backend canónicos.

`applyFeedback` crea una entidad nueva con rating/status nulos para casi todos los feedbacks. Solo distingue `NotForMe`; “Loved”, “Liked”, “Mixed”, “Played…” no se traducen al rating/status que usa iOS.

Además:

- “Show me another option” se envía como `NotForMe`.
- El botón “Skip” de alternativas también llama a `NotForMe`.
- `togglePick` reemplaza el estado completo y puede borrar rating/status previos.

Impacto: Android entrena el perfil con datos equivocados y puede borrar señales existentes.

Acción: portar las funciones puras de `PlayfitLogic` a Kotlin y probar cada transición de estado antes de tocar UI.

#### P0 — Reset, sign-out y delete están rotos o son engañosos

**Estado posterior: corregido salvo Delete Account.** Sign-out conserva datos; Reset Taste borra estado local/cloud mediante el endpoint existente, conserva sesión y usa outbox offline. La operación admin insegura fue eliminada. Borrar la identidad sigue bloqueado hasta disponer de un endpoint backend autorizado.

- Reset llama `completeOnboarding()`, que vuelve a poner onboarding en `true`.
- Sign out invoca también ese callback, creando una carrera entre `false` y `true`.
- Delete navega a una ruta `splash` que no está en el NavHost.
- `AuthManager.deleteAccount()` intenta usar una operación admin desde el cliente y silencia cualquier error.
- La UI promete borrar cuenta y credenciales aunque no puede garantizarlo.

Acción: definir las mismas cuatro operaciones explícitas de iOS y usar un endpoint backend autorizado para borrado de cuenta/perfil.

#### P0 — Configuración visible que no cambia el producto

**Estado posterior: corregido entre Fases 2 y 4.** Debug usa servicios locales y release usa producción; Developer Settings muestra la configuración compilada y ya no ofrece botones falsos. Tema controla la raíz Compose y plataformas actualiza estado, persistencia, sync y recomendaciones.

- El selector Light/Dark/System guarda DataStore, pero `MainActivity` siempre usa `isSystemInDarkTheme()`.
- Plataformas se guardan en DataStore, pero no actualizan `ProductState`, no se envían al servidor y no refrescan el perfil correctamente.
- “Switch to Production” solo llama refresh; el base URL sigue compilado como `http://10.0.2.2:3000`.
- “Clear Local Cache” también solo llama refresh.

Impacto: controles que aparentan éxito sin aplicar el cambio.

Acción: ocultar estas acciones hasta que sean reales o conectarlas correctamente. Nunca dejar botones placebo en Settings.

#### P0 — Errores de red se convierten en estados vacíos

**Estado posterior: corregido en Fase 3.** El repositorio devuelve resultados/errores tipados, conserva snapshots Room y diferencia vacío real de error. El ViewModel mantiene datos previos y etiqueta cache stale.

El repositorio captura excepciones y devuelve modelos vacíos, listas vacías o perfiles vacíos. El ViewModel interpreta eso como éxito y puede mostrar “No games” en vez de “No pudimos conectar”.

Acción: usar resultados tipados (`Result`/sealed errors), conservar cache y distinguir empty real, offline y error.

#### P1 — Offline cache incompleto

**Estado posterior: corregido en gran parte en Fase 3.** Recomendaciones, Picks y perfil tienen snapshots persistentes; game states se reconcilian sin pisar pendientes; onboarding usa outbox y el worker reporta fallos/reintentos. Search Games y pruebas instrumentadas de migración continúan pendientes.

- `getPicks()` escribe Room, pero en error devuelve `emptyList()` en vez de leer Room.
- Recomendaciones dependen de memoria (`SessionCache`) y no están integradas al flujo principal persistente.
- `getState()` no combina Room con servidor.
- SyncWorker solo procesa game states; no onboarding, delete o perfil.

Acción: repositorio local-first con una sola fuente observable y outbox tipado.

#### P1 — Auth reporta éxitos falsos

**Estado posterior: corregido en Fase 2.** `AuthResult` propaga success, pending y error; OAuth se considera pending hasta recibir el deep link y la sesión restaurada se usa antes de crear un guest.

Las funciones del repositorio ignoran `AuthResult` y devuelven `true` aunque AuthManager haya respondido `Error`. El ViewModel también hace sign-in anónimo automático en cada inicialización, incluso antes de conocer el estado persistido.

Acción: eliminar wrappers booleanos, propagar `AuthResult`, restaurar sesión primero y crear guest solo cuando sea necesario.

#### P1 — Taste/Activity no tiene datos equivalentes

**Estado posterior: corregido en Fase 4B.** Activity y traits se derivan de game states/onboarding reales, hidratan metadata por batch, reconstruyen el perfil tras feedback y conservan fallback offline.

`getTasteModel()` devuelve `historyEntries` y `mapTraits` vacíos. `deleteSignal` solo elimina del StateFlow en memoria y no persiste ni llama API. Los nodos sin metadata usan coordenadas derivadas de un ID, no rasgos reales.

Impacto: la pantalla existe, pero su contenido y acciones no representan el mismo modelo que iOS.

#### P1 — Detalle solo abre juegos ya cargados

**Estado posterior: corregido en Fase 4B.** El dossier carga por ID y diferencia loading, not found, error y retry, manteniendo cache como fallback.

La navegación busca el juego únicamente en Play Next o Picks. Si no está allí, muestra “Game not found”; no hace fetch por ID como iOS.

Acción: estado de detalle por ID con loading, fetch, 404 y error.

#### P1 — Paridad de accesibilidad insuficiente

- Solo se encontraron 9 usos explícitos de `contentDescription`/semántica, frente a 52 señales de accesibilidad/Dynamic Type en iOS.
- No hay `androidTest`.
- El Canvas del mapa no expone nodos como elementos semánticos; las cards inferiores ayudan, pero no sustituyen una alternativa textual completa.
- Back y close usan caracteres (`←`, `✕`) en vez de iconos con descripciones.
- El modal Already Played coloca cuatro botones en una sola fila de teléfono y usa símbolos/emoji como iconos.
- Filas `clickable` no declaran rol ni garantizan target mínimo.

Acción: baseline TalkBack + font scale 200% + touch targets 48dp + tests Compose.

#### P1 — Riesgo de pérdida de estado por debounce global

Existe un solo `saveJob`; una segunda edición cancela el guardado anterior aunque corresponda a otro juego.

Acción: guardar inmediatamente en Room y debounce solo la sincronización remota, por clave de entidad.

#### P2 — Layouts no adaptativos

- No se usa `WindowSizeClass` ni navegación adaptativa.
- Varias filas tienen pesos/columnas fijos.
- Los chips seleccionados del onboarding usan `Row`, no `FlowRow`, y pueden salir del ancho.
- Métricas en tres columnas y cuatro opciones en una fila necesitan reflow.

### Evaluación UI/UX Android

La intención visual está bien alineada y el primer vistazo probablemente se sentirá como Playfit. El problema es la confianza: muchas acciones tienen copy correcto pero semántica o persistencia incorrecta. Antes de acercar píxeles, Android debe dejar de confirmar operaciones que no realizó.

## 5. Comparación pantalla por pantalla

| Flujo/superficie | iOS | Android | Paridad | Salud Android |
| --- | --- | --- | --- | --- |
| 1. Splash | Animación, reduce motion y omisión en UI tests | Animación equivalente | Alta | Amarillo: falta prueba/accesibilidad. |
| 2. Intro | Propuesta, preview, theme y sign-in | Propuesta y preview similares | Alta | Amarillo: theme aún no controla app. |
| 3. Auth | Email, Google, guest, reset; Keychain/refresh | Mismas opciones con Supabase SDK | Media | Rojo: resultados y delete inconsistentes. |
| 4. Plataformas | Catálogo API + fallback; persistencia y sync | Solo fallback; DataStore separado | Media | Rojo: no afecta recomendaciones reales. |
| 5. 3 loved + 1 miss | Reglas exactas y exclusión cruzada | Permite cantidades inválidas | Media visual / baja funcional | Rojo. |
| 6. Finalizar onboarding | Perfil local + upload antes de recommendations | Guarda payload débil, ignora error y avanza | Baja | Rojo. |
| 7. Play Next | Primary, reasons, watch-outs, local skip, states | UI muy parecida | Alta visual / baja lógica | Rojo por feedback y errores vacíos. |
| 8. Show another | Rotación local sin entrenar | Marca NotForMe | Muy baja | Rojo crítico. |
| 9. Already Played | Ratings/status correctos | Modal existe | Media visual / baja persistencia | Rojo. |
| 10. Game dossier | Fetch por ID, loading/404/error y actions | Solo contexto ya cargado | Media | Amarillo/Rojo. |
| 11. Picks | Lista, empty, manage, remove/played | Lista y manage similares | Media | Amarillo: cache/estado puede perderse. |
| 12. Taste summary | Perfil, confianza, activity, map y traits list | Perfil y activity/map visibles | Media | Rojo: modelos derivados vacíos. |
| 13. Affinity map | Nodos accesibles + lista textual separada | Canvas + cards horizontales | Media visual / baja a11y | Rojo para TalkBack. |
| 14. Settings | Theme real, plataformas conectadas, account/privacy | Superficie equivalente | Alta visual / baja funcional | Rojo: múltiples botones placebo/rotos. |
| 15. Offline/sync | Cache + pending actions + estado visible | Room/Worker presentes | Baja | Rojo: no son fuente de verdad completa. |

## 6. Plan de acción para convertir Android en la versión Android de iOS

### Fase 0 — Congelar el contrato de referencia (1–2 días)

Objetivo: evitar que iOS y Android sigan divergiendo.

1. Escribir una tabla canónica de endpoints, payloads y respuestas.
2. Documentar transiciones de cada acción: pick, unpick, skip, not-for-me, played-loved/liked/mixed/dropped, started y delete signal.
3. Definir operaciones de cuenta/datos: reset taste, sign out, delete cloud profile, delete identity.
4. Actualizar los README para reflejar que ambas apps ya tienen API/auth/persistencia.

Criterio de salida: ningún equipo necesita leer Swift para entender el contrato.

### Fase 1 — Portar la lógica de dominio iOS a Kotlin (3–5 días)

**Estado: completada el 2026-07-02.**

1. Crear funciones puras Kotlin equivalentes a `PlayfitLogic`.
2. Corregir merge de game states; nunca reemplazar campos no relacionados.
3. Separar skip neutral de feedback negativo.
4. Mapear correctamente todos los ratings/status.
5. Añadir tests de tabla para cada transición y secuencia de acciones.

Criterio de salida: la misma entrada produce el mismo `UserGameState` en iOS y Android.

### Fase 2 — Identidad, auth y entorno (3–4 días)

**Estado: completada localmente el 2026-07-02.** El endpoint remoto de borrado de identidad y la validación OAuth en dispositivo siguen siendo dependencias externas explícitas.

1. Device ID persistente en DataStore.
2. Restaurar sesión antes de guest sign-in.
3. Propagar `AuthResult`; eliminar éxitos falsos.
4. Unificar deep link OAuth y allowlist.
5. Crear build types/config real para local y producción.
6. Mover delete identity/profile a backend autorizado.

Criterio de salida: reiniciar el proceso no cambia el perfil; auth y delete tienen resultados verificables.

### Fase 3 — Repositorio local-first y sync (5–8 días)

**Estado: completada localmente el 2026-07-02.** Persisten como validación pendiente las pruebas instrumentadas de migración, process recreation y reconexión real.

1. Room como fuente local para game states, picks y recommendations snapshot.
2. Outbox tipado para save/delete/onboarding.
3. Lectura inmediata de cache; refresh remoto en segundo plano.
4. Errores tipados: loading, cached, empty, offline y failed.
5. Worker que no silencie fallos y registre retry/error.
6. Guardado local inmediato; debounce solo remoto y por entidad.

Criterio de salida: todas las acciones sobreviven cierre/reapertura offline y sincronizan una vez al recuperar red.

### Fase 4 — Reparar flujos de producto (4–6 días)

**Estado: completada en Android entre Fase 4 y 4B, salvo Delete Account.** Onboarding, dossier, Taste, Delete Signal, Reset Taste, tema y plataformas ya están conectados. El borrado de identidad requiere un endpoint backend autorizado.

1. Onboarding exactamente 1+ plataformas, 3 loved y 1 miss.
2. Eliminar “Skip for now” o convertirlo en una ruta explícita que no finja perfil completo.
3. Detalle por ID con loading/404/error.
4. Taste history/map traits derivados de datos reales.
5. Delete signal persistente.
6. Reset/sign-out/delete con navegación válida y copy exacto.
7. Settings: theme, platforms, production y cache deben funcionar o no mostrarse.

Criterio de salida: completar los 15 pasos de la tabla produce el mismo resultado de producto que iOS.

### Fase 5 — Accesibilidad y adaptabilidad (4–6 días)

1. Semántica TalkBack para todas las acciones e imágenes informativas.
2. Iconos Material, no caracteres o emoji, con content descriptions.
3. Reflow a font scale 200%; `FlowRow`/columnas adaptativas.
4. Touch targets mínimos de 48dp.
5. Alternativa textual al mapa.
6. `WindowSizeClass` para teléfono/tablet/foldable.
7. Pruebas Compose de navegación, onboarding, vacíos, errores y Settings.

Criterio de salida: flujo principal completo con TalkBack y escala de fuente 200%, sin clipping ni controles inaccesibles.

### Fase 6 — Paridad visual y validación final (3–5 días)

1. Ejecutar ambas apps con el mismo fixture/perfil.
2. Capturar cada uno de los 15 pasos al mismo tamaño aproximado.
3. Comparar jerarquía, spacing, tipografía, estados y feedback.
4. Mantener componentes nativos de cada plataforma; igualar intención y contenido, no copiar controles iOS literalmente.
5. Probar offline, reconexión, reinicio de proceso y OAuth real.

Criterio de salida: matriz funcional 100% verde y diferencias visuales justificadas por patrones Android nativos.

## 7. Orden recomendado de implementación

Backlog inmediato:

1. Device ID persistente.
2. Port de feedback/state transitions.
3. Corregir onboarding y payload.
4. Estados de error vs empty.
5. Reset/sign-out/delete.
6. Configuración real de tema/plataformas/entorno.
7. Repositorio local-first y outbox.
8. Taste/detail parity.
9. Accesibilidad y UI tests.
10. Capturas y ajuste visual.

No recomiendo reescribir Android. La base Compose actual es recuperable; conviene corregir contratos y flujos en el proyecto existente.

## 8. Definición de “Android equivalente a iOS”

Android estará listo cuando:

- Mantenga la misma identidad anónima entre reinicios.
- Acepte exactamente el mismo onboarding válido.
- Produzca las mismas transiciones de estado para cada acción.
- Nunca confunda skip con dislike.
- Sea útil offline y no pierda acciones.
- Distinga error, empty, cached y syncing.
- Theme, plataformas, reset, sign-out y delete hagan lo que su copy promete.
- Taste y dossier usen datos reales, no placeholders estructurales.
- Tenga pruebas UI del flujo crítico y una baseline TalkBack.
- Las diferencias visuales sean adaptaciones Material 3 deliberadas, no omisiones.
