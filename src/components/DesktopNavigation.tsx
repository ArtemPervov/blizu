import { useLayoutEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useI18n, useUiText } from "../lib";
import { orderHelpPath } from "../market-copy";

export function DesktopNavigation({
  deliveryEnabled,
}: {
  deliveryEnabled: boolean;
}) {
  const { t, language } = useI18n();
  const tr = useUiText();
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const positionUnderline = () => {
      const activeLabel = nav.querySelector('[aria-current="page"] > span');
      const label = activeLabel?.getBoundingClientRect();
      if (!label?.width) {
        nav.style.setProperty("--nav-underline-opacity", "0");
        return;
      }

      const offset = label.left - nav.getBoundingClientRect().left;
      nav.style.setProperty("--nav-underline-offset", `${offset}px`);
      nav.style.setProperty("--nav-underline-width", `${label.width}px`);
      nav.style.setProperty("--nav-underline-opacity", "1");
    };

    positionUnderline();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(positionUnderline);
    // Link widths can change independently when the font or language changes.
    observer.observe(nav);
    nav.querySelectorAll("a").forEach((link) => observer.observe(link));
    return () => observer.disconnect();
  }, [pathname, language, deliveryEnabled]);

  return (
    <nav
      ref={navRef}
      className="desktop-nav"
      aria-label={tr("Основная навигация")}
    >
      <NavLink to="/" end>
        <span>{t.services}</span>
      </NavLink>
      <NavLink to="/requests">
        <span>{t.requestsShort}</span>
      </NavLink>
      <NavLink to={deliveryEnabled ? "/delivery" : orderHelpPath}>
        <span>{deliveryEnabled ? t.delivery : t.orderHelp}</span>
      </NavLink>
    </nav>
  );
}
