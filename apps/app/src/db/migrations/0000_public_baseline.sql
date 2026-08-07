CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"primary_mode" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_primary_mode_check" CHECK ("users"."primary_mode" in ('owner', 'affiliate'))
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"client_id" text,
	"scope" text,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_polled_at" timestamp with time zone,
	"polling_interval" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"revenue_source" text DEFAULT 'stripe' NOT NULL,
	"website_url" text,
	"tracking_origin" text,
	"logo_url" text,
	"network_visible" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"integration_issue" text,
	"integration_issue_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managed_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"app_id" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"redacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "managed_accounts_status_check" CHECK ("managed_accounts"."status" in ('active', 'redacted'))
);
--> statement-breakpoint
CREATE TABLE "managed_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"managed_account_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"app_id" text NOT NULL,
	"provider" text NOT NULL,
	"provisioning_idempotency_key" text NOT NULL,
	"external_account_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"credentials_version" integer DEFAULT 1 NOT NULL,
	"credentials_acknowledgement_id" text,
	"pending_credential_bundle_encrypted" text,
	"credentials_acknowledged_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"uninstalled_at" timestamp with time zone,
	"redacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "managed_connections_status_check" CHECK ("managed_connections"."status" in ('active', 'suspended', 'uninstalled', 'redacted'))
);
--> statement-breakpoint
CREATE TABLE "managed_data_subject_redactions" (
	"customer_id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"subject_fingerprint" text NOT NULL,
	"redacted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_agreement_acceptances" (
	"id" text PRIMARY KEY NOT NULL,
	"program_affiliate_id" text NOT NULL,
	"app_agreement_version_id" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_agreement_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"terms_text" text NOT NULL,
	"published_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"currency" text NOT NULL,
	"destination_url" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"access_mode" text DEFAULT 'private' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"join_page_enabled" boolean DEFAULT false NOT NULL,
	"join_page_approval" text DEFAULT 'active' NOT NULL,
	"allow_self_referral" boolean DEFAULT false NOT NULL,
	"promotion_code_fallback" boolean DEFAULT false NOT NULL,
	"minimum_payout_amount" integer DEFAULT 0 NOT NULL,
	"supported_payout_methods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"disabled_acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"terms_version_id" text,
	"reward_type" text NOT NULL,
	"percent_value" numeric(8, 4),
	"fixed_amount" integer,
	"fixed_currency" text,
	"recurring_duration_months" integer,
	"is_default" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_terms_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"reward_type" text NOT NULL,
	"percent_value" text,
	"fixed_amount" integer,
	"fixed_currency" text,
	"recurring_duration_months" integer,
	"published_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_links" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"program_affiliate_id" text NOT NULL,
	"program_id" text NOT NULL,
	"link_code" text NOT NULL,
	"label" text DEFAULT 'Default link' NOT NULL,
	"destination_url" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_affiliates" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clicks" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_link_id" text NOT NULL,
	"program_id" text NOT NULL,
	"program_affiliate_id" text NOT NULL,
	"link_label" text,
	"link_code" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"page_url" text,
	"referrer" text,
	"ip_hash" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"external_customer_id" text NOT NULL,
	"email" text,
	"redacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"program_id" text NOT NULL,
	"program_affiliate_id" text NOT NULL,
	"click_id" text,
	"terms_version_id" text,
	"pinned_rule_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_stripe_installs" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"user_id" text NOT NULL,
	"state" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_app_authorizations" (
	"id" text PRIMARY KEY NOT NULL,
	"stripe_account_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"claimed_app_id" text,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"stripe_account_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"stripe_connection_id" text NOT NULL,
	"stripe_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"livemode" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"processing_attempts" integer DEFAULT 0 NOT NULL,
	"processing_started_at" timestamp with time zone,
	"last_processing_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"parent_transaction_id" text,
	"stripe_connection_id" text,
	"program_id" text,
	"customer_id" text,
	"program_affiliate_id" text,
	"stripe_object_id" text,
	"stripe_charge_id" text,
	"action" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"livemode" boolean NOT NULL,
	"stripe_event_id" text,
	"transaction_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"payment_transaction_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"status" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"livemode" boolean NOT NULL,
	"event_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text,
	"program_id" text NOT NULL,
	"program_affiliate_id" text NOT NULL,
	"customer_id" text,
	"rule_id" text,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"exchange_rate" numeric(18, 8),
	"original_amount" integer,
	"original_currency" text,
	"status" text DEFAULT 'approved' NOT NULL,
	"status_before_dispute" text,
	"stripe_refund_id" text,
	"source_event_id" text,
	"dispute_id" text,
	"stripe_dispute_id" text,
	"livemode" boolean NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" text,
	"approval_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"program_affiliate_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"decline_reason" text,
	"payout_batch_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_items" (
	"id" text PRIMARY KEY NOT NULL,
	"payout_batch_id" text NOT NULL,
	"payout_request_id" text,
	"commission_entry_id" text NOT NULL,
	"program_affiliate_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"external_reference" text,
	"batch_status" text DEFAULT 'draft' NOT NULL,
	"payout_method" text,
	"payout_details_snapshot_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_request_items" (
	"id" text PRIMARY KEY NOT NULL,
	"payout_request_id" text NOT NULL,
	"commission_entry_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_payout_details" (
	"id" text PRIMARY KEY NOT NULL,
	"program_affiliate_id" text NOT NULL,
	"method" text NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"details_encrypted" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_promotion_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"program_affiliate_id" text NOT NULL,
	"program_id" text NOT NULL,
	"stripe_promotion_code_id" text NOT NULL,
	"stripe_coupon_id" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"managed_account_id" text,
	"managed_connection_id" text,
	"managed_credentials_version" integer,
	"organization_id" text,
	"app_id" text,
	"kind" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"test_key" text,
	"test_key_encrypted" text,
	"name" text,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_principal_check" CHECK (("api_keys"."user_id" is not null and "api_keys"."managed_account_id" is null and "api_keys"."managed_connection_id" is null and "api_keys"."managed_credentials_version" is null) or ("api_keys"."user_id" is null and "api_keys"."managed_account_id" is not null and "api_keys"."managed_connection_id" is not null and "api_keys"."managed_credentials_version" is not null))
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_user_id" text,
	"managed_account_id" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_logs_actor_check" CHECK (("admin_audit_logs"."admin_user_id" is not null) <> ("admin_audit_logs"."managed_account_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"scope" text NOT NULL,
	"window_bucket" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limits_scope_window_bucket_pk" PRIMARY KEY("scope","window_bucket")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_endpoint_id" text,
	"app_id" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"success" boolean NOT NULL,
	"http_status" integer,
	"response" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"url" text NOT NULL,
	"secret_encrypted" text NOT NULL,
	"enabled_events" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"payout_batch_id" text NOT NULL,
	"program_affiliate_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"method" text NOT NULL,
	"instruction_snapshot_encrypted" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"external_reference" text,
	"failure_reason" text,
	"completion_source" text,
	"last_idempotency_key" text,
	"last_callback_payload_hash" text,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failed_at" timestamp with time zone,
	"succeeded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "program_affiliates_id_program_unique" ON "program_affiliates" USING btree ("id","program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_links_id_program_affiliate_program_unique" ON "affiliate_links" USING btree ("id","program_affiliate_id","program_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_codes" ADD CONSTRAINT "device_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_accounts" ADD CONSTRAINT "managed_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_accounts" ADD CONSTRAINT "managed_accounts_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_connections" ADD CONSTRAINT "managed_connections_managed_account_id_managed_accounts_id_fk" FOREIGN KEY ("managed_account_id") REFERENCES "public"."managed_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_connections" ADD CONSTRAINT "managed_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_connections" ADD CONSTRAINT "managed_connections_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_data_subject_redactions" ADD CONSTRAINT "managed_data_subject_redactions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_agreement_acceptances" ADD CONSTRAINT "affiliate_agreement_acceptances_program_affiliate_id_program_affiliates_id_fk" FOREIGN KEY ("program_affiliate_id") REFERENCES "public"."program_affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_agreement_acceptances" ADD CONSTRAINT "affiliate_agreement_acceptances_app_agreement_version_id_app_agreement_versions_id_fk" FOREIGN KEY ("app_agreement_version_id") REFERENCES "public"."app_agreement_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_agreement_versions" ADD CONSTRAINT "app_agreement_versions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_terms_version_id_program_terms_versions_id_fk" FOREIGN KEY ("terms_version_id") REFERENCES "public"."program_terms_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_terms_versions" ADD CONSTRAINT "program_terms_versions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_program_affiliate_id_program_affiliates_id_fk" FOREIGN KEY ("program_affiliate_id") REFERENCES "public"."program_affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_affiliates" ADD CONSTRAINT "program_affiliates_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_affiliates" ADD CONSTRAINT "program_affiliates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_affiliate_link_id_affiliate_links_id_fk" FOREIGN KEY ("affiliate_link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_affiliate_program_fk" FOREIGN KEY ("program_affiliate_id","program_id") REFERENCES "public"."program_affiliates"("id","program_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_link_program_affiliate_program_fk" FOREIGN KEY ("affiliate_link_id","program_affiliate_id","program_id") REFERENCES "public"."affiliate_links"("id","program_affiliate_id","program_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_click_id_clicks_id_fk" FOREIGN KEY ("click_id") REFERENCES "public"."clicks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_terms_version_id_program_terms_versions_id_fk" FOREIGN KEY ("terms_version_id") REFERENCES "public"."program_terms_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_pinned_rule_id_commission_rules_id_fk" FOREIGN KEY ("pinned_rule_id") REFERENCES "public"."commission_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_program_affiliate_program_fk" FOREIGN KEY ("program_affiliate_id","program_id") REFERENCES "public"."program_affiliates"("id","program_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_stripe_installs" ADD CONSTRAINT "pending_stripe_installs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_stripe_installs" ADD CONSTRAINT "pending_stripe_installs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_app_authorizations" ADD CONSTRAINT "stripe_app_authorizations_claimed_app_id_apps_id_fk" FOREIGN KEY ("claimed_app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD CONSTRAINT "stripe_connections_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_stripe_connection_id_stripe_connections_id_fk" FOREIGN KEY ("stripe_connection_id") REFERENCES "public"."stripe_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_stripe_connection_id_stripe_connections_id_fk" FOREIGN KEY ("stripe_connection_id") REFERENCES "public"."stripe_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_program_affiliate_id_program_affiliates_id_fk" FOREIGN KEY ("program_affiliate_id") REFERENCES "public"."program_affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_disputes" ADD CONSTRAINT "revenue_disputes_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_disputes" ADD CONSTRAINT "revenue_disputes_payment_transaction_id_transactions_id_fk" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_rule_id_commission_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."commission_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_program_affiliate_program_fk" FOREIGN KEY ("program_affiliate_id","program_id") REFERENCES "public"."program_affiliates"("id","program_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_program_affiliate_id_program_affiliates_id_fk" FOREIGN KEY ("program_affiliate_id") REFERENCES "public"."program_affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_payout_batch_id_payout_batches_id_fk" FOREIGN KEY ("payout_batch_id") REFERENCES "public"."payout_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_payout_batch_id_payout_batches_id_fk" FOREIGN KEY ("payout_batch_id") REFERENCES "public"."payout_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_payout_request_id_payout_requests_id_fk" FOREIGN KEY ("payout_request_id") REFERENCES "public"."payout_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_commission_entry_id_commission_entries_id_fk" FOREIGN KEY ("commission_entry_id") REFERENCES "public"."commission_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_program_affiliate_id_program_affiliates_id_fk" FOREIGN KEY ("program_affiliate_id") REFERENCES "public"."program_affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_request_items" ADD CONSTRAINT "payout_request_items_payout_request_id_payout_requests_id_fk" FOREIGN KEY ("payout_request_id") REFERENCES "public"."payout_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_request_items" ADD CONSTRAINT "payout_request_items_commission_entry_id_commission_entries_id_fk" FOREIGN KEY ("commission_entry_id") REFERENCES "public"."commission_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payout_details" ADD CONSTRAINT "affiliate_payout_details_program_affiliate_id_program_affiliates_id_fk" FOREIGN KEY ("program_affiliate_id") REFERENCES "public"."program_affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_promotion_codes" ADD CONSTRAINT "affiliate_promotion_codes_program_affiliate_id_program_affiliates_id_fk" FOREIGN KEY ("program_affiliate_id") REFERENCES "public"."program_affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_promotion_codes" ADD CONSTRAINT "affiliate_promotion_codes_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_managed_account_id_managed_accounts_id_fk" FOREIGN KEY ("managed_account_id") REFERENCES "public"."managed_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_managed_connection_id_managed_connections_id_fk" FOREIGN KEY ("managed_connection_id") REFERENCES "public"."managed_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_managed_account_id_managed_accounts_id_fk" FOREIGN KEY ("managed_account_id") REFERENCES "public"."managed_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("webhook_endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_executions" ADD CONSTRAINT "payout_executions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_executions" ADD CONSTRAINT "payout_executions_payout_batch_id_payout_batches_id_fk" FOREIGN KEY ("payout_batch_id") REFERENCES "public"."payout_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_executions" ADD CONSTRAINT "payout_executions_program_affiliate_id_program_affiliates_id_fk" FOREIGN KEY ("program_affiliate_id") REFERENCES "public"."program_affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_org_user_unique" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "apps_tracking_origin_unique" ON "apps" USING btree ("tracking_origin") WHERE "apps"."tracking_origin" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "managed_accounts_app_unique" ON "managed_accounts" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_connections_account_unique" ON "managed_connections" USING btree ("managed_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_connections_app_unique" ON "managed_connections" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_connections_provider_provisioning_idempotency_unique" ON "managed_connections" USING btree ("provider","provisioning_idempotency_key");--> statement-breakpoint
CREATE INDEX "managed_connections_provider_external_idx" ON "managed_connections" USING btree ("provider","external_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_data_subject_redactions_subject_unique" ON "managed_data_subject_redactions" USING btree ("app_id","subject_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_agreement_acceptances_unique" ON "affiliate_agreement_acceptances" USING btree ("program_affiliate_id","app_agreement_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_agreement_versions_app_version_unique" ON "app_agreement_versions" USING btree ("app_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_slug_unique" ON "programs" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_default_per_app_unique" ON "programs" USING btree ("app_id") WHERE "programs"."is_default" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_rules_active_default_unique" ON "commission_rules" USING btree ("program_id") WHERE "commission_rules"."is_default" = true and "commission_rules"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "program_terms_versions_program_version_unique" ON "program_terms_versions" USING btree ("program_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_links_app_id_link_code_unique" ON "affiliate_links" USING btree ("app_id","link_code");--> statement-breakpoint
CREATE UNIQUE INDEX "program_affiliates_program_user_unique" ON "program_affiliates" USING btree ("program_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_affiliates_program_test_unique" ON "program_affiliates" USING btree ("program_id") WHERE "program_affiliates"."is_test" = true;--> statement-breakpoint
CREATE INDEX "clicks_program_created_idx" ON "clicks" USING btree ("program_id","created_at");--> statement-breakpoint
CREATE INDEX "clicks_program_affiliate_created_idx" ON "clicks" USING btree ("program_affiliate_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_app_external_customer_unique" ON "customers" USING btree ("app_id","external_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_customer_program_unique" ON "referrals" USING btree ("customer_id","program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_stripe_installs_app_user_unique" ON "pending_stripe_installs" USING btree ("app_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_stripe_installs_state_unique" ON "pending_stripe_installs" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_app_authorizations_account_unique" ON "stripe_app_authorizations" USING btree ("stripe_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_connections_app_livemode_unique" ON "stripe_connections" USING btree ("app_id","livemode");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_connections_stripe_account_unique" ON "stripe_connections" USING btree ("stripe_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_events_connection_event_unique" ON "stripe_events" USING btree ("stripe_connection_id","stripe_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_app_external_action_livemode_unique" ON "transactions" USING btree ("app_id","external_id","action","livemode");--> statement-breakpoint
CREATE INDEX "transactions_connection_charge_idx" ON "transactions" USING btree ("stripe_connection_id","stripe_charge_id");--> statement-breakpoint
CREATE INDEX "transactions_customer_program_idx" ON "transactions" USING btree ("customer_id","program_id");--> statement-breakpoint
CREATE INDEX "transactions_app_idx" ON "transactions" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "revenue_disputes_app_external_mode_unique" ON "revenue_disputes" USING btree ("app_id","external_id","livemode");--> statement-breakpoint
CREATE INDEX "revenue_disputes_payment_idx" ON "revenue_disputes" USING btree ("payment_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_entries_earned_unique" ON "commission_entries" USING btree ("transaction_id","program_affiliate_id","rule_id") WHERE "commission_entries"."kind" = 'earned';--> statement-breakpoint
CREATE UNIQUE INDEX "commission_entries_refund_unique" ON "commission_entries" USING btree ("stripe_refund_id") WHERE "commission_entries"."stripe_refund_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_entries_source_event_unique" ON "commission_entries" USING btree ("source_event_id") WHERE "commission_entries"."source_event_id" is not null;--> statement-breakpoint
CREATE INDEX "commission_entries_stripe_dispute_idx" ON "commission_entries" USING btree ("stripe_dispute_id","kind") WHERE "commission_entries"."stripe_dispute_id" is not null;--> statement-breakpoint
CREATE INDEX "commission_entries_dispute_idx" ON "commission_entries" USING btree ("dispute_id","kind") WHERE "commission_entries"."dispute_id" is not null;--> statement-breakpoint
CREATE INDEX "commission_entries_program_affiliate_program_status_idx" ON "commission_entries" USING btree ("program_affiliate_id","program_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_items_batch_entry_unique" ON "payout_items" USING btree ("payout_batch_id","commission_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_items_active_entry_unique" ON "payout_items" USING btree ("commission_entry_id") WHERE "payout_items"."batch_status" != 'cancelled' AND "payout_items"."status" IN ('pending', 'paid');--> statement-breakpoint
CREATE UNIQUE INDEX "payout_request_items_request_entry_unique" ON "payout_request_items" USING btree ("payout_request_id","commission_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_request_items_entry_unique" ON "payout_request_items" USING btree ("commission_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_payout_details_affiliate_method_currency_unique" ON "affiliate_payout_details" USING btree ("program_affiliate_id","method","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_promotion_codes_program_code_unique" ON "affiliate_promotion_codes" USING btree ("program_id","code");--> statement-breakpoint
CREATE INDEX "rate_limits_updated_at_idx" ON "rate_limits" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_event_unique" ON "webhook_deliveries" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_app_created_idx" ON "webhook_deliveries" USING btree ("app_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_endpoints_app_unique" ON "webhook_endpoints" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_executions_batch_affiliate_unique" ON "payout_executions" USING btree ("payout_batch_id","program_affiliate_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION payout_items_affiliate_matches_commission()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM commission_entries ce
    WHERE ce.id = NEW.commission_entry_id
      AND ce.program_affiliate_id = NEW.program_affiliate_id
  ) THEN
    RAISE EXCEPTION 'payout_items program_affiliate_id must match commission entry program_affiliate_id';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER payout_items_affiliate_match_check
BEFORE INSERT OR UPDATE OF program_affiliate_id, commission_entry_id ON payout_items
FOR EACH ROW
EXECUTE FUNCTION payout_items_affiliate_matches_commission();
