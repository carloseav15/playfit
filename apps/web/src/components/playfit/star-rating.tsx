"use client";

import type { ProductRating } from "@playfit/core";
import { Star, X } from "lucide-react";
import { motion } from "motion/react";
import { useId, useState } from "react";

interface StarRatingProps {
  value?: ProductRating;
  onChange?: (value: ProductRating | undefined) => void;
  readOnly?: boolean;
}

export function StarRating({ value, onChange, readOnly = false }: StarRatingProps) {
  const ratingName = useId();
  const [preview, setPreview] = useState<ProductRating | null>(null);
  const display = preview ?? value ?? 0;

  function starFill(star: number): "full" | "half" | "empty" {
    if (display >= star) return "full";
    if (display >= star - 0.5) return "half";
    return "empty";
  }

  if (readOnly) {
    return (
      <div
        className="inline-flex items-center gap-0"
        role="img"
        aria-label={value ? `Rating: ${value} stars` : "No rating"}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = starFill(star);
          return (
            <div key={star} className="relative size-4 shrink-0">
              <Star
                className={`size-4 ${
                  fill === "full" || fill === "half" ? "text-accent" : "text-muted-foreground/30"
                }`}
              />
              {(fill === "full" || fill === "half") && (
                <div
                  className={`absolute inset-0 overflow-hidden ${
                    fill === "half" ? "w-1/2" : "w-full"
                  }`}
                >
                  <Star className="size-4 fill-accent text-accent" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-0">
      <button
        type="button"
        onClick={() => onChange?.(undefined)}
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center text-muted-foreground/30 transition-colors hover:text-muted-foreground"
        aria-label="Clear rating"
      >
        <X className="size-4" />
      </button>
      <div
        role="radiogroup"
        aria-label="Rating"
        className="inline-flex items-center gap-0"
        onMouseLeave={() => setPreview(null)}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const half = (star - 0.5) as ProductRating;
          const whole = star as ProductRating;
          const fill = starFill(star);

          return (
            <motion.div
              key={star}
              whileTap={{ scale: 0.85 }}
              transition={{ type: "spring", stiffness: 500, damping: 15 }}
              className="relative size-6 shrink-0"
            >
              <label
                className="absolute inset-y-0 left-0 z-10 w-1/2 cursor-pointer rounded-l-sm has-focus-visible:ring-2 has-focus-visible:ring-ring"
                onMouseEnter={() => setPreview(half)}
              >
                <input
                  type="radio"
                  name={ratingName}
                  value={half}
                  checked={value === half}
                  onChange={() => onChange?.(half)}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label={`${half} stars`}
                />
              </label>
              <label
                className="absolute inset-y-0 right-0 z-10 w-1/2 cursor-pointer rounded-r-sm has-focus-visible:ring-2 has-focus-visible:ring-ring"
                onMouseEnter={() => setPreview(whole)}
              >
                <input
                  type="radio"
                  name={ratingName}
                  value={whole}
                  checked={value === whole}
                  onChange={() => onChange?.(whole)}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label={`${whole} stars`}
                />
              </label>
              <div className="pointer-events-none absolute inset-0">
                <Star
                  className={`size-6 ${
                    fill === "full" || fill === "half" ? "text-accent" : "text-muted-foreground/30"
                  }`}
                />
                {(fill === "full" || fill === "half") && (
                  <div
                    className={`absolute inset-0 overflow-hidden ${
                      fill === "half" ? "w-1/2" : "w-full"
                    }`}
                  >
                    <Star className="size-6 fill-accent text-accent" />
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
