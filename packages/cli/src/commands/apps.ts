import * as p from "@clack/prompts";
import type { Command } from "commander";
import { ApiRequestError, apiRequest, handleCommandError, type ListResponse } from "../api.js";
import { resolveAppWebsiteUrl } from "../lib/landing-page.js";
import { required } from "../lib/prompts.js";
import { getAuthContext } from "./auth.js";

type Organization = {
  id: string;
  name: string;
};

export type App = {
  id: string;
  organization_id: string;
  name: string;
  revenue_source: "stripe" | "api";
  default_program_id: string | null;
};

export function registerAppsCommands(program: Command) {
  const apps = program.command("apps").description("Manage apps");

  apps
    .command("create")
    .description("Create an app")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .option("--organization-id <id>", "Organization ID")
    .option("--name <name>", "App name")
    .option("--website-url <url>", "Website URL for affiliate links")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      organizationId?: string;
      name?: string;
      websiteUrl?: string;
      destinationUrl?: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);

        let organizationId = options.organizationId;
        let name = options.name;
        let websiteUrl = options.websiteUrl ?? options.destinationUrl;

        if (!organizationId || !name) {
          const organizations = await apiRequest<{ data: Organization[] }>(
            "/v1/organizations",
            { apiUrl, token }
          );

          if (!organizationId) {
            if (organizations.data.length === 0) {
              const orgName = await p.text({
                message: "Organization name",
                placeholder: "My Company",
                validate: required,
              });

              if (p.isCancel(orgName)) {
                p.cancel("Cancelled");
                process.exit(0);
              }

              const createdOrg = await apiRequest<Organization>("/v1/organizations", {
                apiUrl,
                token,
                method: "POST",
                body: { name: orgName },
              });

              organizationId = createdOrg.id;
            }
            else if (organizations.data.length === 1) {
              organizationId = organizations.data[0].id;
            }
            else {
              const selected = await p.select({
                message: "Select organization",
                options: organizations.data.map((org) => ({
                  value: org.id,
                  label: org.name,
                })),
              });

              if (p.isCancel(selected)) {
                p.cancel("Cancelled");
                process.exit(0);
              }

              organizationId = selected;
            }
          }

          if (!name) {
            const enteredName = await p.text({
              message: "App name",
              placeholder: "My SaaS",
              validate: required,
            });

            if (p.isCancel(enteredName)) {
              p.cancel("Cancelled");
              process.exit(0);
            }

            name = enteredName;
          }
        }

        if (websiteUrl) {
          websiteUrl = await resolveAppWebsiteUrl(websiteUrl);
        }

        const body: Record<string, unknown> = {
          organization_id: organizationId,
          name,
        };

        if (websiteUrl) {
          body.website_url = websiteUrl;
        }

        while (true) {
          try {
            const created = await apiRequest<App>("/v1/apps", {
              apiUrl,
              token,
              method: "POST",
              body,
            });

            if (options.json) {
              console.log(JSON.stringify(created, null, 2));
              return;
            }

            console.log(`Created app ${created.name} (${created.id})`);
            return;
          }
          catch (error) {
            if (error instanceof ApiRequestError && !websiteUrl) {
              p.log.error(error.message);
              websiteUrl = await resolveAppWebsiteUrl();
              body.website_url = websiteUrl;
              continue;
            }

            throw error;
          }
        }
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  apps
    .command("update")
    .description("Update an app's default program or Network visibility")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .requiredOption("--app-id <id>", "App ID")
    .option("--default-program-id <id>", "Default program ID")
    .option("--show-in-network", "Show the app in the RefKit Network")
    .option("--hide-from-network", "Hide the app from the RefKit Network")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      appId: string;
      defaultProgramId?: string;
      showInNetwork?: boolean;
      hideFromNetwork?: boolean;
    }) => {
      try {
        if (options.showInNetwork && options.hideFromNetwork) {
          throw new Error("Choose either --show-in-network or --hide-from-network.");
        }

        const body: Record<string, unknown> = {};

        if (options.defaultProgramId) {
          body.default_program_id = options.defaultProgramId;
        }

        if (options.showInNetwork) {
          body.network_visible = true;
        }
        else if (options.hideFromNetwork) {
          body.network_visible = false;
        }

        if (Object.keys(body).length === 0) {
          throw new Error("Provide a default program or Network visibility change.");
        }

        const { apiUrl, token } = getAuthContext(options);
        const updated = await apiRequest<App>(`/v1/apps/${options.appId}`, {
          apiUrl,
          token,
          method: "PATCH",
          body,
        });

        if (options.json) {
          console.log(JSON.stringify(updated, null, 2));
          return;
        }

        console.log(`Updated app ${updated.name} (${updated.id})`);
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  const agreement = apps
    .command("agreement")
    .description("App-level affiliate agreement");

  agreement
    .command("publish")
    .description("Publish a new app affiliate agreement")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .requiredOption("--app-id <id>", "App ID")
    .requiredOption("--terms-text <text>", "Developer-written affiliate agreement text")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      appId: string;
      termsText: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);

        const result = await apiRequest<unknown>(
          `/v1/apps/${options.appId}/agreement`,
          {
            apiUrl,
            token,
            method: "PATCH",
            body: {
              terms_text: options.termsText,
            },
          }
        );

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(`Published new agreement for app ${options.appId}`);
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  apps
    .command("disconnect-stripe")
    .description("Disconnect live Stripe so the app can switch to API reporting")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .requiredOption("--app-id <id>", "App ID")
    .option("--test", "Disconnect the test Stripe connection instead of live")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      appId: string;
      test?: boolean;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);
        const result = await apiRequest<{
          connection: {
            id: string;
            stripe_account_id: string;
            livemode: boolean;
            status: string;
          };
        }>("/v1/stripe/disconnect", {
          apiUrl,
          token,
          method: "POST",
          body: {
            app_id: options.appId,
            livemode: !options.test,
          },
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(
          `Disconnected ${result.connection.livemode ? "live" : "test"} Stripe for app ${options.appId}`,
        );
      }
      catch (error) {
        handleCommandError(error);
      }
    });
}

