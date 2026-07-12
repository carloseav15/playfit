# Auditoría HIG 2026 — Backlog de correcciones (solo pendientes)

> Backlog resultante tras la pasada de correcciones del 2026-07-09. Se removieron las tareas
> completadas. Quedan únicamente los ítems pendientes: bugs funcionales, refactors de
> arquitectura, tests, y mejoras de accesibilidad/localización.

---

---

### GRUPO 9 — Assets (bajo riesgo, tarda en compilar)

- [ ] **35. Convertir `playfit_logo` de PNG a PDF vectorial**
  - Carpeta: `PlayfitIOS/Assets.xcassets/playfit_logo.imageset/`
  - Exportar logo como PDF (preserves vector data) para que escale sin pixelación en todas las resoluciones.

---

---

### GRUPO 16 — Localización / Strings (sistémico, toca todos los archivos)

- [ ] **44. Migrar todos los strings visibles a `LocalizedStringKey`**
  - **Alcance**: todos los archivos en `Sources/PlayfitFeatures/` y `Sources/PlayfitDesignSystem/`
  - Cada `Text("...")`, `Button("...")`, `Label("...")`, `Toggle("...")`, `TextField("...")` debe usar `LocalizedStringKey` o `NSLocalizedString`.
  - **Problema**: 100% de strings hardcodeados en inglés. Sin `.strings`, sin `.lproj`. Para 2026 Apple espera internacionalización desde el día 1. Un entrevistador que hable español, japonés o árabe vería la app completamente en inglés sin opción de cambiar.
  - **Fix**: crear `Localizable.xcstrings` (formato moderno iOS 16+) y referenciar cada string con `Text(verbatim: "Play Next")` o `Text("play_next_title")` con lookup en el strings catalog.
  - **Riesgo**: alto. Toca ~40 archivos. Pero es el cambio más visible para un entrevistador de iOS.
  - **Alternativa gradual**: migrar primero los strings de mayor impacto (títulos de pantalla, toasts, onboarding), dejar los internos para después.

- [ ] **45. Reemplazar `error.localizedDescription` con mensajes amigables**
  - **Alcance**: `SignInSheetView.swift`, `PlayViewModel+Sync.swift`, `OnboardingView.swift`, `GameDetailView.swift`, `PrivacySettingsView.swift`.
  - **Problema**: errores internos ("Decoding error: The data couldn't be read because it is missing.") expuestos directamente al usuario.
  - **Fix**: mapear errores a strings localizados. Ej: `showToast(error == .networkError ? "Connection lost. Please try again." : "Something went wrong.")`

---

### GRUPO 17 — Identidad en ForEach (`id: \.self`, mecánico)

- [ ] **46. Reemplazar `id: \.self` con identificadores explícitos**
  - **Archivos y líneas**:
    - `CustomizePlatformsView.swift:55` → `ForEach(families, id: \.self)` → `ForEach(families, id: \.self)` no se puede cambiar directamente porque `families` es `[String]`. Agregar `Identifiable` wrapper o usar `ForEach(Array(families.enumerated()), id: \.offset)`.
    - `OnboardingGameSearchSheet.swift:72` → `ForEach(suggestions, id: \.self)` → mismo patrón con `enumerated()`.
    - `OnboardingLikedGamesStep.swift:23` → `ForEach(0..<3, id: \.self)` → usar `ForEach(Array(0..<3), id: \.self)` ya está bien porque el rango es fijo y corto, pero idealmente `ForEach(0..<3, id: \\.self)` → reemplazar con `ForEach(0..<numberOfSlots, id: \\.self)`.
    - `PlatformSelectionView.swift:93` → `ForEach(availableFamilies, id: \.self)` → igual que CustomizePlatformsView.
    - `GameDetailView.swift:125` → `ForEach(entry.game.availablePlatformNames, id: \.self)` → los nombres de plataforma pueden duplicarse, mejor usar `id: \\.self` con cuidado o un wrapper.
  - **Problema**: SwiftUI desaconseja `\.self` porque si los datos mutan o hay duplicados, la identidad de las vistas se rompe causando animaciones extrañas o datos incorrectos. Un tech lead lo notaría.

---

---





---

### GRUPO 23 — iPad / Regular width (5ª pasada, estructural)

- [ ] **54. Adaptar layout a regular width / iPad**
  - Target iOS 18 corre en iPad sin adaptación. Problemas identificados:
    - `PlatformSelectionView`: `LazyVGrid` con `GridItem(.adaptive(minimum: 100))` produce 2 columnas desproporcionadas en horizontal iPad.
    - `TodayView`: scroll vertical con cards ancladas al ancho máximo. En iPad 12.9" una card de recomendación de 700pt+ de ancho es difícil de leer.
    - `SettingsView`: `List` con `Form` row style, se ve bien en iPad.
    - `PicksView`: `List` con swipe actions funciona pero el layout no usa `NavigationSplitView`.
  - **Fix**: implementar `NavigationSplitView` para el tab de settings/profile, y usar `GeometryReader` o `maxWidth: 480` en cards de TodayView para limitar el ancho de lectura.
  - **Riesgo**: medio-alto. Cambios de layout pueden romper en iPhone. Requiere testing en ambos tamaños.

---

# Android — Auditoría M3 Compose 2026

## Proyecto: `android-compose/` (SDK 36, Compose BOM 2024.09+, M3 1.3+)

---

### GRUPO A1 — ViewSystem leaks en Compose Canvas

- [ ] **A1.1 `TasteRadarChart` usa `android.text.TextPaint` dentro de Canvas**
  - Archivo: `android-compose/app/src/main/java/com/playfit/app/ui/screens/taste/TasteRadarChart.kt:107`
  - Usa `TextPaint()` + `nativeCanvas.drawText()` en vez de `drawText()` de Compose.
  - **Problema**: no respeta `fontScale`, `lineHeight`, `letterSpacing` del tema M3; los labels no escalan con accesibilidad.
  - **Fix**: migrar a `drawText(textMeasurer, ...)` de Compose 1.4+.

- [ ] **A1.2 `TasteMapVisualizerScreen.AffinityMapCanvas` usa `android.graphics.Paint`**
  - Archivo: `android-compose/app/src/main/java/com/playfit/app/ui/screens/taste/TasteMapVisualizerScreen.kt:269,278`
  - Axis labels y quadrant labels dibujados con `Paint()` + `nativeCanvas.drawText()`.
  - **Problema**: mismo que A1.1 — texto ajeno al sistema M3, no escala.
  - **Fix**: migrar todo `nativeCanvas.drawText()` a `drawText()` de Compose.

---



