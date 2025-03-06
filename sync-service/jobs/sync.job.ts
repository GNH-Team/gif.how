import { chain, map, pipe, tryCatch } from "rambda";
import logger from "../utils/logger";
import prisma from "../utils/prisma";
import { PollJob } from "./service";
import typesense from "../utils/typesense";
import type { video_translations } from "@prisma/client";
import type { OverrideProperties } from "type-fest";

type VideoTranslation = Pick<
	video_translations,
	"languages_code" | "keywords" | "title" | "slug" | "id"
>;

export class SyncUpdatedItems extends PollJob {
	private lastSyncTime: Date = new Date(0);
	private targetCollection = "videos";
	private maxBatchSize = 1000; // Maximum number of items to sync in a single run.

	constructor() {
		super("sync-updated-items", "*/25 * * * * *");
	}

	async run(): Promise<void> {
		const staleItems = await prisma.video.findMany({
			select: {
				video_translations: {
					select: {
						id: true,
						languages_code: true,
						keywords: true,
						title: true,
						slug: true,
					},
				},
			},
			orderBy: {
				// Prioritize items that have not been synced recently.
				updated_at: "asc",
			},
			take: this.maxBatchSize,
			where: {
				status: "processed",
				// Only fetch items that have been updated since the last sync.
				updated_at: { gt: this.lastSyncTime },
			},
		});

		if (staleItems.length === 0) {
			logger.info("No new or updated items to sync.", {
				label: "sync-service",
			});
			return;
		}

		logger.info(`Found ${staleItems.length} item(s) to sync.`, {
			label: "sync-service",
		});

		// Extract data from items. For example: 1 video that contains 3 translations will be transformed into 3 items.
		// Then change ID type from number to string.
		const docs = pipe<
			[typeof staleItems],
			VideoTranslation[],
			OverrideProperties<VideoTranslation, { id: string }>[]
		>(
			chain(({ video_translations }) => video_translations),
			map((item) => ({
				...item,
				id: String(item.id),
			})),
		)(staleItems);

		await this.upsertDocuments(docs);
		this.lastSyncTime = new Date();
	}

	private async upsertDocuments(
		docs: OverrideProperties<VideoTranslation, { id: string }>[],
	): Promise<void> {
		const failedDocs: string[] = [];

		logger.info(`Total docs in queue: ${docs.length}`, {
			label: "sync-service",
		});

		const health = await typesense.health.retrieve();

		if (health.ok) {
			logger.error("Typesense is not ready.", {
				label: "sync-service",
			});
			return;
		}

		await Promise.all(
			docs.map(async (doc) => {
				const result = await tryCatch<void, Promise<VideoTranslation> | null>(
					async () =>
						(await typesense
							.collections(this.targetCollection)
							.documents()
							.upsert(doc)) as VideoTranslation,
					null,
				)();

				if (!result) failedDocs.push(String(doc.id));
			}),
		);
		if (failedDocs.length > 0) {
			logger.error(`Failed to upsert documents: ${failedDocs.join(", ")}`, {
				label: "sync-service",
			});
		}
	}
}
