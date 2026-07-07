# Implementación Fase 4B — Dossier, Taste y reset Android

Fecha: 2026-07-02  
Alcance: dossier por ID, actividad/traits reales, Delete Signal y Reset Taste.  
No se ejecutó la app ni se tomaron capturas. No se modificaron iOS, web, Supabase ni la base de datos remota.

## Resultado

### Dossier por ID

- La navegación ya no depende exclusivamente de Play Next/Picks cargados en memoria.
- `DossierUiState` diferencia idle, loading, success, not found y error.
- El repositorio usa `/api/recommendations/game/{gameId}` y conserva fallback cacheado.
- Un resultado vacío válido muestra 404; un fallo de red muestra error con retry.
- Las entradas ya cargadas aparecen inmediatamente y se refrescan en segundo plano.

### Taste y Activity

- Se portó a Kotlin la derivación de historial de iOS.
- Activity combina ratings, Picks y señales de onboarding sin duplicar juegos.
- Las decisiones distinguen Picks, liked, not-for-me, dropped, setup favorite y setup miss.
- Los traits combinan género/tags del historial con preferencias del perfil.
- Se calculan conteos positivos/negativos, fuerza, confianza y dirección.
- Los juegos faltantes se hidratan con `/api/games/batch` y quedan cacheados.
- Si no hay metadata offline, la señal sigue visible usando el ID como fallback.
- Cada feedback reconstruye y persiste el perfil antes de recalcular Taste.

### Delete Signal

- El callback conserva el `source` de la señal.
- Eliminar una señal de onboarding actualiza liked/disliked.
- Eliminar una señal de rating limpia rating, exclusión y estados terminales.
- Picks/backlog/wishlist no relacionados se conservan.
- Estados inertes se eliminan localmente y mediante `DELETE /api/profile/games/{gameId}`.
- Deletes offline usan una operación tipada en la outbox.
- Después del delete se reconstruye y guarda el perfil completo.

### Reset Taste

- Reset ya no llama falsamente a `completeOnboarding`.
- Cancela sync previo, borra Room/cache/outbox de producto y conserva Auth/Device ID.
- DataStore vuelve a onboarding incompleto y limpia plataformas/last sync.
- Usa el endpoint existente `DELETE /api/profile`.
- Si está offline, el reset local es inmediato y el delete remoto queda primero en la outbox.
- El worker prioriza `delete_profile` para impedir que escrituras antiguas restauren el perfil.
- Sign-out no forma parte del reset y la sesión permanece intacta.

Delete Account continúa separado: borrar la identidad de Supabase todavía requiere un endpoint backend autorizado.

## Verificación

```sh
./gradlew --offline :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease :app:lintDebug
```

Resultado:

- 77 pruebas, 0 fallos, 0 errores.
- Debug APK generado.
- Release APK unsigned generado.
- `lintDebug`: exitoso.
- Nuevas pruebas cubren derivación de Activity/traits, dossier remoto/error, Delete Signal, Reset Taste sin sign-out y delete offline/outbox.
- `ios-swiftui`: cero cambios tracked.
- `product`: cero cambios tracked.

## Límites pendientes

1. Falta validar dossier, batch hydration, reset y offline→online en ejecución.
2. Falta una prueba instrumentada de prioridad/cancelación WorkManager durante reset.
3. Reset Taste elimina el perfil; Delete Account permanece deshabilitado funcionalmente hasta existir un endpoint autorizado para borrar la identidad.
4. Accesibilidad, layouts adaptativos y pruebas UI pertenecen a la siguiente fase.