### GRUPO A4 — Color / Tema

- [ ] **A4.2 `PlayfitGlassCard` aplica alpha a surface color**
  - Archivo: `PlayfitGlassCard.kt`
  - `surfaceContainerLow.copy(alpha = 0.80f)`
  - **Problema**: M3 surface colors ya tienen la opacidad correcta. Aplicar alpha manual puede verse mal contra ciertos fondos.
  - **Fix**: usar `surfaceContainerLow` directamente, o elevar el componente si se quiere efecto glass.






### GRUPO A7 — Componentes custom vs M3 nativo

- [ ] **A7.1 `SubViewTopBar` duplica M3 `TopAppBar`**
  - Archivos: `SettingsAppearance.kt:90`, `SettingsPrivacy.kt:88`, `SettingsDeveloper.kt:82`
  - Importan `SubViewTopBar` de `SettingsScreen.kt` — un custom TopAppBar.
  - **Problema**: M3 `TopAppBar` ya existe y maneja navegación, scrolled behavior, etc.
  - **Fix**: migrar a `TopAppBar` de `androidx.compose.material3`.

- [ ] **A7.2 Sin FAB en pantallas principales**
  - `TasteScreen`, `DecisionsActivityScreen`, `TodayScreen` no tienen FAB.
  - **Problema**: M3 recomienda FAB para la acción primaria. Omisión notable para auditoría de portfolio.
  - **Fix**: evaluar si hay una acción primaria que merezca FAB (ej. "Añadir juego" en DecisionsActivityScreen).

---

### GRUPO A9 — Dependencias / Build

- [ ] **A9.1 Evaluar migración a version catalog con BOM actualizado**
  - Archivo: `gradle/libs.versions.toml`
  - Verificar que Compose BOM esté en la versión más reciente estable (actualmente 2024.12+ con correcciones).
  - **Nota**: ya usan `PullToRefreshBox` → BOM ≥ 2024.09.00. Verificar que no haya APIs obsoletas.

---



---





### GRUPO B3 — Shape overrides adicionales

- [ ] **B3.1 `AuthScreen` — 14.dp en todos los inputs y botones**
  - Archivo: `ui/screens/AuthScreen.kt:261,282,314,360,381,393`
  - `shape = RoundedCornerShape(14.dp)` en OutlinedButton, OutlinedTextField, Button.
  - **Problema**: valor 14.dp no existe en la escala M3 ni en `PlayfitShapes` (8/12/16/24).
  - **Fix**: `MaterialTheme.shapes.medium` (12.dp) o `shapes.large` (16.dp).





- [ ] **B3.6 `DecisionLabelBadge` y `TraitPillCloud` — 20.dp**
  - Archivos: `ui/components/design/DecisionLabelBadge.kt:39`, `ui/components/TraitPillCloud.kt:96`
  - `RoundedCornerShape(20.dp)` — valor que no está en la escala.
  - **Fix**: `MaterialTheme.shapes.extraLarge` (24.dp) o `shapes.large` (16.dp).

---

### GRUPO B4 — Bypass de Typography system

- [ ] **B4.1 `TasteRadarChart` — `fontSize = 9.sp` bypassa escala M3**
  - `TasteRadarChart.kt:56` — `labelSmall.copy(fontSize = 9.sp)` no escala con fontScale del sistema.
  - **Fix**: usar `MaterialTheme.typography.labelSmall.fontSize` sin override.

- [ ] **B4.2 `OnboardingSteps`/`OnboardingSheets` — `fontSize: 10.sp, 11.sp, 20.sp` fijos**
  - `OnboardingSteps.kt:385,456`, `OnboardingSheets.kt:178,297,304,477,486` — Text con fontSize duro.
  - **Fix**: reemplazar con `MaterialTheme.typography.{labelSmall/bodySmall/titleSmall}` que escalan automáticamente.

- [ ] **B4.3 `DecisionIntroScreen` — preview section con `fontSize: 10.sp`**
  - `DecisionIntroScreen.kt:356,376,399` — labels "PLAYFIT CURATION", "% Vibe Fit", género tienen fontSize fijo.
  - **Fix**: `MaterialTheme.typography.labelSmall` o `bodySmall` según contexto.

- [ ] **B4.4 `AuthScreen` — `fontSize = 13.sp` en botones de opciones**
  - `AuthScreen.kt:266,287,322` — `fontSize = 13.sp` no existe en escala M3.
  - **Fix**: `MaterialTheme.typography.labelLarge` (14.sp) o `titleSmall` (14.sp).

- [ ] **B4.5 `GameDossierScreen` — `letterSpacing = 1.5.sp` bypassa valores del tema**
  - `GameDossierScreen.kt:202,279` — usa `letterSpacing` duro en labels de año/género y "AVAILABLE ON".
  - **Fix**: eliminar `letterSpacing` override; el tema ya define tracking correcto para `labelSmall`.

- [ ] **B4.6 `DecisionsActivityScreen` — `letterSpacing: 0.12.sp` y `fontSize: 16.sp`**
  - `DecisionsActivityScreen.kt:371,396` — ChangeSignalSheet usa fontSize y letterSpacing fijos.
  - **Fix**: usar `MaterialTheme.typography.{bodyMedium/titleMedium}` sin `.copy()`.

- [ ] **B4.7 `TasteMapVisualizerScreen` — quadrant labels con `fontSize: 10.sp`**
  - `TasteMapVisualizerScreen.kt:274,283` — `textSize = 10.sp.toPx()` en `android.graphics.Paint`.
  - **Fix**: migrar a `drawText(textMeasurer, ...)` de Compose (relacionado con A1.2).

---

### GRUPO B5 — Alpha tweaking generalizado

- [ ] **B5.1 ~50+ lugares usan `.copy(alpha = ...)` sobre colores M3**
  - Patrón en toda la codebase: `MaterialTheme.colorScheme.{color}.copy(alpha = {0.08f, 0.12f, 0.15f, 0.3f, 0.5f, 0.6f, 0.7f, 0.8f, 0.88f, 0.9f})`.
  - **Problema**: si los colores base del tema cambian (nuevo primary, nueva paleta dinámica), todos estos alpha necesitan re-tuning manual. No hay un sistema centralizado de opacidades.
  - **Fix**: crear `object PlayfitOpacities` con constantes nombradas, o usar `Surface`/`Card` con `tonalElevation` en vez de alpha manual.

---

### GRUPO B6 — Accesibilidad

