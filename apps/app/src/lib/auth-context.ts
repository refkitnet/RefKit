import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { getAdminEmailAllowlist } from "@/lib/env";
import {
  assertDeploymentCapability,
  isSelfHosted,
} from "@/lib/deployment";
import {
  assertAppBelongsToOrganization,
  findApiKeyByRawKey,
  findApiKeyByRawKeyIncludingRevoked,
  touchApiKeyLastUsed,
} from "@/services/api-keys";
import { validateAdminAccess } from "@/services/admin/gate";

export type SessionAuthContext = {
  type: "session";
  userId: string;
  sessionId: string;
};

export type SessionUserContext = SessionAuthContext & {
  email: string | null;
  name: string | null;
};

export type AppKeyAuthContext = {
  type: "app_key";
  userId: string | null;
  managedAccountId?: string | null;
  managedConnectionId?: string | null;
  keyId: string;
  organizationId: string;
  appId: string | null;
  testMode: boolean;
};

export type AffiliateKeyAuthContext = {
  type: "affiliate_key";
  userId: string;
  keyId: string;
};

export type ManagedKeyAuthContext = {
  type: "managed_key";
  keyId: string;
  managedAccountId: string;
  connectionId: string;
  organizationId: string;
  appId: string;
  connectionStatus: "active" | "suspended" | "uninstalled";
};

export type AuthContext =
  | SessionAuthContext
  | AppKeyAuthContext
  | AffiliateKeyAuthContext
  | ManagedKeyAuthContext;

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim();
}

async function authenticateApiKey(
  token: string
): Promise<
  AppKeyAuthContext | AffiliateKeyAuthContext | ManagedKeyAuthContext | null
> {
  if (token.startsWith("rk_managed_")) {
    assertDeploymentCapability("managed_connections");
    const key = await findApiKeyByRawKey(token);

    if (
      !key
      || key.kind !== "managed"
      || !key.managedAccountId
      || !key.managedConnectionId
      || !key.organizationId
      || !key.appId
    ) {
      throw new AppError(
        "unauthorized",
        "invalid_api_key",
        "Invalid API key.",
        401
      );
    }

    const { getManagedConnectionForApiKey } = await import(
      "@/services/managed-connections"
    );
    const managed = await getManagedConnectionForApiKey(key.id);

    if (
      !managed
      || managed.accountStatus !== "active"
      || managed.connection.status === "redacted"
      || managed.connection.managedAccountId !== key.managedAccountId
    ) {
      throw new AppError(
        "unauthorized",
        "invalid_api_key",
        "Invalid API key.",
        401
      );
    }

    await touchApiKeyLastUsed(key.id);

    return {
      type: "managed_key",
      keyId: key.id,
      managedAccountId: key.managedAccountId,
      connectionId: key.managedConnectionId,
      organizationId: key.organizationId,
      appId: key.appId,
      connectionStatus: managed.connection.status,
    };
  }

  if (token.startsWith("rk_app_") || token.startsWith("rk_test_app_")) {
    const key = await findApiKeyByRawKey(token);

    if (
      !key
      || key.kind !== "app"
      || !key.organizationId
      || (!key.userId && !key.managedAccountId)
    ) {
      throw new AppError(
        "unauthorized",
        "invalid_api_key",
        "Invalid API key.",
        401
      );
    }

    if (key.managedConnectionId) {
      assertDeploymentCapability("managed_connections");
      const { getManagedConnectionForApiKey } = await import(
        "@/services/managed-connections"
      );
      const managed = await getManagedConnectionForApiKey(key.id);

      if (
        !managed
        || managed.accountStatus !== "active"
        || managed.connection.status !== "active"
      ) {
        throw new AppError(
          "unauthorized",
          "managed_connection_inactive",
          "The managed connection is not active.",
          401
        );
      }
    }
    else if (key.appId) {
      await assertAppBelongsToOrganization(
        key.appId,
        key.organizationId,
        { forAuth: true }
      );
    }

    await touchApiKeyLastUsed(key.id);

    return {
      type: "app_key",
      userId: key.userId,
      managedAccountId: key.managedAccountId,
      managedConnectionId: key.managedConnectionId,
      keyId: key.id,
      organizationId: key.organizationId,
      appId: key.appId,
      testMode: key.prefix.startsWith("rk_test_app_"),
    };
  }

  if (token.startsWith("rk_aff_")) {
    const key = await findApiKeyByRawKey(token);

    if (!key || key.kind !== "affiliate" || !key.userId) {
      throw new AppError(
        "unauthorized",
        "invalid_api_key",
        "Invalid API key.",
        401
      );
    }

    await touchApiKeyLastUsed(key.id);

    return {
      type: "affiliate_key",
      userId: key.userId,
      keyId: key.id,
    };
  }

  return null;
}

