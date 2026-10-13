import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));
const createClient = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn());
const cookieStore = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: createClient }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("@/lib/csrf.server", () => ({ assertSameOriginAction: vi.fn() }));

import { loginAction, logoutAction } from "@/app/[locale]/admin/auth-actions";
import { getAdminSession, getDevelopmentAdminToken, hasAdminRole } from "@/lib/admin-auth.server";
import { supabaseCookieOptions } from "@/lib/supabase/cookie-options";
import nextConfig from "../../next.config";
import AdminEntryPage from "@/app/admin/page";
import LoginEntryPage from "@/app/login/page";
import robots from "@/app/robots";
import { defaultLocale } from "@/lib/routing";
import { createSessionPolicy, encodeSessionPolicy } from "@/lib/session-policy";

const adminClaims = {
  sub: "fixture-admin",
  email: "owner@example.test",
  role: "authenticated",
  app_metadata: { roles: ["archive_admin"] },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ARCHIVE_DEV_ADMIN_ACCESS_TOKEN", "");
  vi.stubEnv("PUBLISHER_ROLE", "archive_admin");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture-publishable");
  vi.stubEnv("NEXT_PUBLIC_DEFAULT_LOCALE", "ko");
  vi.stubEnv("CMS_SESSION_SECRET", "fixture-session-signing-secret-at-least-32-characters");
  vi.stubEnv("CMS_COOKIE_MODE", "embedded");
  cookieStore.get.mockReturnValue({
    value: encodeSessionPolicy(createSessionPolicy("fixture-admin", true)),
  });
  auth.getClaims.mockResolvedValue({ data: { claims: adminClaims }, error: null });
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "fixture-token" } } });
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
  createClient.mockResolvedValue({ auth });
});

afterEach(() => vi.unstubAllEnvs());

describe("authoring authorization", () => {
  it("uses signed provider metadata, not user-controlled metadata", () => {
    expect(hasAdminRole(adminClaims)).toBe(true);
    expect(
      hasAdminRole({ role: "authenticated", user_metadata: { roles: ["archive_admin"] } }),
    ).toBe(false);
  });

  it("supports configured signed-role claims consistently with the API", () => {
    vi.stubEnv("PUBLISHER_ROLE", "custom_editor");
    expect(hasAdminRole({ roles: ["custom_editor"] })).toBe(true);
    expect(hasAdminRole({ role: "custom_editor" })).toBe(true);
    expect(hasAdminRole(adminClaims)).toBe(false);
  });

  it("rejects malformed role metadata", () => {
    expect(hasAdminRole({ app_metadata: { roles: "archive_admin" } })).toBe(false);
    expect(hasAdminRole({ app_metadata: null })).toBe(false);
    expect(hasAdminRole({ roles: [null, 4, "authenticated"] })).toBe(false);
  });

  it("returns a session only after successful claim validation and role verification", async () => {
    await expect(getAdminSession()).resolves.toEqual({
      accessToken: "fixture-token",
      email: "owner@example.test",
      source: "supabase",
    });
    auth.getClaims.mockResolvedValue({ data: { claims: { role: "authenticated" } }, error: null });
    await expect(getAdminSession()).resolves.toBeUndefined();
    expect(auth.getSession).toHaveBeenCalledTimes(1);
  });

  it("rejects claim errors even when stale claim data is supplied", async () => {
    auth.getClaims.mockResolvedValue({
      data: { claims: adminClaims },
      error: { message: "invalid" },
    });
    await expect(getAdminSession()).resolves.toBeUndefined();
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("never uses a development token in production", async () => {
    vi.stubEnv("ARCHIVE_DEV_ADMIN_ACCESS_TOKEN", "fixture-development-token");
    expect(getDevelopmentAdminToken()).toBeUndefined();
    await expect(getAdminSession()).resolves.toMatchObject({ source: "supabase" });
  });

  it("does not return an absent access token", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(getAdminSession()).resolves.toBeUndefined();
  });
  it("rejects missing or tampered persistence policies before contacting Auth", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await expect(getAdminSession()).resolves.toBeUndefined();
    cookieStore.get.mockReturnValue({ value: "tampered.policy" });
    await expect(getAdminSession()).resolves.toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
  });
  it("binds the signed policy to the verified account subject", async () => {
    cookieStore.get.mockReturnValue({
      value: encodeSessionPolicy(createSessionPolicy("another-owner", true)),
    });
    await expect(getAdminSession()).resolves.toBeUndefined();
    expect(auth.getSession).not.toHaveBeenCalled();
  });
});