- [ ] **B6.2 CustomIcons (Canvas) sin semántica propia**
  - Archivo: `ui/components/design/CustomIcons.kt`
  - `SparklesIcon`, `SunIcon`, `MoonIcon` son Composable sin parámetro de contentDescription.
  - **Problema**: el llamador debe agregar `.semantics { }` externamente o el icono es invisible para TalkBack.
  - **Fix**: agregar `contentDescription: String?` y envolver en `Box` con semántica.

---

### GRUPO B7 — Arquitectura / Code quality

- [ ] **B7.1 ViewModel expone MutableStateFlow públicos**
  - Archivo: `ui/viewmodel/PlayfitViewModel.kt:108,118-121`
  - `onboardingStep`, `onboardingSelectedPlatforms`, `onboardingLikedGames`, `onboardingDislikedGames`, `themeMode` son `MutableStateFlow` públicos.
  - **Problema**: rompe unidirectional data flow. Cualquier componente puede mutar el estado sin pasar por el ViewModel.
  - **Fix**: exponer como `StateFlow` privado con backing mutable, o usar métodos públicos.

- [ ] **B7.2 `themeMode` usa String en vez de sealed class**
  - Archivo: `ui/viewmodel/PlayfitViewModel.kt:108`
  - `MutableStateFlow("system")` — string-typed.
  - **Problema**: valores mágicos "system"/"light"/"dark" sin type safety.
  - **Fix**: `sealed class ThemeMode { object System, object Light, object Dark }`.

- [ ] **B7.4 Chevron custom con Canvas en vez de Icon M3**
  - Archivo: `ui/components/AlternativeRow.kt:92-107`
  - Dibuja chevron con `Canvas` + `Path` en vez de `Icons.AutoMirrored.Filled.KeyboardArrowRight`.
  - **Problema**: código innecesario que no aporta valor visual vs el Icon M3 nativo.
  - **Fix**: reemplazar con `Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, ...)`.

- [ ] **B7.5 Raw dp values en vez de PlayfitSpacing**
  - Archivos: `GameDossierScreen.kt:395` (96.dp), `OnboardingHeader.kt:64-65` (4.dp, 6.dp), `ShimmerEffect.kt:77,82,86` (12.dp, 8.dp), `OnboardingSheets.kt:297,304` (4.dp), etc.
  - **Problema**: el sistema de spacing (`PlayfitSpacing`) existe pero no se usa consistentemente.
  - **Fix**: mapear a `PlayfitSpacing.{xs, sm, md, lg, xl, xxl}` según corresponda.

---

### GRUPO B8 — Dark mode runtime

- [ ] **B8.2 Componentes no reaccionan a cambios de tema en runtime**
  - Como todos los alpha están hand-tuned para una combinación específica light/dark, si el usuario cambia el tema sin reiniciar la actividad, los componentes pueden verse incorrectos.
  - **Fix**: centralizar opacidades en `PlayfitOpacities` (ver B5.1) o eliminar alpha manual en favor de `tonalElevation`.

---

### GRUPO C1 — Manifest / Resources

---

### GRUPO C2 — Data Layer

- [ ] **C2.1 Picks cacheados muestran datos incompletos**
  - Archivo: `data/repository/PlayfitMappers.kt:236-252`
  - `PicksEntity.toDomain()` crea `RankedSeedGame` con `riskScore = 0.0`, `cautionReasons = []`, `confidence = Medium`.
  - **Problema**: al ver un pick offline, la UI muestra "0% Watch-out" y lista vacía de caution reasons, aunque el server tuviera valores distintos.
  - **Fix**: persistir `riskScore` y `cautionReasons` en `PicksEntity`.

- [ ] **C2.3 `inferPlatformFamily/kind` — mapeo frágil por string matching**
  - Archivo: `data/repository/PlayfitMappers.kt:173-189`
  - `platformId.contains("switch")`, `platformId in setOf("nes", "snes", ...)`, etc.
  - **Problema**: cuando salgan nuevas plataformas (ej. "switch_3", "xbox_next", "steam_deck_2"), el mapeo no las reconoce y caen a "other"/"console".
  - **Fix**: depender de los valores que devuelve la API (`family`, `kind`) en vez de inferir. Usar los fallbacks solo cuando la API no los provea.

- [ ] **C2.4 `getSimilarGames` sin cache — offline falla siempre**
  - Archivo: `data/remote/PlayfitApiService.kt:24-25`, `data/repository/PlayfitRepositoryImpl.kt:359-369`
  - `getSimilarRecommendations` no tiene cache layer.
  - **Problema**: en la pantalla de detalle, "Similar Games" siempre muestra error si no hay conexión.
  - **Fix**: cachear la respuesta más reciente, similar a `getTodayRecommendations`.


---

### GRUPO C3 — Arquitectura / Estado

- [ ] **C3.3 InitialData carga 4 llamadas de red secuenciales**
  - Archivo: `ui/viewmodel/InitialDataCoordinator.kt:30-83`
  - `getState` → `getTodayRecommendations` → `getPicks` → `getTasteModel` se ejecutan en serie.
  - **Problema**: startup más lento de lo necesario. `getTodayRecommendations` y `getPicks` no dependen de `getState`.
  - **Fix**: lanzar llamadas independientes en paralelo con `coroutineScope { async {} }`.

- [ ] **C3.4 `selectedPlatformIds` almacenado como CSV frágil**
  - Archivo: `data/local/PreferencesDataStore.kt:43-51`
  - `ids.joinToString(",")` / `split(",")`.
  - **Problema**: si alguna platform ID contiene una coma (edge case), el parsing la parte en dos IDs inválidas.
  - **Fix**: usar `kotlinx.serialization` o JSON en vez de CSV casero.

---

### GRUPO C4 — Data Integrity

- [ ] **C4.1 `PicksEntity.addedAt` usa `System.currentTimeMillis()` en construcción, no al insertar**
  - Archivo: `data/local/entity/PicksEntity.kt:15`
  - `val addedAt: Long = System.currentTimeMillis()` — default evaluado al crear el objeto Kotlin, no al hacer INSERT en Room.
  - **Problema**: si hay delay entre `.toEntity()` y `insertAll()`, los timestamps son incorrectos. Puede afectar ordenamiento de picks.
  - **Fix**: mover `addedAt` a la query de Room (`INSERT ... VALUES (..., strftime(...))`) o asignarlo explícitamente cerca del insert.

- [ ] **C4.2 6 feedback ratings colapsan a 3 valores — distinción "antes de jugar" vs "después de jugar" se pierde**
  - Archivo: `model/ProductGameStateTransitions.kt:90-101`
  - `Loved`/`PlayedLoved` → 5.0, `Liked`/`PlayedLiked` → 4.0, `Mixed`/`PlayedMixed` → 3.0.
  - **Problema**: el sistema de ratings colapsa 6 estados cualitativos en 3 números. Después de guardar, no se puede reconstruir si el usuario seleccionó "Loved it" (antes de jugar) o "Played & Loved" (después de jugar). Esto limita el análisis de comportamiento.
  - **Fix**: agregar un campo `context` al `GameStateDto` que preserve si la decisión fue pre- o post-juego.

