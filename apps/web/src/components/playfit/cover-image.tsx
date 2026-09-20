"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useRef, useState } from "react";

export function CoverImage({
  src,
  alt,
  priority,
  unoptimized,
  fallback,
}: {
  src: string;
  alt: string;
  priority: boolean;
  unoptimized: boolean;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return <>{fallback}</>;

  return (
    <Image
      ref={imageRef}
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      width={264}
      height={352}
      priority={priority}
      unoptimized={unoptimized}
      onError={() => setFailed(true)}
    />
  );
}
