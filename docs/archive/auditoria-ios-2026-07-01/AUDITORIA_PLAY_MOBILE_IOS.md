# Auditoría estática de `/play` mobile y mapeo a iOS

Fecha: 2026-07-01  
Alcance: código fuente de `product/apps/web` y estado actual de `ios-swiftui`.  
Método: lectura estática, typecheck, tests y build. No se usaron capturas ni navegador y no se modificó código de producto.

## Veredicto ejecutivo

El contrato web de `/play` está suficientemente definido para diseñar la versión iOS: entrada sin login obligatorio, calibración de plataformas + 3 favoritos + 1 rechazo, una recomendación principal explicable, feedback rápido, picks y una capa corregible de gusto. Las rutas mobile reales son `/play`, `/play/game/[gameId]`, `/play/picks`, `/play/taste` y `/play/settings` (`product/docs/PLAY-MVP.md:55-65`; `product/apps/web/src/app/play/layout-client.tsx:286-348`).

La app iOS no parte de cero. Ya existen todas las pantallas principales, cliente HTTP, Supabase Auth, Keychain, SwiftData y cola offline (`ios-swiftui/Sources/PlayfitFeatures/PlayfitRootView.swift:72-105`; `ios-swiftui/Sources/PlayfitAPI/PlayfitAPIClient.swift:26-40`; `ios-swiftui/Sources/PlayfitStorage/LocalStorageService.swift:6-20,129-206`). Sin embargo, todavía no tiene paridad funcional confiable. Hay bloqueadores de contrato en picks, decodificación del perfil, señales de gusto y refresh de sesión. Por ello, el estado global es **implementación parcial, no lista para considerarse un port completo**.

## 1. Inventario de rutas y pantallas

| Ruta web | Propósito confirmado | Componente raíz | Estado mobile relevante |
| --- | --- | --- | --- |
| `/play` | Launcher, calibración y recomendación principal | `DecisionShell` | El mismo route alterna intro, onboarding, loading, error, empty y resultado (`product/apps/web/src/components/playfit-mvp/decision-shell.tsx:239-451`). |
| `/play/game/[gameId]` | Dossier explicativo de una recomendación | `DecisionDossier` | Mobile oculta tabs inferiores, usa back y barra fija de acciones (`product/apps/web/src/app/play/layout-client.tsx:172-218,286-348`; `product/apps/web/src/components/playfit-mvp/decision-dossier.tsx:67-137`). |
| `/play/picks` | Lista corta y ordenada de recomendaciones guardadas | `PicksShell` → `PicksMobile` | Lista compacta; detalle al tocar; menú modal para gestionar (`product/apps/web/src/components/playfit-mvp/picks-shell.tsx:22-64`; `product/apps/web/src/components/playfit-mvp/mobile/picks-mobile.tsx:89-149`). |
| `/play/taste` | Explicación y corrección de señales | `TasteShell` → `TasteMobile` | Menú mobile con Affinity Map, Traits List y Activity (`product/apps/web/src/components/playfit-mvp/mobile/taste-mobile.tsx:45-193`). |
| `/play/settings` | Apariencia, plataformas, cuenta y privacidad | `SettingsShell` → `SettingsMobile` | Subpantallas internas con back, no nuevas rutas (`product/apps/web/src/components/playfit-mvp/settings-shell.tsx:34-53`; `product/apps/web/src/components/playfit-mvp/mobile/settings-mobile.tsx:40-157`). |
| `/auth/callback` | Intercambio OAuth y regreso a `/play` | Route handler | Éxito vuelve a `next` o `/play`; fallo agrega `?error=auth_failed` (`product/apps/web/src/app/auth/callback/route.ts:16-30`). |

No hay rutas mobile separadas para los tres pasos de onboarding, los submodos de Taste ni las secciones de Settings. Son estados internos de una pantalla.

## 2. Componentes principales por pantalla

### `/play`: intro y onboarding

- `DecisionIntro`: comunica la promesa y abre calibración; también expone entrada a sign-in (`product/apps/web/src/components/playfit-mvp/decision-shell.tsx:239-274`; `product/apps/web/src/components/playfit-mvp/decision-intro.tsx:54-153`).
- `OnboardingSection`: stepper de Platforms, Loved Games y Missed Game (`product/apps/web/src/components/playfit/onboarding-section.tsx:345-428`).
- Plataformas: presets rápidos, personalización por familia y selección individual (`product/apps/web/src/components/playfit/onboarding-section.tsx:430-652`).
- Favoritos: tres slots, buscar, reemplazar y eliminar (`product/apps/web/src/components/playfit/onboarding-section.tsx:654-757`).
- Rechazo: un slot, buscar, reemplazar y eliminar (`product/apps/web/src/components/playfit/onboarding-section.tsx:759-853`).
- Buscador: input, quick suggestions, resultados, loading, error y empty (`product/apps/web/src/components/playfit/onboarding-section.tsx:860-1056`).

