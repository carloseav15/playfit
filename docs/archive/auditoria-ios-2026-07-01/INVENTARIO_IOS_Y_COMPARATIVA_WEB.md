# Inventario verificable de Playfit iOS y comparativa con `/play` web

Fecha: 2026-07-01  
Alcance iOS: `/Users/carancibia/Projects/playfit/ios-swiftui`  
Base de comparación web: `AUDITORIA_PLAY_MOBILE_IOS.md` y el código bajo `product/apps/web/src/app/play` y `product/apps/web/src/components/playfit-mvp`.  
Método: auditoría estática. No se modificó código ni se realizaron pruebas visuales.

## Resumen

La aplicación iOS tiene una arquitectura nativa real y cubre todas las áreas principales de `/play`, pero su equivalencia funcional es parcial. Las pantallas y gran parte de la interacción existen; los mayores problemas están en contratos de datos, persistencia de Picks, señales de Taste, ciclo de sesión y algunos estados de carga/error.

Estado general: **Parcial**. No debe iniciarse trabajo visual adicional antes de corregir los contratos P0 descritos al final.

## 1. Pantallas existentes

| Pantalla iOS | Tipo | Propósito | Evidencia |
| --- | --- | --- | --- |
| `PlayfitRootView` | Root coordinator | Decide entre intro, onboarding y app principal; instala tabs | `ios-swiftui/Sources/PlayfitFeatures/PlayfitRootView.swift:7-105` |
| `DecisionIntroView` | Pantalla | Promesa de producto, iniciar calibración, sign in y theme | `ios-swiftui/Sources/PlayfitFeatures/DecisionIntroView.swift:5-32,53-145` |
| `OnboardingView` | Flujo de pantalla | Plataformas, 3 favoritos, 1 rechazo y búsqueda | `ios-swiftui/Sources/PlayfitFeatures/OnboardingView.swift:16-69,139-166` |
| `TodayView` | Tab principal | Play Next, alternativas, estados y feedback | `ios-swiftui/Sources/PlayfitFeatures/TodayView.swift:6-45,178-321` |
| `GameDetailView` | Push destination | Dossier de recomendación y acciones | `ios-swiftui/Sources/PlayfitFeatures/GameDetailView.swift:6-167` |
| `PicksView` | Tab | Picks guardados y gestión | `ios-swiftui/Sources/PlayfitFeatures/PicksView.swift:5-86` |
| `TasteView` | Tab | Resumen, mapa y acceso a actividad | `ios-swiftui/Sources/PlayfitFeatures/TasteView.swift:6-118` |
| `TasteMapVisualizerView` | Subvista compleja | Mapa interactivo de juegos/señales | `ios-swiftui/Sources/PlayfitFeatures/TasteMapVisualizerView.swift:6-163` |
| `DecisionsActivityView` | Subvista de tab | Filtros All/Picks/Taste y gestión de señales | `ios-swiftui/Sources/PlayfitFeatures/DecisionsActivityView.swift:6-114` |
| `SettingsView` | Tab | Menú de apariencia, plataformas, privacidad y cuenta | `ios-swiftui/Sources/PlayfitFeatures/SettingsView.swift:7-227` |
| `AppearanceView` | Push destination | Light, Dark y System | `ios-swiftui/Sources/PlayfitFeatures/SettingsView.swift:298-392` |
| `PlatformSelectionView` | Push destination | Presets y selección individual de plataformas | `ios-swiftui/Sources/PlayfitFeatures/SettingsView.swift:412-710` |
| `PrivacySettingsView` | Push destination | Reset y delete con confirmación | `ios-swiftui/Sources/PlayfitFeatures/SettingsView.swift:776-976` |
| `DeveloperSettingsView` | Push destination DEBUG | Cambia development/production y fuerza sync | `ios-swiftui/Sources/PlayfitFeatures/SettingsView.swift:729-776` |
| `SignInSheetView` | Sheet | Google, email sign-in y signup | `ios-swiftui/Sources/PlayfitFeatures/SettingsView.swift:1002-1413` |

No existe una pantalla iOS que resuelva un dossier desde un `gameId` arbitrario. `GameDetailView` exige recibir un `RankedRecommendation` ya cargado (`ios-swiftui/Sources/PlayfitFeatures/GameDetailView.swift:6-13`).

