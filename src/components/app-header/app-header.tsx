import { SiteHeader, ThemeToggle } from "@jakoblui-works/shared-ui";
import { Link } from "@tanstack/react-router";
import type { MouseEvent } from "react";

type AppHeaderProps = {
  /** Called when the home link is clicked, for a page whose state the link alone wouldn't reset (it's already `/`). */
  onHome?: () => void;
};

// The shared header as this site shows it, used by every page. The right-hand side is the site's
// own (a menu, a toggle); it's empty until the site needs one.
export const AppHeader = ({ onHome }: AppHeaderProps) => {
  // Only a plain click stays in this tab; one that opens a new tab or window must leave this page as it is.
  const home = (e: MouseEvent) => {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) onHome?.();
  };
  return (
    <SiteHeader current="ats" homeLink={<Link to="/" onClick={home} />} className="bg-surface">
      <ThemeToggle />
    </SiteHeader>
  );
};