### `/play`: decisión

- `PlayNextCard`: portada, título, Match, Watch-outs, Confidence, razones y acciones (`product/apps/web/src/components/playfit-mvp/play-next-card.tsx:191-402`).
- `RecommendationMetric` y `RecommendationReasons`: presentación semántica de scores y explicación.
- `AlreadyPlayedPanel`: Loved, Liked, Mixed y Dropped (`product/apps/web/src/components/playfit-mvp/already-played-panel.tsx:16-56`).
- `FeedbackReasonPicker`: Wrong mood, Too long, Too hard, Not my genre; el motivo solo produce un mensaje, no se persiste ni entrena (`product/apps/web/src/components/playfit-mvp/feedback-reason-picker.tsx:5-35`; `product/apps/web/src/components/playfit-mvp/decision-shell.tsx:218-224`).
- Alternativas: enlaces compactos al dossier con match (`product/apps/web/src/components/playfit-mvp/decision-shell.tsx:534-576`).
- `SaveIndicator` y `StatusToast`: estado de persistencia y feedback global (`product/apps/web/src/components/playfit/save-indicator.tsx:26-38`; `product/apps/web/src/components/playfit-mvp/decision-shell.tsx:579-580`).

### Picks

- `PicksMobile`: fila compacta con portada, título, match, acceso al dossier y botón de gestión (`product/apps/web/src/components/playfit-mvp/mobile/picks-mobile.tsx:102-147`).
- `ManagePickDialog`: Already Played, Not for me, Remove y Cancel (`product/apps/web/src/components/playfit-mvp/mobile/picks-mobile.tsx:22-86`).
- `AlreadyPlayedPanel`: segundo paso para clasificar el juego ya jugado.

### Taste

- Menú/resumen: profile summary, contadores y accesos a mapa, traits y actividad (`product/apps/web/src/components/playfit-mvp/mobile/taste-mobile.tsx:47-153`).
- `TasteMapVisualizer`: mapa interactivo de juegos y recomendaciones.
- `TasteMap`: radar/pills; requiere al menos tres traits para radar y tiene empty de señales (`product/apps/web/src/components/playfit-mvp/taste-components.tsx:92-197`).
- `TasteHistory`: filtros All/Picks/Preferences, cinco items por página, empty por filtro, cambio y eliminación de señal (`product/apps/web/src/components/playfit-mvp/taste-components.tsx:804-960`).
- `PlatformsTabContent`: edición automática de plataformas desde Settings (`product/apps/web/src/components/playfit-mvp/taste-shell.tsx:143-409`).

### Dossier

- Identidad del juego, estado del usuario, plataformas propias, tres métricas, razones y watch-outs (`product/apps/web/src/components/playfit-mvp/decision-dossier.tsx:326-441`).
- Barra mobile fija: Save/Remove Pick, Already played y Not for me (`product/apps/web/src/components/playfit-mvp/decision-dossier.tsx:67-137`).

### Settings y Auth

- Settings menu: Appearance, Platforms, Account/Sign In y Data & Privacy (`product/apps/web/src/components/playfit-mvp/mobile/settings-mobile.tsx:40-157`).
- Theme: Light, Dark y System (`product/apps/web/src/components/playfit-mvp/settings-shell.tsx:85-123`).
- Account: sesión guest, cuenta vinculada, Google link, sign out o perfil local (`product/apps/web/src/components/playfit-mvp/settings-shell.tsx:125-195`).
- Privacy: reset del perfil y delete de cuenta con confirmación (`product/apps/web/src/components/playfit-mvp/settings-shell.tsx:197-317`).
- `AuthPanel`: Google, email/password, guest, signup y password reset (`product/apps/web/src/components/playfit/auth-panel.tsx:20-133,221-350`).

## 3. Flujos de usuario

### Primer uso