export async function selectApp(apiUrl: string, token: string) {
  const organizations = await apiRequest<{ data: Organization[] }>(
    "/v1/organizations",
    { apiUrl, token }
  );

  if (organizations.data.length === 0) {
    throw new Error("No organizations found. Create one with `refkitnet apps create`.");
  }

  let organizationId = organizations.data[0].id;

  if (organizations.data.length > 1) {
    const selectedOrg = await p.select({
      message: "Select organization",
      options: organizations.data.map((org) => ({
        value: org.id,
        label: org.name,
      })),
    });

    if (p.isCancel(selectedOrg)) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    organizationId = selectedOrg;
  }

  const apps = await apiRequest<ListResponse<App>>("/v1/apps", {
    apiUrl,
    token,
    query: {
      organization_id: organizationId,
      limit: 100,
    },
  });

  const createNew = await p.select({
    message: "App",
    options: [
      ...apps.data.map((app) => ({
        value: app.id,
        label: `${app.name} (${app.id})`,
      })),
      { value: "__create__", label: "Create a new app" },
    ],
  });

  if (p.isCancel(createNew)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  if (createNew === "__create__") {
    const name = await p.text({
      message: "App name",
      placeholder: "My SaaS",
      validate: required,
    });

    if (p.isCancel(name)) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    while (true) {
      const websiteUrl = await resolveAppWebsiteUrl();

      try {
        return await apiRequest<App>("/v1/apps", {
          apiUrl,
          token,
          method: "POST",
          body: {
            organization_id: organizationId,
            name,
            website_url: websiteUrl,
          },
        });
      }
      catch (error) {
        if (error instanceof ApiRequestError) {
          p.log.error(error.message);
          continue;
        }

        throw error;
      }
    }
  }

  const app = apps.data.find((row) => row.id === createNew);

  if (!app) {
    throw new Error("Selected app not found.");
  }

  return app;
}
