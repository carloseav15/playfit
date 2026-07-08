# Guía de Backup/Restore y Squash de Migraciones

> **Actualizado 2026-07-07.** La versión anterior de esta guía (Pasos 3-4 con
> `restore-backup.sh`) quedó **confirmada como insegura**: ese script solo cubría 9 de
> las 67 tablas reales (`games_library` + `games_library_private` + `igdb_raw`), y esas 9
> usaban una forma vieja del esquema (pre-claves-surrogadas) que ya no coincide con las
> columnas actuales. `scripts/restore-backup.sh` queda marcado como deprecado — no lo uses.
> Este documento ahora describe el flujo real de backup/restore, validado contra un
> proyecto Supabase descartable (contenedores y puertos separados del proyecto local
> principal) el 2026-07-07: conteos de filas y checksums de datos idénticos en las 67
> tablas de las 3 schemas, más un bug real encontrado y corregido en el camino (ver
> abajo). El squash de migraciones en sí (Paso 2) todavía no está validado — no lo
> ejecutes hasta que esa parte del trabajo esté probada por separado.

---

## Alcance real

Tres schemas importan para poder recuperar la base ante una pérdida total, no solo uno:

- `games_library`: 39 tablas base + 15 vistas (catálogo, perfiles, tags, etc.)
- `games_library_private`: 24 tablas base (logs de auditoría de merges de duplicados,
  limpiezas, y algunas tablas `tmp_*` de un análisis de cobertura pasado)
- `igdb_raw`: 4 tablas, dominadas por `igdb_raw.entities` (mirror crudo de la API de
  IGDB, ~8.3M filas, ~4.5GB — la mayor parte del tamaño total de la base)

Fuera de alcance (decisión explícita, 2026-07-07): el schema `auth` de Supabase — las
~51 cuentas locales son de prueba, aceptable recrearlas si se pierden.

---

## Prerrequisitos
- Docker en funcionamiento.
- Supabase CLI instalado.
- El disco duro externo `/Volumes/Elements` conectado (destino por defecto de los
  backups — hay ~3TB libres ahí; el disco principal suele andar con poco margen).

---

## Paso 1: Backup

Desde el directorio raíz de `product`:
```bash
./scripts/backup-all.sh
```

Esto corre `scripts/backup-schema.mjs` para cada uno de los 3 schemas
(`games_library`, `games_library_private`, `igdb_raw`), dejando un `.dump` con formato
custom de `pg_dump` por schema en `/Volumes/Elements/Backups/<schema>/`. Podés apuntar a
otro destino con `./scripts/backup-all.sh --out <dir>` o la variable de entorno
`PLAYFIT_BACKUP_ROOT`.

---

## Paso 2: Squash de migraciones (pendiente de validar — no ejecutar todavía)

El squash de las 107 migraciones actuales en un esquema base limpio es un trabajo
separado, todavía no probado contra un proyecto descartable. No corras
`npx supabase db squash` como parte de este flujo hasta que esa validación esté hecha.

---

## Paso 3: Reiniciar la base local

> [!WARNING]
> Este paso elimina **todo** el contenido de `games_library`, `games_library_private` e
> `igdb_raw` en el contenedor local (los 67 tablas de las 3 schemas). Asegurate de haber
> completado el Paso 1 con éxito antes de seguir.

```bash
npx supabase db reset
```

---

## Paso 4: Restaurar

```bash
./scripts/restore-all.sh
```

Corre `scripts/restore-schema.mjs` para cada uno de los 3 schemas, restaurando el dump
más reciente de cada uno (`pg_restore --clean --if-exists`, seguro de re-correr). Para
`games_library` específicamente, el script fuerza además un recálculo de
`games.search_document` después del restore — ver la nota de bug abajo.

---

## Paso 5: Verificación

```bash
./scripts/backup-all.sh --out /tmp/verify   # o cualquier chequeo manual de conteos
```

O manualmente, comparar conteos por tabla en las 3 schemas contra los del backup. El
detalle completo de qué se validó (conteos + checksums de datos en las 67 tablas) está
en la sesión de trabajo del 2026-07-07, no en un script fijo — no hay una lista corta de
"tablas esperadas" como en la versión vieja de esta guía, porque son 67 tablas y crecen.

---

## Bug encontrado y corregido durante la validación (2026-07-07)

`games_library.games.search_document` es una columna `generated always as (...) stored`
que llama a `get_series_name()`/`get_genre_name()` — funciones marcadas `immutable` que
en realidad consultan otras tablas (`series`, `genres`). `pg_restore` no garantiza que
esas tablas estén cargadas antes que `games` (las FKs se agregan recién al final del
restore, así que el orden de carga de datos no respeta dependencias), así que el valor
generado puede quedar incompleto justo después de un restore — le faltan los lexemas de
género/serie si esas tablas todavía no tenían datos en el momento en que Postgres
recalculó la columna. `scripts/restore-schema.mjs` ahora corre un `UPDATE` sin efecto
(`SET game_id = game_id`) sobre `games_library.games` al final del restore de ese schema
específicamente para forzar el recálculo una vez que todo está cargado. Confirmado con
antes/después: sin el fix, el checksum de `games` no coincidía con el original a pesar de
que los conteos de filas sí coincidían; con el fix, coincide exactamente.
