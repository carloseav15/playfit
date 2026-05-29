import { escapeHtml } from "../utils";

interface CoverArtOptions {
  title: string;
  coverPath?: string;
  className?: string;
  size?: "poster" | "thumb" | "mini";
  loading?: "lazy" | "eager";
  variant?: "media" | "archive";
  decorative?: boolean;
}

type CoverFit = "portrait" | "square" | "wide";

function getInitials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment.charAt(0).toUpperCase())
    .join("");
}

export function renderCoverArt({
  title,
  coverPath,
  className = "",
  size = "poster",
  loading = "lazy",
  variant = "media",
  decorative = false,
}: CoverArtOptions) {
  const classes = ["cover-art", `cover-art-${size}`, `cover-art-${variant}`, className]
    .filter(Boolean)
    .join(" ");
  const wrapperAttributes =
    variant === "media"
      ? `data-cover-art="media" data-cover-fit="pending"`
      : `data-cover-art="archive" data-cover-fit="archive"${
          decorative ? ' aria-hidden="true"' : ""
        }`;

  if (!coverPath) {
    const placeholderAttributes =
      decorative || variant === "archive"
        ? 'aria-hidden="true"'
        : `role="img" aria-label="${escapeHtml(`${title} cover placeholder`)}"`;

    return `
      <div
        class="${classes} cover-art-placeholder"
        data-cover-art="${variant}"
        data-cover-fit="placeholder"
        ${placeholderAttributes}
      >
        <span class="cover-art-initials">${escapeHtml(getInitials(title) || "??")}</span>
      </div>
    `;
  }

  return `
    <div
      class="${classes}"
      ${wrapperAttributes}
    >
      <img
        src="${escapeHtml(coverPath)}"
        alt="${decorative ? "" : escapeHtml(`${title} cover art`)}"
        loading="${loading}"
        decoding="async"
      />
    </div>
  `;
}

function classifyCoverFit(image: HTMLImageElement): CoverFit {
  const ratio = image.naturalWidth / image.naturalHeight;

  if (ratio >= 1.12) {
    return "wide";
  }

  if (ratio >= 0.82) {
    return "square";
  }

  return "portrait";
}

function applyCoverFit(image: HTMLImageElement) {
  const wrapper = image.closest<HTMLElement>("[data-cover-art]");

  if (!wrapper) {
    return;
  }

  if (!image.naturalWidth || !image.naturalHeight) {
    wrapper.dataset.coverFit = "portrait";
    return;
  }

  wrapper.dataset.coverFit = classifyCoverFit(image);
}

export function hydrateCoverArt(root: ParentNode) {
  const images = root.querySelectorAll<HTMLImageElement>('[data-cover-art="media"] img');

  images.forEach((image) => {
    if (image.complete) {
      applyCoverFit(image);
      return;
    }

    image.addEventListener("load", () => applyCoverFit(image), { once: true });
    image.addEventListener(
      "error",
      () => {
        const wrapper = image.closest<HTMLElement>("[data-cover-art]");
        if (wrapper) {
          wrapper.dataset.coverFit = "portrait";
        }
      },
      { once: true },
    );
  });
}
