import env from "./utils/env";
import logger from "./utils/logger";
import { pollAndSync } from "./utils/pollSync";
import prisma from "./utils/prisma";

async function main() {
	await prisma.$connect();
	logger.info("Connected to database via Prisma.", {
		label: "sync-service",
	});

	// // Perform an initial sync.
	// await pollAndSync();

	// // Set up the polling loop.
	// setInterval(pollAndSync, env.POLL_INTERVAL);
}

main().catch((err) => {
	logger.error("Error starting sync service:", err, {
		label: "sync-service",
	});
	process.exit(1);
});
