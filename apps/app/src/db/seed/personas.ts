import { SEED_USERS } from "@/db/seed/ids";

export type SeedPersonaRole = "admin" | "owner" | "affiliate";

export type SeedPersona = {
  id: string;
  name: string;
  email: string;
  role: SeedPersonaRole;
  description: string;
};

const SEED_PERSONAS: SeedPersona[] = [
  {
    id: SEED_USERS.admin.id,
    name: SEED_USERS.admin.name,
    email: SEED_USERS.admin.email,
    role: "admin",
    description: "Platform admin with access to /v1/admin routes.",
  },
  {
    id: SEED_USERS.marcus.id,
    name: SEED_USERS.marcus.name,
    email: SEED_USERS.marcus.email,
    role: "owner",
    description: "New developer with an org only - empty dashboard onboarding.",
  },
  {
    id: SEED_USERS.priya.id,
    name: SEED_USERS.priya.name,
    email: SEED_USERS.priya.email,
    role: "owner",
    description: "Early setup: Stripe app and program, no traffic yet.",
  },
  {
    id: SEED_USERS.diego.id,
    name: SEED_USERS.diego.name,
    email: SEED_USERS.diego.email,
    role: "owner",
    description: "Primary Stripe story: SDK attribution, payment webhook, and refund.",
  },
  {
    id: SEED_USERS.tomas.id,
    name: SEED_USERS.tomas.name,
    email: SEED_USERS.tomas.email,
    role: "owner",
    description: "Primary SDK/API story: payments, refund, commissions, and open payout request.",
  },
  {
    id: SEED_USERS.elena.id,
    name: SEED_USERS.elena.name,
    email: SEED_USERS.elena.email,
    role: "owner",
    description: "ChartGrid live on Stripe: full funnel, paid payouts, and pending mark-paid batch.",
  },
  {
    id: SEED_USERS.mei.id,
    name: SEED_USERS.mei.name,
    email: SEED_USERS.mei.email,
    role: "owner",
    description: "ZenForms with a public join page and pending affiliates.",
  },
  {
    id: SEED_USERS.alex.id,
    name: SEED_USERS.alex.name,
    email: SEED_USERS.alex.email,
    role: "owner",
    description: "Developer on PixelForge and affiliate on Lumina Partners.",
  },
  {
    id: SEED_USERS.jordan.id,
    name: SEED_USERS.jordan.name,
    email: SEED_USERS.jordan.email,
    role: "affiliate",
    description: "Active affiliate on ShipFast, ChartGrid, and LedgerKit.",
  },
  {
    id: SEED_USERS.sam.id,
    name: SEED_USERS.sam.name,
    email: SEED_USERS.sam.email,
    role: "affiliate",
    description: "Pending affiliate on ZenForms.",
  },
  {
    id: SEED_USERS.riley.id,
    name: SEED_USERS.riley.name,
    email: SEED_USERS.riley.email,
    role: "affiliate",
    description: "Paid on ChartGrid; pending on ZenForms.",
  },
  {
    id: SEED_USERS.nina.id,
    name: SEED_USERS.nina.name,
    email: SEED_USERS.nina.email,
    role: "affiliate",
    description: "Disabled affiliate on ChartGrid and ZenForms.",
  },
];

export function getSeedPersonas() {
  return SEED_PERSONAS;
}
