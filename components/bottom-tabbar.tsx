"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChatBubbleIcon, ClockIcon, GearIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { useI18n } from "@/lib/use-i18n";

const TABS = [
  { href: "/", labelKey: "tabs.query", icon: MagnifyingGlassIcon, isActive: (pathname: string) => pathname === "/" },
  { href: "/translate", labelKey: "tabs.translate", icon: ChatBubbleIcon, isActive: (pathname: string) => pathname.startsWith("/translate") },
  { href: "/history", labelKey: "tabs.history", icon: ClockIcon, isActive: (pathname: string) => pathname.startsWith("/history") },
  { href: "/settings", labelKey: "tabs.settings", icon: GearIcon, isActive: (pathname: string) => pathname.startsWith("/settings") }
] as const;

export function BottomTabbar() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="app-bottom-nav" aria-label={t("nav.bottom")}>
      <div className="app-bottom-nav-inner">
        {TABS.map(({ href, labelKey, icon: Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`app-bottom-nav-item${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon />
              <span>{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
