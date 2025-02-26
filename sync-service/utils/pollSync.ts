import prisma from "./prisma";
import typesense from "./typesense";
import logger from "./logger";

let lastSyncTime: Date = new Date(0);
const targetCollection = "videos";

async function ensureCollectionExists(): Promise<void> {
	const exists = await typesense.collections(targetCollection).exists();
	if (!exists) {
		logger.info(`Collection ${targetCollection} does not exist. Creating...`, {
			label: "sync-service",
		});
		await typesense.collections().create({
			name: targetCollection,
			fields: [
				{ name: "keywords", type: "string[]", optional: true },
				{ name: "title", type: "string[]" },
				{ name: "slug", type: "string[]" },
				{ name: "updated_at", type: "int64" },
			],
			enable_nested_fields: true,
			default_sorting_field: "updated_at",
		});
		logger.info(`Collection ${targetCollection} created.`, {
			label: "sync-service",
		});
	}
}

async function syncUpdatedItems(): Promise<void> {
	const updatedItems = await prisma.video.findMany({
		include: {
			video_translations: true,
		},
		where: {
			status: "processed",
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
				id: String(item.id),
				keywords: item.video_translations.map((t) => t.keywords),
				title: item.video_translations.map((t) => t.title),
				slug: item.video_translations.map((t) => t.slug),
				updated_at: Math.floor(new Date(item.updated_at ?? 0).getTime() / 1000),
			};

			try {
				await typesense.collections(targetCollection).documents().upsert(doc);
				logger.info(`Upserted item ${item.id}.`, {
					label: "sync-service",
				});
			} catch (err) {
				logger.error(
					`Error upserting item ${item.id} - ${item.video_translations.map(
						(t) => t.title,
					)}:`,
					err,
					{ label: "sync-service" },
				);
			}
		}
		// Update last sync time after processing.
		lastSyncTime = new Date();
	} else {
		logger.info("No new or updated items to sync.", {
			label: "sync-service",
		});
	}
}

export async function pollAndSync(): Promise<void> {
	try {
		await ensureCollectionExists();
		await syncUpdatedItems();
	} catch (err) {
		logger.error("Error during poll and sync:", err, {
			label: "sync-service",
		});
	}
}