## 2. Componentes principales

| Grupo | Componentes | Evidencia |
| --- | --- | --- |
| Design system | `PlayfitGlassCard`, colores, spacing, cover placeholder | `ios-swiftui/Sources/PlayfitDesignSystem/PlayfitDesignSystem.swift:1-94`; `ios-swiftui/Sources/PlayfitDesignSystem/Colors.swift:1-74` |
| Recomendación | `RecommendationMetric`, `FitReasonsCard`, `SignalSummaryBar` | `ios-swiftui/Sources/PlayfitDesignSystem/RecommendationMetric.swift:1-56`; `ios-swiftui/Sources/PlayfitDesignSystem/FitReasonsCard.swift:1-67`; `ios-swiftui/Sources/PlayfitDesignSystem/SignalSummaryBar.swift:1-55` |
| Feedback | `AlreadyPlayedSheet`, `FeedbackReasonPicker`, `StatusToast` | `ios-swiftui/Sources/PlayfitDesignSystem/AlreadyPlayedSheet.swift:1-38`; `ios-swiftui/Sources/PlayfitDesignSystem/FeedbackReasonPicker.swift:1-64`; `ios-swiftui/Sources/PlayfitDesignSystem/StatusToast.swift:1-86` |
| Estado y lógica | `PlayViewModel`, `PlayfitLogic` | `ios-swiftui/Sources/PlayfitFeatures/PlayViewModel.swift:8-74`; `ios-swiftui/Sources/PlayfitLogic/PlayfitLogic.swift:4-145` |
| Red/Auth | `HTTPPlayfitClient`, `SupabaseAuthClient`, `AuthSessionStore` | `ios-swiftui/Sources/PlayfitAPI/HTTPPlayfitClient.swift:4-18`; `ios-swiftui/Sources/PlayfitAPI/SupabaseAuthClient.swift:30-104`; `ios-swiftui/Sources/PlayfitAPI/AuthSession.swift:24-65` |
| Persistencia | `LocalStorageService` y modelos SwiftData | `ios-swiftui/Sources/PlayfitStorage/LocalStorageService.swift:6-20`; `ios-swiftui/Sources/PlayfitStorage/SDProfile.swift:1-38`; `ios-swiftui/Sources/PlayfitStorage/SDGameState.swift:1-38`; `ios-swiftui/Sources/PlayfitStorage/SDPendingAction.swift:1-25` |

## 3. Flujos de navegación

### Entrada

`PlayfitIOSApp` abre `PlayfitRootView` (`ios-swiftui/PlayfitIOS/PlayfitIOSApp.swift:4-10`). El root ejecuta `viewModel.load()`, y luego decide:

- onboarding completo → `TabView`;
- onboarding iniciado → `OnboardingView`;
- de lo contrario → `DecisionIntroView` (`ios-swiftui/Sources/PlayfitFeatures/PlayfitRootView.swift:19-69`).

Mientras `isReady` es false, el `Group` no presenta un loading view. Como `load()` puede esperar plataformas y sync, el arranque puede quedar visualmente vacío (`PlayfitRootView.swift:19-69`; `PlayViewModel.swift:187-197`).

### Navegación principal

El `TabView` contiene cuatro `NavigationStack`: Play Next, Picks, Taste y Settings. Picks muestra badge (`ios-swiftui/Sources/PlayfitFeatures/PlayfitRootView.swift:72-105`).

### Navegación secundaria

- Today y alternativas hacen push a `GameDetailView` (`ios-swiftui/Sources/PlayfitFeatures/TodayView.swift:216-223,312-319`).
- Picks hace push a detalle y usa `confirmationDialog`, swipe y sheet (`ios-swiftui/Sources/PlayfitFeatures/PicksView.swift:28-79,117-191`).
- Taste alterna internamente entre Your Taste y Activity con `Picker` segmentado (`ios-swiftui/Sources/PlayfitFeatures/TasteView.swift:32-46`).
- Settings usa `NavigationLink` hacia Appearance, Platforms, Privacy y Developer (`ios-swiftui/Sources/PlayfitFeatures/SettingsView.swift:21-96,197-227`).
- Auth, game feedback y cambio de señal usan sheets (`PlayfitRootView.swift:48-60`; `GameDetailView.swift:120-125`; `DecisionsActivityView.swift:109-113`).