function loginForm(email = " owner@example.test ", password = " untouched password ") {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  form.set("locale", "ko");
  return form;
}

describe("owner login actions", () => {
  it("trims the email but never changes the original password", async () => {
    await loginAction({}, loginForm());
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.test",
      password: " untouched password ",
    });
    expect(redirect).toHaveBeenCalledWith("/ko/admin");
  });

  it("rejects a non-admin account without retaining that session or revealing role details", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { role: "authenticated" } }, error: null });
    await expect(loginAction({}, loginForm())).resolves.toEqual({
      error: "The email or password was not accepted.",
    });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not bypass rejected or missing signed claims", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: { message: "invalid" } });
    await expect(loginAction({}, loginForm())).resolves.toHaveProperty("error");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("keeps provider error details private", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: "private-provider-message" } });
    await expect(loginAction({}, loginForm())).resolves.toEqual({
      error: "The email or password was not accepted.",
    });
    expect(auth.getClaims).not.toHaveBeenCalled();
  });

  it("limits oversized form values before contacting the provider", async () => {
    await expect(loginAction({}, loginForm("x".repeat(255)))).resolves.toHaveProperty("error");
    await expect(
      loginAction({}, loginForm("owner@example.test", "x".repeat(1025))),
    ).resolves.toHaveProperty("error");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("logs out only this device's session and rejects arbitrary locale redirects", async () => {
    const form = new FormData();
    form.set("locale", "https://example.test");
    await logoutAction(form);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(redirect).toHaveBeenCalledWith("/ko/admin/login");
  });
  it("defaults to a browser session, and only persists on an explicit remember choice", async () => {
    await loginAction({}, loginForm());
    expect(createClient).toHaveBeenLastCalledWith(false);
    expect(cookieStore.set).toHaveBeenLastCalledWith(
      "archive-cms-session-policy",
      expect.any(String),
      expect.not.objectContaining({ maxAge: expect.anything() }),
    );
    const remembered = loginForm();
    remembered.set("remember", "on");
    await loginAction({}, remembered);
    expect(createClient).toHaveBeenLastCalledWith(true);
    expect(cookieStore.set).toHaveBeenLastCalledWith(
      "archive-cms-session-policy",
      expect.any(String),
      expect.objectContaining({
        maxAge: expect.any(Number),
        httpOnly: true,
        secure: true,
        sameSite: "none",
        partitioned: true,
      }),
    );
  });
});

describe("server-only session boundary", () => {
  it("uses HttpOnly HTTPS-only cookies in production", () => {
    expect(supabaseCookieOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      partitioned: true,
    });
  });

  it("allows plain HTTP only for local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(supabaseCookieOptions()).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });
  });

  it("keeps the private studio uncacheable and permits only the official HF parent frame", async () => {
    const groups = await nextConfig.headers?.();
    expect(groups?.map(({ source }) => source)).toEqual(["/:path*"]);
    for (const group of groups ?? []) {
      const headers = Object.fromEntries(group.headers.map(({ key, value }) => [key, value]));
      expect(headers["Cache-Control"]).toBe("private, no-store");
      expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow, noarchive");
      expect(headers["X-Frame-Options"]).toBeUndefined();
      expect(headers["Content-Security-Policy"]).toContain(
        "frame-ancestors 'self' https://huggingface.co",
      );
      expect(headers["Content-Security-Policy"]).not.toContain("*");
    }
  });

  it("redirects short entry URLs to the configured, validated locale without reading a session", () => {
    AdminEntryPage();
    expect(redirect).toHaveBeenLastCalledWith("/ko/admin");
    LoginEntryPage();
    expect(redirect).toHaveBeenLastCalledWith("/ko/admin/login");
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_LOCALE", "en");
    LoginEntryPage();
    expect(redirect).toHaveBeenLastCalledWith("/en/admin/login");
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_LOCALE", "https://example.test");
    expect(defaultLocale()).toBe("ko");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("excludes the entire private studio from crawlers", () => {
    const rules = robots().rules;
    expect(rules).toMatchObject({ userAgent: "*", disallow: "/" });
  });
});