---

### GRUPO D1 — Build / Gradle

- [ ] **D1.2 Sin `kotlinOptions { jvmTarget = "17" }` explícito**
  - Archivo: `app/build.gradle.kts:62-65`
  - `compileOptions` setea Java 17 pero no hay `kotlinOptions { jvmTarget = "17" }`.
  - **Problema**: el plugin `kotlin.compose` puede auto-configurar el target, pero no está explícito. Con ciertas versiones de Kotlin, el default puede ser distinto.
  - **Fix**: agregar `kotlin { jvmToolchain(17) }` o `kotlinOptions { jvmTarget = "17" }`.

- [ ] **D1.3 `versionCode = 1`, `versionName = "0.1"` sin estrategia**
  - Archivo: `app/build.gradle.kts:34-35`
  - **Problema**: no hay mecanismo de auto-incremento ni关联 con CI.
  - **Fix**: usar `versionCode = System.getenv("CI_BUILD_NUMBER")?.toIntOrNull() ?: 1` o similar.

---

### GRUPO D2 — Sync / Data Layer

- [ ] **D2.1 SyncWorker sin límite de reintentos para operaciones fallidas**
  - Archivo: `data/sync/SyncWorker.kt:136-138`
  - `PendingOperationEntity.attemptCount` existe pero nunca se consulta para decidir si abandonar.
  - **Problema**: si una operación falla siempre (ej. servidor devuelve 400), SyncWorker reintenta infinitamente cada vez que se ejecuta.
  - **Fix**: leer `attemptCount` y fallar permanentemente después de N intentos (ej. 5).

- [ ] **D2.2 Game states enviados uno por uno, sin batching**
  - Archivo: `data/sync/SyncWorker.kt:64-84`
  - Itera `pendingStates` y hace un request HTTP por cada uno.
  - **Problema**: para un usuario con 50+ game states modificados offline, serán 50 requests secuenciales.
  - **Fix**: cambiar el endpoint a uno que acepte batch de `GameStateRequest` y enviar todos en un solo POST.

- [ ] **D2.3 `ExistingWorkPolicy.KEEP` en SyncManager puede descartar syncs**
  - Archivo: `data/sync/SyncManager.kt:35`
  - `ExistingWorkPolicy.KEEP` — si el ViewModel encola syncs múltiples rápidamente, solo el primer `OneTimeWorkRequest` se ejecuta.
  - **Problema**: cambios intermedios pueden perderse si no se consolidan antes del próximo sync.
  - **Fix**: considerar `ExistingWorkPolicy.REPLACE` o `APPEND_OR_REPLACE`, o consolidar operaciones antes de enqueue.

---

### GRUPO D3 — Arquitectura

- [ ] **D3.1 SettingsAppearance/SettingsDeveloper/SettingsPrivacy acceden directo a DataStore**
  - Archivo: `ui/screens/SettingsAppearance.kt:77`
  - `viewModel?.preferencesDataStore?.themeMode` — la UI lee/escribe PreferencesDataStore directamente en vez de pasar por el ViewModel.
  - **Problema**: rompe unidirectional data flow (UDF). La UI tiene acceso al almacenamiento subyacente y puede bypassear la lógica del ViewModel.
  - **Fix**: exponer solo `currentTheme: StateFlow<String>` y `onThemeChange: (String) -> Unit` desde el ViewModel.

- [ ] **D3.2 `viewModel` pasado como `PlayfitViewModel?` nullable a 3 subvistas de Settings**
  - Archivo: `ui/screens/SettingsAppearance.kt:74`, `SettingsDeveloper.kt:74`, `SettingsPrivacy.kt:72-76`
  - El ViewModel entero se pasa como nullable. Si es null, los componentes simplemente no funcionan.
  - **Problema**: interfaz inflada, difícil de testear, acoplamiento fuerte. Viola Interface Segregation Principle.
  - **Fix**: pasar solo lambdas y state específicos (ej. `onThemeChange`, `currentTheme`, `onRefresh`, `onResetTaste`).

---

### GRUPO D4 — DecisionIntroScreen

- [ ] **D4.2 Botón "Sign In" con colores hardcodeados para light/dark**
  - Archivo: `ui/screens/DecisionIntroScreen.kt:253-256`
  - `Color(0xFF0F172A)` en dark, `Color.White.copy(alpha = 0.72f)` en light.
  - **Problema**: no son colores del tema M3. Si la paleta dinámica cambia, estos colores no se actualizan.
  - **Fix**: usar `MaterialTheme.colorScheme.surface` con opacidad, o `PlayfitExtendedTheme` si es intencional.

- [ ] **D4.3 Header "PLAYFIT" usa `labelSmall` con `letterSpacing = 2.sp`**
  - Archivo: `ui/screens/DecisionIntroScreen.kt:159`
  - `Text("PLAYFIT", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Black, letterSpacing = 2.sp)`
  - **Problema**: mismo bypass de typografía M3 que B4. `fontWeight` y `letterSpacing` overridean los valores del tema.
  - **Fix**: crear un custom style en typography custom de PlayfitExtendedTheme o aceptar el tracking default de `labelSmall`.

---

### GRUPO D5 — Tests faltantes

- [ ] **D5.1 Cero tests unitarios para SyncWorker**
  - `SyncWorker.kt` no tiene tests. Contiene lógica crítica de sincronización offline-first (bucle de reintentos, manejo de operaciones concurrentes, serialización/deserialización).
  - **Fix**: agregar tests con `TestDispatcher` + mock de `PlayfitApiService`.

- [ ] **D5.2 Cero tests para SyncManager**
  - `SyncManager.kt` no tiene tests. La lógica de encolado de WorkManager no está verificada.

- [ ] **D5.3 Cero tests para PlayNextQueueCoordinator**
  - `PlayNextQueueCoordinator.kt` no tiene tests. Lógica de merging de recomendaciones, filtrado de excluidos, decisión de refresh.

- [ ] **D5.4 Cero tests para AuthCoordinator**
  - `AuthCoordinator.kt` no tiene tests. Manejo de sesión, guest sign-in, account deletion.

- [ ] **D5.5 Cero tests para InitialDataCoordinator**
  - `InitialDataCoordinator.kt` no tiene tests. Orquestación de carga inicial, orden de llamadas, manejo de errores.

