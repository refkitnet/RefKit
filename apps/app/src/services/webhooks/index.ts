import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  webhookDeliveries,
  webhookEndpoints,
  type WebhookDelivery,
  type WebhookEndpoint,
} from "@/db/schema";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
} from "@/lib/crypto";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { type ListParams, listWithCursor } from "@/lib/pagination";
import {
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
} from "@/lib/webhook-events";
import { requireAppAccess } from "@/services/scoping";

export { WEBHOOK_EVENT_TYPES };
export type { WebhookEventType };

type WebhookEventPayload = {
  id: string;
  type: WebhookEventType | "webhook.test";
  created_at: string;
  livemode: boolean;
  app_id: string;
  data: Record<string, unknown>;
};

type ConfigureWebhookInput = {
  url: string;
  enabledEvents: WebhookEventType[];
  enabled: boolean;
};

const RESPONSE_LIMIT = 2_000;
const DELIVERY_TIMEOUT_MS = 3_000;

function truncate(value: string | null): string | null {
  return value && value.length > RESPONSE_LIMIT
    ? value.slice(0, RESPONSE_LIMIT)
    : value;
}

async function readTruncatedResponse(response: Response) {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";

  while (result.length < RESPONSE_LIMIT) {
    const { done, value } = await reader.read();

    if (done) {
      result += decoder.decode();
      break;
    }

    result += decoder.decode(value, { stream: true });

    if (result.length >= RESPONSE_LIMIT) {
      await reader.cancel();
      break;
    }
  }

  return truncate(result) ?? "";
}

function createSecret() {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".").map(Number);

  if (
    parts.length !== 4
    || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }

  return parts;
}

function parseIpv6(address: string): number[] | null {
  if (!address.includes(":")) {
    return null;
  }

  const sections = address.split("::");

  if (sections.length > 2) {
    return null;
  }

  const parseSection = (section: string) => {
    if (!section) {
      return [];
    }

    const groups = section.split(":");

    if (groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) {
      return null;
    }

    return groups.map((group) => Number.parseInt(group, 16));
  };

  const left = parseSection(sections[0] ?? "");
  const right = parseSection(sections[1] ?? "");

  if (!left || !right) {
    return null;
  }

  if (sections.length === 1) {
    return left.length === 8 ? left : null;
  }

  const omitted = 8 - left.length - right.length;

  if (omitted < 1) {
    return null;
  }

  return [...left, ...Array<number>(omitted).fill(0), ...right];
}

function embeddedIpv4(groups: number[]) {
  const mapped = groups.slice(0, 5).every((group) => group === 0)
    && groups[5] === 0xffff;
  const compatible = groups.slice(0, 6).every((group) => group === 0);

  if (!mapped && !compatible) {
    return null;
  }

  return [
    groups[6]! >> 8,
    groups[6]! & 0xff,
    groups[7]! >> 8,
    groups[7]! & 0xff,
  ].join(".");
}

export function isPrivateNetworkAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const ipv4 = parseIpv4(normalized);

  if (ipv4) {
    const [a, b, c] = ipv4;
    return (
      a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 192 && b === 88 && c === 99)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113)
      || a >= 224
    );
  }

  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice("::ffff:".length);

    if (parseIpv4(mappedIpv4)) {
      return isPrivateNetworkAddress(mappedIpv4);
    }
  }

  const ipv6 = parseIpv6(normalized);

  if (!ipv6) {
    return false;
  }

  const embedded = embeddedIpv4(ipv6);

  if (embedded) {
    return isPrivateNetworkAddress(embedded);
  }

  const firstIpv6Group = ipv6[0]!;

  return (
    (firstIpv6Group >= 0xfc00 && firstIpv6Group <= 0xfdff)
    || (firstIpv6Group >= 0xfe80 && firstIpv6Group <= 0xfebf)
    || (firstIpv6Group >= 0xff00 && firstIpv6Group <= 0xffff)
  );
}

type ResolvedWebhookTarget = {
  url: string;
  address: string | null;
  family: 4 | 6 | null;
};

type WebhookResolver = typeof lookup;

export async function resolveWebhookTarget(
  rawUrl: string,
  resolver: WebhookResolver = lookup
): Promise<ResolvedWebhookTarget> {
  let url: URL;

  try {
    url = new URL(rawUrl);
  }
  catch {
    throw new AppError(
      "invalid_request",
      "invalid_webhook_url",
      "Webhook URL must be a valid HTTPS URL.",
      400
    );
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    throw new AppError(
      "invalid_request",
      "invalid_webhook_url",
      "Webhook URL must use HTTPS and cannot include credentials.",
      400
    );
  }

  if (getServerEnv().WEBHOOK_ALLOW_PRIVATE_NETWORKS === "true") {
    return { url: url.toString(), address: null, family: null };
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new AppError(
      "invalid_request",
      "private_webhook_url_blocked",
      "Webhook URL cannot target a private network address.",
      400
    );
  }

  let addresses: string[];

  if (isIP(hostname)) {
    addresses = [hostname];
  }
  else {
    try {
      addresses = (await resolver(hostname, { all: true, verbatim: true })).map(
        (result) => result.address
      );
    }
    catch {
      throw new AppError(
        "invalid_request",
        "webhook_host_unresolved",
        "Webhook URL host could not be resolved.",
        400
      );
    }
  }

  if (addresses.length === 0 || addresses.some(isPrivateNetworkAddress)) {
    throw new AppError(
      "invalid_request",
      "private_webhook_url_blocked",
      "Webhook URL cannot target a private network address.",
      400
    );
  }

  const address = addresses[0]!;
  const family = isIP(address);

  if (family !== 4 && family !== 6) {
    throw new AppError(
      "invalid_request",
      "webhook_host_unresolved",
      "Webhook URL host could not be resolved.",
      400
    );
  }

  return { url: url.toString(), address, family };
}

