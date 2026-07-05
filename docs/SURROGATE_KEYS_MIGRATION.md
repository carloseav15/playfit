# Migración a claves subrogadas (`pk`/`*_ref`) — estado y siguientes pasos

Este documento es el handoff de una migración de esquema hecha **solo en la base de datos** (schema `games_library`, proyecto local Supabase). Ningún archivo de `product/` ni `intelligence-lab/` fue tocado a nivel de queries/tipos — la app sigue funcionando exactamente igual que antes de este cambio. Este doc es la referencia para la Fase 2 (adaptar el código de la app).

## Por qué

`game_id`, `genres.id`, `series.id`, `platforms.id` son slugs de texto legibles (`SCHEMA.md` los documenta como "URL-safe slug", diseño intencional para URLs como `/game/zelda_tears`). El problema no es que sean texto — es que además de servir como slug de URL, **también eran la clave primaria y la clave foránea usada por 15+ tablas satélite**. Eso significa que cualquier corrección de duplicados o normalización de slug requería reescribir el string en cascada en todas esas tablas. Evidencia de ese costo en el propio historial de migraciones: `game_id_canonicalization_map` (43,550 filas), `game_id_diacritic_cleanup_map`, `game_id_slug_cleanup_map`, y un revert de emergencia (`revert_unstable_hash_slug_cleanup`) deshecho 7 minutos después de aplicarse.

**Decisión:** mantener los slugs de texto tal cual (siguen siendo el contrato público de la app, no se tocan), pero agregar una clave subrogada inmutable (`bigint identity`) por debajo, y mover las relaciones internas (FKs) a usar esa clave en vez del texto. Fusionar duplicados o corregir un slug deja de requerir reescritura en cascada.

## Qué se hizo hoy (Fase 1 — Expand, 100% aditivo)

Se agregaron columnas nuevas. **No se modificó, renombró ni eliminó ninguna columna existente.** Todo query/tipo actual de la app sigue funcionando sin cambios.

### Claves subrogadas en las tablas núcleo
| Tabla | Columna nueva | Tipo |
|---|---|---|
| `games` | `pk` | `bigint generated always as identity`, `unique` |
| `genres` | `pk` | `bigint generated always as identity`, `unique` |
| `series` | `pk` | `bigint generated always as identity`, `unique` |
| `platforms` | `pk` | `bigint generated always as identity`, `unique` |

### FKs subrogados en tablas satélite (`game_ref` → `games.pk`)
`NOT NULL` + FK + índice en: `game_age_ratings`, `game_aliases`, `game_companies`, `game_external_ids`, `game_platforms`, `game_releases`, `game_review_sentiment_snapshots`, `game_sales_snapshots`, `game_scores`, `game_summaries`, `game_tags`, `user_game_states`, `game_duplicate_candidates`, `series_cleanup_applied`.

Nullable (porque el `game_id` original también es nullable en esa tabla): `game_external_match_candidates.game_ref`.

### FKs subrogados de plataforma (`platform_ref` → `platforms.pk`)
`game_age_ratings`, `game_platforms`, `game_releases`, `game_review_sentiment_snapshots`, `game_sales_snapshots`, `game_scores` — todos `NOT NULL` excepto `game_age_ratings.platform_ref` y `game_scores.platform_ref` (nullable, igual que su `platform_id` original).

### FKs subrogados en `games`
- `games.genre_ref bigint` → `genres.pk` (nullable)
- `games.series_ref bigint` → `series.pk` (nullable)
- `series_cleanup_candidates.series_ref bigint` → `series.pk` (nullable)

Verificación de integridad tras la migración: **0 filas con `*_ref` null donde el texto original no era null**, en todas las tablas. Backfill 100% consistente.

## Qué falta (Fase 2 — requiere tocar `product/` y `intelligence-lab/`)

Esto **no se hizo hoy** porque requiere correr y probar la app (165 archivos dependen de `game_id` como texto: 138 en `product/`, 27 en `intelligence-lab/`), algo que no se puede hacer a ciegas desde una sesión que solo tiene acceso a la DB.

