# Operaciones de datos y recuperación

El disco externo **Expanse** está montado como `/Volumes/Elements`. Los datos
pesados y recuperables de Playfit viven en `/Volumes/Elements/Playfit/Backups`;
no se guardan en Git ni se despliegan a producción.

## Qué va en cada lugar

| Lugar | Contenido |
| --- | --- |
| Git | migraciones livianas, código y scripts de recuperación |
| Expanse | backups completos, mirror IGDB y seed runtime de catálogo |
| Producción | 17 tablas runtime y el catálogo necesario para la web |
| Base local activa | entorno enriquecido para desarrollo e importación |

Los backups completos son `games_library`, `games_library_private` e `igdb_raw`.
El seed `runtime_catalog` contiene solo catálogo público: nunca perfiles,
estados de juego, rate limits, auditoría ni caché.

## Operación normal

```bash
npm run backup:all
npm run backup:runtime-catalog
npm run backup:verify
```

Ejecutar esos tres comandos antes de cambios de datos masivos, de un reset o
del mantenimiento de IGDB.

## Recuperar desarrollo enriquecido

Este comando es destructivo **solo para la base local**. Reconstruye el esquema
y restaura el catálogo completo, tablas privadas y mirror IGDB desde Expanse:

```bash
npm run recover:local
```

No apuntar este flujo a producción. El script exige que Expanse esté montado y
que los dumps existan.

## Reconstruir el contrato reducido

En una base local desechable, aplicar las migraciones y cargar el catálogo
runtime externo:

```bash
supabase db reset --local
npm run seed:catalog
```

El resultado esperado es el contrato de producción: 17 tablas runtime, 65,118
juegos, 36 plataformas y recomendaciones válidas con plataformas vacías.

## Límite deliberado

La base local activa conserva datos pesados para que desarrollo siga operativo
sin una restauración de horas. Expanse es la copia recuperable y canónica de
esos datos; no se debe borrar una tabla pesada local hasta que se acepte perder
esa disponibilidad inmediata o se migre explícitamente el almacenamiento de
Docker al disco externo.
