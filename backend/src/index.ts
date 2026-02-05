import { buildServer } from "./server";
import { config } from "./config";
import { runBootstrap } from "./bootstrap";

async function start() {
  await runBootstrap();
  const app = await buildServer();
  await app.listen({ port: config.port, host: config.host });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