## 4. Estados implementados

| Superficie | Loading | Empty | Error | Success | Disabled |
| --- | --- | --- | --- | --- | --- |
| Root | **No visible** mientras `isReady=false` | Intro para perfil nuevo | Error no se presenta en root antes de tabs | Tabs/onboarding/intro | No aplica (`PlayfitRootView.swift:19-69`) |
| Onboarding plataformas | Plataformas se cargan en `load()` | Fallback hardcoded si API no responde | Error de plataformas no visible | Selección y avance | Continue sin plataforma (`OnboardingView.swift:265-280`; `PlayViewModel.swift:187-193`) |
| Onboarding favoritos/rechazo | N/A | Slots sin seleccionar | N/A | Avance con 3 + 1 | Continue <3 y Complete sin miss (`OnboardingView.swift:324,453`) |
| Search onboarding | `ProgressView` | Prompt inicial y no-results | `searchError` visible | Lista seleccionable | No confirma disabled de duplicados (`OnboardingView.swift:466-535`) |
| Today | Skeleton/redacted y aviso tras 3 s | No recommendations y skipped-session | “Play Next could not load” | Primary + alternatives | Add Pick si ya existe (`TodayView.swift:23-39,82-176,235-246`) |
| Picks | No loading propio | `ContentUnavailableView` | No error propio | List + actions | No aplica (`PicksView.swift:12-85`) |
| Taste | Overlay `ProgressView` | Actividad tiene empty genérico | Usa `viewModel.error`, pero no presenta error específico en Taste | Summary/map/activity | No aplica (`TasteView.swift:16-60`; `DecisionsActivityView.swift:48-72`) |
| Dossier | No | No | No | Contenido con acciones | No (`GameDetailView.swift:15-126`) |
| Settings/Auth | `ProgressView` y `actionPending` | Local-only account state | Toast de Auth/Sync/Delete | Sign-in/signup/reset/delete | Botones deshabilitados durante acción (`SettingsView.swift:776-976,1002-1368`) |
| Offline sync | Count de pending actions | Cola vacía | Errores se encolan | Overlay local evita rollback visual | No aplica (`PlayViewModel.swift:246-248,442-517`) |

## 5. Formularios y validaciones

- Onboarding exige al menos una plataforma, tres favoritos y un rechazo mediante botones disabled (`ios-swiftui/Sources/PlayfitFeatures/OnboardingView.swift:265-275,314-324,443-453`).
- Búsqueda tiene debounce de 250 ms, cancelación de task obsoleta y error (`OnboardingView.swift:637-665`).
- Seleccionar un favorito elimina el mismo juego como miss y viceversa (`OnboardingView.swift:668-682`).
- Sign-in valida sintaxis básica del email y password no vacío (`ios-swiftui/Sources/PlayfitFeatures/SettingsView.swift:1188-1208`).
- Sign-up valida email y password mínimo de 6 (`SettingsView.swift:1281-1309`).
- Reset/Delete requiere doble acción y deshabilita controles durante el request (`SettingsView.swift:776-944`).
- No se encontró forgot-password en iOS, aunque existe en web.
- Las quick suggestions de onboarding **no consultan el catálogo**: crean un `Game` local mínimo con ID derivado del título (`OnboardingView.swift:539-563`). Es funcionalidad simulada y puede guardar IDs inexistentes en backend.

## 6. Reglas de negocio implementadas

