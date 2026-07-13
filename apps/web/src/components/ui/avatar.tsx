"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { User } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const avatarVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted",
  {
    variants: {
      size: {
        sm: "size-6 text-[10px]",
        md: "size-8 text-xs",
        lg: "size-10 text-sm",
        xl: "size-14 text-lg",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

// Icon sizing for the fallback glyph tracks the same `size` prop but isn't a
// root-element class variant, so it stays a plain lookup rather than joining avatarVariants.
const iconSizes: Record<string, string> = {
  sm: "size-3",
  md: "size-4",
  lg: "size-5",
  xl: "size-7",
};

interface AvatarProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof avatarVariants> {
  src?: string;
  alt: string;
  fallback?: string;
  loading?: "eager" | "lazy";
}

export function Avatar({
  className,
  src,
  alt,
  size,
  fallback,
  loading = "lazy",
  ...props
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = src && !imgError;
  const showFallback = !showImage;
  const resolvedSize = size ?? "md";

  return (
    <span
      role="img"
      aria-label={alt}
      className={cn(avatarVariants({ size, className }))}
      {...props}
    >
      {showImage && (
        // biome-ignore lint/performance/noImgElement: generic avatar with dynamic src
        <img
          src={src}
          alt=""
          loading={loading}
          onError={() => setImgError(true)}
          className="aspect-square size-full object-cover"
        />
      )}
      {showFallback && (
        <span className="flex size-full items-center justify-center font-medium text-muted-foreground">
          {fallback ?? <User className={iconSizes[resolvedSize]} />}
        </span>
      )}
    </span>
  );
}

export { avatarVariants };
