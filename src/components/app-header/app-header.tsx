import { SiteHeader, ThemeToggle } from "@jakoblui-works/shared-ui";
import { Link } from "@tanstack/react-router";

// The shared header as this site shows it, used by every page. The right-hand side is the site's
// own (a menu, a toggle); it's empty until the site needs one.
export const AppHeader = () => {
  return (
    <SiteHeader current="ats" homeLink={<Link to="/" />}>
      <ThemeToggle />
    </SiteHeader>
  );
};
