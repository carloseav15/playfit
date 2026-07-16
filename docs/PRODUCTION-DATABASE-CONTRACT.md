# Contrato mínimo de base de datos de producción

Fecha de verificación: 2026-07-15.

Este documento define el mínimo que necesita la aplicación web publicada. No
pretende que producción replique todas las tablas de enriquecimiento que existen
en local: producción fue reducida deliberadamente para el plan gratuito.

## Regla de paridad

La paridad requerida es de **contrato de ejecución**, no de cantidad de tablas:

- Las tablas, vistas, políticas y funciones que consume `apps/web` deben existir
  y conservar sus columnas, tipos y permisos esperados.
- Las tablas de ingestión, scraping, auditoría masiva y taxonomía auxiliar pueden
  existir solo en local mientras ningún endpoint ni RPC de producción las lea.
- Una migración de producción debe modificar un contrato de ejecución de forma
  explícita y verificable; no se debe usar `supabase db push` desde un árbol con
  historial de migraciones pendiente de squash.

## Historial canónico de producción

El 2026-07-15 se reconcilió el ledger remoto con los efectos de esquema ya
verificados. Las migraciones vigentes, y en el mismo orden tanto local como en
producción, son:

1. `20260707115959_drop_legacy_schemas_for_squash`
2. `20260707120000_baseline_schema`
3. `20260708000000_restrict_api_cache_access`
4. `20260708175936_remaining_tables`
5. `20260709000000_trim_to_production_essentials`
6. `20260710093000_fix_cold_start_recommendations`

El snapshot local de datos `20260708180011_remaining_tables.sql` fue retirado
del directorio de migraciones: contenía 90 MB de `INSERT` y no debe ejecutarse
en producción. Su copia histórica y los backups recuperables viven en Expanse;
no se reproducen datos locales mediante el historial de esquema.

### Estado de reproducibilidad

El ledger está alineado entre local y producción. Un `db reset` reconstruye el
contrato reducido; después se carga el seed externo `runtime_catalog` para tener
el catálogo público. Una prueba en una base temporal confirmó esa secuencia: 17
tablas runtime, 65,118 juegos, 36 plataformas y recomendaciones de cold start
válidas.

El seed runtime de catálogo, sin perfiles ni datos de usuario, vive fuera de
Git en Expanse y se carga después de aplicar el contrato reducido. El entorno
local enriquecido se recupera desde los tres backups completos de Expanse. El
procedimiento y sus límites están en `docs/OPERACIONES-DATOS.md`.

## Tablas consultadas directamente por la web

Estas tablas aparecen en consultas `from(...)` de `apps/web` o de `packages/core`:

| Tabla | Uso |
| --- | --- |
| `games` | catálogo, detalle, búsqueda, salud y recomendaciones de perfil |
| `platforms` | selector de plataformas |
| `game_platforms` | disponibilidad y detalle de un juego |
| `game_tags` | datos de catálogo semilla |
| `game_aliases` | resolución de identificadores y catálogo |
| `game_redirects` | redirecciones de IDs canónicos |
| `game_similar_games` | recomendaciones similares |
| `series` | metadatos de serie |
| `audit_log` | auditoría de los endpoints de perfil |

## Estado de usuario y RPC obligatorias

El navegador no escribe directamente el estado de usuario. Ese contrato es el
conjunto de RPC siguientes, junto con sus tablas internas `profiles`,
`user_game_states`, `rate_limits` y `api_cache`:

| Función | Responsabilidad |
| --- | --- |
| `check_rate_limit` | proteger escrituras de perfil y biblioteca |
| `get_profile`, `upsert_profile`, `delete_profile` | perfil y onboarding |
| `upsert_game_state`, `delete_game_state` | estado local/sincronizado de cada juego |
| `get_cache`, `set_cache` | caché del servidor |

Las firmas públicas de estas funciones forman parte del contrato. Cualquier
cambio debe probar los endpoints `/api/profile` y `/api/profile/games/:gameId`.

## Recomendaciones: contrato de producción

`score_today_recommendations` es invocada desde
`apps/web/src/app/api/recommendations/shared.ts`. Además de las tablas de
catálogo anteriores, depende de:

- `game_scores` y la vista `game_quality_score` para priorizar calidad;
- `tag_weights` para similitud por etiquetas;
- `series`, `games` y `game_platforms` para construir los buckets.

El caso de plataformas vacías es válido: un usuario puede saltar el paso de
plataformas durante onboarding. En ese caso la función debe interpretar el
arreglo vacío como «sin filtro de plataforma», no como «no hay juegos». La
migración `fix_cold_start_recommendations` se aplicó en producción el
2026-07-15 y se verificó con un arreglo vacío: devolvió 20 elementos en
`nextUp`.

La función heredada `score_today_recommendations_v2` no tiene referencias en el
repositorio, no tiene dependencias en la base y no recibió llamadas en los logs
API recientes revisados. No es parte del contrato actual. Antes de eliminarla,
mantener una ventana de observación o revocar su ejecución si se desea excluir
clientes externos no documentados.

## Advisors de seguridad revisados

El advisor `security_definer_view` marcó `game_quality_score` porque las vistas
de PostgreSQL son privilegiadas por defecto. La migración
`20260716131832_set_game_quality_score_security_invoker.sql` la cambia a
`security_invoker=true`, conservando las cinco columnas y dejando que el RPC
privilegiado siga leyendo `game_scores`; el acceso directo anónimo a esa vista
no forma parte del contrato porque `game_scores` no tiene lectura pública.

Los warnings de RPC no implican que todas las funciones deban pasar a
`SECURITY INVOKER`: los wrappers de perfil/estado y el rate limiter necesitan
el contexto privilegiado, y `score_today_recommendations` es invocada por la
API pública de recomendaciones. `score_today_recommendations_v2` no tiene uso
estático ni tráfico observado; queda pendiente de una ventana de observación
antes de revocar o eliminarla.

## Tablas que pueden ser solo locales

Las siguientes familias no son leídas directamente por la web publicada y son
aptas para permanecer en el entorno local de ingestión/enriquecimiento:

- taxonomía y relaciones IGDB: `game_genres`, `game_themes`, `game_modes`,
  `game_perspectives`, `game_engines` y sus tablas de relación;
- snapshots y fuentes externas: `game_releases`, `game_sales_snapshots`,
  `game_review_sentiment_snapshots`, `game_summaries`, `game_external_ids`;
- colas de limpieza y conciliación: `game_duplicate_candidates`,
  `game_duplicate_groups`, `game_external_match_candidates`,
  `series_cleanup_candidates` y `series_cleanup_applied`.

Que una tabla sea local no autoriza a borrar una tabla productiva: primero se
debe buscar su uso estático, dependencias SQL y tráfico de la API.

## Verificación mínima después de cada cambio

1. Confirmar que `/api/health` responde y que catálogo/plataformas siguen
   leyendo datos.
2. Invocar `score_today_recommendations` con plataformas disponibles y con
   `[]`; ambos casos deben devolver un modelo JSON válido.
3. Comparar firmas de RPC y dependencias de vistas/funciones alteradas.
4. Revisar el historial remoto de migraciones antes de cualquier squash o
   sincronización masiva.
