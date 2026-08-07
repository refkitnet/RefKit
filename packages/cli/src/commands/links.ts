import type { Command } from "commander";
import {
  apiRequest,
  handleCommandError,
  type ListResponse,
} from "../api.js";
import { formatTable } from "../lib/table.js";
import { getAuthContext } from "./auth.js";

type AffiliateLink = {
  id: string;
  label?: string;
  tracking_url?: string;
  url?: string;
  program_id?: string;
  program_slug?: string;
  link_code: string;
};

export function registerLinksCommands(program: Command) {
  const links = program.command("links").description("Affiliate links");

  links
    .command("list")
    .description("List affiliate links")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .option("--limit <n>", "Page size", "25")
    .option("--affiliate-id <id>", "List links for a Developer-managed Affiliate")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      limit?: string;
      affiliateId?: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);

        const result = await apiRequest<ListResponse<AffiliateLink>>(
          options.affiliateId
            ? `/v1/program-affiliates/${options.affiliateId}/links`
            : "/v1/affiliate-links",
          {
            apiUrl,
            token,
            query: {
              limit: options.limit,
            },
          }
        );

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.data.length === 0) {
          console.log("No links found.");
          return;
        }

        console.log(
          formatTable(
            ["ID", "PROGRAM", "LINK CODE", "URL"],
            result.data.map((link) => [
              link.id,
              link.program_slug ?? link.program_id ?? "",
              link.link_code,
              link.tracking_url ?? link.url ?? "",
            ])
          )
        );

        if (result.has_more) {
          console.log("\nMore results available. Use --limit or pagination cursors via --json.");
        }
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  links
    .command("create")
    .description("Create a named affiliate link")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .option("--program-id <id>", "Program ID")
    .option("--affiliate-id <id>", "Create the link for a Developer-managed Affiliate")
    .option("--label <label>", "Link label (defaults to link code)")
    .option("--link-code <code>", "Link code for ?via= (required if --label omitted)")
    .option("--destination-url <url>", "Optional destination URL override")
    .option("--utm-source <value>", "UTM source")
    .option("--utm-medium <value>", "UTM medium")
    .option("--utm-campaign <value>", "UTM campaign")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      programId?: string;
      affiliateId?: string;
      label?: string;
      linkCode?: string;
      destinationUrl?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
    }) => {
      try {
        if (!options.affiliateId && !options.programId) {
          throw new Error("Provide --program-id for an Affiliate-owned link.");
        }

        if (options.affiliateId && !options.linkCode) {
          throw new Error(
            "Provide --link-code for a Developer-managed Affiliate link."
          );
        }

        if (!options.label && !options.linkCode) {
          throw new Error("Provide --link-code or --label.");
        }

        const { apiUrl, token } = getAuthContext(options);

        const body: Record<string, unknown> = {};

        if (options.label) {
          body.label = options.label;
        }

        if (options.linkCode) {
          body.link_code = options.linkCode;
        }

        if (options.destinationUrl) {
          body.destination_url = options.destinationUrl;
        }

        if (options.utmSource) {
          body.utm_source = options.utmSource;
        }

        if (options.utmMedium) {
          body.utm_medium = options.utmMedium;
        }

        if (options.utmCampaign) {
          body.utm_campaign = options.utmCampaign;
        }

        const result = await apiRequest<AffiliateLink>(
          options.affiliateId
            ? `/v1/program-affiliates/${options.affiliateId}/links`
            : `/v1/affiliate/programs/${options.programId}/links`,
          {
            apiUrl,
            token,
            method: "POST",
            body,
          }
        );

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(
          `Created link ${result.label ?? options.label ?? options.linkCode} (${result.id})${
            result.tracking_url ? `: ${result.tracking_url}` : ""
          }`
        );
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  links
    .command("delete")
    .description("Delete a named affiliate link (not the default)")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .option("--program-id <id>", "Program ID")
    .requiredOption("--link-id <id>", "Link ID")
    .option("--affiliate-id <id>", "Delete a link for a Developer-managed Affiliate")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      programId?: string;
      linkId: string;
      affiliateId?: string;
    }) => {
      try {
        if (!options.affiliateId && !options.programId) {
          throw new Error("Provide --program-id for an Affiliate-owned link.");
        }

        const { apiUrl, token } = getAuthContext(options);

        const result = await apiRequest<AffiliateLink>(
          options.affiliateId
            ? `/v1/program-affiliates/${options.affiliateId}/links/${options.linkId}`
            : `/v1/affiliate/programs/${options.programId}/links/${options.linkId}`,
          {
            apiUrl,
            token,
            method: "DELETE",
          }
        );

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(
          `Deleted link ${result.label ?? options.linkId} (${result.id})`
        );
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  links
    .command("update")
    .description("Update a Developer-managed Affiliate link")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .requiredOption("--affiliate-id <id>", "Program affiliate ID")
    .requiredOption("--link-id <id>", "Link ID")
    .option("--label <label>", "Link label")
    .option("--destination-url <url>", "Destination URL override")
    .option("--utm-source <value>", "UTM source")
    .option("--utm-medium <value>", "UTM medium")
    .option("--utm-campaign <value>", "UTM campaign")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      affiliateId: string;
      linkId: string;
      label?: string;
      destinationUrl?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
    }) => {
      try {
        if (
          options.label === undefined
          && options.destinationUrl === undefined
          && options.utmSource === undefined
          && options.utmMedium === undefined
          && options.utmCampaign === undefined
        ) {
          throw new Error("Provide at least one link field to update.");
        }

        const { apiUrl, token } = getAuthContext(options);
        const body: Record<string, unknown> = {};

        if (options.label !== undefined) {
          body.label = options.label;
        }

        if (options.destinationUrl !== undefined) {
          body.destination_url = options.destinationUrl;
        }

        if (options.utmSource !== undefined) {
          body.utm_source = options.utmSource;
        }

        if (options.utmMedium !== undefined) {
          body.utm_medium = options.utmMedium;
        }

        if (options.utmCampaign !== undefined) {
          body.utm_campaign = options.utmCampaign;
        }

        const result = await apiRequest<AffiliateLink>(
          `/v1/program-affiliates/${options.affiliateId}/links/${options.linkId}`,
          {
            apiUrl,
            token,
            method: "PATCH",
            body,
          }
        );

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(`Updated link ${result.label ?? result.id} (${result.id})`);
      }
      catch (error) {
        handleCommandError(error);
      }
    });
}
