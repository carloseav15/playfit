"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type QueueItem = {
  game_id: string;
  title: string;
  cover_url: string;
  metacritic_score: number | null;
  max_platform_gen: number | null;
  platform_names: string[] | null;
};

const PAGE_SIZE = 50;
const SECRET_STORAGE_KEY = "playfit_admin_secret";

function sourceLabel(coverUrl: string) {
  if (coverUrl.startsWith("http")) {
    try {
      return new URL(coverUrl).hostname;
    } catch {
      return "externo";
    }
  }
  return "local";
}

export default function AdminCoversPage() {
  const [secret, setSecret] = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [items, setItems] = useState<QueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [removedCount, setRemovedCount] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  const fetchingRef = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(SECRET_STORAGE_KEY);
    if (stored) setSecret(stored);
    const urlSource = new URLSearchParams(window.location.search).get("source");
    if (urlSource) setSourceFilter(urlSource);
  }, []);

  const fetchBatch = useCallback(
    async (currentSecret: string, currentOffset: number, currentSource: string | null) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      setLoadingMore(true);
      try {
        const sourceParam = currentSource ? `&source=${encodeURIComponent(currentSource)}` : "";
        const res = await fetch(
          `/api/admin/covers?offset=${currentOffset}&limit=${PAGE_SIZE}${sourceParam}`,
          { headers: { "x-admin-secret": currentSecret } },
        );
        if (res.status === 401) {
          window.localStorage.removeItem(SECRET_STORAGE_KEY);
          setSecret(null);
          setAuthError("Secret incorrecto.");
          return;
        }
        const json = await res.json();
        const newItems: QueueItem[] = json.items ?? [];
        setItems((prev) => [...prev, ...newItems]);
        setOffset(currentOffset + newItems.length);
        setTotal(typeof json.total === "number" ? json.total : null);
        if (newItems.length < PAGE_SIZE) setExhausted(true);
      } finally {
        fetchingRef.current = false;
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (secret && items.length === 0 && !exhausted) {
      void fetchBatch(secret, 0, sourceFilter);
    }
  }, [secret, items.length, exhausted, fetchBatch, sourceFilter]);

  useEffect(() => {
    if (secret && !exhausted && index >= items.length - 5 && !fetchingRef.current) {
      void fetchBatch(secret, offset, sourceFilter);
    }
  }, [index, items.length, secret, exhausted, offset, fetchBatch, sourceFilter]);

  function toggleSourceFilter(next: string | null) {
    setItems([]);
    setIndex(0);
    setOffset(0);
    setExhausted(false);
    setTotal(null);
    setSourceFilter(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("source", next);
    else url.searchParams.delete("source");
    window.history.replaceState({}, "", url);
  }

  const current = items[index];

  const advance = useCallback(() => {
    setReviewedCount((c) => c + 1);
    setIndex((i) => i + 1);
  }, []);

  const handleKeep = useCallback(() => {
    if (!current) return;
    advance();
  }, [current, advance]);

  const handleRemove = useCallback(async () => {
    if (!current || !secret) return;
    const gameId = current.game_id;
    await fetch("/api/admin/covers", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify({ gameId }),
    });
    setRemovedCount((c) => c + 1);
    advance();
  }, [current, secret, advance]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!current) return;
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        handleKeep();
      } else if (e.key === "ArrowLeft" || e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        void handleRemove();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, handleKeep, handleRemove]);

  function submitSecret(e: React.FormEvent) {
    e.preventDefault();
    if (!secretInput.trim()) return;
    window.localStorage.setItem(SECRET_STORAGE_KEY, secretInput.trim());
    setSecret(secretInput.trim());
    setAuthError(null);
  }

  if (!secret) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="text-lg font-semibold">Admin: revisión de covers</h1>
        <form onSubmit={submitSecret} className="flex flex-col gap-2">
          <input
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="Admin secret"
            className="rounded border border-border bg-background px-3 py-2"
          />
          <button type="submit" className="rounded bg-primary px-3 py-2 text-primary-foreground">
            Entrar
          </button>
        </form>
        {authError ? <p className="text-sm text-red-500">{authError}</p> : null}
      </div>
    );
  }

  const filterToggle = (
    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        id="source-filter-toggle"
        onClick={() => toggleSourceFilter(sourceFilter === "steamcdn" ? null : "steamcdn")}
        className={`rounded border px-2 py-1 ${
          sourceFilter === "steamcdn"
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border text-muted-foreground"
        }`}
      >
        {sourceFilter === "steamcdn" ? "✕ Modo: solo steamcdn" : "Revisar solo steamcdn"}
      </button>
    </div>
  );

  if (!current) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
        {filterToggle}
        <p className="text-lg font-semibold">
          {exhausted ? "No hay más covers para revisar." : "Cargando..."}
        </p>
        <p className="text-sm text-muted-foreground">
          Revisados: {reviewedCount} · Quitados: {removedCount}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6">
      {filterToggle}
      <p className="text-sm text-muted-foreground">
        #{offset - items.length + index + 1}
        {total != null ? ` / ${total}` : ""} · revisados {reviewedCount} · quitados {removedCount}
        {loadingMore ? " · cargando más..." : ""}
      </p>

      <div className="flex max-h-64 items-center justify-center overflow-hidden rounded-sm border border-border bg-black/40 shadow-md">
        {/* biome-ignore lint/performance/noImgElement: admin-only tool, arbitrary cover URLs, no LCP/bandwidth concern */}
        <img
          src={
            current.cover_url.startsWith("http")
              ? current.cover_url
              : `/${current.cover_url.replace(/^\//, "")}`
          }
          alt={`${current.title} cover art`}
          className="max-h-64 w-auto object-contain"
        />
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="text-base font-semibold">{current.title}</h2>
        <p className="text-xs text-muted-foreground">
          {(current.platform_names ?? []).join(", ") || "sin plataforma"}
        </p>
        <p className="text-xs text-muted-foreground">
          {current.metacritic_score != null
            ? `Metacritic ${current.metacritic_score}`
            : "sin score"}
          {" · "}
          {sourceLabel(current.cover_url)}
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void handleRemove()}
          className="rounded border border-red-500 px-4 py-2 text-red-500"
        >
          ← Quitar cover
        </button>
        <button
          type="button"
          onClick={handleKeep}
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
        >
          Mantener →
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Flechas: ← quitar · → / Enter mantener</p>
    </div>
  );
}