1. Se abre `/play`.
2. El provider intenta recuperar sesión; con `localFirst` crea una sesión anónima y, si falla, usa perfil local (`product/apps/web/src/app/play/layout-client.tsx:15-29`; `product/apps/web/src/components/playfit/playfit-context.tsx:233-262`).
3. Aparece el launcher y el usuario inicia calibración.
4. Selecciona al menos una plataforma.
5. Selecciona exactamente tres favoritos.
6. Selecciona exactamente un rechazo.
7. Se construye el perfil, se marca onboarding completo, se fuerza guardado y se abre Play Next (`product/apps/web/src/components/playfit/onboarding-section.tsx:322-343`).
8. El cliente pide `POST /api/recommendations/today`; si el servidor no tiene estado, responde `needsResync` y el cliente reinicia/resincroniza (`product/apps/web/src/components/playfit-mvp/use-play-next-recommendations.ts:36-108`; `product/apps/web/src/app/api/recommendations/today/route.ts:30-50`).

### Loop de recomendación

- Add to Picks: guarda intención; no debe ser señal de gusto.
- Already Played: exige Loved/Liked/Mixed/Dropped y avanza al siguiente candidato.
- Not for me: rating 2 + excluded y avanza.
- Show another: exclusión solo de sesión; no persiste ni modifica gusto (`product/docs/PLAY-MVP.md:111-122`; `product/apps/web/src/components/playfit-mvp/decision-shell.tsx:201-224`).
- See analysis: abre `/play/game/[gameId]`.
- Al guardarse el cambio, el shell espera el save y refresca recomendaciones; si falla el save, cancela el refresh pendiente (`product/apps/web/src/components/playfit-mvp/decision-shell.tsx:81-109`).

### Picks

Play Next → Add to Picks → tab My Picks → dossier o Manage → Already Played / Not for me / Remove. El contrato de producto también pide `Started`, pero el componente **mobile** actual no lo ofrece; solo aparece como requisito documental (`product/docs/PLAY-MVP.md:147-160`; `product/apps/web/src/components/playfit-mvp/mobile/picks-mobile.tsx:38-85`).

### Taste

Tab My Taste → resumen → Affinity Map, Traits List o Activity → filtrar → cambiar/eliminar señal → perfil se recalcula (`product/apps/web/src/components/playfit-mvp/mobile/taste-mobile.tsx:90-190`; `product/apps/web/src/components/playfit/playfit-context.tsx:989-1049`).

### Cuenta y datos

Settings → Sign In/Sync → Google o email. También: Sign Out, Reset Taste Profile y Delete Account. Reset conserva la sesión; delete borra perfil y cierra sesión en el cliente (`product/apps/web/src/components/playfit-mvp/settings-shell.tsx:197-211`; `product/apps/web/src/components/playfit/playfit-context.tsx:1086-1128`).

## 4. Estados verificables

| Superficie | Loading | Empty | Error | Success | Disabled / pending |
| --- | --- | --- | --- | --- | --- |
| Provider global | Auth spinner y luego “Loading your profile” (`playfit-context.tsx:1177-1219`) | Estado inicial limpio | Boot error (`playfit-context.tsx:1194-1205`) | Contexto listo | N/A |
| Layout `/play` | Se resuelve catálogo de plataformas en servidor | Plataformas `[]` pasan al provider | Pantalla “Play Next could not load” (`app/play/layout.tsx:6-29`) | Layout + navegación | N/A |
| Onboarding Platforms | N/A | Catálogo sin plataformas muestra error | `platformError` y fallo de catálogo | Paso avanza | Continue deshabilitado sin plataforma; presets vacíos deshabilitados (`onboarding-section.tsx:430-540`) |
| Onboarding Search | Spinner “Searching catalog” | Prompt inicial, no resultados o catálogo vacío | Error explícito de búsqueda | Selección cierra modal | Resultado duplicado/conflictivo deshabilitado (`onboarding-section.tsx:910-1053`) |
| Onboarding Loved/Miss | N/A | Slots vacíos | N/A | 3 + 1 habilitan finalizar | Continue <3; Find Play Next sin miss (`onboarding-section.tsx:732-757,832-852`) |
| Play Next | Skeleton; mensaje lento tras 3 s | Sin candidatos; separado de “todos skipped” | “Play Next could not load” | Primary + alternativas | Add Pick deshabilitado si ya está guardado (`decision-shell.tsx:281-451`; `play-next-card.tsx:308-322`) |
| Guardado | `saving` | idle | retry/offline message | `saved` por 3 s | Cola debounce 1 s (`playfit-context.tsx:297-417`; `save-indicator.tsx:26-38`) |
| Picks | Skeleton | “No saved picks yet” | Warning inline | Lista | N/A (`picks-shell.tsx:105-199`) |
| Taste | Skeleton mientras hidrata juegos | “No signals recorded yet” y empty por filtros | Warning si faltan señales antiguas | Resumen/mapa/historia | Prev/Next de paginación (`taste-shell.tsx:518-601`; `taste-components.tsx:907-954`) |
| Dossier | “Loading game details” | N/A | “Game not found” o “Set up your taste first” | Dossier | N/A (`decision-dossier.tsx:239-292`) |
| Settings | Placeholder hasta montar theme | N/A | Google link reporta toast | Theme/account/data views | Link, reset y delete bloquean mientras pending (`settings-shell.tsx:85-119,149-158,232-305`) |
| Auth | Botones loading | N/A | Error de Supabase o conexión | Email verification / sesión | Inputs required; password mínimo 6; botones busy (`auth-panel.tsx:43-133,309-350`) |

