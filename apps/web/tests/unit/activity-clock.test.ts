import { describe, expect, it } from "vitest";
import { createActivityClock, isActivityPublicPath } from "@/lib/activity-clock";

describe("minimal visible reading measurements", () => {
  it("does not count hidden tab time, resumes and reports only coarse deltas", () => {
    const clock = createActivityClock(0, true);
    expect(clock.takeSeconds(6200)).toBe(5);
    clock.setVisible(7000, false);
    expect(clock.takeSeconds(90_000)).toBe(0);
    clock.setVisible(90_000, true);
    expect(clock.takeSeconds(93_000)).toBe(5);
    expect(clock.takeSeconds(93_000)).toBe(0);
  });
  it("never creates negative duration after a clock adjustment", () => {
    const clock = createActivityClock(100, true);
    expect(clock.takeSeconds(90)).toBe(0);
    expect(clock.takeSeconds(5100)).toBe(5);
  });
  it("bounds individual reports", () => {
    expect(createActivityClock(0, true).takeSeconds(3600_000)).toBe(600);
  });
  it("does not attribute one section's fractional time to the next section", () => {
    const clock = createActivityClock(0, true);
    expect(clock.takeSeconds(3000)).toBe(0);
    clock.reset(3000);
    expect(clock.takeSeconds(5000)).toBe(0);
    expect(clock.takeSeconds(8000)).toBe(5);
  });
  it("rejects query strings, fragments, admin and encoded traversal paths", () => {
    expect(isActivityPublicPath("/ko/docs/retrieval")).toBe(true);
    for (const path of [
      "/ko/docs?q=email",
      "/en/docs#private",
      "/ko/admin/new",
      "/ko/privacy",
      "/ko/%2e%2e",
      "/ko/../x",
      "/api/telemetry",
      "https://external.test/ko",
    ])
      expect(isActivityPublicPath(path)).toBe(false);
  });
});
