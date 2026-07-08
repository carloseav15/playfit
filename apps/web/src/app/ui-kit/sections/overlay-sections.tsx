"use client";

import { ChevronRight, Download, Settings2, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownItem, DropdownMenu, DropdownSeparator } from "@/components/ui/dropdown-menu";
import { Sheet } from "@/components/ui/sheet";
import { SectionHeader } from "./helpers";

export function OverlaySections() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetLeft, setSheetLeft] = useState(false);

  return (
    <>
      <SectionHeader title="Sheet" id="sheet" />
      <p className="mb-5 text-sm text-muted-foreground">
        Slide-in panel powered by the native <code className="font-mono text-xs">{"<dialog>"}</code>{" "}
        element. Use for filters, mobile nav, or side content.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setSheetOpen(true);
          }}
        >
          Open right sheet
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setSheetLeft(true);
          }}
        >
          Open left sheet
        </Button>
      </div>
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} side="right" title="Sheet Right">
        <p className="text-sm text-muted-foreground">
          Content slides in from the right side. Escape or backdrop click closes.
        </p>
      </Sheet>
      <Sheet open={sheetLeft} onClose={() => setSheetLeft(false)} side="left" title="Sheet Left">
        <p className="text-sm text-muted-foreground">Content slides in from the left side.</p>
      </Sheet>

      <SectionHeader title="DropdownMenu" id="dropdown-menu" />
      <p className="mb-5 text-sm text-muted-foreground">
        Simple popover menu with items, icons, separators, and destructive variant. Click outside or
        press Escape to close.
      </p>
      <DropdownMenu
        align="start"
        trigger={
          <Button variant="secondary" size="sm">
            Options <ChevronRight className="size-3.5" />
          </Button>
        }
      >
        <DropdownItem icon={<Settings2 className="size-4" />}>Settings</DropdownItem>
        <DropdownItem icon={<Download className="size-4" />}>Download</DropdownItem>
        <DropdownSeparator />
        <DropdownItem icon={<ShieldCheck className="size-4" />}>Share</DropdownItem>
        <DropdownItem variant="destructive" icon={<X className="size-4" />}>
          Delete
        </DropdownItem>
      </DropdownMenu>
    </>
  );
}