Límite observado: `TasteShell` recibe `loadError` de recomendaciones para el mapa pero no lo extrae ni muestra (`product/apps/web/src/components/playfit-mvp/use-today-recommendations.ts:23-121`; `product/apps/web/src/components/playfit-mvp/taste-shell.tsx:447-454`). Ese fallo puede verse como mapa sin recomendaciones, no como error explícito.

## 5. Formularios y validaciones

- Plataformas: mínimo 1; el submit revalida aunque el botón ya esté disabled (`product/apps/web/src/components/playfit/onboarding-section.tsx:438-448`).
- Loved: máximo/exacto 3; evita duplicados y elimina conflicto con disliked (`product/apps/web/src/components/playfit/onboarding-section.tsx:239-264`).
- Miss: exactamente 1; elimina conflicto con loved (`product/apps/web/src/components/playfit/onboarding-section.tsx:287-304`).
- Buscador: debounce 250 ms, cancela resultados obsoletos, máximo visible 8 (`product/apps/web/src/components/playfit/playfit-context.tsx:643-680`; `product/apps/web/src/components/playfit/onboarding-section.tsx:170-181`).
- Auth email: `type=email`, required; password required y `minLength=6` (`product/apps/web/src/components/playfit/auth-panel.tsx:319-350`).
- Forgot password: exige email no vacío (`product/apps/web/src/components/playfit/auth-panel.tsx:111-133`).
- Reset/Delete: confirmación explícita y bloqueo mientras corre la acción (`product/apps/web/src/components/playfit-mvp/settings-shell.tsx:232-305`).
- Contratos backend: Zod valida payload completo de perfil y rechaza JSON inválido/overwrite vacío (`product/apps/web/src/app/api/profile/route.ts:11-22,151-202`).
- `PATCH /api/profile/games/[gameId]` solo castea el body; no aplica schema runtime a campos individuales (`product/apps/web/src/app/api/profile/games/[gameId]/route.ts:70-90`).

## 6. Reglas de negocio

1. `/play` no es library, wishlist ni tracker; es un asistente de decisión (`product/docs/PLAY-MVP.md:3-20,274-283`).
2. Onboarding válido: ≥1 plataforma, ≥3 liked y ≥1 disliked (`product/packages/core/src/domain/onboarding.ts:270-276`). La UI limita a 3 y 1.
3. Solo plataformas `available` o `limited` son accesibles para scoring (`product/apps/web/src/app/api/recommendations/shared.ts:295-313`).
4. No recomendar onboarding anchors, completed, beaten, abandoned o excluded (`product/packages/core/src/domain/recommendations.ts:462-468`).
5. Candidato Play Next: playable, riesgo <58, no playing/on_hold/shelved/abandoned, no wishlist y no pick (`product/packages/core/src/domain/recommendations.ts:526-538`).
6. Confianza: low <3 ratings, medium 3-5, high ≥6 (`product/packages/core/src/domain/recommendations.ts:27-38,113-116`).
7. Strong fit ≥78, promising ≥62, high friction ≥58 (`product/packages/core/src/domain/recommendations.ts:14-17`).
8. Picks activos excluyen terminales y excluded; límite UI/contexto de 100 (`product/apps/web/src/components/playfit/playfit-context.tsx:53,165-178,911-938`).
9. Add Pick solo cambia `inPlayfitPicks`; no aporta gusto. Started cambia a playing y retira el pick (`product/docs/PLAY-MVP.md:219-236`).
10. Feedback: Loved 5, Liked 4, Mixed 3, Not for me 2; played variants además resuelven status; Dropped → abandoned + excluded (`product/packages/core/src/domain/feedback.ts:11-20,61-95`).
11. Show another es local/session-only (`product/docs/PLAY-MVP.md:121-122,201-207`).
12. Cada mutación local dispara guardado debounced; onboarding final fuerza flush (`product/apps/web/src/components/playfit/playfit-context.tsx:682-694`; `product/apps/web/src/components/playfit/onboarding-section.tsx:322-343`).
13. Recomendaciones se calculan desde estado persistido del servidor; el endpoint rechaza que el cliente envíe profile/onboarding/gameStates directamente (`product/apps/web/src/app/api/recommendations/today/route.ts:5-27`).

