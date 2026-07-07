# Guía de Squash de Migraciones y Restauración Segura

Esta guía describe cómo realizar un squash de las 104+ migraciones acumuladas en el proyecto `playfit` y restablecer el esquema local de Supabase de forma limpia, **sin perder en ningún momento tus perfiles locales o los datos de tu catálogo**.

---

## Prerrequisitos
- Docker en funcionamiento.
- Supabase CLI instalado. Puedes comprobar el estado local con:
  ```bash
  npx supabase status
  ```

---

## Paso 1: Realizar un Backup de los Datos Actuales
Antes de realizar cualquier cambio, exportaremos todos los datos mutados y de configuración actuales (esquema `games_library`) a un archivo `.dump` de PostgreSQL personalizado.

Desde el directorio raíz de `product`:
```bash
./scripts/backup-db.sh
```
*Esto creará un archivo con formato `playfit_YYYYMMDD_HHMMSS.dump` en tu carpeta local `~/db-backups/` y te indicará el tamaño del backup (ej. `✓ Done (5.4MB)`).*

---

## Paso 2: Ejecutar el Squash de las Migraciones
El squash unifica todas las migraciones incrementales dentro de la carpeta `supabase/migrations/` en un único archivo consolidado que representa el estado del esquema de hoy.

Ejecuta el comando oficial de la CLI de Supabase:
```bash
npx supabase db squash
```
*Este comando consolidará tu historial en un archivo limpio sin afectar a tu base de datos en ejecución.*

---

## Paso 3: Reiniciar la Base de Datos Local con el Esquema Squasheado
Para validar que el nuevo esquema unificado se compila y aplica perfectamente desde cero, reiniciaremos el contenedor de base de datos local de Supabase.

> [!WARNING]
> Este paso restablece los contenedores de base de datos a su estado inicial vacío de migraciones, por lo que **eliminará temporalmente** los datos del catálogo y perfiles locales en el contenedor local. Asegúrate de haber completado con éxito el Paso 1.

Ejecuta:
```bash
npx supabase db reset
```
*Esto descargará el esquema anterior, aplicará la migración squasheada unificada y dejará una base de datos local limpia y con la estructura correcta.*

---

## Paso 4: Restaurar Todos tus Datos y Perfiles
Ahora restauraremos todo el catálogo de juegos, plataformas, tags y perfiles locales que tenías antes del reinicio usando nuestro script de restauración corregido.

1. Identifica el nombre exacto de tu último archivo de backup generado en el Paso 1 (ej. `playfit_20260706_015500.dump`).
2. Ejecuta el restore apuntando a ese archivo:
   ```bash
   ./scripts/restore-backup.sh ~/db-backups/playfit_20260706_015500.dump
   ```

El script automáticamente:
1. Creará un esquema de importación temporal.
2. Cargará los datos del dump en un contenedor PG temporal.
3. Transferirá y transformará los datos de juegos, géneros, series y alias al nuevo esquema.
4. **Restaurará la tabla `profiles`** para recuperar todas tus partidas guardadas locales y onboarding.
5. Limpiará los esquemas temporales.

---

## Paso 5: Verificación de Éxito
Al finalizar el paso anterior, el script imprimirá el resumen de conteo de registros restaurados. Deberías ver cifras similares a las siguientes:
```sql
=== Verifying results ===
 count             
-------------------
 games:16702
 game_platforms:32450
 game_tags:41200
 game_aliases:254
 series:1145
 genres:34
 tags:512
 profiles: [Tu cantidad de perfiles previos]
 platforms:24
```

¡Listo! Tu historial de base de datos local ahora está limpio con un set consolidado de migraciones, y todos tus perfiles y catálogo han sido restaurados exitosamente.
