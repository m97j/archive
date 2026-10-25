import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";

const UUID = "^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$";
const TYPES = ["page_view", "page_leave", "navigation"] as const;
const LIMIT = 48;
const DOMAIN = "archive:telemetry:v1\0";

export interface ActivityBatch {
  schemaVersion: 1;
  policyVersion: string;
  subjectId: string;
  sessionId: string;
  batchId: string;
  consentedAt: string;
  events: { id: string; type: (typeof TYPES)[number]; path: string; seconds?: number }[];
}

export function activitySignature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(DOMAIN).update(body).digest("hex");
}

export function validateActivityBatch(
  batch: ActivityBatch,
  policy: string,
  now = Date.now(),
): boolean {
  const consented = Date.parse(batch.consentedAt);
  if (
    batch.policyVersion !== policy ||
    !Number.isFinite(consented) ||
    consented > now + 60_000 ||
    now - consented > 30 * 86400_000 ||
    !batch.events.length ||
    batch.events.length > LIMIT
  )
    return false;
  return batch.events.every(
    (event) =>
      /^\/(?:ko|en|ja|zh|es|fr|de)(?:\/[a-zA-Z0-9_\-/.%]+)?$/.test(event.path) &&
      !event.path
        .split("/")
        .some((segment) =>
          ["admin", "login", "api", "cms", "studio"].includes(segment.toLowerCase()),
        ) &&
      !event.path.includes("..") &&
      !/%(?:2f|5c|2e|25)/i.test(event.path),
  );
}

export interface PrivateActivitySink {
  preserve(batch: ActivityBatch): Promise<void>;
}

/** Collection is deliberately unavailable until the operator enables the complete reviewed policy. */
export function registerTelemetryRoutes(
  app: FastifyInstance,
  options: {
    enabled?: boolean;
    policy?: string;
    secret?: string;
    sink?: PrivateActivitySink;
  } = {},
): void {
  // Retired production v1: raw activity must not be committed to Dataset Git history.
  // An explicitly injected local test sink remains available for compatibility tests.
  const enabled = options.enabled ?? false;
  const secret = options.secret;
  const policy = options.policy ?? process.env.ANALYTICS_POLICY_VERSION ?? "2026-10-13";
  const sink = options.sink;
  app.post<{ Body: ActivityBatch }>(
    "/v1/telemetry/batches",
    {
      bodyLimit: 65536,
      schema: {
        body: Type.Object(
          {
            schemaVersion: Type.Literal(1),
            policyVersion: Type.String({ pattern: "^[a-zA-Z0-9_-]{1,40}$" }),
            subjectId: Type.String({ pattern: UUID }),
            sessionId: Type.String({ pattern: UUID }),
            batchId: Type.String({ pattern: UUID }),
            consentedAt: Type.String({ format: "date-time" }),
            events: Type.Array(
              Type.Object(
                {
                  id: Type.String({ pattern: UUID }),
                  type: Type.Union(TYPES.map((type) => Type.Literal(type))),
                  path: Type.String({ maxLength: 240 }),
                  seconds: Type.Optional(Type.Integer({ minimum: 0, maximum: 600 })),
                },
                { additionalProperties: false },
              ),
              { minItems: 1, maxItems: LIMIT },
            ),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      if (!enabled || !secret || !sink) return reply.code(404).send({ error: "Not found" });
      const supplied = request.headers["x-archive-activity-signature"];
      const expected = activitySignature(JSON.stringify(request.body), secret);
      if (
        typeof supplied !== "string" ||
        !/^[a-f0-9]{64}$/.test(supplied) ||
        !timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"))
      )
        return reply.code(401).send({ error: "Activity authorization required" });
      if (!validateActivityBatch(request.body, policy))
        return reply.code(400).send({ error: "Activity batch rejected" });
      try {
        await sink.preserve(request.body);
        // A successful response means the private durable copy exists, not an ephemeral buffer.
        return reply.code(201).send({ preserved: true });
      } catch {
        return reply.code(503).send({ error: "Private storage unavailable" });
      }
    },
  );
}
