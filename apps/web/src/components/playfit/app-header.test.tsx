import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "./app-header";

const mocks = vi.hoisted(() => ({
  routerBack: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <span {...props} />,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: mocks.routerBack, push: mocks.routerPush }),
}));

vi.mock("./desktop-app-nav", () => ({
  DesktopAppNav: ({ picksCount }: { picksCount: number }) => <nav>picks:{picksCount}</nav>,
}));

describe("AppHeader", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the route title and shared brand without duplicating markup", () => {
    render(<AppHeader pathname="/picks" headerConfig={{}} picksCount={2} />);

    expect(screen.getByText("Saved Picks")).toBeInTheDocument();
    expect(screen.getByText("Playfit")).toBeInTheDocument();
    expect(screen.getByText("picks:2")).toBeInTheDocument();
  });

  it("uses the configured back action for contextual screens", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <AppHeader pathname="/settings" headerConfig={{ title: "Account", onBack }} picksCount={0} />,
    );

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalledOnce();
  });

  it("routes back to the landing when a game is opened directly", async () => {
    const user = userEvent.setup();
    render(<AppHeader pathname="/game/game-1" headerConfig={{}} picksCount={0} />);

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(mocks.routerPush).toHaveBeenCalledWith("/");
  });
});