## 7. APIs, Supabase y persistencia

| Operación | Endpoint / integración | Evidencia |
| --- | --- | --- |
| Cargar/guardar/resetear perfil | `GET/POST/DELETE /api/profile` | `product/packages/core/src/store/indexed-db.ts:115-197` |
| Actualizar/eliminar estado de juego | `PATCH/DELETE /api/profile/games/[gameId]` | `product/packages/core/src/store/indexed-db.ts:199-233` |
| Buscar juegos | `GET /api/games?q=` | `product/apps/web/src/components/playfit/playfit-context.tsx:643-680` |
| Hidratar juegos | `POST /api/games/batch`, máximo 500 IDs | `product/apps/web/src/lib/game-cache.ts:7-74`; `product/apps/web/src/app/api/games/batch/route.ts:37-67` |
| Plataformas | lectura server-side directa y `GET /api/platforms` disponible | `product/apps/web/src/app/play/layout.tsx:6-29`; `product/apps/web/src/app/api/platforms/route.ts:3-31` |
| Play Next | `POST /api/recommendations/today` | `product/apps/web/src/components/playfit-mvp/use-play-next-recommendations.ts:36-108` |
| Picks | `GET /api/recommendations/picks` | `product/apps/web/src/components/playfit-mvp/use-picks-recommendations.ts:48-77` |
| Modelo/mapa | `POST /api/recommendations/model` | `product/apps/web/src/components/playfit-mvp/use-today-recommendations.ts:72-121` |
| Dossier | `GET /api/recommendations/game/[gameId]`, fallback local si ya hay juego/perfil | `product/apps/web/src/components/playfit-mvp/decision-dossier.tsx:152-223` |
| Reconstruir perfil | `POST /api/recommendations/profile` | `product/apps/web/src/components/playfit/playfit-context.tsx:500-547` |
| Auth | Supabase anonymous, email/password, Google OAuth, link identity, reset password | `product/apps/web/src/components/playfit/playfit-context.tsx:207-295,1130-1148`; `product/apps/web/src/components/playfit/auth-panel.tsx:43-133` |
| DB | RPC `get_profile`, `upsert_profile`, `delete_profile`, `upsert_game_state`, `score_today_recommendations`, cache y audit log | `product/apps/web/src/app/api/profile/route.ts:126-144,236-271,295-313`; `product/apps/web/src/app/api/recommendations/shared.ts:286-319` |

No se encontró Firebase en el flujo `/play` inspeccionado.

## 8. Navegación

- Mobile principal: tab bar inferior de cuatro destinos, visible solo con perfil listo y oculta en dossier (`product/apps/web/src/app/play/layout-client.tsx:286-348`).
- Dossier: `router.back()`; las alternativas y filas de Picks/Taste usan deep link por game ID (`product/apps/web/src/app/play/layout-client.tsx:172-218`; `product/apps/web/src/components/playfit-mvp/mobile/picks-mobile.tsx:102-119`; `product/apps/web/src/components/playfit-mvp/taste-components.tsx:739-799`).
- Taste y Settings usan subviews internos con back configurado desde HeaderContext (`product/apps/web/src/components/playfit-mvp/taste-shell.tsx:419-431`; `product/apps/web/src/components/playfit-mvp/settings-shell.tsx:34-53`).
- Antes de calibrar, Picks/Taste/Settings bloquean el contenido y enlazan de vuelta a `/play` (`product/apps/web/src/components/playfit-mvp/picks-shell.tsx:79-103`; `product/apps/web/src/components/playfit-mvp/taste-shell.tsx:492-516`; `product/apps/web/src/components/playfit-mvp/settings-shell.tsx:59-83`).

