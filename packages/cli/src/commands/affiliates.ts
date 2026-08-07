import * as p from "@clack/prompts";
import type { Command } from "commander";
import { apiRequest, handleCommandError } from "../api.js";
import { required } from "../lib/prompts.js";
import { getAuthContext } from "./auth.js";

type Affiliate = {
  id: string;
  program_id: string;
  email: string;
  name: string | null;
  link_id?: string;
};

export function registerAffiliatesCommands(program: Command) {
  const affiliates = program
    .command("affiliates")
    .description("Manage affiliates");

  affiliates
    .command("create")
    .description("Create an affiliate")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .option("--program-id <id>", "Program ID")
    .option("--email <email>", "Affiliate email")
    .option("--name <name>", "Affiliate name")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      programId?: string;
      email?: string;
      name?: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);

        let programId = options.programId;
        let email = options.email;
        let name = options.name;

        if (!programId) {
          const enteredProgramId = await p.text({
            message: "Program ID",
            validate: required,
          });

          if (p.isCancel(enteredProgramId)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          programId = enteredProgramId;
        }

        if (!email) {
          const enteredEmail = await p.text({
            message: "Affiliate email",
            placeholder: "affiliate@example.com",
            validate: required,
          });

          if (p.isCancel(enteredEmail)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          email = enteredEmail;
        }

        if (!name) {
          const enteredName = await p.text({
            message: "Affiliate name (optional)",
          });

          if (p.isCancel(enteredName)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          if (enteredName) {
            name = enteredName;
          }
        }

        const body: Record<string, unknown> = {
          program_id: programId,
          email,
        };

        if (name) {
          body.name = name;
        }

        const created = await apiRequest<Affiliate>("/v1/program-affiliates", {
          apiUrl,
          token,
          method: "POST",
          body,
        });

        if (options.json) {
          console.log(JSON.stringify(created, null, 2));
          return;
        }

        console.log(`Created affiliate ${created.email} (${created.id})`);
      }
      catch (error) {
        handleCommandError(error);
      }
    });
}
