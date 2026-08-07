import { createHmac, timingSafeEqual } from "crypto";
import { getServerEnv } from "@/lib/env";

const STATE_TTL_MS = 15 * 60 * 1000;

export type StripeInstallStatePayload = {
  appId: string;
  userId: string;
  exp: number;
  returnTo?: string;
  livemode?: boolean;
};

function getStateSecret() {
  return getServerEnv().BETTER_AUTH_SECRET;
}

function encodePayload(payload: StripeInstallStatePayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function sign(encoded: string) {
  return createHmac("sha256", getStateSecret())
    .update(encoded)
    .digest("base64url");
}

export function createStripeInstallState(
  appId: string,
  userId: string,
  returnTo?: string,
  livemode?: boolean,
) {
  const payload: StripeInstallStatePayload = {
    appId,
    userId,
    exp: Date.now() + STATE_TTL_MS,
    ...(returnTo ? { returnTo } : {}),
    ...(livemode === undefined ? {} : { livemode }),
  };
  const encoded = encodePayload(payload);

  return `${encoded}.${sign(encoded)}`;
}

export function verifyStripeInstallState(
  state: string
): StripeInstallStatePayload {
  const [encoded, signature] = state.split(".");

  if (!encoded || !signature) {
    throw new Error("Invalid Stripe install state.");
  }

  const expected = sign(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid Stripe install state signature.");
  }

  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8")
  ) as StripeInstallStatePayload;

  if (Date.now() > payload.exp) {
    throw new Error("Stripe install state expired.");
  }

  return payload;
}
