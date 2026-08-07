import type {
  AdminAuditLog,
  App,
  Customer,
  Organization,
  OrganizationMember,
  StripeConnection,
  StripeEvent,
} from "@/db/schema";
import { isStripeEventStuck } from "@/services/stripe/event-processor";

export function serializeOrganization(org: Organization) {
  return {
    id: org.id,
    name: org.name,
    created_at: org.createdAt.toISOString(),
    updated_at: org.updatedAt.toISOString(),
  };
}

export function serializeOrganizationMember(
  member: OrganizationMember,
  details?: {
    organization_name: string;
    user_email: string;
    user_name: string | null;
    user_image: string | null;
  }
) {
  return {
    id: member.id,
    organization_id: member.organizationId,
    organization_name: details?.organization_name ?? null,
    user_id: member.userId,
    user_email: details?.user_email ?? null,
    user_name: details?.user_name ?? null,
    user_image: details?.user_image ?? null,
    role: member.role,
    created_at: member.createdAt.toISOString(),
    updated_at: member.updatedAt.toISOString(),
  };
}

export function serializeCustomer(customer: Customer) {
  return {
    id: customer.id,
    app_id: customer.appId,
    external_customer_id: customer.externalCustomerId,
    email: customer.email,
    created_at: customer.createdAt.toISOString(),
    updated_at: customer.updatedAt.toISOString(),
  };
}

export function serializeStripeConnection(connection: StripeConnection) {
  return {
    id: connection.id,
    app_id: connection.appId,
    stripe_account_id: connection.stripeAccountId,
    livemode: connection.livemode,
    status: connection.status,
    created_at: connection.createdAt.toISOString(),
    updated_at: connection.updatedAt.toISOString(),
  };
}

export function serializeStripeEvent(event: StripeEvent) {
  return {
    id: event.id,
    stripe_connection_id: event.stripeConnectionId,
    stripe_event_id: event.stripeEventId,
    event_type: event.eventType,
    livemode: event.livemode,
    processing_status: event.processingStatus,
    processing_attempts: event.processingAttempts,
    processing_started_at: event.processingStartedAt?.toISOString() ?? null,
    last_processing_error: event.lastProcessingError,
    is_stuck: isStripeEventStuck(event),
    created_at: event.createdAt.toISOString(),
    updated_at: event.updatedAt.toISOString(),
  };
}

export function serializeAuditLog(log: AdminAuditLog) {
  return {
    id: log.id,
    admin_user_id: log.adminUserId,
    managed_account_id: log.managedAccountId,
    action: log.action,
    resource_type: log.resourceType,
    resource_id: log.resourceId,
    metadata: log.metadata,
    created_at: log.createdAt.toISOString(),
    updated_at: log.updatedAt.toISOString(),
  };
}

export function serializeAdminApp(
  app: App,
  organizationName?: string | null
) {
  return {
    id: app.id,
    organization_id: app.organizationId,
    organization_name: organizationName ?? null,
    name: app.name,
    status: app.status,
    integration_issue: app.integrationIssue,
    integration_issue_at: app.integrationIssueAt
      ? app.integrationIssueAt.toISOString()
      : null,
    created_at: app.createdAt.toISOString(),
    updated_at: app.updatedAt.toISOString(),
  };
}
