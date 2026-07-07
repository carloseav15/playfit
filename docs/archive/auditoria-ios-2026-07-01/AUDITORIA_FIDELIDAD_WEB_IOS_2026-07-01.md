# Auditoría de fidelidad: Web mobile `/play` vs iOS nativo

Fecha: 2026-07-01
Alcance: `product/apps/web/src/app/play` + `product/apps/web/src/components/playfit-mvp` + `product/apps/web/src/components/playfit` (web) vs `ios-swiftui/Sources/PlayfitFeatures` + `PlayfitDesignSystem` + `PlayfitLogic` (iOS).
Método: auditoría estática de código. Se citó copy literal vía `grep`/lectura directa en archivos clave de ambas plataformas. No se tomaron capturas de pantalla, no se ejecutó la app, no se modificó código.

## 0. Nota sobre auditorías previas

Existen dos documentos previos en esta misma carpeta (`AUDITORIA_PLAY_MOBILE_IOS.md`, `INVENTARIO_IOS_Y_COMPARATIVA_WEB.md`), fechados también 2026-07-01, que afirman haber implementado correcciones P0/P1/P2 el mismo día. No se asumió que esas afirmaciones fueran ciertas; se verificaron contra el código actual:

| Afirmación del doc previo | Estado verificado hoy | Evidencia |
| --- | --- | --- |
| Add Pick no crea rating, solo `inPlayfitPicks` | CONFIRMADO | `PlayViewModel.swift:319`, `PlayfitLogic.swift:79-94` |
| Decodificación `game_states`/camelCase corregida | CONFIRMADO (parcial en robustez) | `PlayfitModels+New.swift:145-165`, `HTTPPlayfitClient.swift:169-189` |
| Picks consume `fetchPicks()` real | CONFIRMADO | `PlayViewModel.swift:159,238,244` |
| Refresh de token Supabase implementado | CONFIRMADO | `HTTPPlayfitClient.swift:292-329`, `AuthSession.swift:19-25` |
| Taste incluye señales de onboarding | CONFIRMADO | `TasteView.swift:18-23`, `PlayfitLogic.swift:393-419` |
| Dossier resuelve por `gameId` con fetch real | CONFIRMADO | `GameDetailView.swift:25-30,225-260` |
| "Started" mueve un Pick a `playing` | CONFIRMADO | `PlayViewModel.swift:329-337` |
| Portadas reales con caché | CONFIRMADO | `PlayfitDesignSystem.swift:64-141` |
| Traits List textual como alternativa al mapa | CONFIRMADO | `TasteView.swift:141-189` |
| Límite de 100 picks | CONFIRMADO hoy (el doc previo lo daba por ausente) | `PlayViewModel.swift:306-307` |
| Suite de tests UI configurada | CONFIRMADO (existencia, no ejecución) | `PlayfitIOSUITests.swift:17-44` |
| Forgot password en iOS | **FALSO** — sigue sin existir | sin resultados en `grep -rniE 'forgot|reset.?password'` sobre `ios-swiftui/Sources` |
| `PlayfitMocks` removido de Features | **FALSO** — sigue como dependencia | `Package.swift:49-57` |

Conclusión: el trabajo descrito en los documentos previos sí está mayormente reflejado en el código actual. Los dos puntos falsos (forgot password, PlayfitMocks) se incorporan como hallazgos en esta auditoría. Además, esta auditoría añade un hallazgo **crítico no cubierto por los documentos previos**: los "quick suggestions" del onboarding en iOS crean juegos ficticios con IDs inventados (ver sección 4).

---

## 1. Inventario completo de pantallas — Web mobile `/play`

| # | Ruta / pantalla | Propósito | Archivo raíz |
| - | --- | --- | --- |
| 1 | Launcher / Intro | Promesa de producto, inicia calibración o sign-in | `components/playfit-mvp/decision-intro.tsx` |
| 2 | Onboarding – Plataformas | Selección de plataformas propias (mínimo 1) | `components/playfit/onboarding-section.tsx:189-236` |
| 3 | Onboarding – 3 favoritos | Selección exacta de 3 juegos amados | `onboarding-section.tsx:239-263` |
| 4 | Onboarding – 1 rechazo | Selección exacta de 1 juego rechazado | `onboarding-section.tsx:287-319` |
| 5 | Onboarding – Búsqueda | Buscador de catálogo con debounce y quick suggestions | `onboarding-section.tsx:860-1056` |
| 6 | Play Next / Decision | Recomendación principal + alternativas | `app/play/page.tsx` → `components/playfit-mvp/decision-shell.tsx`, `play-next-card.tsx` |
| 7 | Already Played (dialog) | Clasifica un juego ya jugado (Loved/Liked/Mixed/Dropped) | `already-played-panel.tsx` |
| 8 | Feedback Reason Picker | Motivo de "Not for me" (no persiste) | `feedback-reason-picker.tsx` |
| 9 | Dossier | `/play/game/[gameId]` — detalle explicativo de una recomendación | `app/play/game/[gameId]/page.tsx` → `decision-dossier.tsx` |
| 10 | Picks | `/play/picks` — lista de recomendaciones guardadas + gestión | `app/play/picks/page.tsx` → `picks-shell.tsx`, `mobile/picks-mobile.tsx` |
| 11 | Taste – Interactive Affinity Map | `/play/taste` submenu — mapa visual de juegos/señales | `mobile/taste-mobile.tsx:103-104` → `taste-map-visualizer.tsx` |
| 12 | Taste – Gaming Taste DNA | `/play/taste` submenu — radar chart + affinity pill clouds | `mobile/taste-mobile.tsx:123-125` → `taste-components.tsx` (`TasteMap`) |
| 13 | Taste – Decisions & Activity | `/play/taste` submenu — historial filtrable All/Picks/Preferences | `mobile/taste-mobile.tsx:142-147` → `taste-components.tsx:804-960` (`TasteHistory`) |
| 14 | Settings – Menú | `/play/settings` — accesos a Appearance/Platforms/Account/Privacy | `app/play/settings/page.tsx` → `mobile/settings-mobile.tsx:40-157` |
| 15 | Settings – Appearance | Light/Dark/System | `settings-shell.tsx:85-123` |
| 16 | Settings – Platforms | Edición de plataformas (dentro de Taste shell) | `taste-shell.tsx:143-409` (`PlatformsTabContent`) |
| 17 | Settings – Data & Privacy | Reset taste profile / Delete cloud account | `settings-shell.tsx:197-317` |
| 18 | Auth panel | Google, email/password, guest, signup, forgot password | `components/playfit/auth-panel.tsx` |
| 19 | Navegación / Tab bar | Tab bar inferior + header dinámico | `app/play/layout-client.tsx` |
| — | `/auth/callback` | Intercambio OAuth | `app/auth/callback/route.ts` |

