import type { createAnonClient } from "./server";

export async function paginateTable<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createAnonClient>,
  table: string,
  select: string,
  pageSize = 1000,
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;
  let done = false;

  while (!done) {
    const { data, error } = await supabase
      .schema("games_library")
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to paginate ${table}: ${error.message}`);
    }

    const batch = (data as unknown as T[]) ?? [];
    allRows.push(...batch);
    from += pageSize;

    if (batch.length < pageSize) {
      done = true;
    }
  }

  return allRows;
}
