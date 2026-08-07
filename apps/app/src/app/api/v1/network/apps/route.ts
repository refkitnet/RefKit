import { handleRouteError } from "@/lib/auth-context";
import { assertRefKitNetworkAccessible } from "@/lib/closed-beta.server";
import { parseListParams } from "@/lib/pagination";
import {
  listNetworkApps,
  serializeNetworkApp,
} from "@/services/network";

function withNetworkHeaders(response: Response) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Cache-Control", "public, s-maxage=60");
  return response;
}

export async function GET(request: Request) {
  try {
    assertRefKitNetworkAccessible();
    const url = new URL(request.url);
    const params = parseListParams(url.searchParams);
    const result = await listNetworkApps(params);

    return withNetworkHeaders(
      Response.json({
        data: result.data.map((row) => serializeNetworkApp(row, url.origin)),
        has_more: result.hasMore,
      })
    );
  }
  catch (error) {
    return withNetworkHeaders(handleRouteError(error));
  }
}
