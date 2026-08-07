import { configureSeedEnv } from "./env";
import { runSeedCli } from "./index";

async function main() {
  configureSeedEnv();
  await runSeedCli();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