| Regla | Estado iOS | Evidencia / diferencia |
| --- | --- | --- |
| Calibración 1/3/1 | Implementada | `OnboardingView.swift:265-275,314-324,443-453` |
| Thresholds 58/78/62 | Implementada | `ios-swiftui/Sources/PlayfitLogic/PlayfitLogic.swift:4-8` |
| Confidence labels y decision tone | Implementada | `PlayfitLogic.swift:78-130` |
| Already played mappings | Mayormente implementada | `PlayfitLogic.swift:12-75` |
| Show another solo sesión | Implementada | Solo agrega a `excludedIds`, no persiste (`PlayViewModel.swift:252-257,288-296`) |
| Add Pick no entrena gusto | **Incorrecta** | `addPick` aplica `.liked` (`PlayViewModel.swift:265-271`) |
| Pick persistido en `inPlayfitPicks` | **Incorrecta** | `addPick` no establece el campo; `removePick` sí lo limpia (`PlayViewModel.swift:265-271,317-322`) |
| Máximo 100 picks | No | No se encontró validación equivalente al web |
| Picks ordenados por backend | Parcial | `fetchPicks()` existe pero no se invoca; UI filtra `visiblePool` (`PlayfitAPIClient.swift:27-29`; `PlayViewModel.swift:238-240`) |
| Onboarding como señales separadas | Incorrecta | iOS crea ratings/excluded en game state (`OnboardingView.swift:713-719`) |
| Change signal exacto | Incorrecta | Dropped no marca abandoned/excluded y Not for me no fija rating 2 (`PlayViewModel.swift:331-355`) |
| Recalcular perfil tras feedback | Parcial | Lógica iOS muta game state, pero no reconstruye el perfil adaptativo local |
| Started desde Picks | No | No existe acción en `PicksView`; web mobile tampoco la implementa aunque el brief la exige |

## 7. Conexiones a API, Supabase y backend

| Integración | Estado | Evidencia |
| --- | --- | --- |
| `POST /api/recommendations/today` | Implementada | `HTTPPlayfitClient.swift:26-47` |
| `GET /api/recommendations/picks` | Cliente implementado, flujo no usado | `HTTPPlayfitClient.swift:49-54`; `PlayViewModel.swift:121-159` |
| `GET/POST/DELETE /api/profile` | Implementada | `HTTPPlayfitClient.swift:77-120,137-210,226-237` |
| `PATCH/DELETE /api/profile/games/:id` | Implementada | `HTTPPlayfitClient.swift:122-135,239-250` |
| `GET /api/games?q=` | Implementada | `HTTPPlayfitClient.swift:56-75` |
| `POST /api/games/batch` | Implementada | `HTTPPlayfitClient.swift:252-266` |
| `GET /api/platforms` | Implementada | `HTTPPlayfitClient.swift:212-224` |
| Supabase email/password | Implementada | `SupabaseAuthClient.swift:41-64` |
| Supabase Google OAuth | Implementada con system auth session | `SupabaseAuthClient.swift:72-104` |
| Supabase sign-out | Implementada | `SupabaseAuthClient.swift:66-70` |
| Refresh token | No | `AuthSession` guarda refresh token/expiry, pero no existe operación de refresh en el cliente (`AuthSession.swift:4-21`; `SupabaseAuthClient.swift:41-104`) |
| SwiftData offline | Implementada parcial | Profile, game states, cached recs y pending actions (`LocalStorageService.swift:29-206`) |
| Firebase | No confirmado / no encontrado | No hay imports, SDK ni llamadas Firebase en los Sources inspeccionados |

Problema de contrato confirmado: el backend devuelve `game_states`, pero `ProfileState` espera `gameStates` (`product/supabase/migrations/20260620210000_play_recommendation_session_contract.sql:9-15`; `ios-swiftui/Sources/PlayfitAPI/HTTPPlayfitClient.swift:303-315`). Además, `UserProfile` decodifica snake_case mientras `saveProfile` construye profile camelCase (`ios-swiftui/Sources/PlayfitModels/PlayfitModels+New.swift:126-156`; `HTTPPlayfitClient.swift:182-200`).

## 8. Autenticación, permisos y roles

- Sesiones Supabase usan email/password o Google y se almacenan en Keychain (`ios-swiftui/Sources/PlayfitAPI/AuthSession.swift:24-65`).
- Requests API agregan bearer token si existe; siempre incluyen `device_id` (`ios-swiftui/Sources/PlayfitAPI/HTTPPlayfitClient.swift:270-282`).
- El usuario puede usar la app localmente sin cuenta; Settings ofrece posterior sign-in/sync (`ios-swiftui/Sources/PlayfitFeatures/SettingsView.swift:102-190`).
- No se encontraron roles de producto, premium, admin o autorización por pantalla. Estado: **No confirmado porque no existe evidencia de roles**.
- No se solicitan permisos de cámara, fotos, ubicación, micrófono o notificaciones. `Info.plist` solo configura URL scheme y local networking (`ios-swiftui/PlayfitIOS/Info.plist:5-20`).
- Google OAuth usa `ASWebAuthenticationSession`, no WebView (`ios-swiftui/Sources/PlayfitAPI/SupabaseAuthClient.swift:74-103`).
- No está implementado el refresh del JWT. Una sesión expirada puede dejar de autenticar requests aunque exista refresh token.
- `authEmail` se guarda aparte en `AppStorage`, mientras la sesión real vive en Keychain (`PlayfitRootView.swift:8-13`; `AuthSession.swift:24-65`). Pueden divergir si un flujo falla entre ambos writes.

