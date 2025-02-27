import prisma from "./prisma";
import typesense from "./typesense";
import logger from "./logger";
import { forEach } from "rambda";

let lastSyncTime: Date = new Date(0);
const targetCollection = "videos";

type VideoLang = "en-US" | "es-ES" | "jp-JP" | "vn-VN" | "fr-FR" | "de-DE";

interface VideoDocument {
	id: string;
	keywords: string | null;
	title: string | null;
	slug: string | null;
}

interface VideoTranslation {
	lang: VideoLang | null;
	content: VideoDocument;
	updated_at: number;
}

async function ensureCollectionExists(): Promise<void> {
	const exists = await typesense.collections(targetCollection).exists();
	if (!exists) {
		logger.info(`Collection ${targetCollection} does not exist. Creating...`, {
			label: "sync-service",
		});
		await typesense.collections().create({
			name: targetCollection,
			fields: [
				{ name: ".*", type: "auto" },
				{ name: "updated_at", type: "int32" },
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
	const freshItems = await prisma.video.findMany({
		select: {
			id: true,
			updated_at: true,
			video_translations: {
				select: {
					languages_code: true,
					keywords: true,
					title: true,
					slug: true,
				},
			},
		},
		where: {
			status: "processed",
			updated_at: {
				gt: lastSyncTime,
			},
		},
	});

	if (freshItems.length > 0) {
		logger.info(`Found ${freshItems.length} item(s) to sync.`, {
			label: "sync-service",
		});

		forEach(async (item) => {
			for (const translation of item.video_translations) {
				const doc = {
					lang: translation.languages_code as VideoLang,
					content: {
						id: String(item.id),
						keywords: translation.keywords,
						title: translation.title,
						slug: translation.slug,
					},
					updated_at: Math.floor(
						new Date(item.updated_at ?? 0).getTime() / 1000,
					),
				} satisfies VideoTranslation;

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
		}, freshItems);

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