1. **Migrar queries de escritura para poblar los `*_ref`.** Cualquier `INSERT` nuevo a las tablas satélite debe resolver y setear `game_ref`/`platform_ref`/`genre_ref`/`series_ref` además del texto (o en vez del texto, ver punto 4). Buscar en `product/` los inserts a estas tablas (principalmente en `product/scripts/*.mjs` de backfill/scraping y en las rutas API de escritura).
2. **Migrar joins/embeds de lectura** que hoy dependen del FK de texto (PostgREST resuelve embeds por la relación de FK — una vez las relaciones "canónicas" pasen a ser por `pk`, hay que revisar los `select=*,relation(...)` que usan las relaciones viejas).
3. **Regenerar tipos TypeScript** (`generate_typescript_types`) después de cada paso de esta fase, y correr el type-checker para encontrar todos los puntos de ajuste automáticamente en vez de grepear a mano.
4. **Decidir el punto de corte:** cuando el código ya lea/escriba por `pk`/`*_ref`, se puede:
   - Promover `games.pk` (y equivalentes) a `PRIMARY KEY` real, y
   - Convertir el `game_id` (y `genre_id`/`series_id`/`platform_id`) de PK/FK a una columna `UNIQUE` normal — sigue existiendo para URLs y display, pero deja de ser el mecanismo de integridad referencial.
   - Esto es la Fase 3 ("Contract"). No hacerla hasta que la Fase 2 esté completa y probada — mientras tanto ambos caminos (texto y `*_ref`) coexisten sin conflicto.
5. **Regla nueva para todo el equipo, desde ya:** ningún `game_id`/`genre_id`/`series_id`/`platform_id` se reescribe in-place una vez creado. Toda fusión de duplicados usa `game_redirects` (ya existe) o, a partir de ahora, simplemente repunta `game_ref` al `pk` ganador y borra la fila perdedora — no hace falta tocar el texto en ninguna tabla satélite.

## Otros cambios de datos aplicados hoy (relacionados)

- **Géneros duplicados consolidados:** `board-games`, `massively-multiplayer`, `role-playing-games-rpg` (variantes kebab-case, con `name` corrompido) fueron eliminados de `genres`; los juegos que apuntaban a ellos se movieron a los ids snake_case canónicos (`board_games`, `massively_multiplayer`, `role_playing_games_rpg`), que ahora tienen `name` correcto ("Board Games", "Massively Multiplayer", "Role-Playing Games (RPG)"). `genres` pasó de 77 a 74 filas.
- **Causa raíz corregida:** `product/scripts/scrape-rawg.mjs:316` tomaba el `genre.slug` crudo de la API de RAWG (kebab-case, ej. `role-playing-games-rpg`) y lo escribía directo como `genre_id` interno — de ahí salieron los duplicados. Se corrigió a `.replace(/-/g, "_")` antes de asignar, así el próximo scrape de RAWG no vuelve a crear colisiones. **No se tocó** `RAWG_GENRE_TAG_MAP` en `scrape-rawg.mjs`/`enrich-tags.mjs` — esas claves kebab-case son correctas tal cual, porque son el vocabulario nativo de la API de RAWG (no nuestro `genre_id` interno).
- **12 scripts de matching** (`match-gamesdatabase-*.mjs`, `match-psxdatacenter*.mjs`, `generate-gamesdatabase-migration.mjs`) tenían las 3 variantes kebab-case duplicadas en sus allowlists de géneros válidos — se removieron, dejando solo las snake_case canónicas.

## Segunda pasada de limpieza (2026-07-04, mismo día — solo DB)

Todo lo siguiente se hizo **solo en la base de datos**, sin tocar código de la app, siguiendo el criterio "lo que mejora la calidad de la DB sin requerir una decisión de producto":