async function authenticateSession(
  request: Request
): Promise<SessionAuthContext | null> {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return null;
  }

  return {
    type: "session",
    userId: session.user.id,
    sessionId: session.session.id,
  };
}

export async function authenticateRequest(
  request: Request
): Promise<AuthContext> {
  const token = getBearerToken(request);

  if (token) {
    const apiKeyContext = await authenticateApiKey(token);

    if (apiKeyContext) {
      return apiKeyContext;
    }
  }

  const sessionContext = await authenticateSession(request);

  if (sessionContext) {
    return sessionContext;
  }

  throw new AppError(
    "unauthorized",
    token ? "invalid_credentials" : "missing_credentials",
    token ? "Invalid credentials." : "Authorization required.",
    401
  );
}

export async function requireSession(
  request: Request
): Promise<SessionAuthContext> {
  const context = await authenticateRequest(request);

  if (context.type !== "session") {
    throw new AppError(
      "unauthorized",
      "session_required",
      "Session authentication required.",
      401
    );
  }

  return context;
}

export async function requireSessionUser(
  request: Request
): Promise<SessionUserContext> {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    throw new AppError(
      "unauthorized",
      "missing_credentials",
      "Authorization required.",
      401
    );
  }

  return {
    type: "session",
    userId: session.user.id,
    sessionId: session.session.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
  };
}

export async function requireAppKey(
  request: Request
): Promise<AppKeyAuthContext> {
  const context = await authenticateRequest(request);

  if (context.type !== "app_key") {
    throw new AppError(
      "unauthorized",
      "app_key_required",
      "App API key authentication required.",
      401
    );
  }

  return context;
}

export async function requireManagedKey(
  request: Request
): Promise<ManagedKeyAuthContext> {
  assertDeploymentCapability("managed_connections");
  const context = await authenticateRequest(request);

  if (context.type !== "managed_key") {
    throw new AppError(
      "unauthorized",
      "managed_key_required",
      "Managed administration key authentication required.",
      401
    );
  }

  return context;
}

export function assertManagedConnectionIsActive(
  context: AuthContext
) {
  if (
    context.type === "managed_key"
    && context.connectionStatus !== "active"
  ) {
    throw new AppError(
      "unauthorized",
      "managed_connection_inactive",
      "The managed connection is not active.",
      401
    );
  }
}

export type ManagedConnectionDeleteKeyAuthContext = Omit<
  ManagedKeyAuthContext,
  "connectionStatus"
> & {
  connectionStatus: ManagedKeyAuthContext["connectionStatus"] | "redacted";
};

export async function requireManagedConnectionDeleteKey(
  request: Request,
  connectionId: string
): Promise<ManagedConnectionDeleteKeyAuthContext> {
  assertDeploymentCapability("managed_connections");
  const token = getBearerToken(request);

  if (!token?.startsWith("rk_managed_")) {
    throw new AppError(
      "unauthorized",
      "invalid_api_key",
      "Invalid API key.",
      401
    );
  }

  const key = await findApiKeyByRawKeyIncludingRevoked(token);

  if (
    !key
    || key.kind !== "managed"
    || !key.managedAccountId
    || !key.managedConnectionId
    || !key.organizationId
    || !key.appId
    || key.managedConnectionId !== connectionId
  ) {
    throw new AppError(
      "unauthorized",
      "invalid_api_key",
      "Invalid API key.",
      401
    );
  }

  const { getManagedConnectionForApiKey } = await import(
    "@/services/managed-connections"
  );
  const managed = await getManagedConnectionForApiKey(key.id);
  const isActiveCredential =
    !key.revokedAt
    && managed?.accountStatus === "active"
    && managed.connection.status !== "redacted";
  const isRedactionReplay =
    Boolean(key.revokedAt)
    && managed?.accountStatus === "redacted"
    && managed.connection.status === "redacted";

  if (!managed || (!isActiveCredential && !isRedactionReplay)) {
    throw new AppError(
      "unauthorized",
      "invalid_api_key",
      "Invalid API key.",
      401
    );
  }

  if (isActiveCredential) {
    await touchApiKeyLastUsed(key.id);
  }

  return {
    type: "managed_key",
    keyId: key.id,
    managedAccountId: key.managedAccountId,
    connectionId: key.managedConnectionId,
    organizationId: key.organizationId,
    appId: key.appId,
    connectionStatus: managed.connection.status,
  };
}