- [ ] **D5.6 Cero tests para PlayfitMappers**
  - `PlayfitMappers.kt` no tiene tests. Mapeo de entidades Room ↔ modelos de dominio, parsing de fechas, inferencia de plataformas.

- [ ] **D5.7 Cero tests para Room DAOs**
  - `GameStateDao`, `PicksDao`, `PendingOperationDao`, `CacheEntryDao` no tienen tests de integración con Room.

- [ ] **D5.8 `ProductTasteDerivationTest` cobertura mínima**
  - Solo 2 tests que cubren básicamente el mismo happy path. No hay tests para estado vacío, sin onboarding, sin game states, duplicados perfil vs historial, edge cases.

---



### GRUPO D7 — Variantes de botón M3 faltantes + elevación tonal

- [ ] **D7.1 Nunca se usa `FilledTonalButton` ni `ElevatedButton`**
  - En toda la codebase solo se usan `Button` (Filled), `OutlinedButton`, y `TextButton`.
  - **Problema**: M3 define 5 variantes semánticas. `FilledTonalButton` es la variante recomendada para acciones secundarias en cards (ej. "Ver análisis", "Manage Platforms"), y `ElevatedButton` para acciones que necesitan énfasis adicional.
  - **Fix**: evaluar en `PrimaryRecommendationCard.kt:101` ("See analysis") y `DossierActionBar.kt:67-81` ("Already played", "Not for me") si `FilledTonalButton` comunica mejor el énfasis secundario.

- [ ] **D7.2 Sin `tonalElevation` en ningún Surface/Card**
  - Ningún componente usa `tonalElevation` — M3 recomienda elevación tonal (cambio de tono del color) sobre sombras (shadowElevation).
  - **Fix**: agregar `tonalElevation = 2.dp` en cards que actualmente no tienen elevación (PlayfitGlassCard, SettingsSection, etc.).

---

### GRUPO D9 — Usabilidad / Flujo de usuario (heurísticas Nielsen)

- [ ] **D9.1 "Not for me" sin confirmación — error irreversible sin undo**
  - Archivos: `PlayNextScreen.kt:204-209`, `GameDossierScreen.kt:121-127`
  - Tap en "Not for me" aplica feedback inmediatamente sin confirmación. No hay undo dentro de la sesión (solo "Show skipped again" en PlayNext).
  - **Fix**: agregar un `Snackbar` con acción "Undo" que re-encola la recomendación, o pedir confirmación (ej. feedback chips obligatorio antes de descartar).

- [ ] **D9.2 `GameDossierScreen` — no muestra indicador de carga inline**
  - Archivo: `ui/screens/GameDossierScreen.kt`
  - Solo tiene `GameDossierLoading` como estado aparte (pantalla completa). Cuando los datos llegan, hay un flash skeleton-to-content.
  - **Fix**: agregar shimmer inline en las secciones que cargan datos secundarios (similar games, full reasons).

- [ ] **D9.3 `DecisionIntroScreen` — exceso de texto e información antes del CTA**
  - La pantalla tiene: header con logo, 3 líneas de título hero, 4 líneas de descripción, CTA principal, CTA secundario (Sign In), preview card completa con 4 secciones anidadas, y animación de sparkles.
  - **Problema**: el usuario tiene que scroll para encontrar el botón "Find What to Play". El contenido de preview (mock, no real) compite por atención sin aportar información nueva.
  - **Fix**: colapsar la preview card en un diseño más compacto, o moverla debajo del CTA.

---

### GRUPO D10 — Configuración / Build adicional

- [ ] **D10.1 `configChanges` incluye `density` — fontSize del sistema no se aplica en runtime**
  - Archivo: `app/src/main/AndroidManifest.xml:19`
  - **Problema**: si el usuario cambia "Tamaño de fuente" en Ajustes sin cerrar la app, `density` no refresca. Los componentes con `fontSize` hardcodeado (TraitPillCloud, OnboardingHeader, PlayfitCoverArt) quedan con tamaños incorrectos.
  - **Fix**: eliminar `density` de `configChanges` o migrar todos los `fontSize` hardcodeados a `MaterialTheme.typography`.

- [ ] **D10.2 `isMinifyEnabled = false` sin ProGuard rules preparados**
  - Archivo: `app/build.gradle.kts:53`
  - **Riesgo**: si alguien activa R8 para release, Kotlin Serialization y Coil crashean por falta de `proguard-rules.pro`.
  - **Fix**: agregar `proguard-rules.pro` con reglas de los libraries, aunque `minifyEnabled` siga en false.

---

### GRUPO 24 — Dynamic Type limitado en TasteMapVisualizerView (accesibilidad visual)

- [ ] **53. `TasteMapVisualizerView` — .dynamicTypeSize capado a accessibility1**
  - Archivo: `Sources/PlayfitFeatures/TasteMapVisualizerView.swift`
  - Líneas 83, 89, 93, 97, 101 usan `.dynamicTypeSize(...DynamicTypeSize.accessibility1)` en los labels de cuadrante y ejes.
  - **Problema**: usuarios que necesiten texto más grande (accessibility2, accessibility3, accessibility4, accessibility5) no pueden agrandar el texto en esta pantalla. Violación directa de HIG y WCAG.
  - **Fix**: rediseñar el canvas SVG para que los labels escalen con Dynamic Type, o eliminar la constraint y usar layout autoescalable. El canvas con `GeometryReader` + posiciones absolutas es incompatible con Dynamic Type — requiere refactor estructural.

---

### GRUPO 25 — Confirmación / Undo para "Not for me" (heurística Nielsen: prevención de errores)

- [ ] **54. "Not for me" sin confirmación — acción irreversible**
  - Archivos: `Sources/PlayfitFeatures/PrimaryRecommendationCard.swift:148-161`, `Sources/PlayfitFeatures/GameDetailView.swift:217-225`, `Sources/PlayfitFeatures/PlayViewModel+Actions.swift:32-40`
  - **Problema**: un tap en "Not for me" descarta la recomendación permanente sin confirmación ni undo en-sesión.
  - **Fix opción A**: agregar `.confirmationDialog` antes de ejecutar `notForMe()`.
  - **Fix opción B** (preferida): implementar Snackbar con acción "Undo" (ej. toast "Skipped" + botón "Undo") que re-encola la recomendación. No interrumpe el flujo como un dialog.
  - Nota: D9.1 cubre el mismo problema en Android. Mantener solución consistente entre plataformas.

---



### GRUPO 27 — Animaciones de transición (percepción de respuesta)