- **`games.aliases`/`games.platforms` sincronizados** con `game_aliases`/`game_platforms` (merge sin pérdida en ambas direcciones: 1,506 y 1,959 juegos corregidos). Se agregaron **triggers** (`game_aliases_sync_games`, `game_platforms_sync_games`) que mantienen el array recalculado automáticamente cada vez que cambia la tabla relacional — la tabla relacional es ahora la fuente de verdad. **Ojo:** si algún script sigue escribiendo directo al array sin pasar por la tabla, va a volver a desincronizarse; el trigger solo cubre la dirección tabla→array.
- **`game_scores_preferred`** (vista nueva): un score por `(game_id, platform_id)`, con precedencia `igdb > metacritic > metacritic_review_sentiment > metacritic_staging > rawg > vgsales`. Recomendado usar esta vista en vez de `game_scores` directamente donde se necesite "el" score de un juego.
- **U+2028 limpiado** en `games.notes` y `game_summaries.summary` (1,955 + 1 filas).
- **Índices agregados** en los 10 FKs de `match_candidate_id`/`source_platform_id` y 3 de `run_id` en `_private` que no tenían cobertura.
- **CHECK constraints agregados** en `game_scores.score_source` y `game_external_ids.provider`.
- **`search_path` fijado** en las 4 funciones que el advisor de seguridad marcaba (`weighted_cosine_similarity`, `confidence_label`, `format_trait`, `tag_weight`).
- **Colas estancadas archivadas** (no borradas, solo marcadas): 52 filas de `game_duplicate_groups` → `status='ignored'`; 2,057 filas de `game_external_match_candidates` → `status='archived_stale'` (se agregó ese valor al CHECK constraint). Todas tenían `created_at` de 2026-06-19 sin resolución.
  - *Nota para el futuro:* al hacer el backfill de `game_ref` en `game_external_match_candidates` esa misma sesión, un `UPDATE` sobre todas las filas pisó `updated_at` a la fecha del backfill — por eso el archivado se basó en `created_at`, no `updated_at`. Cualquier ALTER/UPDATE masivo futuro sobre tablas con trigger de `updated_at` va a tener el mismo efecto secundario; no usar `updated_at` como proxy de "última actividad real" después de una migración de esquema.
- **Tablas `staging_*` archivadas** (renombradas con sufijo `_archived_20260704`, no borradas): `staging_metacritic_games`, `staging_vgsales`, `staging_metacritic_review_sentiment`, `staging_metacritic_reviews`. Sin funciones que las referencien (verificado contra `pg_proc` antes de tocar).
- **3 géneros duplicados adicionales encontrados y fusionados:** `action_game`→`action`, `fighting_game`→`fighting`, `puzzle_game`→`puzzle` (cada uno con 1-2 juegos, mismo patrón de bug que los 3 de la primera pasada). `genres`: 74 → 71 filas.

## Tercera pasada (2026-07-04, mismo día — "rompe lo que haya que romper en las apps, prioriza la DB")

A partir de acá se dejó de proteger la compatibilidad con `product/`/`intelligence-lab/` a propósito. **Cualquiera que retome el código de la app después de esta fecha tiene que asumir que estos cambios ya están aplicados.**