## 9. Autenticación, permisos y roles

- No hay permisos de cámara, fotos, ubicación, micrófono, notificaciones ni Bluetooth en el producto web observado.
- `/play` no requiere login visible: intenta sesión anónima; si no puede, usa perfil por device ID/local (`product/apps/web/src/components/playfit/playfit-context.tsx:233-262`).
- Requests autenticados usan Bearer token; sin token agregan `device_id` UUID (`product/packages/core/src/store/indexed-db.ts:37-94`).
- Backend resuelve cookie, bearer o device ID; recomendaciones sin identidad devuelven 401 (`product/apps/web/src/app/api/recommendations/shared.ts:91-109,159-203`).
- Hay rate limit 60/min en profile y profile/game (`product/apps/web/src/app/api/profile/route.ts:24-25,61-81`; `product/apps/web/src/app/api/profile/games/[gameId]/route.ts:4-31`).
- No existen roles de producto como admin/editor/premium. Solo Supabase `anon`, `authenticated` y `service_role` a nivel backend; la UI no presenta autorización por rol.
- El service key se usa server-to-server para migración best-effort, nunca debería llegar al iOS client (`product/apps/web/src/app/api/profile/route.ts:31-58`).

## 10. UI/UX que debe conservarse

- Una sola recomendación dominante antes que un catálogo.
- Portada, título, Match, Watch-outs, Confidence y razones humanas como un bloque indivisible.
- Alternativas subordinadas, no una parrilla competitiva.
- Acciones con significado estable: Save Pick, Already Played, Not for me, Show another y See analysis.
- Explicación de estado: loading real, search error distinto de zero results, empty con siguiente acción, save/sync feedback.
- Calibración corta con progreso visible y reglas 1/3/1.
- Corrección de gusto: cambiar/eliminar evidencia, no solo mostrar analytics.
- Lenguaje Play Next / Picks / Taste; evitar framing de library/wishlist (`product/docs/PLAY-MVP.md:258-283`).
- Color semántico positivo/negativo/warning, light/dark/system, portadas reales y marca Playfit.

## 11. Adaptaciones necesarias a Apple HIG

1. Usar `TabView`, `NavigationStack`, títulos grandes/inline y back del sistema; no copiar headers sticky ni `router.back()` custom.
2. Usar `List`, `ContentUnavailableView`, `.searchable`, `ProgressView`, `.refreshable`, `confirmationDialog`, `alert` y sheets con detents cuando expresen mejor el patrón.
3. Mantener acciones primarias alcanzables, pero evitar tres botones comprimidos en una barra inferior en iPhone pequeño; usar una acción principal y `Menu`/sheet para secundarias.
4. Respetar Dynamic Type, VoiceOver, Reduce Motion, Increase Contrast y hit targets de al menos 44×44. El web usa textos de 8-10 px y hover-only en algunos lugares; eso no debe trasladarse.
5. El mapa visual necesita alternativa accesible en lista, orden de lectura y labels descriptivos; no puede ser la única representación.
6. Usar colores dinámicos y SF Symbols, sin depender solo de color para tono/estado.
7. Mostrar sync/offline como estado nativo no bloqueante; ofrecer retry/pull-to-refresh.
8. Guardar tokens en Keychain y datos offline en SwiftData; no trasladar `localStorage`/cache de memoria.
9. Usar AuthenticationServices para OAuth y respetar cancelación; no webview embebido.
10. Las operaciones destructivas deben usar lenguaje exacto y confirmar solo lo que el backend realmente elimina.

## 12. Mapeo Web → iOS y estado actual