No hay rutas mobile separadas para los pasos de onboarding, los submodos de Taste ni las subvistas de Settings: son estados internos de una sola pantalla/ruta.

---

## 2. Inventario completo de pantallas — iOS

| # | Pantalla | Tipo | Propósito | Archivo |
| - | --- | --- | --- | --- |
| 1 | `DecisionIntroView` | Pantalla | Promesa, iniciar calibración, sign-in, theme menu | `DecisionIntroView.swift` |
| 2 | `OnboardingView` | Flujo (3 pasos) | Plataformas, 3 favoritos, 1 rechazo, búsqueda | `OnboardingView.swift` |
| 3 | `TodayView` | Tab principal | Play Next, alternativas, feedback | `TodayView.swift` |
| 4 | `AlreadyPlayedSheet` | Sheet (design system) | Loved/Liked/Mixed/Dropped | `PlayfitDesignSystem/AlreadyPlayedSheet.swift` |
| 5 | `FeedbackReasonPicker` | Componente inline (design system) | Motivo de "No, skip this" | `PlayfitDesignSystem/FeedbackReasonPicker.swift` |
| 6 | `GameDetailView` | Push destination | Dossier por `entry` o por `gameId` | `GameDetailView.swift` |
| 7 | `PicksView` | Tab | Picks guardados + gestión (confirmationDialog, swipe) | `PicksView.swift` |
| 8 | `TasteView` (tab "Your Taste") | Tab | Resumen + Interactive Affinity Map + Traits List | `TasteView.swift`, `TasteMapVisualizerView.swift` |
| 9 | `TasteView` (tab "Activity") / `DecisionsActivityView` | Subvista de tab | Filtros All/Picks/Taste, gestión de señales | `DecisionsActivityView.swift` |
| 10 | `SettingsView` | Tab | Menú Appearance/Platforms/Data & Privacy/Account/Developer | `SettingsView.swift:7-262` |
| 11 | `AppearanceView` | Push destination | Light/Dark/System | `SettingsView.swift:298-392` |
| 12 | `PlatformSelectionView` | Push destination | Presets + selección individual | `SettingsView.swift:412-710` |
| 13 | `PrivacySettingsView` | Push destination | Reset Taste Profile / Delete Cloud Profile | `SettingsView.swift:776-976` |
| 14 | `DeveloperSettingsView` | Push destination (solo DEBUG) | Cambiar entorno dev/prod | `SettingsView.swift:729-776` |
| 15 | `SignInSheetView` | Sheet | Google, email sign-in/signup, guest | `SettingsView.swift:1002-1413` |
| 16 | `PlayfitRootView` + `TabView` | Root/Navegación | Gate intro/onboarding/app, 4 tabs con badge | `PlayfitRootView.swift` |

`DeveloperSettingsView` no tiene equivalente web (correcto: es tooling interno, no debe tenerlo). No existe una pantalla dedicada de "Forgot password".

---

## 3. Tabla comparativa por pantalla

Escala: **Alta / Media / Baja / Faltante / No confirmado**.