## 9. Adaptaciones existentes a Apple HIG

### Bien adaptado

- `TabView` con cuatro destinos y badge nativo (`PlayfitRootView.swift:72-105`).
- `NavigationStack`/`NavigationLink` para jerarquía y back del sistema (`PlayfitRootView.swift:74-101`; `TodayView.swift:216-223`).
- `List`, `ContentUnavailableView` y swipe actions en Picks (`PicksView.swift:19-43`).
- `confirmationDialog` para acciones contextuales/destructivas (`PicksView.swift:44-70`; `DecisionsActivityView.swift:75-108`).
- Sheets con detents para Already Played y Change Signal (`AlreadyPlayedSheet.swift:1-38`; `DecisionsActivityView.swift:258-303`).
- `safeAreaInset` para acciones del dossier (`GameDetailView.swift:117-167`).
- SF Symbols, materiales dinámicos y light/dark/system (`DecisionIntroView.swift:268-280`; `SettingsView.swift:298-392`).
- Keychain para tokens y SwiftData para persistencia (`AuthSession.swift:24-65`; `LocalStorageService.swift:6-20`).

### Parcial o pendiente de verificación

- No hay evidencia de `.refreshable` o retry nativo en Today/Picks/Taste.
- No hay auditoría demostrable de VoiceOver labels, Dynamic Type extremo, Reduce Motion o Increase Contrast.
- El mapa usa tap gestures y textos de 7-8 pt; necesita alternativa accesible y validación en VoiceOver (`TasteMapVisualizerView.swift:68-124,200-256`).
- Varias pantallas usan glows y cards custom; no es incorrecto, pero su legibilidad no puede confirmarse sin render.
- El dossier presenta tres acciones horizontales; puede romperse con Dynamic Type (`GameDetailView.swift:128-167`).

## 10. Funcionalidad incompleta o simulada

1. Quick suggestions crean juegos mock con IDs locales (`OnboardingView.swift:539-563`).
2. Today, detail, activity y search usan `PlayfitCoverPlaceholder` aunque `Game` admite `externalCoverUrl` (`TodayView.swift:189-193`; `GameDetailView.swift:21-25`; `ios-swiftui/Sources/PlayfitModels/PlayfitModels.swift:3-55`).
3. `PlayfitMocks` sigue incluido como dependencia de Features (`ios-swiftui/Package.swift:49-57`), aunque el root usa cliente HTTP real.
4. Fallback platforms puede ocultar una caída real del catálogo (`PlayViewModel.swift:37-53,78-84,187-193`).
5. Root no muestra loading inicial.
6. Dossier no puede cargar por ID ni representar not-found/no-profile.
7. Picks no consulta el endpoint dedicado.
8. Taste omite señales onboarding porque pasa arrays vacíos (`TasteView.swift:17-22`; `DecisionsActivityView.swift:19-24`).
9. Traits List equivalente al web no existe como pantalla separada; iOS muestra mapa y actividad.
10. Forgot password no existe.
11. Token refresh no existe.
12. No hay tests iOS de contrato HTTP con fixtures reales; el smoke check no cubre estas incompatibilidades.

## 11. Comparativa Web → iOS

Valores usados exactamente:

- Existe en iOS: `Sí`, `Parcial`, `No`.
- Calidad: `Igual o muy similar`, `Adaptado correctamente a iOS`, `Parcial`, `Incorrecto`, `Faltante`.