- [ ] **57. Transición abrupta al hacer skip/notforme**
  - Archivo: `Sources/PlayfitFeatures/PrimaryRecommendationCard.swift`, `Sources/PlayfitFeatures/TodayView.swift`
  - **Problema**: cuando el usuario hace skip o notforme, el card de recomendación se reemplaza instantáneamente sin animación de salida/entrada. La experiencia se siente "cruda" comparada con apps iOS nativas.
  - **Fix**: agregar `.transition(.asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .leading)))` en el contenido del card, o animar opacidad + escala con `matchedGeometryEffect`.

---



### GRUPO 31 — Accesibilidad adicional: vistas faltantes (VoiceOver)



- [ ] **65. `DecisionIntroView` — preview card sin accessibilityElement**
  - Archivo: `Sources/PlayfitFeatures/DecisionIntroView.swift:132-226`
  - La preview card (mock) tiene múltiples Text, Divider, y reasonRows sin agrupación semántica. VoiceOver lee cada fragmento suelto.
  - **Fix**: agregar `.accessibilityElement(children: .combine)` con un label descriptivo: "Preview: Hades, 94 percent match, high action affinity, repetitive run loops."

---

### GRUPO 36 — Percepción de rendimiento (iOS)

- [ ] **79. Sin shimmer/skeleton loading en recomendación primaria**
  - Archivo: `Sources/PlayfitFeatures/TodayView.swift`, `Sources/PlayfitFeatures/TodayLoadingState.swift`
  - Solo spinner, sin placeholder visual del contenido que está cargando.

- [ ] **80. Sin indicador de progreso durante completeOnboarding()**
  - Archivo: `Sources/PlayfitFeatures/OnboardingView.swift:completeOnboarding()`
  - Puede demorar si hay red, pero no hay feedback visual para el usuario.

---

### GRUPO D11 — Touch targets y navegación

- [ ] **D11.4 `TasteScreen.kt` — sin TopAppBar inconsistente con otras pantallas principales**
  - `TasteScreen.kt` no tiene `TopAppBar` M3. Usa solo `Text(headlineLarge)` como título suelto.
  - **Problema**: inconsistente con PlayNextScreen (LargeTopAppBar) y PicksScreen (LargeTopAppBar).
  - **Fix**: agregar `LargeTopAppBar` con `exitUntilCollapsedScrollBehavior` como en las otras pantallas.

- [ ] **D11.5 Sin `NavigationBar` M3 para navegación entre destinos principales**
  - La app tiene 3-4 destinos (PlayNext, Taste, Picks, Settings) pero no usa `NavigationBar` de M3.
  - **Fix**: evaluar si `NavigationBar` con `NavigationBarItem` mejora la navegación principal.

---

### GRUPO D12 — Colors hardcodeados que bypassan el tema M3

- [ ] **D12.1 `TasteMapVisualizerScreen.nodeColor()` — 4 colores fijos sin relación con el tema**
  - `TasteMapVisualizerScreen.kt:73-77` — `Color(0xFF34D399)`, `Color(0xFF047857)`, `Color(0xFFFB7185)`, `Color(0xFFBE123C)`.
  - Si el usuario cambia de tema dinámico, estos colores no cambian.
  - **Fix**: usar `MaterialTheme.colorScheme.{primary/error/tertiary}` o `PlayfitExtendedTheme.{playfitPositive/playfitNegative}`.

- [ ] **D12.2 `DecisionIntroScreen.kt` — pink `#EC4899` fijo en gradient "curated"**
  - `DecisionIntroScreen.kt:190` — `Color(0xFFEC4899)` no viene del tema.
  - **Fix**: reemplazar con `MaterialTheme.colorScheme.tertiary` o `PlayfitExtendedTheme.colors.playfitIndigo`.

---

### GRUPO D13 — Shapes hardcodeadas adicionales (extensión de B3)

- [ ] **D13.1 `PlayfitCoverArt.kt` — `RoundedCornerShape(8.dp)` en contenedor de cover**
  - `PlayfitCoverArt.kt:79` — 8.dp no existe en escala `PlayfitShapes` (4/8/12/16/24).
  - **Fix**: `MaterialTheme.shapes.small` (8.dp).

- [ ] **D13.2 `TasteScreen.kt` — `RoundedCornerShape(12.dp)` en `TasteStatusBanner`**
  - `TasteScreen.kt:230` — 12.dp corresponde a `MaterialTheme.shapes.medium`.
  - **Fix**: `MaterialTheme.shapes.medium`.

- [ ] **D13.3 `AlternativeRow.kt` — badge match con `RoundedCornerShape(8.dp)`**
  - `AlternativeRow.kt:78` — 8.dp = `MaterialTheme.shapes.small`.
  - **Fix**: `MaterialTheme.shapes.small`.

- [ ] **D13.4 `AlreadyPlayedDialog.kt` — botones con `RoundedCornerShape(16.dp)`**
  - `AlreadyPlayedDialog.kt:124` — 16.dp = `MaterialTheme.shapes.large`.
  - **Fix**: `MaterialTheme.shapes.large`.

- [ ] **D13.5 `OnboardingHeader.kt` — progress bar con `RoundedCornerShape(2.dp)`**
  - `OnboardingHeader.kt:65` — 2.dp no está en la escala.
  - **Fix**: `MaterialTheme.shapes.extraSmall` (4.dp).

- [ ] **D13.6 `DecisionsActivityScreen.kt` — `ChangeSignalSheet` con `RoundedCornerShape(28.dp)`**
  - `DecisionsActivityScreen.kt:359` — 28.dp no existe en la escala M3 ni en `PlayfitShapes`.
  - **Fix**: `MaterialTheme.shapes.extraLarge` (24.dp).

---

### GRUPO D14 — Estados de carga sin indicador visual

- [ ] **D14.1 `AuthScreen.kt` — sin indicador de progreso durante `busy = true`**
  - `AuthScreen.kt:74-96` — cuando `busy = true` los botones se deshabilitan pero no hay spinner ni skeleton. El usuario no sabe si la app está procesando o congelada.
  - **Fix**: agregar `CircularProgressIndicator` solapado o `LinearProgressIndicator` en la parte superior del formulario.

- [ ] **D14.2 `PicksScreen.kt` — "Loading saved picks..." es solo texto sin shimmer**
  - `PicksScreen.kt:220-241` — `PicksLoadingState` muestra texto plano. `PlayNextLoading` en cambio tiene shimmer (buen patrón que no se replica aquí).
  - **Fix**: reemplazar con `ShimmerCard` o `ShimmerBox` como en `PlayNextLoading.kt`.

---