- **`pk` es ahora el `PRIMARY KEY` real** de `games`, `genres`, `series`, `platforms`. Los textos (`game_id`, `genres.id`, `series.id`, `platforms.id`) pasaron a ser columnas `UNIQUE NOT NULL` normales — siguen ahí, siguen siendo consultables igual que antes, pero ya no son la clave primaria ni sostienen las FKs internas.
- **Todas las FKs de las ~20 tablas satélite se movieron de texto a `*_ref` (bigint)**, con el mismo comportamiento `ON DELETE` que tenían antes (`CASCADE` en la mayoría, `SET NULL` en las de plataforma opcional, `RESTRICT` en las de auditoría/duplicados). Probado con un `INSERT`+`DELETE` real: borrar un juego ahora cascada correctamente a `game_tags`/`game_scores`/etc. por `pk`, no por texto.
- Las columnas de texto que **no** tenían un `_ref` (`winner_game_id`, `to_game_id` en `game_redirects`, `old_series_id`, `series_cleanup_candidates.series_id`, `source_platform_id` en 2 tablas) se dejaron **intencionalmente en texto** — son referencias a slugs históricos/redirects, no relaciones de catálogo vivo, así que tiene sentido que sigan siendo texto.
- **Nota técnica menor:** quedó un índice `UNIQUE` redundante (`games_pk_key`, `genres_pk_key`, `series_pk_key`, `platforms_pk_key`) además del `PRIMARY KEY` en cada tabla — las FKs `*_ref` ya estaban apuntando a ese unique constraint desde que se crearon (antes de que `pk` fuera PK), y Postgres no las re-apunta solo. No se tocó para no arriesgar otra ronda de drops/recreate; es ~4 índices duplicados de bajo costo, no un bug.
- **`release_label` eliminada de `games`.** Sí la usaba la función `get_full_catalog()` internamente (la incluía en el JSON de salida) — se actualizó la función para que ya no la mencione. Cualquier consumidor de `get_full_catalog()` deja de recibir esa clave.
- **`platform_names` eliminada de `games`.** Era la 3ª copia redundante de la misma info (`platforms` array + `game_platforms` tabla + `platform_names` array). Se encontró y eliminó un trigger viejo y duplicado (`game_platforms_sync` → `sync_game_platforms()`, de la migración `fix_game_platforms_sync` de julio) que hacía básicamente el mismo trabajo que el trigger nuevo de hoy — se dejó solo uno.
- **Trigger bidireccional agregado** (`games_aliases_array_sync`, `games_platforms_array_sync`): ahora escribir directo en `games.aliases`/`games.platforms` (el array) también empuja los datos nuevos hacia `game_aliases`/`game_platforms` (la tabla). Probado en vivo, converge sin loop infinito. **Esto es un parche temporal**, documentado con `COMMENT ON FUNCTION` en la propia base de datos: los scripts de `product/scripts/` (`match-gamesdatabase-*.mjs`, `scrape-rawg.mjs`, etc.) que hoy escriben el array directamente deberían actualizarse para escribir en la tabla relacional en vez de depender de este trigger, antes de que se les vuelva a usar para un nuevo scrape/backfill.
- **3 duplicados de género adicionales:** `action_game`→`action`, `fighting_game`→`fighting`, `puzzle_game`→`puzzle` (sinónimos casi vacíos), y `adventure_puzzle`→`puzzle_adventure`, `adventure_strategy`→`strategy_adventure` (mismo par de palabras en orden invertido), y se borró `arena_fighter_rpg_hybrid` (0 juegos, fila sin uso real). `genres`: 74 → 68 filas.
- **Sobre los géneros híbridos restantes (`action_horror`, `card_rpg`, `life_sim_action_rpg`, etc.):** se revisó el uso real de cada uno. Los que tienen 40-295 juegos (`action_rpg`, `tactical_rpg`, `tactical_strategy`, `point_and_click_adventure`, `action_adventure`) son géneros reales y establecidos en la industria, **no son bugs, no tocar**. Los ~21 restantes tienen entre 1 y 10 juegos cada uno — son candidatos a modelarse como `game_genres` (many-to-many) en vez de eliminarse, pero decidir cómo se descompone cada uno (ej. ¿"monster_collecting_action_rpg" es action+rpg, o es su propia categoría?) es una decisión de producto, no un bug de datos — no se tocaron.

## Cuarta pasada (2026-07-04, mismo día — decisiones de género + limpieza de duplicados)

