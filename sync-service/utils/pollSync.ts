import prisma from "./prisma";
import typesense from "./typesense";
import logger from "./logger";
import { chain, tryCatch } from "rambda";
import type { video, video_translations } from "@prisma/client";
import type { Simplify } from "type-fest";

let LAST_SYNC_TIME: Date = new Date(0);
const TARGET_COLLECTION = "videos";

type UnprocessedVideoTranslation = Pick<
	video_translations,
	"languages_code" | "keywords" | "title" | "slug"
>;

type UnprocessedVideo = Pick<video, "id" | "updated_at"> & {
	video_translations: UnprocessedVideoTranslation[];
};

interface VideoTranslation {
	id: string;
	updated_at: number;
	lang: UnprocessedVideoTranslation["languages_code"];
	content: Simplify<Omit<UnprocessedVideoTranslation, "languages_code">>;
}

const processTranslation = async (
	item: UnprocessedVideo,
	translation: UnprocessedVideoTranslation,
): Promise<void> => {
	const doc = {
		id: String(item.id),
		lang: translation.languages_code,
		content: {
			keywords: translation.keywords,
			title: translation.title,
			slug: translation.slug,
		},
		updated_at: Math.floor(new Date(item.updated_at ?? 0).getTime() / 1000),
	} satisfies VideoTranslation;

	const result = await tryCatch<void, Promise<VideoTranslation> | null>(
		async () =>
			(await typesense
				.collections(TARGET_COLLECTION)
				.documents()
				.upsert(doc)) as VideoTranslation,
		null,
	)();

	if (result) {
		logger.info(`Item ${item.id} - ${translation.title} upserted.`, {
			label: "sync-service",
		});
	} else {
		logger.error(`Error upserting item ${item.id} - ${translation.title}.`, {
			label: "sync-service",
		});
	}
};

async function ensureCollectionExists(): Promise<void> {
	const exists = await typesense.collections(TARGET_COLLECTION).exists();
	if (!exists) {
		logger.info(`Collection ${TARGET_COLLECTION} does not exist. Creating...`, {
			label: "sync-service",
		});
		await typesense.collections().create({
			name: TARGET_COLLECTION,
			fields: [
				{ name: ".*", type: "auto" },
				{ name: "updated_at", type: "int32" },
			],
			enable_nested_fields: true,
			default_sorting_field: "updated_at",
		});
		logger.info(`Collection ${TARGET_COLLECTION} created.`, {
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
			updated_at: { gt: LAST_SYNC_TIME },
		},
	});

	if (freshItems.length === 0) {
		logger.info("No new or updated items to sync.", {
			label: "sync-service",
		});
		return;
	}

	logger.info(`Found ${freshItems.length} item(s) to sync.`, {
		label: "sync-service",
	});

	// Flatten translations with their parent item.
	const translationsWithItems = chain(
		(item) =>
			item.video_translations.map((translation) => ({ item, translation })),
		freshItems,
	);

	// Process each translation concurrently.
	await Promise.all(
		translationsWithItems.map(({ item, translation }) =>
			processTranslation(item, translation),
		),
	);

	// Update the last sync time.
	LAST_SYNC_TIME = new Date();
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