export type OwnerAuthContext = SessionAuthContext | ManagedKeyAuthContext;

export async function requireOwnerAuth(
  request: Request
): Promise<OwnerAuthContext> {
  const context = await authenticateRequest(request);

  assertManagedConnectionIsActive(context);

  if (context.type === "session" || context.type === "managed_key") {
    return context;
  }

  throw new AppError(
    "unauthorized",
    "owner_auth_required",
    "Developer session or managed administration key required.",
    401
  );
}

export function ownerPrincipalId(context: OwnerAuthContext) {
  return context.type === "session"
    ? context.userId
    : context.managedAccountId;
}

export async function requireLiveAppScopedKey(
  request: Request
): Promise<AppKeyAuthContext & { appId: string }> {
  const context = await requireAppKey(request);

  if (context.testMode || !context.appId) {
    throw new AppError(
      "unauthorized",
      "live_app_scoped_key_required",
      "Use a live API key scoped to the exact App.",
      401
    );
  }

  return context as AppKeyAuthContext & { appId: string };
}

export async function requireAffiliateKey(
  request: Request
): Promise<AffiliateKeyAuthContext> {
  const context = await authenticateRequest(request);

  if (context.type !== "affiliate_key") {
    throw new AppError(
      "unauthorized",
      "affiliate_key_required",
      "Affiliate API key authentication required.",
      401
    );
  }

  return context;
}

export type AffiliateAuthContext =
  | AffiliateKeyAuthContext
  | SessionAuthContext;

export async function requireAffiliateAuth(
  request: Request
): Promise<AffiliateAuthContext> {
  const context = await authenticateRequest(request);

  if (context.type === "affiliate_key" || context.type === "session") {
    return context;
  }

  throw new AppError(
    "unauthorized",
    "affiliate_auth_required",
    "Affiliate API key or session authentication required.",
    401
  );
}

export type AdminAuthContext = SessionAuthContext & {
  email: string;
};

export async function requireAdmin(
  request: Request
): Promise<AdminAuthContext> {
  const session = await requireSessionUser(request);
  const email = session.email?.trim().toLowerCase();

  if (!email) {
    throw new AppError(
      "forbidden",
      "admin_forbidden",
      "Admin access denied.",
      403
    );
  }

  const db = getDb();

  const [user] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const allowlist = getAdminEmailAllowlist();

  if (!isSelfHosted() && allowlist.length === 0) {
    throw new AppError(
      "forbidden",
      "admin_not_configured",
      "Admin access is not configured.",
      403
    );
  }

  if (!validateAdminAccess(email, user?.isAdmin ?? false)) {
    throw new AppError(
      "forbidden",
      "admin_forbidden",
      "Admin access denied.",
      403
    );
  }

  return {
    type: "session",
    userId: session.userId,
    sessionId: session.sessionId,
    email,
  };
}

export function handleRouteError(error: unknown): Response {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const message = issue
      ? `${issue.path.join(".")}: ${issue.message}`
      : "Invalid request body.";

    return Response.json(
      {
        error: {
          type: "invalid_request",
          code: "invalid_request_body",
          message,
        },
      },
      { status: 400 }
    );
  }

  if (error instanceof AppError) {
    return Response.json(error.toBody(), { status: error.status });
  }

  console.error(error);

  return Response.json(
    {
      error: {
        type: "internal",
        code: "internal_error",
        message: "Something went wrong.",
      },
    },
    { status: 500 }
  );
}