export async function assertWebhookUrlAllowed(rawUrl: string) {
  return (await resolveWebhookTarget(rawUrl)).url;
}

export function createPinnedLookup(
  address: string,
  family: 4 | 6
): LookupFunction {
  return (_hostname, options, callback) => {
    callback(
      null,
      options.all ? [{ address, family }] : address,
      family
    );
  };
}

async function findEndpoint(appId: string) {
  const db = getDb();
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.appId, appId))
    .limit(1);

  return endpoint ?? null;
}

export async function getWebhookEndpoint(userId: string, appId: string) {
  await requireAppAccess(userId, appId);
  return findEndpoint(appId);
}

export async function configureWebhookEndpoint(
  userId: string,
  appId: string,
  input: ConfigureWebhookInput
) {
  await requireAppAccess(userId, appId);
  const url = await assertWebhookUrlAllowed(input.url);
  const existing = await findEndpoint(appId);
  const db = getDb();

  if (existing) {
    const [updated] = await db
      .update(webhookEndpoints)
      .set({
        url,
        enabledEvents: input.enabledEvents,
        enabled: input.enabled,
        updatedAt: new Date(),
      })
      .where(eq(webhookEndpoints.id, existing.id))
      .returning();

    return { endpoint: updated!, secret: null };
  }

  const secret = createSecret();
  const [endpoint] = await db
    .insert(webhookEndpoints)
    .values({
      id: generateId(ID_PREFIXES.webhookEndpoint),
      appId,
      url,
      secretEncrypted: encryptWebhookSecret(secret),
      enabledEvents: input.enabledEvents,
      enabled: input.enabled,
    })
    .returning();

  return { endpoint: endpoint!, secret };
}

export async function deleteWebhookEndpoint(userId: string, appId: string) {
  await requireAppAccess(userId, appId);
  const db = getDb();
  await db.delete(webhookEndpoints).where(eq(webhookEndpoints.appId, appId));
}

export async function rotateWebhookSecret(userId: string, appId: string) {
  await requireAppAccess(userId, appId);
  const endpoint = await findEndpoint(appId);

  if (!endpoint) {
    throw new AppError(
      "not_found",
      "webhook_endpoint_not_found",
      "Webhook endpoint not found.",
      404
    );
  }

  const secret = createSecret();
  const db = getDb();
  const [updated] = await db
    .update(webhookEndpoints)
    .set({
      secretEncrypted: encryptWebhookSecret(secret),
      updatedAt: new Date(),
    })
    .where(eq(webhookEndpoints.id, endpoint.id))
    .returning();

  return { endpoint: updated!, secret };
}

export async function isWebhookSubscribed(
  appId: string,
  eventType: WebhookEventType
) {
  const endpoint = await findEndpoint(appId);
  return Boolean(
    endpoint?.enabled && endpoint.enabledEvents.includes(eventType)
  );
}

async function recordDelivery(input: {
  endpoint: WebhookEndpoint;
  payload: WebhookEventPayload;
  success: boolean;
  httpStatus: number | null;
  response: string | null;
  error: string | null;
}) {
  const db = getDb();
  const [delivery] = await db
    .insert(webhookDeliveries)
    .values({
      id: generateId(ID_PREFIXES.webhookDelivery),
      webhookEndpointId: input.endpoint.id,
      appId: input.endpoint.appId,
      eventId: input.payload.id,
      eventType: input.payload.type,
      payload: input.payload,
      success: input.success,
      httpStatus: input.httpStatus,
      response: truncate(input.response),
      error: truncate(input.error),
    })
    .returning();

  return delivery!;
}

function readTruncatedIncomingResponse(response: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const decoder = new TextDecoder();
    let result = "";
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(truncate(result + decoder.decode()) ?? "");
    };

    response.on("data", (chunk: Buffer) => {
      if (settled) {
        return;
      }

      result += decoder.decode(chunk, { stream: true });

      if (result.length >= RESPONSE_LIMIT) {
        response.destroy();
        finish();
      }
    });
    response.on("end", finish);
    response.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