| Web feature / screen | Existe en iOS | Calidad de equivalencia | Archivos iOS | Diferencias | Pendiente |
| --- | --- | --- | --- | --- | --- |
| Launcher `/play` | Sí | Adaptado correctamente a iOS | `DecisionIntroView.swift:5-145` | Usa pantalla nativa y theme menu | Verificar accesibilidad y sustituir preview placeholder si se desea dato real |
| Gate intro/onboarding/app | Sí | Parcial | `PlayfitRootView.swift:19-69` | Arquitectura correcta, pero root queda vacío durante load | Añadir loading/error de arranque |
| Onboarding: plataformas | Sí | Parcial | `OnboardingView.swift:16-47,180-280` | Presets y mínimo 1; fallback puede ocultar error | Empty/error explícito y paridad completa de catálogo |
| Customize platforms | Sí | Adaptado correctamente a iOS | `OnboardingView.swift:280,743-820` | Sheet + List nativos | Verificar grupos/familias live |
| Onboarding: 3 favoritos | Sí | Parcial | `OnboardingView.swift:286-329` | Regla cubierta | Deshabilitar duplicados explícitamente y eliminar mocks |
| Onboarding: 1 miss | Sí | Parcial | `OnboardingView.swift:397-458` | Regla cubierta | Alinear semántica del game state con web |
| Search catalog | Sí | Parcial | `OnboardingView.swift:466-609,637-665` | Debounce/error/empty implementados | Quick suggestions deben buscar juego real, no crear mock |
| Finalización de onboarding | Sí | Incorrecto | `OnboardingView.swift:687-735` | Crea ratings/excluded diferentes al modelo web | Usar señales onboarding sin doble conteo y sync transaccional |
| Play Next loading | Sí | Igual o muy similar | `TodayView.swift:82-134` | Skeleton y slow message equivalentes | Resetear slowLoading correctamente en recargas |
| Play Next error | Sí | Parcial | `TodayView.swift:136-148` | Presenta error | Añadir retry/pull-to-refresh |
| Play Next empty/skipped | Sí | Igual o muy similar | `TodayView.swift:150-176` | Distingue no recs y skipped de sesión | Ninguno funcional importante |
| Primary recommendation | Sí | Parcial | `TodayView.swift:189-299` | Métricas/razones/acciones presentes | Portada real y sync state visible |
| Alternatives | Sí | Parcial | `TodayView.swift:301-380` | Navegación y match | Portadas reales |
| Add to Picks | Sí | Incorrecto | `PlayViewModel.swift:265-271` | Se guarda como `.liked`, no como pick persistente | Corregir antes de continuar |
| Already Played | Sí | Igual o muy similar | `AlreadyPlayedSheet.swift:1-38`; `PlayfitLogic.swift:42-72` | Mapping principal coincide | Tests de contrato |
| Not for me | Sí | Parcial | `PlayViewModel.swift:273-278`; `PlayfitLogic.swift:66-72` | Acción principal coincide; edit signal no | Corregir `updateSignal` |
| Show another | Sí | Igual o muy similar | `PlayViewModel.swift:252-257,288-296` | Skip solo de sesión | Mejorar copy para no confundir con exclusión |
| Feedback reason picker | Sí | Igual o muy similar | `TodayView.swift:248-253`; `FeedbackReasonPicker.swift:1-64` | Motivo solo muestra toast como web | Confirmar si seguirá no persistente |
| Dossier `/play/game/:id` | Parcial | Parcial | `GameDetailView.swift:6-167` | Contenido existe, pero requiere entry y no tiene estados de fetch | Router/fetch por ID, loading, not-found y user state |
| Picks list | Parcial | Incorrecto | `PicksView.swift:5-86`; `PlayViewModel.swift:238-240` | Solo picks presentes en pool actual | Consumir `fetchPicks`, loading/error y orden server |
| Picks manage | Sí | Adaptado correctamente a iOS | `PicksView.swift:28-79` | Confirmation dialog y swipe son nativos | Evitar duplicación de modifiers en row/list |
| Picks Started | No | Faltante | No confirmado | Tampoco existe en web mobile actual; sí en brief | Resolver decisión de producto |
| Taste summary | Sí | Parcial | `TasteView.swift:63-134` | Resumen/contadores presentes | Cálculos dependen de historial incompleto |
| Interactive Affinity Map | Sí | Parcial | `TasteMapVisualizerView.swift:6-313` | Port nativo del mapa | Alternativa accesible, labels y portadas reales |
| Traits List / Taste DNA | No | Faltante | No confirmado | No hay pantalla equivalente al web mobile | Implementar lista accesible de traits |
| Decisions & Activity | Sí | Parcial | `DecisionsActivityView.swift:6-114` | Filtros y gestión presentes | Incluir onboarding signals y detalles/dossier |
| Change/Delete taste signal | Sí | Incorrecto | `PlayViewModel.swift:324-355` | Mapping y recálculo no equivalen al web | Corregir estado + profile rebuild |
| Settings menu | Sí | Adaptado correctamente a iOS | `SettingsView.swift:7-227` | NavigationLinks y List nativos | Verificar estados live |
| Appearance | Sí | Adaptado correctamente a iOS | `SettingsView.swift:298-392` | Light/Dark/System | Ninguno relevante |
| Platform settings | Sí | Parcial | `SettingsView.swift:412-710` | Selección nativa | Confirmar save + refresh recommendations |
| Local profile / account | Sí | Parcial | `SettingsView.swift:102-190` | UX presente | Evitar drift `authEmail` vs Keychain session |
| Email sign-in/signup | Sí | Parcial | `SettingsView.swift:1151-1330`; `SupabaseAuthClient.swift:41-64` | Validación básica | Token refresh y contract tests |
| Google OAuth | Sí | Adaptado correctamente a iOS | `SupabaseAuthClient.swift:72-104` | Usa AuthenticationServices | Verificar redirect dashboard/dispositivo |
| Forgot password | No | Faltante | No confirmado | Web sí lo ofrece | Implementar si permanece en alcance |
| Reset taste profile | Sí | Parcial | `SettingsView.swift:776-860` | Confirmación y wipe local | Confirmar comportamiento server y recuperación |
| Delete cloud account | Parcial | Incorrecto | `SettingsView.swift:862-952`; `HTTPPlayfitClient.swift:226-237` | Borra profile, no se demostró borrar usuario Auth | Ajustar copy o backend |
| Save/sync indicator | Parcial | Parcial | `TodayView.swift:71-78`; `PlayViewModel.swift:246-248` | Muestra pending count/toasts, no saving/saved/error equivalente | State machine de sync por acción |
| Offline queue | Sí | Adaptado correctamente a iOS | `PlayViewModel.swift:442-517`; `LocalStorageService.swift:167-206` | Mejora nativa sobre web | Añadir profile/onboarding y política de conflictos |
| API response mapping | Parcial | Incorrecto | `HTTPPlayfitClient.swift:303-315`; `PlayfitModels+New.swift:126-156` | Snake/camel mismatch confirmado | Contract fixtures y corrección P0 |
| Tab navigation | Sí | Adaptado correctamente a iOS | `PlayfitRootView.swift:72-105` | TabView/NavigationStack nativos | Deep links/restauración de estado |
| Theme/semantic colors | Sí | Adaptado correctamente a iOS | `Colors.swift:1-74`; `SettingsView.swift:298-392` | Dynamic colors y system mode | Verificación visual pendiente |
| Real cover art | No | Faltante | `PlayfitDesignSystem.swift:50-94` | Se usan placeholders | Async image, cache, loading/error y alt/accessibility |
| Roles de usuario | No | Faltante | No confirmado | Web tampoco presenta roles de producto | Mantener fuera salvo nuevo requisito |
| Firebase | No | Faltante | No confirmado | No se usa en `/play` web ni iOS | Ninguno si Supabase sigue siendo backend |

