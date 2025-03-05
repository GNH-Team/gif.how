import { CreateCollection } from "./jobs/createCollection.job";
import { PollingService } from "./jobs/service";
import { SyncUpdatedItems } from "./jobs/sync.job";
import logger from "./utils/logger";
import prisma from "./utils/prisma";

async function main() {
	await prisma.$connect();
	logger.info("Connected to database via Prisma.", {
		label: "sync-service",
	});

	const jobs = [new SyncUpdatedItems(), new CreateCollection()];

	const pollingService = new PollingService(jobs);

	pollingService.exec();
}

main().catch((err) => {
	logger.error("Error starting sync service:", err, {
		label: "sync-service",
	});
	process.exit(1);
});
