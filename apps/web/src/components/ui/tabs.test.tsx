import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Tab, Tabs, TabsContent, TabsList } from "./tabs";

function ControlledTabs() {
  const [value, setValue] = useState("all");
  return (
    <Tabs value={value} onValueChange={setValue}>
      <TabsList>
        <Tab value="all">All</Tab>
        <Tab value="backlog">Backlog</Tab>
        <Tab value="wishlist">Wishlist</Tab>
      </TabsList>
      <TabsContent value="all">All games</TabsContent>
      <TabsContent value="backlog">Backlog games</TabsContent>
      <TabsContent value="wishlist">Wishlist games</TabsContent>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("renders role=tablist and role=tab with correct aria-selected", () => {
    render(<ControlledTabs />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Backlog" })).toHaveAttribute("aria-selected", "false");
  });

  it("moves selection with ArrowRight/ArrowLeft (roving tabindex)", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs />);

    screen.getByRole("tab", { name: "All" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Backlog" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows only the active panel's content, hides the others", () => {
    render(<ControlledTabs />);
    expect(screen.getByText("All games")).toBeVisible();
    expect(screen.queryByText("Backlog games")).not.toBeInTheDocument();
    expect(screen.queryByText("Wishlist games")).not.toBeInTheDocument();
  });

  it("clicking a tab updates aria-selected and swaps the visible panel", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs />);

    await user.click(screen.getByRole("tab", { name: "Wishlist" }));

    expect(screen.getByRole("tab", { name: "Wishlist" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Wishlist games")).toBeVisible();
    expect(screen.queryByText("All games")).not.toBeInTheDocument();
  });
});