| Web mobile screen | iOS screen | Fidelidad visual | Fidelidad funcional | Copy/texto | HIG compliance | Diferencias detectadas | Archivos web | Archivos iOS | Prioridad |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Launcher/Intro (`decision-intro.tsx`) | `DecisionIntroView` | Media (No confirmado a nivel píxel; estructura y jerarquía equivalentes) | Alta | **Alta** — "Your next game, curated." / "Select your platforms, three favorites, and one notable miss..." / "Zero noise. Zero decision fatigue." / "Find What to Play" / "Sign In" son casi verbatim | Cumple (NavigationStack, Label+SF Symbol) | Ninguna funcional relevante; No confirmado si el mock de portada ("Hades") hace fetch de cover real como en web (`decision-intro.tsx:65-77`) | `decision-intro.tsx:54-237` | `DecisionIntroView.swift:60-190` | Baja |
| Onboarding — Plataformas | `OnboardingView` (paso 1) | No confirmado | Alta (mínimo 1, presets) | Media — título "Where do you play?" idéntico; descripción parafraseada distinta | Cumple | Descripción diferente: web "We will only recommend games available on your active platforms." vs iOS "Select the systems you own so Playfit only suggests games you can actually play." | `onboarding-section.tsx:349-355` | `OnboardingView.swift:179-182` | Media |
| Onboarding — 3 favoritos | `OnboardingView` (paso 2) | No confirmado | Alta | **Alta** — título y descripción idénticos | Cumple | Ninguna | `onboarding-section.tsx:239-264,351,356` | `OnboardingView.swift:239-264,291,294` | Baja |
| Onboarding — 1 rechazo | `OnboardingView` (paso 3) | No confirmado | Alta | Media — descripción idéntica, **título distinto**: web "Pick one game that wasn't for you" vs iOS "Pick one game that missed" | Cumple | Título iOS es ambiguo/menos claro que el web | `onboarding-section.tsx:287-304,352,358` | `OnboardingView.swift:385,388` | Media |
| Onboarding — Búsqueda / Quick suggestions | `OnboardingView` (search sheet) | No confirmado | **Incorrecta** — ver hallazgo crítico | Alta en labels de UI de búsqueda ("Searching...", empty, error); lista de sugerencias idéntica | Cumple en UI (`.navigationTitle`, `ProgressView`) pero falla en integridad de datos | Web: tap en sugerencia autocompleta el input y dispara búsqueda real contra el catálogo (`onboarding-section.tsx:901`). iOS: tap crea un `Game` mock con ID derivado del título (`title.lowercased().replacingOccurrences(...)`), **sin consultar el catálogo** | `onboarding-section.tsx:860-1056,892-905` | `OnboardingView.swift:539-563` | **Alta** |
| Play Next / Decision (`decision-shell.tsx` + `play-next-card.tsx`) | `TodayView` | Media (No confirmado a nivel de tokens exactos) | Alta | **Alta** — "Finding recommendations...", "Play Next could not load"→"No games to recommend yet", "Also worth considering", "Play this next"/"Worth checking", "See analysis", "Already Played", "No, skip this", "Show me another option", mensaje de unlock de razones: todos verbatim | Cumple (skeleton, estados, botones nativos) | Sin diferencias de copy relevantes detectadas | `decision-shell.tsx:334-541`, `play-next-card.tsx:191-402` | `TodayView.swift:45-381` | Baja |
| Already Played (dialog/sheet) | `AlreadyPlayedSheet` | Media | Alta | **Alta** en título/subtítulo/helper ("Already Played", "How did it land?", helper text idéntico); **Media** en opciones — "Dropped" (iOS) vs "Dropped it" (web) | Cumple (`.presentationDetents`) | Iconografía distinta: Dropped usa `xmark` en iOS vs ThumbsDown en web; Mixed usa `ellipsis` en iOS vs Waves en web | `already-played-panel.tsx:20-69` | `AlreadyPlayedSheet.swift:12-45` | Baja |
| Feedback Reason Picker | `FeedbackReasonPicker` (design system) | Alta | Alta | **Alta** — "What got in the way?", "Wrong mood", "Too long", "Too hard", "Not my genre": verbatim | Cumple | Ninguna | `feedback-reason-picker.tsx:1-44` | `FeedbackReasonPicker.swift:1-37` | Baja |
| Dossier (`/play/game/[gameId]`) | `GameDetailView` | No confirmado | Alta | Alta en labels confirmados ("Catalog Details", badges) | Cumple (`safeAreaInset` para action bar, `ContentUnavailableView` para not-found) | Ninguna crítica; dossier iOS resuelve por ID con loading/not-found/error, a la par del web | `decision-dossier.tsx:139-441` | `GameDetailView.swift:6-260` | Baja |
| Picks (lista + manage) | `PicksView` | Media | Alta (superando el brief: iOS implementa "Started", que ni el propio web mobile ofrece) | **Alta** — "No saved picks yet" y descripción idénticos; "Already Played It" / "No, skip this" / "Remove Pick" idénticos | Cumple (`confirmationDialog`, swipe actions, `ContentUnavailableView`) | iOS añade "Start Playing" en el diálogo de gestión — funcionalidad ausente en la propia web mobile (`PLAY-MVP.md` la exige, web no la implementó); no es un defecto de iOS sino un adelanto respecto al brief | `picks-shell.tsx:161-200`, `mobile/picks-mobile.tsx:38-149` | `PicksView.swift:12-86`, `PlayViewModel.swift:329-337` | Baja (documentar como decisión de producto, no bug) |
| Taste — Interactive Affinity Map | `TasteMapVisualizerView` (dentro de tab "Your Taste") | Media | Media | Media — título "Interactive Affinity Map" idéntico; subtítulo distinto ("Visual coordinates mapping your gaming footprint and active picks." vs "Visual graph of your gaming traits.") | Parcial — falta confirmar VoiceOver/Dynamic Type en runtime | Estructuralmente el mapa vive junto al resumen en una sola vista, no como pantalla separada navegable | `mobile/taste-mobile.tsx:103-104` | `TasteMapVisualizerView.swift:35-37`, `TasteView.swift` | Media |
| Taste — Gaming Taste DNA (radar + pill clouds) | Traits List (textual, dentro de `TasteView`) | **Faltante** el radar/pills visual; sustituido por lista | Media — misma información, presentación distinta | Media — "Traits List" no es el mismo copy que "Gaming Taste DNA"; subtítulo diferente ("An accessible text view of the evidence shown in the map." vs "Radar chart and affinity pill clouds.") | **Adaptación intencional válida por HIG** (alternativa textual accesible en vez de gráfico complejo con solo color/posición) — documentar como diferencia intencional, no bug | `mobile/taste-mobile.tsx:123-125`, `taste-components.tsx:92-197` | `TasteView.swift:143-189` | Media (decidir si además del texto se quiere un radar nativo, o si el texto reemplaza intencionalmente al radar) |
| Taste — Decisions & Activity | `DecisionsActivityView` | Media | Alta | Media — filtro "Preferences" (web) vs "Taste" (iOS) para la tercera pestaña; resto de copy ("How did it land?", "Cancel", "Done") idéntico | Cumple (`confirmationDialog`, `Picker` segmentado) | Etiqueta de tercer filtro distinta; sin impacto funcional | `taste-components.tsx:872-902` | `DecisionsActivityView.swift:40-42` | Baja |
| Settings — Menú | `SettingsView` | Media | Alta | Media — subtítulo de "Data & Privacy" distinto ("Manage your personal data, local taste storage, and account settings." vs "Manage cache and profile preferences") | Cumple (`List`, `NavigationLink`) | Estructura de secciones equivalente; iOS añade sección "Developer" (correcto, solo DEBUG) | `mobile/settings-mobile.tsx:40-157` | `SettingsView.swift:7-262` | Baja |
| Settings — Appearance | `AppearanceView` | Media | Alta | Media — iOS añade oración no presente en web ("Changes apply immediately to all screens.") | Cumple | Copy añadido, no contradictorio | `settings-shell.tsx:85-123` | `SettingsView.swift:298-392,333` | Baja |
| Settings — Platforms | `PlatformSelectionView` | Media | Alta | Media — descripción distinta a la de onboarding platforms | Cumple | Presets y selección individual presentes en ambos | `taste-shell.tsx:143-409` | `SettingsView.swift:412-710,436` | Baja |
| Settings — Data & Privacy (Reset) | `PrivacySettingsView` (Reset) | Media | Alta | **Alta** — "Reset Taste Profile" + descripción verbatim | Cumple (doble confirmación) | Ninguna | `settings-shell.tsx:225-250` | `SettingsView.swift:792-859` | Baja |
| Settings — Data & Privacy (Delete) | `PrivacySettingsView` (Delete) | Media | Media | **Diferente intencionalmente** — web "Delete Cloud Account": "...sign-in credentials from our servers. This action is irreversible." (sobre-promete borrar credenciales); iOS "Delete Cloud Profile": "...Your Supabase sign-in identity is not deleted." (más preciso) | Cumple | Esto es un problema de **precisión de copy en la web**, no un defecto de iOS — ver hallazgo crítico #3 | `settings-shell.tsx:270-297` | `SettingsView.swift:879-947` | **Alta** (corregir la web, no el iOS) |
| Auth panel | `SignInSheetView` | Media | Media | Alta en botones confirmados ("Continue with Google/Email/Guest", "Email Address", "Password", "New to Playfit? Create account") | Cumple (AuthenticationServices en vez de WebView) | **Falta Forgot Password en iOS** (existe en web: `auth-panel.tsx:111-133`) | `auth-panel.tsx:22-400` | `SettingsView.swift:1002-1413` | **Alta** |
| Navegación / Tab bar | `PlayfitRootView` + `TabView` | Media | Alta | Alta — labels de tabs coinciden conceptualmente ("Play Next", "My Picks"/"Picks", "My Taste"/"Taste", "Settings") | Cumple (TabView nativo con badge, vs tab bar custom fixed en web) | Web usa tab bar custom con `fixed` + backdrop-blur; iOS usa `TabView` nativo — **diferencia intencional correcta por HIG** | `layout-client.tsx:286-352` | `PlayfitRootView.swift:72-105` | Baja |

