"use client";

import { User } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  src?: string;
  alt: string;
  size?: "sm" | "md" | "lg" | "xl";
  fallback?: string;
  loading?: "eager" | "lazy";
}

const sizeStyles: Record<string, string> = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
  xl: "size-14 text-lg",
};

const iconSizes: Record<string, string> = {
  sm: "size-3",
  md: "size-4",
  lg: "size-5",
  xl: "size-7",
};

export function Avatar({
  className,
  src,
  alt,
  size = "md",
  fallback,
  loading = "lazy",
  ...props
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = src && !imgError;
  const showFallback = !showImage;

  return (
    <span
      role="img"
      aria-label={alt}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted",
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {showImage && (
        // biome-ignore lint/performance/noImgElement: generic avatar with dynamic src
        <img
          src={src}
          alt=""
          role="presentation"
          loading={loading}
          onError={() => setImgError(true)}
          className="aspect-square size-full object-cover"
        />
      )}
      {showFallback && (
        <span className="flex size-full items-center justify-center font-medium text-muted-foreground">
          {fallback ?? <User className={iconSizes[size]} />}
        </span>
      )}
    </span>
  );
}
