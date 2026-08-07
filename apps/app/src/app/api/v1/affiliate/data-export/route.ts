import {
  handleRouteError,
  requireAffiliateAuth,
} from "@/lib/auth-context";
import { exportAffiliateData } from "@/services/affiliates/compliance";

export async function GET(request: Request) {
  try {
    const auth = await requireAffiliateAuth(request);
    const payload = await exportAffiliateData(auth.userId);
    const filename = `refkit-affiliate-export-${auth.userId}.json`;

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
