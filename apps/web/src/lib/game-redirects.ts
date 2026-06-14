interface GameRedirectRow {
  from_game_id: string;
  to_game_id: string;
}

interface RedirectLookupClient {
  schema(schema: string): {
    from(table: string): {
      select(columns: string): {
        in(
          column: string,
          values: string[],
        ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
}

interface GameRedirectsResult {
  ids: string[];
  redirectById: Map<string, string>;
  error: string | null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export async function resolveGameRedirects(
  supabase: unknown,
  gameIds: string[],
  maxHops = 5,
): Promise<GameRedirectsResult> {
  const originalIds = unique(gameIds);
  if (originalIds.length === 0) {
    return { ids: [], redirectById: new Map(), error: null };
  }

  const currentByOriginal = new Map(originalIds.map((id) => [id, id]));
  const seenByOriginal = new Map(originalIds.map((id) => [id, new Set([id])]));
  const redirectClient = supabase as RedirectLookupClient;
  let pending = originalIds;

  for (let hop = 0; hop < maxHops && pending.length > 0; hop += 1) {
    const { data, error } = await redirectClient
      .schema("games_library")
      .from("game_redirects")
      .select("from_game_id, to_game_id")
      .in("from_game_id", pending);

    if (error) {
      return { ids: originalIds, redirectById: new Map(), error: error.message };
    }

    const targetBySource = new Map(
      ((data ?? []) as GameRedirectRow[])
        .filter((row) => row.from_game_id && row.to_game_id)
        .map((row) => [row.from_game_id, row.to_game_id]),
    );

    if (targetBySource.size === 0) break;

    const nextPending: string[] = [];
    for (const originalId of originalIds) {
      const currentId = currentByOriginal.get(originalId) ?? originalId;
      const targetId = targetBySource.get(currentId);
      if (!targetId) continue;

      const seen = seenByOriginal.get(originalId) ?? new Set([originalId]);
      if (seen.has(targetId)) {
        return {
          ids: originalIds,
          redirectById: new Map(),
          error: `Circular game redirect detected for ${originalId}`,
        };
      }

      seen.add(targetId);
      seenByOriginal.set(originalId, seen);
      currentByOriginal.set(originalId, targetId);
      nextPending.push(targetId);
    }

    pending = unique(nextPending);
  }

  const redirectById = new Map(
    [...currentByOriginal.entries()].filter(([originalId, currentId]) => originalId !== currentId),
  );

  return {
    ids: unique(originalIds.map((id) => currentByOriginal.get(id) ?? id)),
    redirectById,
    error: null,
  };
}

export async function resolveGameRedirect(
  supabase: unknown,
  gameId: string,
): Promise<{ gameId: string; redirectedFrom?: string; error: string | null }> {
  const result = await resolveGameRedirects(supabase, [gameId]);
  const resolvedGameId = result.ids[0] ?? gameId;
  if (result.redirectById.has(gameId)) {
    return { gameId: resolvedGameId, redirectedFrom: gameId, error: result.error };
  }
  return { gameId: resolvedGameId, error: result.error };
}