---

## 4. Diferencias críticas

1. **Onboarding "quick suggestions" crean juegos ficticios con IDs inventados** en iOS (`OnboardingView.swift:547-549`: `Game(id: title.lowercased().replacingOccurrences(of: " ", with: "_"), ...)`), en vez de disparar una búsqueda real contra el catálogo como hace la web (`onboarding-section.tsx:901`: autocompleta el input y reutiliza el buscador real). Riesgo: un usuario puede guardar un "favorito" o "rechazo" cuyo ID no exista en el catálogo real, contaminando el perfil y el scoring de recomendaciones. No estaba cubierto por los P0/P1/P2 previos.
2. **Forgot password no existe en iOS** (`SettingsView.swift` / `SignInSheetView`, sin match en `grep -rniE 'forgot|reset.?password'`), mientras la web sí lo ofrece (`auth-panel.tsx:111-133`, `resetPasswordForEmail`). Usuarios de iOS que olvidan su contraseña quedan sin salida dentro de la app.
3. **Sobre-promesa de copy en la web**, no en iOS: "Delete Cloud Account" en web afirma borrar "sign-in credentials... irreversible" (`settings-shell.tsx:270-276`), pero la auditoría previa ya documentó que el backend (`DELETE /api/profile`) solo borra el perfil, no las credenciales de Supabase Auth. iOS es más preciso ("Your Supabase sign-in identity is not deleted", `SettingsView.swift:883`). Se recomienda corregir el copy web para que sea igual de preciso que el de iOS, no al revés.
4. **"Gaming Taste DNA" (radar chart + affinity pill clouds) no tiene equivalente visual en iOS** — se sustituyó por una "Traits List" textual (`TasteView.swift:143-189`). Puede justificarse como adaptación de accesibilidad HIG, pero se pierde una visualización que el producto web presenta como parte central del valor de "Your Taste" (`taste-components.tsx:92-197`). Requiere decisión de producto explícita: ¿la lista reemplaza permanentemente al radar, o falta portar el radar como complemento?
5. **`PlayfitMocks` sigue como dependencia de `PlayfitFeatures`** en producción (`Package.swift:49-57`), pese a que el root ya usa el cliente HTTP real. Riesgo bajo pero real de que código de desarrollo quede alcanzable desde flujos de producción si algún componente lo referencia sin querer.

## 5. Diferencias menores

1. Título del paso 3 de onboarding: "Pick one game that missed" (iOS) vs "Pick one game that wasn't for you" (web) — tono más ambiguo en iOS (`OnboardingView.swift:385` vs `onboarding-section.tsx:352`).
2. Descripción del paso de plataformas parafraseada distinta entre plataformas (`OnboardingView.swift:182` vs `onboarding-section.tsx:355`).
3. "Dropped" (iOS) vs "Dropped it" (web) en el sheet de Already Played (`AlreadyPlayedSheet.swift:34` vs `already-played-panel.tsx:23`).
4. Iconografía de "Dropped" (`xmark` en iOS vs ThumbsDown en web) y de "Mixed" (`ellipsis` en iOS vs Waves en web) — semántica del icono no coincide exactamente.
5. Subtítulo de "Data & Privacy" distinto entre plataformas (`SettingsView.swift:91` vs `settings-shell.tsx:218`).
6. Subtítulo de Appearance con una oración adicional en iOS no presente en la web (`SettingsView.swift:333` vs `settings-shell.tsx:90`).
7. Subtítulo del Affinity Map distinto (`TasteMapVisualizerView.swift:37` vs `mobile/taste-mobile.tsx:104`).
8. Etiqueta del tercer filtro de actividad: "Preferences" (web, `taste-components.tsx:902`) vs "Taste" (iOS, `DecisionsActivityView.swift:42`).
9. Capitalización de "Quick suggestions" (iOS, minúscula) vs "Quick Suggestions" (web, título) — cosmético.

## 6. Lista de funciones faltantes

1. **Forgot / reset password** en iOS (existe en web).
2. **Búsqueda real de catálogo para "quick suggestions"** de onboarding en iOS (actualmente crea juegos simulados).
3. Visualización tipo **radar chart / affinity pill clouds** ("Gaming Taste DNA") en iOS — sustituida por lista textual, pendiente decisión de producto.
4. No confirmado: paridad exacta del deep-linking externo hacia `/play/game/[gameId]` desde fuera de la app iOS (universal links) — no se encontró evidencia ni en contra ni a favor en el código revisado hoy.

Funciones que el documento previo daba por faltantes y **hoy se confirmaron como ya implementadas** (no repetir como pendientes): límite de 100 picks, refresh de token, `fetchPicks()` real, Traits List, Started, portadas reales.

## 7. Lista de textos/copy faltantes o inconsistentes

Ver el detalle citado en la sección 5 (ítems 1, 2, 3, 5, 6, 7, 8, 9) — son inconsistencias de copy, no de funcionalidad. Adicionalmente:

- Título/subtítulo exactos de las vistas de `SignInSheetView` ("Welcome to Playfit" / "Sign In" / "Create Account" en web) no se pudieron verificar 1:1 contra `navTitleForView` en iOS (`SettingsView.swift:1346`) — es dinámico y no se leyó su implementación completa. **No confirmado.**
- Copy exacto de `DecisionIntroView` para el estado "Sign In" vs las vistas de auth completas: confirmado en el punto de entrada, pero el contenido completo del sheet no se comparó campo por campo más allá de los botones citados.

## 8. Lista de problemas visuales

Con la salvedad de que no se realizó verificación en runtime (el usuario pidió auditoría solo de código):

1. **No confirmado** — paridad exacta de color/tipografía/espaciado a nivel de tokens entre `Colors.swift`/`PlayfitDesignSystem.swift` (iOS) y las clases Tailwind semánticas del web (`accent`, `positive`, `warning`, `destructive`, `font-display`). Ambos sistemas usan tokens semánticos equivalentes conceptualmente, pero no se comparó valor por valor.
2. La sustitución del radar/pill-cloud de "Gaming Taste DNA" por una lista textual (`TasteView.swift:143-189`) es un cambio visual estructural, no solo de detalle — documentado como diferencia intencional en la sección 4.
3. **No confirmado** — comportamiento de `LazyVGrid` de Traits List bajo Dynamic Type extremo, aunque el código sí condiciona columnas según `dynamicTypeSize` (mencionado por el agente de iOS, sin cita de línea exacta verificada hoy).
4. **No confirmado** — legibilidad de las 3 acciones horizontales del dossier bajo Dynamic Type grande (safeAreaInset action bar en `GameDetailView.swift`).

