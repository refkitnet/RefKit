import { randomBytes } from "crypto";

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function toBase58(bytes: Buffer): string {
  let value = BigInt(`0x${bytes.toString("hex")}`);
  let result = "";

  while (value > 0n) {
    const remainder = Number(value % 58n);
    result = BASE58_ALPHABET[remainder] + result;
    value = value / 58n;
  }

  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0) {
      break;
    }

    result = "1" + result;
  }

  return result;
}

export function generateId(prefix: string): string {
  const randomPart = toBase58(randomBytes(18)).slice(0, 24).padEnd(24, "1");
  return `${prefix}_${randomPart}`;
}

export const ID_PREFIXES = {
  user: "usr",
  organization: "org",
  app: "app",
  managedAccount: "macc",
  managedConnection: "mcon",
  program: "prg",
  affiliate: "aff",
  link: "lnk",
  click: "clk",
  customer: "rcus",
  referral: "ref",
  transaction: "rtxn",
  revenueDispute: "rdsp",
  commissionRule: "rule",
  termsVersion: "tver",
  termsAcceptance: "tacc",
  appAgreementVersion: "aagr",
  agreementAcceptance: "aacc",
  commissionEntry: "cme",
  payoutRequest: "preq",
  payoutRequestItem: "priq",
  payoutBatch: "pbat",
  payoutItem: "pitm",
  apiKey: "key",
  job: "job",
  stripeConnection: "scon",
  pendingStripeInstall: "psin",
  stripeAppAuthorization: "saut",
  stripeEvent: "sevt",
  payoutDetails: "pdt",
  promotionCode: "apc",
  auditLog: "aud",
  webhookEndpoint: "whep",
  webhookDelivery: "whdl",
  webhookEvent: "whev",
  payoutExecution: "pexe",
} as const;
