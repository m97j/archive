import { X509Certificate } from "node:crypto";
import { describe, expect, it } from "vitest";

import { databasePoolConfig } from "./runtime-config.js";

const remote = "postgresql://postgres.ref:dummy@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";

describe("database runtime configuration", () => {
  it("permits a local developer database without TLS", () => {
    expect(databasePoolConfig("postgresql://postgres:dummy@127.0.0.1:54322/postgres", {}).ssl).toBe(
      false,
    );
  });
  it("uses the public Supabase root with hostname/certificate verification", () => {
    const config = databasePoolConfig(remote, {});
    expect(config.ssl).toMatchObject({ rejectUnauthorized: true });
    if (typeof config.ssl !== "object" || typeof config.ssl.ca !== "string")
      throw new Error("Missing CA");
    const certificate = new X509Certificate(config.ssl.ca);
    expect(certificate.ca).toBe(true);
    expect(certificate.subject).toContain("Supabase Root 2021 CA");
    expect(certificate.verify(certificate.publicKey)).toBe(true);
  });
  it("removes URL SSL options before pg can overwrite its trusted CA", () => {
    const config = databasePoolConfig(
      `${remote}?sslmode=require&sslrootcert=ignored&application_name=test`,
      {},
    );
    expect(config.connectionString).not.toContain("sslmode");
    expect(config.connectionString).not.toContain("sslrootcert");
    expect(config.connectionString).toContain("application_name=test");
    expect(config.ssl).toMatchObject({ rejectUnauthorized: true });
  });
  it("does not trust the Supabase CA for lookalike hosts", () => {
    expect(
      databasePoolConfig("postgresql://user:dummy@pooler.supabase.com.attacker.test:5432/db", {})
        .ssl,
    ).toEqual({ rejectUnauthorized: true });
  });
  it("rejects remote verification bypasses in either configuration source", () => {
    expect(() => databasePoolConfig(remote, { DATABASE_SSL_MODE: "disable" })).toThrow(
      "verify-full",
    );
    expect(() => databasePoolConfig(`${remote}?sslmode=no-verify`, {})).toThrow("verification");
    expect(() => databasePoolConfig(`${remote}?sslmode=disable`, {})).toThrow("verification");
  });
  it("accepts a public inline CA and rejects conflicting or private inputs", () => {
    const config = databasePoolConfig(remote, {});
    if (typeof config.ssl !== "object" || typeof config.ssl.ca !== "string")
      throw new Error("Missing CA");
    const ca = config.ssl.ca;
    expect(databasePoolConfig(remote, { DATABASE_SSL_CA: ca.replace(/\n/g, "\\n") }).ssl).toEqual(
      config.ssl,
    );
    expect(() =>
      databasePoolConfig(remote, { DATABASE_SSL_CA: ca, DATABASE_SSL_CA_FILE: "dummy" }),
    ).toThrow("not both");
    expect(() =>
      databasePoolConfig(remote, { DATABASE_SSL_CA: "-----BEGIN PRIVATE KEY-----" }),
    ).toThrow("public CA");
    expect(() => databasePoolConfig(remote, { DATABASE_SSL_CA_FILE: "nonexistent" })).toThrow(
      "could not be read",
    );
  });
  it("bounds pool use and timeouts and rejects malformed numbers", () => {
    expect(databasePoolConfig(remote, { DATABASE_POOL_MAX: "2" })).toMatchObject({
      max: 2,
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
    });
    for (const value of ["0", "-1", "NaN", "1.5", "1e4", "9007199254740992"]) {
      expect(() => databasePoolConfig(remote, { DATABASE_POOL_MAX: value })).toThrow(
        "positive integer",
      );
    }
  });
  it("preserves the encoded password and other URL parameters", () => {
    const url = "postgresql://postgres:p%40ss%3Aword@db.ref.supabase.co:5432/postgres?options=abc";
    const config = databasePoolConfig(url, {});
    expect(new URL(config.connectionString).password).toBe("p%40ss%3Aword");
    expect(new URL(config.connectionString).searchParams.get("options")).toBe("abc");
  });
  it("reports invalid configuration without the credential-bearing input", () => {
    expect(() => databasePoolConfig("this is a dummy password", {})).toThrow("valid PostgreSQL");
    expect(() => databasePoolConfig("https://user:dummy@example.test", {})).toThrow(
      "valid PostgreSQL",
    );
  });
});
