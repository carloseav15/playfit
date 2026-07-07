# Implementación Fase 1 — Paridad de lógica Android/iOS

Fecha: 2026-07-02  
Alcance: lógica de decisiones, picks, skip y serialización de estados.  
No se ejecutó la app ni se hicieron cambios visuales.

## Resultado

Android ahora aplica las mismas transiciones principales de `UserGameState` que iOS:

| Acción | Estado resultante |
| --- | --- |
| Play | `playing`, sale de backlog y Picks, no inventa rating |
| Later | `shelved`, entra a backlog |
| Loved / Liked / Mixed | rating 5 / 4 / 3, preservando campos no relacionados |
| Played Loved / Liked / Mixed | `completed`, rating 5 / 4 / 3, sale de Picks |
| Played Dropped | `abandoned`, rating 2, excluded, sale de Picks |
| Not For Me | rating 2, excluded, sale de Picks |
| Add/Remove Pick | solo modifica `inPlayfitPicks`; conserva rating, status y flags |
| Skip / Show another | rotación local; no escribe señal negativa |

## Cambios realizados

- Nueva fuente pura de reglas: `ProductGameStateTransitions.kt`.
- `ProductPlayStatus` convierte correctamente `OnHold` ↔ `on_hold` y equivalentes.
- Repository lee el estado existente de Room antes de aplicar feedback o picks.
- Persistencia y requests usan valores backend en minúsculas/snake_case.
- ViewModel actualiza estado, Picks y recomendaciones de forma coherente.
- “Show me another” y “Skip” ya no llaman `NotForMe`.
- Picks rechaza juegos terminales/excluidos y conserva el límite de 100.
- Se eliminó el doble envío de `NotForMe` en el dossier.
- `PlayNextScreen` observa el `StateFlow`; el cambio de primary recompone la UI.

## Verificación

Comando:

```sh
./gradlew --offline :app:testDebugUnitTest :app:assembleDebug :app:lintDebug
```

Resultado:

- 49 pruebas unitarias, 0 fallos.
- `assembleDebug`: exitoso.
- `lintDebug`: exitoso.
- 10 pruebas puras nuevas de transición/serialización.
- 3 pruebas nuevas de integración de ViewModel: skip neutral, played feedback y rechazo de Picks terminales.

## Brechas que siguen abiertas

Esta fase no corrige todavía:

1. Device ID persistente y restauración correcta de sesión.
2. Contrato y validación estricta del onboarding.
3. Reset, sign-out y delete account.
4. Configuración real de tema, plataformas y entornos.
5. Repositorio local-first completo y errores tipados.
6. Taste/detail parity, accesibilidad y pruebas UI.

El siguiente bloque recomendado es la Fase 2: identidad, auth y configuración de entorno.