| Web screen/component | iOS screen/component | Lógica necesaria | Estado actual | Pendiente |
| --- | --- | --- | --- | --- |
| `PlayLayoutClient` + tab bar | `PlayfitRootView` + `TabView` | Gate onboarding, tabs, badge de picks | Implementado (`ios-swiftui/Sources/PlayfitFeatures/PlayfitRootView.swift:19-105`) | Restauración de tab/deep links y estado de sesión más robusto. |
| `DecisionIntro` | `DecisionIntroView` | Promesa, iniciar calibración, sign in opcional | Implementado | Verificar copy y accesibilidad en dispositivo. |
| Platforms onboarding | `OnboardingView` step 0 | Fetch/fallback platforms, presets, mínimo 1 | Implementado (`OnboardingView.swift:16-43,192-280`) | No ocultar fallo real con fallback silencioso; validar empty/error. |
| Loved/Miss search | `OnboardingView` steps 1-2 | Debounce, búsqueda remota, 3 + 1, conflictos | Implementado (`OnboardingView.swift:637-685`) | La UI iOS debe deshabilitar duplicados explícitamente como web. |
| Finalize onboarding | `OnboardingView.completeOnboarding` | Perfil, metadata, persistir, sync | Parcial (`OnboardingView.swift:687-735`) | Alinear semántica: iOS asigna rating 5 a favoritos y `excluded` al miss; web trata onboarding como señales separadas. Evitar doble conteo. |
| `DecisionShell` | `TodayView` + `PlayViewModel` | Load/error/empty, primary estable, alternatives, refresh | Implementado parcial (`TodayView.swift:15-45,82-176`; `PlayViewModel.swift:120-217`) | Retry/pull-to-refresh, estado “saving then refreshing”, cache invalidation y cover art real. |
| `PlayNextCard` | `TodayView.primaryCard` | Métricas, razones, acciones | Implementado (`TodayView.swift:189-299`) | Actualmente usa `PlayfitCoverPlaceholder`; debe renderizar portada real y texto accesible. |
| Add Pick | `PlayViewModel.addPick` | `inPlayfitPicks=true`, no rating, límite 100, persistir | **Incorrecto** (`PlayViewModel.swift:265-271`) | Hoy llama feedback `.liked`, no marca `inPlayfitPicks` y el pick se pierde al sincronizar/reiniciar. Bloqueador. |
| Show another | `PlayViewModel.skip` | Excluir solo en sesión, no persistir | Implementado (`PlayViewModel.swift:288-296`) | Mensaje “Skipped” puede confundirse con exclusión persistente. |
| Already Played / Not for me | `AlreadyPlayedSheet`, `PlayfitLogic` | Mapeo exacto de rating/status/excluded | Mayormente implementado (`PlayfitLogic.swift:12-75`) | Corregir `updateSignal`: Dropped deja `excluded=false` y no pone abandoned; Not for me borra rating, distinto al web (`PlayViewModel.swift:331-355`). |
| Alternatives | `CompactRecommendationRow` | Máximo 3, navegación a detalle | Implementado (`TodayView.swift:301-380`) | Portadas reales. |
| Dossier por ID | `GameDetailView(entry:)` | Deep link/fetch por ID, loading/not found/no profile | Parcial (`GameDetailView.swift:6-126`) | Solo acepta entry ya cargada; falta resolver ID, loading/error y current user state/plataformas propias. |
| Dossier actions | `GameDetailView.dossierActions` | Pick, played, reject | Implementado parcial (`GameDetailView.swift:128-167`) | Hereda bug de Add Pick; revisar layout de 3 acciones con Dynamic Type. |
| Picks route | `PicksView` | Fetch picks completos, orden server, empty/error/loading, manage | Parcial (`PicksView.swift:12-86`) | `fetchPicks()` existe pero no se usa; `picks` filtra solo el pool visible (`PlayViewModel.swift:238-240`). Faltan picks fuera del lote actual y estado de red. |
| Picks Started | No componente | status playing + retirar pick | No implementado | También falta en web mobile aunque el brief lo exige. Decidir contrato y añadir en ambas plataformas. |
| Taste summary/map | `TasteView`, `TasteMapVisualizerView` | Historial, contadores, mapa y alternativa accesible | Parcial (`TasteView.swift:16-118`) | Solo ofrece mapa en Your Taste; falta Traits List equivalente y manejo visible de hidratación parcial/error. |
| Taste onboarding signals | `TasteView` / `DecisionsActivityView` | Incluir IDs liked/disliked | **Incorrecto** (`TasteView.swift:17-22`; `DecisionsActivityView.swift:19-24`) | Pasan arrays vacíos y omiten las señales de onboarding aunque ViewModel las guarda. Bloqueador de paridad. |
| Taste change/delete | `DecisionsActivityView`, `PlayViewModel` | Actualizar o borrar señal y recalcular perfil | Parcial (`DecisionsActivityView.swift:75-113`; `PlayViewModel.swift:324-355`) | No recalcula profile local después del cambio; corregir mapping y conservar onboarding sources. |
| Settings menu/theme/platforms | `SettingsView`, `AppearanceView`, `PlatformSelectionView` | Navegación nativa, auto-save | Implementado | Confirmar que cambios de plataforma sincronizan estado completo y refrescan recs. |
| Auth | `SignInSheetView`, `SupabaseAuthClient`, Keychain | Email, signup, Google, signout, token lifecycle | Parcial (`SupabaseAuthClient.swift:41-104`; `AuthSession.swift:24-65`) | No hay refresh de access token aunque se almacena refresh token y expiración; sesión falla después de expirar. Bloqueador. |
| Profile decode | `HTTPPlayfitClient` + modelos | Decodificar envelope/RPC web | **Incorrecto** | Backend devuelve `game_states` (`product/supabase/migrations/20260620210000_play_recommendation_session_contract.sql:9-15`), pero `ProfileState` espera `gameStates` (`HTTPPlayfitClient.swift:303-315`). `UserProfile` espera snake_case aunque el perfil guardado usa camelCase (`PlayfitModels+New.swift:126-156`; `HTTPPlayfitClient.swift:182-200`). |
| Offline/save queue | SwiftData + pending actions | Cache, optimistic UI, retry y overlay | Implementado parcial (`PlayViewModel.swift:442-517`; `LocalStorageService.swift:129-206`) | Perfil/onboarding no está en la misma cola transaccional; falta política de conflictos/versionado. |
| SaveIndicator/StatusToast | `StatusToast`, contador pending | Mostrar success/error/offline | Parcial | No hay estado equivalente saving/saved/error por acción; solo toast y count. |
| Reset/Delete | `PrivacySettingsView` | Confirmación, backend, wipe local | Implementado parcial | Backend `DELETE /api/profile` borra perfil, no se confirmó eliminación de credenciales de Auth; copy “delete account credentials” no está respaldada por el route. |