## 12. Lo que está bien migrado

1. Arquitectura SwiftUI modular con Models, Logic, API, Storage, DesignSystem y Features (`ios-swiftui/Package.swift:5-69`).
2. Navegación principal con `TabView` y `NavigationStack`.
3. Flujo de calibración 1/3/1 y búsqueda con loading/error/empty.
4. Loading, empty y feedback loop principal de Today.
5. Mapeo base de Already Played.
6. Show another como estado de sesión.
7. Settings, theme y selección de plataformas con controles nativos.
8. AuthenticationServices + Keychain.
9. SwiftData y cola offline de game-state actions.
10. Confirmation dialogs, sheets, swipe actions y safe-area action bar.

## 13. Lo parcialmente migrado

1. Root loading/error.
2. Onboarding por uso de mocks y semántica de signals.
3. Today por portadas y retry/sync state.
4. Dossier porque no resuelve game ID.
5. Picks porque solo usa el pool visible.
6. Taste porque omite onboarding signals y Traits List.
7. Change/Delete signal porque no recalcula perfil ni conserva mapping.
8. Auth porque no refresca tokens.
9. Reset/Delete porque el alcance real del backend no coincide completamente con el copy.
10. Accesibilidad del mapa y layouts con Dynamic Type.

## 14. Lo que falta