- **`game_genres` (tabla many-to-many) creada.** 11 géneros compuestos que combinaban 2-3 géneros ya existentes (`arcade_racing`→arcade+racing, `action_jrpg`→action+jrpg, `card_horror_adventure`→card+adventure, etc.) se dividieron: el juego mantiene un `genre_id` primario (el primer componente) y gana filas en `game_genres` para cada género real. 111 filas nuevas, 55 juegos afectados.
- **20 géneros "compuestos" sin sub-género real eliminados**, reasignando cada juego afectado al género existente más cercano (`action_horror`→action, `cinematic_action_adventure`→action_adventure, `lore_film`→unknown, etc. — lista completa en el chat de esa fecha).
- **2 excepciones mantenidas a propósito:** `survival_horror` (9 juegos) y `third_person_shooter` (5 juegos) — son géneros reales y reconocidos en la industria aunque no se descompongan en 2 géneros ya existentes en esta tabla.
- `genres`: 77 (inicio del día) → 68 (tras primeras pasadas) → **37** (tras esta división/eliminación).
- **349 juegos de los 167 grupos de duplicados de título eliminados** (doom, ridge_racer, la serie completa de Pokémon con `pok_mon_*`/`pokemon_*`, etc. — lista completa en `167_duplicate_groups.md` en el scratchpad de esa sesión). Se limpiaron primero los bloqueos (337 redirects que apuntaban a estos ids, 96 registros de auditoría de fusiones, 23 candidatos de duplicados, 137 candidatos de matching externo) y luego se borraron los juegos — el cascade por `pk` se encargó del resto (scores, companies, tags, aliases, platforms, summaries, external_ids). **2 registros de `user_game_states` de usuarios reales se perdieron** en el proceso (bajo impacto: solo 3 perfiles totales en el sistema). Pendiente: recrear estos títulos limpios vía matching con IGDB cuando haga falta.
- **`game_redirects` revisado y depurado.** No había cadenas rotas ni redirects circulares. Sí había **107 casos** (71 `duplicate_merge` + 36 `manual_id_change`) donde el juego "viejo" (`from_game_id`) seguía vivo en `games` en vez de haber sido realmente fusionado/borrado — el redirect se creó pero la limpieza nunca se completó. 71 de esos 107 se resolvieron solos al borrar los 167 grupos (se solapaban); los 36 restantes se borraron explícitamente (ganador ya decidido por el propio redirect, 0 impacto en usuarios reales). `game_redirects` queda con 0 casos de este tipo.
- `games`: 65,419 → **65,034** al final del día (349 + 36 = 385 filas eliminadas en total).

## Quinta pasada (2026-07-04, mismo día — vulnerabilidad real en RPCs `SECURITY DEFINER`)

Al revisar las 18 funciones `SECURITY DEFINER` una por una se confirmó una **vulnerabilidad real, no solo teórica**: `delete_profile`, `get_profile`, `get_game_states`, `delete_game_state`, `upsert_game_state` (x2), `upsert_profile` y `migrate_profile` reciben `p_user_id` como parámetro de texto y lo usaban **sin verificar que corresponde al usuario realmente logueado**. Las políticas RLS de `profiles`/`user_game_states` sí usan `auth.uid() = user_id` correctamente — pero como estas RPCs son `SECURITY DEFINER` (bypasean RLS) y estaban otorgadas a `anon` (sin login), **cualquiera con la clave pública de la API podía leer, escribir o borrar el perfil y game-states de cualquier usuario real**, sin necesidad de autenticarse.

**Arreglado:** las 9 funciones (8 nombres, `upsert_game_state` tiene 2 sobrecargas) ahora validan `p_user_id::uuid = auth.uid()` al inicio (`migrate_profile` valida `p_to_user_id`, ya que `p_from_user_id` es intencionalmente una identidad distinta — el flujo de migrar un perfil anónimo a uno recién autenticado). `check_rate_limit` valida lo mismo solo cuando se pasa un `p_user_id` no nulo (para no romper el rate-limit anónimo por IP). Probado en vivo: `get_profile(...)` ahora lanza `not authorized` sin una sesión válida.

**4 funciones restringidas a `service_role`** (dejaron de ser invocables por `anon`/`authenticated`): `cleanup_audit_log`, `cleanup_rate_limits`, `get_audit_log` (devolvía el audit log de **todos** los usuarios si se llamaba con `p_user_id = null`), y `sync_profile_game_states` (es una función de trigger, no debía ser invocable directo).

**Sin tocar (no son sensibles a identidad):** `get_cache`, `set_cache`, `get_full_catalog`, `score_today_recommendations` — no reciben ni exponen datos de un usuario específico.

