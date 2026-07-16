"use client";

import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { DesktopAppNav } from "./desktop-app-nav";
import type { HeaderConfig } from "./header-context";

function BrandLink({ mobile = false }: { mobile?: boolean }) {
  return (
    <Link
      href="/"
      className={`${mobile ? "flex" : "hidden md:flex"} items-center gap-2.5 no-underline`}
    >
      <Image
        src="/playfit_logo_light.png"
        alt="Playfit Logo"
        width={28}
        height={28}
        className="object-contain dark:hidden"
        priority
      />
      <Image
        src="/playfit_logo_dark.png"
        alt="Playfit Logo"
        width={28}
        height={28}
        className="hidden object-contain dark:block"
        priority
      />
      <span className="grid leading-tight">
        <strong className="font-display text-sm tracking-tight font-black text-foreground">
          Playfit
        </strong>
        <span className="text-[10px] text-muted-foreground">Game decisions you can trust</span>
      </span>
    </Link>
  );
}

function MobileTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center md:hidden absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
      <span className="font-display text-base font-black tracking-tight text-foreground">
        {title}
      </span>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-10 w-10 rounded-full mr-2 -ml-2 text-foreground hover:bg-secondary relative z-50"
      onClick={onClick}
    >
      <ArrowLeft className="size-5" />
      <span className="sr-only">Back</span>
    </Button>
  );
}

function RouteHeader({ pathname, headerConfig }: { pathname: string; headerConfig: HeaderConfig }) {
  const router = useRouter();

  if (headerConfig.onBack) {
    return (
      <>
        <div className="flex items-center md:hidden w-full">
          <BackButton onClick={headerConfig.onBack} />
          <MobileTitle title={headerConfig.title ?? "Back"} />
        </div>
        <BrandLink />
      </>
    );
  }

  const routeTitle =
    pathname === "/picks"
      ? "Saved Picks"
      : pathname === "/taste"
        ? "My Taste"
        : pathname.startsWith("/game/")
          ? "Game Analysis"
          : pathname === "/settings"
            ? "Settings"
            : null;

  if (pathname.startsWith("/game/")) {
    return (
      <>
        <div className="flex items-center md:hidden w-full">
          <BackButton
            onClick={() => {
              if (window.history.length > 1) router.back();
              else router.push("/");
            }}
          />
          <MobileTitle title="Game Analysis" />
        </div>
        <BrandLink />
      </>
    );
  }

  if (routeTitle) {
    return (
      <>
        <MobileTitle title={routeTitle} />
        <BrandLink />
      </>
    );
  }

  return <BrandLink mobile />;
}

export function AppHeader({
  pathname,
  headerConfig,
  picksCount,
}: {
  pathname: string;
  headerConfig: HeaderConfig;
  picksCount: number;
}) {
  return (
    <header className="border-b border-border/60 bg-background/80 backdrop-blur-xl shrink-0 z-40 sticky top-0">
      <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-5 px-6 relative">
        <RouteHeader pathname={pathname} headerConfig={headerConfig} />
        <DesktopAppNav picksCount={picksCount} />
      </div>
    </header>
  );
}
