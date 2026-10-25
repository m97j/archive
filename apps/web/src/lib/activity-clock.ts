/** Hidden tabs never count as reading; reported durations are rounded down to five seconds. */
export function createActivityClock(now: number, visible: boolean) {
  let previous = now;
  let running = visible;
  let unreported = 0;
  const advance = (at: number) => {
    const next = Math.max(previous, at);
    if (running) unreported += next - previous;
    previous = next;
  };
  return {
    setVisible(at: number, active: boolean) {
      advance(at);
      running = active;
    },
    takeSeconds(at: number): number {
      advance(at);
      const seconds = Math.min(600, Math.floor(unreported / 5000) * 5);
      unreported -= seconds * 1000;
      return seconds;
    },
    reset(at: number) {
      advance(at);
      unreported = 0;
    },
  };
}

/** Only pathnames go to server-side publication lookup, never query strings or fragments. */
export function isActivityPublicPath(path: string): boolean {
  return (
    path.length <= 240 &&
    /^\/(?:ko|en|ja|zh|es|fr|de)(?:\/[\w\-/.%]+)?$/.test(path) &&
    !path.includes("..") &&
    !/%(?:2f|5c|2e|25)/i.test(path) &&
    !path
      .split("/")
      .some((part) =>
        ["admin", "login", "api", "cms", "studio", "privacy", "auth", "sign-in"].includes(
          part.toLowerCase(),
        ),
      )
  );
}