## 9. Lista de problemas UX

1. Onboarding: el flujo de "quick suggestions" rompe la expectativa del usuario — visualmente parece elegir un juego real del catálogo, pero técnicamente no lo es (hallazgo crítico #1). Esto es tanto un problema de UX como de integridad de datos.
2. Un usuario que olvida su contraseña en iOS no tiene camino de recuperación dentro de la app (hallazgo crítico #2) — fricción alta, posible pérdida de usuarios.
3. El copy de "Delete Cloud Account" en la **web** puede generar una falsa expectativa de privacidad (cree que borra sus credenciales cuando no es así) — es un problema de confianza del usuario, no solo de copy.
4. Al colapsar "Interactive Affinity Map" y "Traits List" en una sola pantalla con tabs internos (`TasteView`) en vez del menú de 3 opciones que ofrece la web, la navegación iOS es más corta (mejor, menos taps) pero pierde la jerarquía "elige qué quieres ver" que la web comunica explícitamente vía el menú con descripciones (`mobile/taste-mobile.tsx:95-147`). No es necesariamente peor, pero cambia el modelo mental — **requiere validación con el usuario/producto, no es un bug**.

## 10. Lista de ajustes necesarios para cumplir Apple HIG

1. Mantener `TabView`/`NavigationStack` nativos (ya implementado correctamente, `PlayfitRootView.swift:72-105`) en vez de portar la tab bar `fixed` + `backdrop-blur` custom de la web — **ya cumplido, no requiere cambio**.
2. La sustitución de "Gaming Taste DNA" (radar chart) por una Traits List textual es la decisión correcta de HIG si el radar depende solo de color/posición sin alternativa accesible — **mantener el texto**, y si se decide agregar un radar nativo, debe ir acompañado de la alternativa textual, no reemplazarla.
3. Confirmar (no se pudo hoy, requiere runtime) que los targets táctiles de los iconos de `AlreadyPlayedSheet` y `DecisionsActivityView` cumplen 44×44 pt mínimo — el código de `PlayfitIOSUITests.swift:32-44` sugiere que ya se testea esto para "controles primarios", pero no se confirmó cobertura de estos sheets específicos.
4. Alinear la iconografía semántica de "Dropped"/"Mixed" en `AlreadyPlayedSheet` con SF Symbols que comuniquen el mismo significado que en la web (ThumbsDown/Waves), en vez de `xmark`/`ellipsis`, para no perder claridad de significado por adoptar un símbolo genérico.
5. Confirmar accesibilidad VoiceOver de `TasteMapVisualizerView` (mapa interactivo con gestos táctiles) — el agente de iOS señaló textos pequeños (7-8pt) en una versión anterior del código; no se re-verificó hoy si persiste. **No confirmado**, marcar como pendiente de auditoría en dispositivo.
6. Auditar en dispositivo/simulador Dynamic Type XL y Reduce Motion para `GameDetailView` (acciones horizontales) y `TasteView` (Traits List) — el código muestra soporte parcial pero no se puede confirmar sin runtime.

---

## 11. Plan de implementación ordenado por prioridad

No se implementa nada de lo siguiente sin aprobación explícita del usuario.

### P0 — Integridad de datos y bloqueadores de confianza

**Tarea 1 — Corregir "quick suggestions" de onboarding para usar el catálogo real**
- Objetivo: que tocar una sugerencia rápida dispare la búsqueda real del catálogo (o resuelva el juego real por título) en vez de crear un `Game` mock con ID inventado.
- Pantalla afectada: Onboarding — Búsqueda / Quick suggestions.
- Archivos probables: `ios-swiftui/Sources/PlayfitFeatures/OnboardingView.swift:539-563`.
- Tipo de cambio: Lógica.
- Riesgo: Medio — cambia el flujo de selección; requiere manejar el caso de que la búsqueda no encuentre el título exacto (fallback a error, no a mock).
- Complejidad: S.
- Criterio de aceptación: tocar una quick suggestion nunca persiste un `gameId` que no exista en el catálogo real; si la búsqueda falla, se muestra el estado de error existente en vez de crear un mock.
- Verificación de fidelidad: comparar contra `onboarding-section.tsx:892-905`, donde la sugerencia solo autocompleta el input y reutiliza el buscador ya validado; correr un test de contrato que verifique que el `gameId` guardado existe en `/api/games`.

**Tarea 2 — Implementar Forgot Password en iOS**
- Objetivo: dar a los usuarios de iOS un camino de recuperación de contraseña equivalente al de la web.
- Pantalla afectada: Auth (`SignInSheetView`).
- Archivos probables: `ios-swiftui/Sources/PlayfitFeatures/SettingsView.swift` (sección `SignInSheetView`, ~1002-1413), `ios-swiftui/Sources/PlayfitAPI/SupabaseAuthClient.swift`.
- Tipo de cambio: UI + lógica + backend (llamada a Supabase `resetPasswordForEmail`).
- Riesgo: Bajo-Medio — depende de la configuración de redirect URLs en el dashboard de Supabase para deep link de vuelta a la app (marcado como "No confirmado" en la auditoría previa).
- Complejidad: M.
- Criterio de aceptación: un usuario puede solicitar reset de password desde el sheet de sign-in; recibe el email; el deep link de vuelta funciona en iOS.
- Verificación de fidelidad: comparar copy/flujo contra `auth-panel.tsx:111-133` (mensaje "If that email is registered, you'll receive a reset link shortly." y validación de email requerido).

**Tarea 3 — Corregir el copy de "Delete Cloud Account" en la web**
- Objetivo: que el copy web no prometa borrar "sign-in credentials" si el backend no lo hace, alineándolo con la precisión que ya tiene el copy de iOS ("Your Supabase sign-in identity is not deleted").
- Pantalla afectada: Settings — Data & Privacy (web).
- Archivos probables: `product/apps/web/src/components/playfit-mvp/settings-shell.tsx:270-297`.
- Tipo de cambio: Copy (y backend, si en cambio se decide que el borrado de credenciales sí debe ocurrir).
- Riesgo: Bajo si es solo copy; Alto si se decide implementar borrado real de `auth.users` (cambio de alcance de producto, requiere decisión explícita del usuario).
- Complejidad: S (solo copy) / L (si se implementa borrado real de Auth).
- Criterio de aceptación: el copy visible describe exactamente lo que el backend ejecuta; no queda ninguna oración que prometa algo no verificable en `DELETE /api/profile`.
- Verificación de fidelidad: revisar que iOS y web usen el mismo alcance de "delete" documentado, y que ambos copys sean honestos con el backend real.

### P1 — Paridad de copy y consistencia de producto

**Tarea 4 — Alinear el título del paso "rechazo" en onboarding iOS**
- Objetivo: cambiar "Pick one game that missed" por una redacción equivalente a "Pick one game that wasn't for you".
- Pantalla afectada: Onboarding — paso 3 (rechazo).
- Archivos probables: `ios-swiftui/Sources/PlayfitFeatures/OnboardingView.swift:385`.
- Tipo de cambio: Copy.
- Riesgo: Bajo.
- Complejidad: S.
- Criterio de aceptación: el título comunica claramente "un juego que no te gustó / no fue para ti", sin ambigüedad de "missed" (que puede leerse como "me perdí este juego").
- Verificación: comparar contra `onboarding-section.tsx:352`.

**Tarea 5 — Decisión de producto sobre "Gaming Taste DNA" (radar chart)**
- Objetivo: decidir explícitamente si la Traits List textual reemplaza permanentemente al radar/pill-cloud de la web, o si se debe portar también una versión nativa del radar como complemento visual.
- Pantalla afectada: Taste — Your Taste.
- Archivos probables: `ios-swiftui/Sources/PlayfitFeatures/TasteView.swift:141-189`, `TasteMapVisualizerView.swift`.
- Tipo de cambio: Decisión de producto → UI si se opta por agregar el radar.
- Riesgo: Medio — un radar nativo mal implementado puede violar accesibilidad si no conserva la alternativa textual.
- Complejidad: M-L (si se implementa el radar) / S (si se documenta la Traits List como reemplazo intencional).
- Criterio de aceptación: existe una decisión documentada y, si aplica, un radar nativo que conserva la Traits List como alternativa accesible obligatoria (nunca la reemplaza).
- Verificación: contrastar con `taste-components.tsx:92-197` (`TasteMap`) para confirmar qué información del radar se preserva o se pierde.

**Tarea 6 — Igualar la etiqueta del tercer filtro de actividad**
- Objetivo: usar "Preferences" (o el término que el producto decida como canónico) en vez de "Taste" en el filtro de `DecisionsActivityView`.
- Pantalla afectada: Taste — Decisions & Activity.
- Archivos probables: `ios-swiftui/Sources/PlayfitFeatures/DecisionsActivityView.swift:42`.
- Tipo de cambio: Copy.
- Riesgo: Bajo.
- Complejidad: S.
- Criterio de aceptación: la etiqueta del filtro coincide con `taste-components.tsx:902`.
- Verificación: comparación directa de string.

**Tarea 7 — Igualar copy menor de Already Played / Settings**
- Objetivo: "Dropped it" en vez de "Dropped"; iconos ThumbsDown/Waves en vez de xmark/ellipsis; subtítulos de Data & Privacy y Appearance alineados a la web (o decisión consciente de mantener la variante iOS si se considera una mejora).
- Pantalla afectada: Already Played sheet, Settings menu, Appearance.
- Archivos probables: `PlayfitDesignSystem/AlreadyPlayedSheet.swift:34,37`, `SettingsView.swift:91,333`.
- Tipo de cambio: Copy + iconografía (SF Symbols).
- Riesgo: Bajo.
- Complejidad: S.
- Criterio de aceptación: strings e iconos coinciden semánticamente con sus equivalentes web citados en la sección 5.
- Verificación: comparación directa contra `already-played-panel.tsx:20-23`, `settings-shell.tsx:90,218`.

### P2 — Limpieza técnica y verificación HIG en runtime

**Tarea 8 — Remover `PlayfitMocks` de las dependencias de producción de `PlayfitFeatures`**
- Objetivo: que el target de producción no dependa de código mock.
- Pantalla afectada: Ninguna directamente (infraestructura de build).
- Archivos probables: `ios-swiftui/Package.swift:49-57`.
- Tipo de cambio: Backend/infraestructura (build config).
- Riesgo: Medio — si algún preview o test usa `PlayfitMocks` a través de `PlayfitFeatures`, hay que mover esas referencias a un target de test/preview antes de quitar la dependencia.
- Complejidad: M.
- Criterio de aceptación: `swift build` del target de producción no depende de `PlayfitMocks`; los previews/tests que sí lo necesiten lo declaran en su propio target.
- Verificación: `swift build` limpio + revisión de `Package.swift` sin la dependencia en `PlayfitFeatures`.

**Tarea 9 — Auditoría visual/accesibilidad en runtime (HIG)**
- Objetivo: confirmar en simulador/dispositivo lo que hoy quedó como "No confirmado": VoiceOver en `TasteMapVisualizerView`, Dynamic Type XL en `GameDetailView` y Traits List, targets táctiles de `AlreadyPlayedSheet`/`DecisionsActivityView`, Reduce Motion.
- Pantalla afectada: Taste, Dossier, Already Played, Decisions & Activity.
- Archivos probables: los ya citados en la sección 10; posible expansión de `PlayfitIOSUITests.swift`.
- Tipo de cambio: Accesibilidad + HIG (validación, no necesariamente código nuevo salvo que se detecten fallos).
- Riesgo: Bajo (es verificación); depende de disponibilidad de dispositivo físico (el documento previo indica que el iPhone disponible estaba offline).
- Complejidad: M.
- Criterio de aceptación: cada punto "No confirmado" de la sección 8 y 10 pasa a CONFIRMADO o genera una tarea de corrección específica.
- Verificación: ejecución de `PlayfitIOSUITests` + inspección manual con VoiceOver/Dynamic Type activados en simulador y, si es posible, dispositivo físico.

**Tarea 10 — Confirmar copy completo de `SignInSheetView` vs `auth-panel.tsx`**
- Objetivo: cerrar el "No confirmado" de la sección 7 sobre títulos dinámicos ("Welcome to Playfit"/"Sign In"/"Create Account").
- Pantalla afectada: Auth.
- Archivos probables: `SettingsView.swift:1346` (`navTitleForView`) y su definición completa.
- Tipo de cambio: Copy (verificación, posible ajuste).
- Riesgo: Bajo.
- Complejidad: S.
- Criterio de aceptación: los 3 títulos de vista coinciden con `auth-panel.tsx:207-217`, o se documenta la diferencia como intencional.
- Verificación: lectura completa de la función `navTitleForView` y comparación string a string.

---

## Decisión de fase

Esta auditoría fue inicialmente de solo lectura. El usuario aprobó ejecutar el plan completo el mismo día; ver "Cambios aplicados" abajo.

## 12. Cambios aplicados (2026-07-01, tras aprobación del usuario)

1. **Onboarding quick suggestions (iOS)** — ya no crean un `Game` mock con ID inventado; ahora asignan el título a `searchQuery`, disparando la búsqueda real del catálogo vía `.onChange`, igual que el `onClick` de la web. `OnboardingView.swift:545-555`.
2. **Forgot Password (iOS)** — nuevo método `resetPasswordForEmail` en `SupabaseAuthClient.swift` (`POST /auth/v1/recover`) y `resetPassword(email:)` en `PlayViewModel.swift`; botón "Forgot password?" agregado en `SignInSheetView` con el mismo copy y manejo de error que la web (`SettingsView.swift`, vista `.signIn`).
3. **Copy "Delete Cloud Account" (web)** — corregido para no prometer borrado de credenciales que el backend no ejecuta; ahora dice "Delete Cloud Profile" con copy alineado a la precisión de iOS. `settings-shell.tsx`.
4. **Título de onboarding paso 3 (iOS)** — "Pick one game that missed" → "Pick one game that wasn't for you", igual que la web. `OnboardingView.swift:385`.
5. **Filtro de actividad (iOS)** — "Taste" → "Preferences" para igualar la etiqueta web. `DecisionsActivityView.swift:42`.
6. **Already Played (iOS)** — "Dropped" → "Dropped it"; icono de Dropped `xmark` → `hand.thumbsdown.fill`; icono de Mixed `ellipsis` → `water.waves`, alineando semántica con los iconos ThumbsDown/Waves de la web. `AlreadyPlayedSheet.swift`.
7. **Subtítulos de Settings (iOS)** — "Manage cache and profile preferences" → "Manage your personal data, local taste storage, and account settings."; se removió la oración añadida en Appearance para igualar el copy web exacto. `SettingsView.swift`.
8. **`PlayfitMocks` removido de la dependencia de producción de `PlayfitFeatures`** en `Package.swift` (no se encontró ningún uso real en `Sources/PlayfitFeatures`); se mantiene como dependencia de `PlayfitSmokeCheck`, que sí lo usa.
9. **Verificación de build:** `swift build` limpio, `swift test` (13/13 tests OK), `swift run PlayfitSmokeCheck` OK, `xcodebuild ... -destination 'generic/platform=iOS Simulator' build` → BUILD SUCCEEDED. Web: `npm run typecheck` sin errores.
10. **Verificado sin cambios necesarios:** el copy de `SignInSheetView` (`titleForView`/`subtitleForView`: "Welcome to Playfit" / "Sign In" / "Create Account" + subtítulos) ya coincidía verbatim con `auth-panel.tsx:207-217`.

No se tocó: la decisión de producto sobre portar o no un radar chart nativo para "Gaming Taste DNA" (se mantiene la Traits List textual como alternativa intencional de accesibilidad, sin agregar el radar) — esto requiere una decisión de producto explícita, no solo un ajuste de copy o código, y no se asumió unilateralmente.

## 13. Segunda ronda de mejoras (2026-07-01, tras análisis de "qué falta para subir el %")

El usuario aprobó las sugerencias presentadas para cada duda abierta (color canónico = web, mantener SF Pro en vez de Geist, no implementar Universal Links sin caso de negocio confirmado, mantener el tab único de Taste, no construir el radar nativo) y pidió proceder con todo lo demás. Cambios aplicados:

1. **3 copies menores alineados**: descripción de plataformas en onboarding ("We will only recommend games available on your active platforms."), subtítulo del Affinity Map ("Visual graph of your gaming traits."), capitalización de "Quick Suggestions". `OnboardingView.swift`, `TasteMapVisualizerView.swift`.
2. **Color `foreground` claro unificado** a `#0f172a` (antes `#17201d`), igualando `globals.css:56`. `Colors.swift:11`.
3. **Auditoría completa de tokens de color restantes**: `accent`, `positive`, `warning`, `destructive`, `background`, `tone-accent` ya eran hex idénticos entre web e iOS (verificado línea por línea); `indigo` coincide con el `indigo-600` de Tailwind que usa la web. Los tokens sin analog directo (`secondary`, `muted`, `border`, `card`, `ring`) se implementan en iOS vía materiales/colores de sistema (`.thinMaterial`, `.secondary`), que es la adaptación correcta por HIG, no un gap.
4. **Decisión de tipografía documentada**: se mantiene la fuente de sistema (SF Pro) en iOS en vez de empaquetar Geist (la fuente `--font-display` de la web). Motivo: HIG prioriza fuente de sistema por soporte nativo de Dynamic Type/accesibilidad; el peso `black`/tracking ya replica la identidad visual sin requerir un asset de fuente adicional.
5. **3 accessibilityLabel agregados** donde de verdad faltaban (auditado con grep exhaustivo, no a ciegas): botón de cancelar onboarding (`"Cancel setup"`), botón de quitar un favorito (`"Remove \(title)"`), botón de quitar el rechazo (`"Remove \(title)"`). `OnboardingView.swift`. El resto de botones de solo-ícono (Picks manage, Decisions & Activity manage, carrusel de Taste map) ya tenían `accessibilityLabel` correcto — no se tocaron.
6. **Tests de regresión agregados**:
   - iOS: `SupabaseAuthClientTests.swift` (2 tests) cubre `resetPasswordForEmail` — request correcto a `/auth/v1/recover` y manejo de error de servidor. Requirió hacer `SupabaseAuthClient` testeable (parámetro `session:` inyectable, igual que `HTTPPlayfitClient`).
   - Web: `settings-shell.copy.test.ts` (2 tests) fija el copy de "Delete Cloud Profile" para que no vuelva a prometer borrado de credenciales que el backend no ejecuta.
7. **Suite de UI tests ampliada de 2 a 7 tests**, ejecutada de verdad en el simulador "Playfit iPhone 17" (no solo compilada):
   - Nuevo modo de arranque determinístico `-playfit-ui-testing-seeded` (`PlayfitRootView.swift`) que marca onboarding completo en memoria sin red, permitiendo llegar al tab bar principal de forma offline.
   - Nuevos tests: Onboarding reachable desde Intro (verifica "Where do you play?"), Auth sheet reachable con Google/Email/Guest y el nuevo "Forgot password?" visible, tabs principales reachable con sus 4 labels, empty state de Picks ("No saved picks yet"), menú de Settings con sus 3 secciones + navegación a Appearance (Light/Dark/System).
   - Los 7 tests corren con `-UIAccessibilityReduceMotionEnabled YES` y Dynamic Type `AccessibilityExtraExtraExtraLarge` — **confirma en runtime** (no solo en código) que Intro, Onboarding paso 1, Auth, Picks (empty) y Settings (+ Appearance) siguen siendo funcionales y localizables bajo esas condiciones. **Sigue sin confirmar**: recorrido completo de VoiceOver (orden de lectura/anuncios), Increase Contrast, y el mapa de Taste (TasteMapVisualizerView) bajo estas condiciones, y cualquier verificación en dispositivo físico.
8. **Verificación final**: `swift build` limpio, **15/15 tests unitarios iOS**, **7/7 UI tests en simulador** (antes 2/2), `swift run PlayfitSmokeCheck` OK, **47/47 tests unitarios web** (`npm test`), `npm run typecheck` sin errores.

## 14. Tercera ronda: pull-to-refresh + rediseño de Taste (2026-07-01)

Tras una evaluación UX pantalla por pantalla (fricción, claridad de navegación, consistencia, feedback), se detectaron dos problemas de UX propia (no de fidelidad con la web) y el usuario aprobó corregirlos:

1. **Pull-to-refresh agregado a las 4 listas de la app** (antes no existía en ninguna): `TodayView.swift` (ScrollView), `PicksView.swift` (List), `DecisionsActivityView.swift` (ScrollView interno), `TasteView.swift` (ScrollView de "Your Taste"). Todas llaman `viewModel.syncIfOnline()`; Taste además llama `hydrateTasteGames()` para recachear juegos nuevos.
2. **"Your Taste" rediseñado**: pasó de un solo scroll largo con resumen + mapa + lista de traits embebidos, a un resumen breve (calibración + Profile Summary + stats) seguido de un **menú de 2 filas** ("Interactive Affinity Map" y "Traits List"), cada una un `NavigationLink` a su propia pantalla con `.navigationTitle` nativo. El estilo de fila reutiliza el mismo patrón visual de icono+título+subtítulo que ya usa `SettingsView`, por consistencia interna. Se evitó deliberadamente llamar a la lista de traits "Gaming Taste DNA" (nombre de la web) porque no es un radar chart, para no prometer una visualización que no existe.
   - `TasteMapVisualizerView.swift`: se quitó el header de texto duplicado ("Interactive Affinity Map" en negrita) y se reemplazó por `.navigationTitle`, conservando el subtítulo descriptivo.
   - `TasteView.swift`: nueva `TasteTraitsListView` (privada) con la lista de traits extraída tal cual, más `.navigationTitle("Traits List")`.
3. **Nuevo UI test** `testTasteMenuNavigatesToMapAndTraitsListWhenSeeded` — navega a Taste, confirma ambas filas del menú, entra a Traits List, vuelve, entra al mapa; **corrido y verificado en el simulador "Playfit iPhone 17"**, no solo compilado.
4. **Verificación**: `swift build` limpio, 15/15 tests unitarios, **8/8 UI tests en simulador** (antes 7/7), `swift run PlayfitSmokeCheck` OK.

No se tocó "Decisions & Activity" más allá de agregarle pull-to-refresh — se mantuvo como pestaña separada (segmented control), no se fusionó al nuevo menú de 2 filas, tal como se acordó explícitamente antes de implementar.

## 15. Cuarta ronda: hallazgo sistémico de `.tint()` + 12 bugs encontrados con datos poblados (2026-07-02)

Todas las rondas anteriores solo habían auditado estados vacíos. Se construyó un fixture temporal con datos reales (Octopath Traveler 2, Hades, Celeste, Hollow Knight) para poder ver la card principal, Picks y Taste poblados — algo nunca hecho antes en esta auditoría — y se encontraron 12 problemas reales, incluyendo el más grave de toda la sesión.

**Hallazgo sistémico**: la app nunca definía un `.tint()` global. SwiftUI cae al azul de sistema para cualquier botón/link/tab sin tint explícito. Esto afectaba el botón más importante de toda la app ("Add to Playfit Picks"), el tab bar completo, los 3 "Continue" del onboarding, y varios botones más — invisible en todas las capturas anteriores porque nunca se comparó el color real contra `Colors.swift`. Fix: un solo `.tint(.playfitAccent)` en la raíz (`PlayfitRootView.swift`), más limpieza de tints crudos (`.green`→`.playfitPositive`, `.red`→`.playfitNegative`, `Color.blue`→`Color.playfitAccent`) en `TodayView.swift` y `GameDetailView.swift`.

**Cambios aplicados:**
1. `.tint(.playfitAccent)` global + limpieza de tints/colores crudos restantes.
2. `TodayView.swift`: reordenado — la card principal ahora aparece antes que el header "Best matches"/"First reads" (antes aparecía primero, chocando visualmente con el nav title "Play Next"), y se redujo su tipografía de `.largeTitle` a `.title2` para que se vea como sección secundaria, no como título de página, igual que en la web.
3. `PlayViewModel.picks`: ahora ordena por `affinityScore` descendente, igual que `picks/route.ts:46` en el backend.
4. `PicksView.swift`: quitado "Start Playing" del diálogo de gestión — la web no lo tiene (verificado fresco en `picks-mobile.tsx`).
5. `GameDetailView.swift`: el botón principal del dossier ahora alterna "Save to Picks"/"Remove from Picks" (antes decía "Start" y movía el juego a "playing") — igual que `decision-dossier.tsx:86-105`. Se eliminó `PlayViewModel.startPick`, que quedó sin uso.
6. `TasteView.swift`: Profile Summary ahora ocupa el ancho completo (`frame(maxWidth: .infinity)`); las stat cards "Liked"/"Avoided" ahora usan `playfitPositive`/`playfitNegative` igual que `taste-mobile.tsx:73-85`.
7. `PlayViewModel.syncIfOnline()`: reordenado para subir cambios pendientes (`drainPendingActions()`) **antes** de pedir recomendaciones frescas, no después — corrige que un juego recién calificado o agregado a Picks pudiera reaparecer en Play Next tras un sync.
8. Nueva función `formatTagLabel()` en `PlayfitLogic.swift` (replica `formatTagLabel` de `profile-section.tsx`: separa por `_`, capitaliza cada parte); aplicada en `TasteMapVisualizerView.swift` y `GameDetailView.swift` (antes mostraban tags crudos o solo reemplazaban `_` sin capitalizar).
9. Investigado pero no reproducido en aislamiento: "Settings muestra 0 platforms seleccionados" — con un repro aislado (asignar plataformas → ir directo a Settings) el conteo se mostró correcto. Se documenta como no confirmado en vez de aplicar un fix especulativo.
10. Investigado pero no reproducido: overflow en eje X con "Octopath Traveler 2" — el título wrappea correctamente a una línea sin desbordarse.

**Verificación**: `swift build` limpio, 15/15 tests unitarios, **8/8 UI tests en simulador**, smoke check OK. Confirmado visualmente con capturas reales: tab bar y "See analysis" ahora en `playfitAccent`, sin doble título en Play Next.