function postPinnedWebhook(input: {
  target: ResolvedWebhookTarget;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}) {
  if (!input.target.address || !input.target.family) {
    throw new Error("A validated webhook address is required.");
  }

  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpsRequest(
      input.target.url,
      {
        method: "POST",
        headers: {
          ...input.headers,
          "Content-Length": Buffer.byteLength(input.body).toString(),
        },
        lookup: createPinnedLookup(input.target.address!, input.target.family!),
        signal: input.signal,
      },
      (response) => {
        readTruncatedIncomingResponse(response)
          .then((body) => {
            resolve({ status: response.statusCode ?? 0, body });
          })
          .catch(reject);
      }
    );

    request.on("error", reject);
    request.end(input.body);
  });
}

async function deliver(endpoint: WebhookEndpoint, payload: WebhookEventPayload) {
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const secret = decryptWebhookSecret(endpoint.secretEncrypted);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  const headers = {
    "Content-Type": "application/json",
    "X-RefKit-Webhook-Id": payload.id,
    "X-RefKit-Webhook-Event": payload.type,
    "X-RefKit-Webhook-Timestamp": timestamp,
    "X-RefKit-Webhook-Signature": `v1=${signature}`,
    "X-RefKit-Webhook-Version": "1",
  };

  try {
    const target = await resolveWebhookTarget(endpoint.url);

    if (target.address && target.family) {
      const response = await postPinnedWebhook({
        target,
        headers,
        body: rawBody,
        signal: controller.signal,
      });
      httpStatus = response.status;
      responseBody = response.body;
    }
    else {
      const response = await fetch(target.url, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers,
        body: rawBody,
      });
      httpStatus = response.status;
      responseBody = await readTruncatedResponse(response);
    }

    if (httpStatus < 200 || httpStatus >= 300) {
      errorMessage = `Webhook endpoint returned HTTP ${httpStatus}.`;
    }
  }
  catch (error) {
    errorMessage = controller.signal.aborted
      ? "Webhook request timed out after 3 seconds."
      : error instanceof Error
        ? error.message
        : "Webhook request failed.";
  }
  finally {
    clearTimeout(timeout);
  }

  return recordDelivery({
    endpoint,
    payload,
    success: httpStatus !== null && httpStatus >= 200 && httpStatus < 300,
    httpStatus,
    response: responseBody,
    error: errorMessage,
  });
}

function buildPayload(input: {
  appId: string;
  eventType: WebhookEventType | "webhook.test";
  livemode: boolean;
  data: Record<string, unknown>;
}): WebhookEventPayload {
  return {
    id: generateId(ID_PREFIXES.webhookEvent),
    type: input.eventType,
    created_at: new Date().toISOString(),
    livemode: input.livemode,
    app_id: input.appId,
    data: input.data,
  };
}

export async function emitWebhookEvent(input: {
  appId: string;
  eventType: WebhookEventType;
  livemode: boolean;
  data: Record<string, unknown>;
}) {
  try {
    const endpoint = await findEndpoint(input.appId);

    if (
      !endpoint?.enabled
      || !endpoint.enabledEvents.includes(input.eventType)
    ) {
      return null;
    }

    return await deliver(endpoint, buildPayload(input));
  }
  catch (error) {
    console.error("Outgoing webhook delivery failed before it was recorded.", error);
    return null;
  }
}

export async function sendTestWebhook(userId: string, appId: string) {
  await requireAppAccess(userId, appId);
  const endpoint = await findEndpoint(appId);

  if (!endpoint) {
    throw new AppError(
      "not_found",
      "webhook_endpoint_not_found",
      "Webhook endpoint not found.",
      404
    );
  }

  return deliver(
    endpoint,
    buildPayload({
      appId,
      eventType: "webhook.test",
      livemode: true,
      data: { message: "RefKit test webhook" },
    })
  );
}

export async function listWebhookDeliveries(
  userId: string,
  appId: string,
  params: ListParams
) {
  await requireAppAccess(userId, appId);

  return listWithCursor<WebhookDelivery>({
    table: webhookDeliveries,
    columns: {
      id: webhookDeliveries.id,
      createdAt: webhookDeliveries.createdAt,
    },
    where: eq(webhookDeliveries.appId, appId),
    limit: params.limit ?? 25,
    startingAfter: params.startingAfter,
  });
}

export function serializeWebhookEndpoint(endpoint: WebhookEndpoint) {
  return {
    id: endpoint.id,
    app_id: endpoint.appId,
    url: endpoint.url,
    enabled_events: endpoint.enabledEvents,
    enabled: endpoint.enabled,
    created_at: endpoint.createdAt.toISOString(),
    updated_at: endpoint.updatedAt.toISOString(),
  };
}

export function serializeWebhookDelivery(delivery: WebhookDelivery) {
  return {
    id: delivery.id,
    event_id: delivery.eventId,
    event_type: delivery.eventType,
    payload: delivery.payload,
    success: delivery.success,
    http_status: delivery.httpStatus,
    response: delivery.response,
    error: delivery.error,
    created_at: delivery.createdAt.toISOString(),
    updated_at: delivery.updatedAt.toISOString(),
  };
}
