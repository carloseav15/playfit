import { ListChecks, Settings, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PlayRouteTab = "picks" | "taste" | "settings";

const tabConfig = {
  picks: {
    href: "/play/picks",
    icon: ListChecks,
  },
  taste: {
    href: "/play/taste",
    icon: SlidersHorizontal,
  },
  settings: {
    href: "/play/settings",
    icon: Settings,
  },
};

export function PlayRouteTabs({
  pathname,
  picksCount,
  picksLabel = "Picks",
  tasteLabel = "Taste",
  settingsLabel = "Settings",
  order = ["picks", "taste", "settings"],
  showIcons = false,
  className,
}: {
  pathname: string | null;
  picksCount?: number;
  picksLabel?: string;
  tasteLabel?: string;
  settingsLabel?: string;
  order?: PlayRouteTab[];
  showIcons?: boolean;
  className?: string;
}) {
  const labels = {
    picks: picksCount ? `${picksLabel} (${picksCount})` : picksLabel,
    taste: tasteLabel,
    settings: settingsLabel,
  };

  return (
    <div
      className={cn(
        "flex shrink-0 gap-1 rounded-2xl border border-border/60 bg-secondary/60 p-1",
        className,
      )}
    >
      {order.map((tab) => {
        const { href, icon: Icon } = tabConfig[tab];
        const active = pathname === href;

        return (
          <Button
            key={tab}
            type="button"
            variant={active ? "secondary" : "ghost"}
            asChild
            className={cn(
              "h-11 md:h-8 px-3 md:px-3.5 text-[11px] md:text-xs rounded-xl font-extrabold transition-all active:scale-[0.98]",
              active
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/80",
            )}
          >
            <Link href={href}>
              {showIcons ? <Icon className="size-3.5 mr-1" /> : null}
              {labels[tab]}
            </Link>
          </Button>
        );
      })}
    </div>
  );
}
