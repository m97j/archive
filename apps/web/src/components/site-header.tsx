"use client";

import type { Locale, Space } from "@archive/contracts";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { siteCopy } from "@/lib/site-copy";
import styles from "./site-header.module.css";

const subscribe = () => () => {};

type NavigationItem = { href: string; label: string; active: boolean };

function NavigationLinks({
  items,
  onNavigate,
}: {
  items: NavigationItem[];
  onNavigate?: () => void;
}) {
  return items.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={item.active ? "page" : undefined}
      onClick={() => onNavigate?.()}
    >
      {item.label}
    </Link>
  ));
}

function MobileNavigation({ items, locale }: { items: NavigationItem[]; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const navigationId = useId();
  const isKorean = locale === "ko";

  useEffect(() => {
    if (!open) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", dismissOnEscape);
    document.addEventListener("pointerdown", dismissOutside);
    return () => {
      document.removeEventListener("keydown", dismissOnEscape);
      document.removeEventListener("pointerdown", dismissOutside);
    };
  }, [open]);

  return (
    <div
      className={styles.mobileMenu}
      ref={wrapper}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className={`${styles.iconButton} ${styles.menuButton}`}
        ref={button}
        aria-label={
          isKorean ? (open ? "메뉴 닫기" : "메뉴 열기") : open ? "Close menu" : "Open menu"
        }
        aria-expanded={open}
        aria-controls={navigationId}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d={open ? "M6 6l12 12M6 18L18 6" : "M5 8h14M5 16h14"} />
        </svg>
      </button>
      {open ? (
        <nav
          id={navigationId}
          className={`${styles.mobileNavigation} primary-nav`}
          aria-label={siteCopy(locale).navigation}
        >
          <NavigationLinks items={items} onNavigate={() => setOpen(false)} />
        </nav>
      ) : null}
    </div>
  );
}

export function SiteHeader({ locale }: { locale: Locale; spaces: readonly Space[] }) {
  const path = usePathname();
  const router = useRouter();
  const copy = siteCopy(locale);
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const isLight = !mounted || resolvedTheme === "light";
  const prefix = `/${locale}`;
  const workPath = `${prefix}/spaces/work`;
  const aboutPath = `${prefix}/spaces/about`;
  const archivePath = `${prefix}/archive`;
  const isWork = path === workPath || path.startsWith(`${workPath}/`);
  const isAbout = path === aboutPath || path.startsWith(`${aboutPath}/`);
  const isAdmin = path === `${prefix}/admin` || path.startsWith(`${prefix}/admin/`);
  const isArchive = path !== prefix && path !== `${prefix}/` && !isWork && !isAbout && !isAdmin;
  const items: NavigationItem[] = [
    { href: workPath, label: copy.spaces.WORK, active: isWork },
    { href: archivePath, label: locale === "ko" ? "아카이브" : "Archive", active: isArchive },
    { href: aboutPath, label: copy.spaces.ABOUT, active: isAbout },
  ];

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const openArchive = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "k")
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest("input, textarea, select, [role='textbox']"))
      )
        return;
      event.preventDefault();
      router.push(archivePath);
    };
    document.addEventListener("keydown", openArchive);
    return () => document.removeEventListener("keydown", openArchive);
  }, [archivePath, router]);

  return (
    <header className={styles.header}>
      <Link className={styles.brand} href={prefix} aria-label={`Marchivej · ${copy.home}`}>
        <Image
          className={styles.signature}
          src="/brand/signature.png"
          width={42}
          height={42}
          alt=""
          loading="eager"
        />
        <span className={styles.brandName}>
          marchivej<span aria-hidden="true">.</span>
        </span>
      </Link>
      <nav className={`${styles.desktopNavigation} primary-nav`} aria-label={copy.navigation}>
        <NavigationLinks items={items} />
      </nav>
      <div className={styles.tools}>
        <Link
          className={styles.iconButton}
          href={archivePath}
          aria-label={copy.search}
          aria-keyshortcuts="Control+k Meta+k"
          title={`${copy.search} · ⌘ / Ctrl K`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.3" />
            <path d="m15.5 15.5 4 4" />
          </svg>
        </Link>
        <Link
          className={`${styles.iconButton} ${styles.language}`}
          href={locale === "ko" ? "/en" : "/ko"}
          hrefLang={locale === "ko" ? "en" : "ko"}
          aria-label={copy.language}
          title={copy.language}
        >
          {locale === "ko" ? "EN" : "KO"}
        </Link>
        <button
          className={styles.iconButton}
          type="button"
          disabled={!mounted}
          onClick={() => setTheme(isLight ? "dark" : "light")}
          aria-label={isLight ? copy.dark : copy.light}
          title={isLight ? copy.dark : copy.light}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {isLight ? (
              <path d="M20.4 14.4A8.7 8.7 0 0 1 9.6 3.6a8.7 8.7 0 1 0 10.8 10.8Z" />
            ) : (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
              </>
            )}
          </svg>
        </button>
        <MobileNavigation key={path} items={items} locale={locale} />
      </div>
    </header>
  );
}