### GRUPO D15 — Elevación M2 remanente (extensión de D7.2)

- [ ] **D15.1 `OnboardingScreen.kt` — `Surface` usa `shadowElevation = 8.dp` (M2) en vez de solo `tonalElevation`**
  - `OnboardingScreen.kt:243` — `Surface(tonalElevation = 8.dp, shadowElevation = 8.dp)`. M3 recomienda solo tonal elevation.
  - **Fix**: eliminar `shadowElevation`, mantener solo `tonalElevation = 8.dp`.

---

# Web (Next.js / shadcn/ui) — Auditoría Sistema de Diseño + Accesibilidad 2026-07-09

> Proyecto: `apps/web/` (Next.js 16 canary, Tailwind v4, shadcn/ui con Radix primitives + CVA)

---

### GRUPO W1 — P0: Barreras WCAG 2.1 AA (bloqueante para usuarios de teclado/screen reader)

- [ ] **W1.1 `Dialog` — falta focus trap nativo de Radix**
  - Archivo: `apps/web/src/components/ui/dialog.tsx`
  - Usa `<dialog>` nativo + `showModal()` en vez de `@radix-ui/react-dialog`. El `<dialog>` nativo tiene focus trap básico pero no maneja correctamente roots de terceros (portales, tooltips internos). Tampoco hay `aria-modal` explícito.
  - **Fix**: migrar a `@radix-ui/react-dialog` que provee focus trap, `aria-modal`, y keyboard dismissal por defecto.

- [ ] **W1.2 `Sheet` — mismo problema que Dialog, sin Radix**
  - Archivo: `apps/web/src/components/ui/sheet.tsx`
  - Ídem W1.1 pero para panel lateral. Usa `<dialog>` nativo sin focus trap de Radix.
  - **Fix**: migrar a `@radix-ui/react-dialog` configurado como sheet, o implementar focus trap manual con `tabindex` cycling.

- [ ] **W1.3 `DropdownMenu` — sin navegación por teclado (↑↓ entre items)**
  - Archivo: `apps/web/src/components/ui/dropdown-menu.tsx`
  - Al abrirse, el foco no se mueve al menú. No se pueden navegar los items con flechas. Solo Escape dismiss.
  - **Fix**: migrar a `@radix-ui/react-dropdown-menu` que provee manejo completo de teclado (↑↓, Home, End, Enter, Escape) + `role="menu"` + `aria-activedescendant`.

- [ ] **W1.4 `Tabs` — sin roles WAI-ARIA tabs**
  - Archivo: `apps/web/src/components/ui/tabs.tsx`
  - No usa `role="tablist"`, `role="tab"`, `role="tabpanel"`, ni `aria-selected`/`aria-controls`. Screen reader no identifica la estructura de tabs.
  - **Fix**: migrar a `@radix-ui/react-tabs` o agregar roles/aria manualmente.

- [ ] **W1.5 `RadioGroup` — sin navegación por teclado direccional**
  - Archivo: `apps/web/src/components/ui/radio-group.tsx`
  - Las opciones de radio no soportan navegación con ↑↓. Solo se puede tabular entre opciones.
  - **Fix**: migrar a `@radix-ui/react-radio-group` que provee manejo de teclado completo + `role="radiogroup"`.

- [ ] **W1.8 `Tooltip` — no activable por teclado**
  - Archivo: `apps/web/src/components/ui/tooltip.tsx`
  - Usa `<span role="button" tabIndex={0}>` en vez de `<button>`. El tooltip solo aparece en hover, no al recibir foco por teclado. El biome-ignore comment para `a11y/useSemanticElements` oculta la advertencia pero no resuelve el problema.
  - **Fix**: migrar a `@radix-ui/react-tooltip` (cubierto en W3.5) o implementar `onFocus`/`onBlur` para mostrar/ocultar el tooltip.

---

### GRUPO W2 — P1: Usabilidad bloqueante (heurísticas Nielsen)

- [ ] **W2.3 Sin feedback visual de "guardando" en pasos intermedios de onboarding**
  - Archivo: `apps/web/src/components/playfit/onboarding-section.tsx:72-94`
  - `togglePlatform()` llama `updateState()` que encola save, pero no hay indicador visual (Spinner/Skeleton) durante la persistencia.
  - **Fix**: mostrar `SaveIndicator` o un pequeño spinner inline durante la operación.

---

### GRUPO W3 — P2: Consistencia con patrón shadcn/ui

- [ ] **W3.1 Migrar `Dialog` a `@radix-ui/react-dialog`**
  - Archivo: `apps/web/src/components/ui/dialog.tsx`
  - El `<dialog>` nativo funciona pero Radix provee focus trap completo, `aria-modal`, keyboard handling consistente, y API declarativa.

- [ ] **W3.2 Migrar `Sheet` a `@radix-ui/react-dialog` (modo sheet)**
  - Archivo: `apps/web/src/components/ui/sheet.tsx`
  - Radix Dialog configurable con `side` animations reemplaza el `<dialog>` nativo.

- [ ] **W3.3 Migrar `DropdownMenu` a `@radix-ui/react-dropdown-menu`**
  - Archivo: `apps/web/src/components/ui/dropdown-menu.tsx`
  - Implementación custom actual no soporta keyboard nav entre items ni `aria-activedescendant`.

- [ ] **W3.4 Migrar `Tabs` a `@radix-ui/react-tabs`**
  - Archivo: `apps/web/src/components/ui/tabs.tsx`
  - Radix Tabs provee estructura WAI-ARIA completa + keyboard navigation.

- [ ] **W3.5 Migrar `Tooltip` a `@radix-ui/react-tooltip`**
  - Archivo: `apps/web/src/components/ui/tooltip.tsx`
  - CSS-only tooltip no funciona en hover táctil. Radix Tooltip maneja pointer + keyboard + focus.

- [ ] **W3.6 Migrar `RadioGroup` a `@radix-ui/react-radio-group`**
  - Archivo: `apps/web/src/components/ui/radio-group.tsx`
  - Keyboard nav direccional con Radix.

---

### GRUPO W4 — P3: Accesibilidad refinamiento

- [ ] **W4.1 `StatusDot` — sin texto accesible**
  - Archivo: `apps/web/src/components/ui/status-dot.tsx`
  - Renderiza como `<span>` sin `aria-label`, `role="status"`, ni `sr-only`. Usuarios de screen reader o daltónicos no perciben el estado.
  - **Fix**: agregar `<span className="sr-only">{label}</span>` o `aria-label` prop obligatoria.

