import { PrismaClient } from "@prisma/client";
import Typesense from "typesense";
import logger from "./logger"; // Import the decoupled logger
import type { CollectionSchema } from "typesense/lib/Typesense/Collection";

// Configure the poll interval.
const POLL_INTERVAL = Number.parseInt(process.env.POLL_INTERVAL || "10000", 10);

// Initialize Prisma with detailed logging.
const prisma = new PrismaClient({
	log: ["query", "info", "warn", "error"],
});

// Initialize Typesense client.
const typesenseClient = new Typesense.Client({
	nodes: [
		{
			host: process.env.TYPESENSE_HOST || "typesense",
			port: Number.parseInt(process.env.TYPESENSE_PORT || "8108", 10),
			protocol: process.env.TYPESENSE_PROTOCOL || "http",
		},
	],
	apiKey: process.env.TYPESENSE_API_KEY || "xyz",
	connectionTimeoutSeconds: 2,
});

// Set the initial last sync time.
let lastSyncTime: Date = new Date(0);

// Poll the database for updated items and sync them to Typesense.
async function pollAndSync() {
	try {
		const updatedItems = await prisma.video.findMany({
			include: {
				video_translations: true,
			},
			where: {
				updated_at: {
					gt: lastSyncTime,
				},
			},
		});

		if (updatedItems.length > 0) {
			logger.info(`Found ${updatedItems.length} item(s) to sync.`, {
				label: "sync-service",
			});
			for (const item of updatedItems) {
				const doc = {
					id: item.id,
					keywords: item.video_translations.map((t) => t.slug),
					title: item.video_translations.map((t) => t.title),
					slug: item.video_translations.map((t) => t.slug),
					updated_at: Math.floor(
						new Date(item.updated_at || 0).getTime() / 1000,
					),
				};

				try {
					const target = "videos";
					const isTargetExisting = await typesenseClient
						.collections(target)
						.exists();

					if (!isTargetExisting) {
						await typesenseClient.collections().create({
							name: target,
							fields: [
								{ name: "id", type: "int32" },
								{ name: "keywords", type: "string[]", optional: true },
								{ name: "title", type: "string[]", optional: true },
								{ name: "slug", type: "string[]", optional: true },
								{ name: "updated_at", type: "int64" },
							],
							default_sorting_field: "updated_at",
						});
					}

					await typesenseClient.collections(target).documents().upsert(doc);
					logger.info(`Upserted item ${item.id}.`, {
						label: "sync-service",
					});
				} catch (err) {
					logger.error(`Error upserting item ${item.id}:`, err, {
						label: "sync-service",
					});
				}
			}
			// Update last sync time after processing.
			lastSyncTime = new Date();
		} else {
			logger.info("No new or updated items to sync.", {
				label: "sync-service",
			});
		}
	} catch (err) {
		logger.error("Error polling database:", err, {
			label: "sync-service",
		});
	}
}

async function main() {
	await prisma.$connect();
	logger.info("Connected to MariaDB via Prisma.", {
		label: "sync-service",
	});

	typesenseClient.presets;
	// Perform an initial sync.
	await pollAndSync();

	// Set up the polling loop.
	setInterval(pollAndSync, POLL_INTERVAL);
}

main().catch((err) => {
	logger.error("Error starting sync service:", err, {
		label: "sync-service",
	});
	process.exit(1);
});
