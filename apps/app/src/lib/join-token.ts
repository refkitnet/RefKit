import { createHmac, timingSafeEqual } from "crypto";
import { getServerEnv } from "@/lib/env";

const JOIN_TOKEN_TTL_MS = 30 * 60 * 1000;

export type JoinTokenPayload = {
  programId: string;
  email: string;
  appAgreementVersionId: string;
  name?: string;
  exp: number;
};

function getTokenSecret() {
  return getServerEnv().BETTER_AUTH_SECRET;
}

function encodePayload(payload: JoinTokenPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function sign(encoded: string) {
  return createHmac("sha256", getTokenSecret())
    .update(encoded)
    .digest("base64url");
}

export function createJoinToken(input: {
  programId: string;
  email: string;
  appAgreementVersionId: string;
  name?: string;
}) {
  const payload: JoinTokenPayload = {
    programId: input.programId,
    email: input.email.trim().toLowerCase(),
    appAgreementVersionId: input.appAgreementVersionId,
    exp: Date.now() + JOIN_TOKEN_TTL_MS,
    ...(input.name ? { name: input.name } : {}),
  };
  const encoded = encodePayload(payload);

  return `${encoded}.${sign(encoded)}`;
}

export function verifyJoinToken(token: string): JoinTokenPayload {
  const [encoded, signature] = token.split(".");

  if (!encoded || !signature) {
    throw new Error("Invalid join token.");
  }

  const expected = sign(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid join token signature.");
  }

  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8")
  ) as JoinTokenPayload;

  if (Date.now() > payload.exp) {
    throw new Error("Join token expired.");
  }

  return payload;
}