- [ ] **W4.4 `CoverArt` — placeholder con initials sin contraste verificable**
  - Archivo: `apps/web/src/components/playfit/cover-art.tsx:54`
  - `background: linear-gradient(135deg, hsl(${hue}, 40%, 18%), hsl(${(hue + 50) % 360}, 30%, 26%))` con texto `text-white/80`. El contraste variante según el hue generado — no hay garantía WCAG AA.
  - **Fix**: agregar pass de verificación de luminancia, y ajustar color de texto a `white` o `black` según contraste resultante.

---

### GRUPO W5 — P4: Rendimiento y UX

- [ ] **W5.5 No existe página de búsqueda de catálogo (`/search`)**
  - Solo existe búsqueda dentro del onboarding (`OnboardingSearchDialog`). El usuario no puede explorar el catálogo de juegos fuera del flujo de calibración.
  - **Fix**: crear ruta `/search` con input de búsqueda, resultados paginados, y filtros por plataforma/género/año.

- [ ] **W5.6 Onboarding sin opción de saltar pasos**
  - Archivo: `apps/web/src/components/playfit/onboarding-section.tsx`
  - Las 3 fases (platforms → liked games → disliked game) son obligatorias. Un usuario que solo quiere probar la app no puede skipear.
  - **Fix**: agregar botón "Skip for now" en cada paso o al inicio del onboarding, que use valores por defecto (todas las platforms, cero anchors) y pase directamente a recomendaciones.

- [ ] **W5.8 FeedbackReasonPicker aparece post-"Not for me" como paso extra**
  - Archivo: `apps/web/src/components/playfit/play-next-card.tsx:175-185`
  - Después de "Not for me" se muestra el picker de razones. No obligatorio, pero agrega fricción post-acción.
  - **Fix**: considerar moverlo a pre-decisión (como confirmación estructurada) o mantenerlo como post-hoc dismissible.



---



### GRUPO W6 — P3: Consistencia interna del sistema de diseño

- [ ] **W6.1 CVA usado solo en 6/28 componentes**
  - Componentes con CVA: `button`, `badge`, `alert`, `spinner`, `select`, `tabs`, `toggle-group`. Los 22 restantes usan estilos manuales inline o ternarios.
  - **Problema**: inconsistencia de patrón. Algunos componentes exponen `VariantProps` tipados, otros no. Dificulta mantenimiento y extensión.
  - **Fix**: estandarizar: componentes con variantes visuales → CVA + `VariantProps`; componentes de layout/estructurales → `cn()` simple.

- [ ] **W6.2 `tag.tsx` hardcodea dark mode en hover del botón remove**
  - Archivo: `apps/web/src/components/ui/tag.tsx`
  - `hover:bg-black/10 dark:hover:bg-white/10` viola la convención de AGENTS.md: "Dark mode via CSS token variables, no hardcoded values".
  - **Fix**: `hover:bg-muted/20` (o token correspondiente).

- [ ] **W6.3 Solo 1 dependencia Radix vs ~12 esperadas en shadcn/ui estándar**
  - `package.json` solo tiene `@radix-ui/react-slot`. Componentes como Dialog, Sheet, DropdownMenu, Tooltip, Tabs, Select, Checkbox, RadioGroup, ToggleGroup deberían usar primitivas Radix.
  - **Impacto**: el equipo mantiene ~8 implementaciones custom de patrones que Radix resuelve con accesibilidad out-of-the-box.
  - **Fix**: migration roadmap cubierto en W3.1-W3.6.

- [ ] **W6.4 `alerts.tsx` no es parte del index — falta export en `ui/index.ts`**
  - Verificar si `alerts.tsx` (si existe) o `alert.tsx` está correctamente exportado.

- [ ] **W6.5 `Stack` usa template literals para clases Tailwind (`items-${align}`, `justify-${justify}`)**
  - Archivo: `apps/web/src/components/ui/stack.tsx`
  - **Problema**: Tailwind v4 JIT puede no generar clases dinámicas si los valores no aparecen estáticamente en el código. Funciona si los valores ya existen en otros archivos, pero es frágil.
  - **Fix**: usar lookup table exhaustiva como ya se hace para `gap`.

### GRUPO W7 — P3: Refactors estructurales

- [ ] **W7.1 `Input` no usa `forwardRef`**
  - Archivo: `apps/web/src/components/ui/input.tsx`
  - Input y Textarea son function components sin `forwardRef`. El ref pasado externamente se pierde. Librerías como `react-hook-form` dependen de ref forwarding.
  - **Fix**: envolver con `React.forwardRef`.

- [ ] **W7.2 `TextareaProps` definido pero no usado**
  - Archivo: `apps/web/src/components/ui/input.tsx`
  - La interface `TextareaProps` extiende `TextareaHTMLAttributes` pero la función `Textarea` solo acepta `className`. Props como `placeholder`, `value`, `onChange` no se propagan.
  - **Fix**: hacer que `Textarea` acepte y spreadee `TextareaProps`.

- [ ] **W7.3 `components/ui/index.ts` no existe**
  - No hay barrel export. Los componentes se importan directo de cada archivo. No hay un punto único de exportación como es estándar en shadcn/ui.
  - **Fix**: crear `index.ts` con exports alfabéticos de todos los componentes.

- [ ] **W7.4 `form-field.tsx` no conecta `FormLabel` con `FormMessage` vía `aria-describedby`**
  - Archivo: `apps/web/src/components/ui/form-field.tsx`
  - `FormField` es un `<div>` simple. No provee `aria-describedby` automático entre label y mensaje de error/descripción.
  - **Fix**: agregar wiring de `aria-describedby` mediante IDs generados con `useId()`.

### GRUPO W8 — P4: Cobertura de tests

- [ ] **W8.1 Sin tests para componentes UI (solo existen test para decision-shell, picks-shell, taste-shell, playfit-context, play-next-card)**
  - Archivos faltantes: `dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`, `tabs.tsx`, `tooltip.tsx`, `radio-group.tsx`, `toast.tsx`, `checkbox.tsx`, `toggle-group.tsx`, `form-field.tsx`, `progress-bar.tsx`, `stack.tsx`, `container.tsx`
  - **Problema**: componentes con lógica de accesibilidad crítica (focus trap, keyboard nav, ARIA) no tienen tests unitarios ni de comportamiento.
  - **Fix**: agregar tests con `@testing-library/react` para keyboard interactions, focus management, ARIA attributes.

- [ ] **W8.2 Onboarding flow sin tests e2e**
  - Archivo: `apps/web/e2e/` — explorar si existe test para onboarding completo.
  - **Fix**: agregar test Playwright que recorra onboarding completo como usuario nuevo (guest → platforms → liked games → disliked → recomendación).
