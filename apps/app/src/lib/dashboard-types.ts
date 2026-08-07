export type MeProfile = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  is_admin: boolean;
  primary_mode: "owner" | "affiliate";
  deployment: {
    edition: "cloud" | "self-hosted";
    instance_url: string;
    capabilities: {
      cloud_billing: boolean;
      filesystem_uploads: boolean;
      managed_stripe: boolean;
      managed_connections: boolean;
      official_network: boolean;
      refkit_support: boolean;
    };
  };
  organizations: Array<{
    id: string;
    name: string;
    role: string;
    created_at: string;
  }>;
  apps: Array<{
    id: string;
    name: string;
    logo_url: string | null;
    organization_id: string;
    network_visible: boolean;
    default_program_id: string | null;
  }>;
  program_affiliates: Array<{
    program_affiliate: {
      id: string;
      program_id: string;
      status: string;
      default_link_code: string | null;
      created_at: string;
    };
    program: {
      id: string;
      app_id: string;
      name: string;
      slug: string;
      currency: string;
      status: string;
      minimum_payout_amount: { amount: number; currency: string };
      supported_payout_methods: string[];
      commission_rule: {
        reward_type: string;
        percent_value: number | null;
        fixed_amount: number | null;
        recurring_duration_months: number | null;
      } | null;
    };
    accepted_agreement_version: {
      id: string;
      version_number: number;
      terms_text: string | null;
    } | null;
  }>;
  default_mode: "owner" | "affiliate" | null;
};

export type SetupStatus = {
  revenue_source: "stripe" | "api";
  program_launched: boolean;
  api_key_created: boolean;
  first_click: boolean;
  first_identify: boolean;
  stripe_connected: boolean;
  first_stripe_event: boolean;
  first_revenue_event: boolean;
  first_commission: boolean;
  test_api_key_created: boolean;
  test_api_key: string | null;
  test_api_key_used: boolean;
  test_affiliate_created: boolean;
  test_first_click: boolean;
  test_first_identify: boolean;
  test_stripe_connected: boolean;
  test_first_revenue_event: boolean;
  test_first_commission: boolean;
  test_integration_complete: boolean;
  live_api_key_created: boolean;
  live_api_key_used: boolean;
  live_stripe_connected: boolean;
  live_first_revenue_event: boolean;
  live_first_commission: boolean;
  production_website_ready: boolean;
  production_ready: boolean;
  unattributed_revenue_alarm: boolean;
  cross_currency_alarm: boolean;
  cross_currency_message: string | null;
  integration_issue: string | null;
  integration_issue_at: string | null;
};

export type ProgramOverview = {
  clicks: number;
  referrals: number;
  paying_customers: number;
  gross_referred_revenue: { amount: number; currency: string };
  click_to_referral_rate: number;
  referral_to_paid_rate: number;
  top_affiliates: Array<{
    program_affiliate_id: string;
    default_link_code: string | null;
    email: string | null;
    name: string | null;
    image: string | null;
    gross_revenue: { amount: number; currency: string };
  }>;
};

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
