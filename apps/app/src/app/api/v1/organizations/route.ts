import { z } from "zod";
import { handleRouteError, requireSession } from "@/lib/auth-context";
import { parseJsonBody, toIso } from "@/lib/api";
import {
  createOrganization,
  listOrganizationsForUser,
} from "@/services/organizations";

const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const organizations = await listOrganizationsForUser(session.userId);

    return Response.json({
      data: organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        role: organization.role,
        created_at: toIso(organization.createdAt),
        updated_at: toIso(organization.updatedAt),
      })),
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const body = await parseJsonBody(request, createOrganizationSchema);
    const organization = await createOrganization(session.userId, body.name);

    return Response.json(
      {
        id: organization.id,
        name: organization.name,
        created_at: toIso(organization.createdAt),
        updated_at: toIso(organization.updatedAt),
      },
      { status: 201 }
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