1. Contract-safe profile/game-state decoding.
2. Persistencia correcta de Picks y fetch dedicado.
3. Token refresh.
4. Dossier por ID con estados completos.
5. Traits List accesible.
6. Portadas reales.
7. Forgot password, si se mantiene paridad de Auth.
8. Started desde Picks, sujeto a decisión común web/iOS.
9. Tests iOS de contratos HTTP, persistencia y reglas.
10. Verificación visual/accessibility en simulador y dispositivo.

## 15. Prioridad recomendada

### P0 — Integridad de datos

- [x] Corregir decodificación `game_states` y perfil camelCase/snake_case.
- [x] Corregir Add Pick y cargar Picks desde endpoint.
- [x] Corregir mappings de change signal y onboarding.
- [x] Implementar refresh de sesión.

P0 implementado el 2026-07-01. Verificación: 8 pruebas unitarias, `swift build`,
`PlayfitSmokeCheck` y build Debug del target `PlayfitIOS` para iOS Simulator.

### P1 — Completar flujos

- [x] Dossier por ID y estados loading/not-found/error.
- [x] Taste con onboarding signals, recálculo y Traits List.
- [x] Root loading, retry y sync state.
- [x] Definir Started y delete-account contract.

P1 implementado el 2026-07-01. El dossier consulta `GET /api/games/:id` y la ruta
normaliza el caso Supabase `PGRST116` como 404. Taste hidrata juegos, reconstruye
el perfil y expone una Traits List textual. Started mueve el Pick a `playing`.
El contrato destructivo se denomina **Delete Cloud Profile**: elimina el perfil
Playfit remoto/local y cierra sesión, pero no afirma eliminar `auth.users`.
Verificación: 12 pruebas unitarias iOS, 45 pruebas web, typecheck web,
`PlayfitSmokeCheck` y build Debug del target `PlayfitIOS` para iOS Simulator.

### P2 — HIG y calidad visible

- [x] Portadas reales y cache.
- [x] VoiceOver, Dynamic Type, Reduce Motion, contraste y tamaños pequeños.
- [x] Tests UI/end-to-end configurados para simulador y dispositivo.
- [x] Suite UI ejecutada en iOS Simulator.
- [ ] Suite UI ejecutada en dispositivo físico (el iPhone disponible figura offline).

P2 implementado el 2026-07-01. Las portadas resuelven `coverURL`, `coverPath` y
fallback por ID, con caché HTTP y memoria limitada. Las jerarquías principales
responden a Dynamic Type, los controles críticos mantienen objetivos táctiles de
44 pt, el mapa ofrece una alternativa textual y las animaciones respetan Reduce
Motion. El target `PlayfitIOSUITests` valida el arranque accesible y los objetivos
táctiles sin depender del backend. La suite pasó en `Playfit iPhone 17 Simulator`;
la ejecución física queda pendiente porque el dispositivo está offline. Verificación:
13 pruebas unitarias, 2 pruebas UI, `PlayfitSmokeCheck`, build Debug para iOS
Simulator, validación del proyecto Xcode y `git diff --check`.

## 16. No confirmado

- Paridad visual pixel a pixel, deliberadamente no auditada con capturas.
- Lectura manual completa con VoiceOver e Increase Contrast en dispositivo físico.
- Google OAuth en dispositivo y redirects del dashboard Supabase.
- RLS/policies y datos vigentes del entorno production.
- Eliminación real del usuario Supabase Auth.
- Background tasks, notificaciones y sync fuera de foreground.
- Cualquier rol de producto o entitlement premium.

## Decisión de fase

El inventario formal sigue siendo la base de comparación. **P0, P1 y la
implementación de P2 están completas**. Solo queda la ejecución de la suite P2 en
un dispositivo físico disponible; no se avanzó a ninguna prioridad posterior.