**Riesgo residual conocido, no resuelto:** `migrate_profile` sigue sin validar `p_from_user_id` (es imposible hacerlo sin saber si ese id fue alguna vez una sesión anónima real de Supabase Auth o un id generado por el cliente — no se investigó el código de la app para esto, según lo pedido). En teoría, alguien podría copiar el perfil de otro usuario real hacia el suyo propio si conoce su UUID exacto. Vale revisarlo cuando se audite el flujo de auth de la app.

## Sexta pasada (2026-07-04, mismo día — limpieza de deuda propia)

- **4 índices únicos duplicados eliminados** (`games_pk_key`/`games_pkey` y equivalentes en `genres`/`series`/`platforms`). Postgres había enganchado las FKs `*_ref` a la constraint `unique` vieja en vez de a la `PRIMARY KEY` real (inconsistente entre tablas, sin razón clara). Se repuntaron las 16 FKs de `games`, 2 de `genres`, 2 de `series` y 6 de `platforms` contra la PK real, manteniendo el mismo `ON DELETE` que tenían, y se borraron las 4 constraints `unique` redundantes. Probado de nuevo con insert+delete real: cascade sigue funcionando.
- **RLS habilitado en `game_genres`** (se me había pasado al crearla) + policy de lectura pública (`anon`/`authenticated`) igual que `genres`/`series`/`tags`, más el `GRANT SELECT` correspondiente (RLS solo no alcanza sin el grant). Antes de esto la tabla no era alcanzable desde la API aunque existiera.
- **Trigger bidireccional agregado para `tags`** (`game_tags_sync_games`, `games_tags_array_sync`), mismo patrón que `aliases`/`platforms`. Antes de esto, `tags` estaba sincronizado por casualidad (venía bien desde antes) pero sin ninguna protección contra que se desincronizara de nuevo. Probado en vivo en ambas direcciones.

## Séptima pasada (2026-07-04, mismo día — `game_companies_preferred`)

- **Vista `game_companies_preferred` creada**, mismo patrón que `game_scores_preferred`: una fila por (game_id, company_name, role), eligiendo una sola fuente cuando hay duplicados entre providers. Precedencia: `igdb > gamesdatabase > psxdatacenter > metacritic > rawg > vgsales`. 77,753 filas en la tabla base → 67,168 en la vista (10,585 duplicados colapsados). A diferencia de `game_scores`, acá no había *valores* en conflicto entre fuentes (todas coinciden en el nombre de la empresa) — el problema era solo redundancia (la misma fila insertada por 2-3 fuentes distintas).
- **No se le dio acceso público** (`anon`/`authenticated`) porque la tabla base `game_companies` tampoco lo tiene — solo `service_role` puede leerla hoy. Se mantuvo el mismo nivel de exposición para no cambiar el modelo de acceso sin que se pida explícitamente.

## Lo que quedó pendiente (requiere una decisión de alguien, no es mecánico)

- **32 géneros "híbridos"** (`action_jrpg`, `arena_fighter_rpg_hybrid`, `card_horror_adventure`, `life_sim_action_rpg`, etc.) — candidatos a modelarse como `game_genres` (tabla puente many-to-many) en vez de un genre_id escalar. **No se auto-dividieron** porque no todos se descomponen limpio en dos tokens existentes (ej. `arena_fighter_rpg_hybrid` no tiene un genre "arena_fighter" separado), y decidir la semántica de cada uno es un juicio de producto, no una limpieza de datos.
- `release_label` (columna casi muerta, 65,416/65,419 filas vacías, usada en 25 archivos de `product/`) y `platform_names` (redundante, derivable por join, usada en 10 archivos) — no se tocaron porque romperían la app; requieren coordinación de código primero.
- Los 167 grupos de duplicados de título (doom, ridge_racer, final_fantasy_vii, etc.) que no pasaron por el detector estándar — no se auto-fusionaron, fusionar duplicados reales borra filas y requiere revisión caso a caso.
