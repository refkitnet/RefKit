import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "crypto";
import { getServerEnv } from "@/lib/env";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashApiKey(rawKey: string): string {
  return sha256(rawKey);
}

function getPayoutDetailsKey(): Buffer {
  const env = getServerEnv();
  const key = Buffer.from(env.PAYOUT_DETAILS_ENCRYPTION_KEY, "base64");

  if (key.length !== 32) {
    throw new Error("PAYOUT_DETAILS_ENCRYPTION_KEY must decode to 32 bytes.");
  }

  return key;
}

function getPurposeDerivedKey(purpose: string): Buffer {
  return createHmac("sha256", getPayoutDetailsKey())
    .update(`refkit:${purpose}:v1`)
    .digest();
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    encrypted.toString("base64"),
    authTag.toString("base64"),
  ].join(":");
}

function decryptWithKey(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format.");
  }

  const [ivB64, dataB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);

  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptPayoutDetails(plaintext: string): string {
  return encryptWithKey(plaintext, getPayoutDetailsKey());
}

export function decryptPayoutDetails(ciphertext: string): string {
  return decryptWithKey(ciphertext, getPayoutDetailsKey());
}

export function encryptWebhookSecret(plaintext: string): string {
  return encryptWithKey(plaintext, getPurposeDerivedKey("webhook-secret"));
}

export function decryptWebhookSecret(ciphertext: string): string {
  return decryptWithKey(ciphertext, getPurposeDerivedKey("webhook-secret"));
}

export function encryptTestApiKey(plaintext: string): string {
  return encryptWithKey(
    plaintext,
    getPurposeDerivedKey("recoverable-test-api-key")
  );
}

export function decryptTestApiKey(ciphertext: string): string {
  return decryptWithKey(
    ciphertext,
    getPurposeDerivedKey("recoverable-test-api-key")
  );
}

export function encryptManagedCredentialBundle(plaintext: string): string {
  return encryptWithKey(
    plaintext,
    getPurposeDerivedKey("managed-credential-bundle")
  );
}

export function decryptManagedCredentialBundle(ciphertext: string): string {
  return decryptWithKey(
    ciphertext,
    getPurposeDerivedKey("managed-credential-bundle")
  );
}

export function createManagedDataSubjectRedactionReceipt(
  appId: string,
  externalCustomerId: string
): string {
  return createHmac(
    "sha256",
    getPurposeDerivedKey("managed-data-subject-redaction")
  )
    .update(appId)
    .update("\0")
    .update(externalCustomerId)
    .digest("hex");
}