## 13. Hallazgos prioritarios antes de continuar iOS

### P0 — Contrato/datos

1. Corregir Add Pick para persistir `inPlayfitPicks=true` sin crear rating ni señal de gusto.
2. Corregir decodificación `game_states` y campos del perfil; añadir contract tests con fixtures reales del API web.
3. Implementar refresh de sesión Supabase antes de usar un token expirado.
4. Hacer que Picks consuma `GET /api/recommendations/picks`, no solo el pool visible.

### P1 — Paridad funcional

5. Incluir señales de onboarding en Taste/Activity y recalcular perfil tras cambios.
6. Alinear `played_dropped` y `not_for_me` con el mapping web.
7. Resolver dossier por game ID y cubrir loading/not found/no profile.
8. Definir y aplicar `Started` en mobile web e iOS o retirar esa exigencia del brief.
9. Añadir retry/pull-to-refresh y estados de sync comparables al web.

### P2 — Producto/HIG

10. Reemplazar cover placeholders por imágenes reales con placeholder/error accesible.
11. Añadir Traits List como alternativa accesible al mapa.
12. Auditar Dynamic Type, VoiceOver, Reduce Motion y contraste en simulador/dispositivo. Esto no puede confirmarse solo leyendo código.

## 14. Partes no confirmadas

- Comportamiento visual real en tamaños iPhone, landscape, Dynamic Type XL, VoiceOver y Reduce Motion: el usuario pidió excluir capturas/runtime visual.
- Configuración vigente del dashboard Supabase para redirect URLs, Google provider, anonymous sign-in y email confirmation.
- Funcionamiento de OAuth Google en dispositivo físico.
- Disponibilidad real del backend production y contenido actual de la base de datos.
- Eliminación de credenciales Supabase Auth al usar “Delete Cloud Account”; el route inspeccionado solo borra perfil.
- RLS/policies efectivas de la instancia desplegada; se leyó código/migraciones, no el estado live.
- Notificaciones, background refresh y sincronización en segundo plano: no existen en el alcance inspeccionado.
- Deep links externos hacia `/play/game/[gameId]` en iOS: no hay router por ID confirmado.
- Paridad visual exacta: por decisión del usuario no se tomaron capturas.

## 15. Verificación ejecutada

- Web: `npm run typecheck` — OK.
- Web: 17 archivos de tests, 110 tests — OK (12/44 en web, 5/66 en core).
- iOS: `swift build` — OK.
- iOS: `swift run PlayfitSmokeCheck` — OK.

Estas verificaciones demuestran compilación y tests existentes; no invalidan los gaps de contrato detectados porque no hay contract tests iOS que cubran los payloads reales ni la persistencia de Picks.

## Decisión de fase

El inventario está completo para el código local disponible. **No se inició implementación iOS.** La siguiente fase debe empezar por los cuatro P0, no por UI nueva.
