import { chain, map, pipe, tryCatch } from "rambda";
import logger from "../utils/logger";
import prisma from "../utils/prisma";
import { PollJob } from "./service";
import typesense from "../utils/typesense";
import type { synctime, video_translations } from "@prisma/client";
import type { OverrideProperties } from "type-fest";

type VideoTranslation = Pick<
	video_translations,
	"languages_code" | "keywords" | "title" | "slug" | "id"
>;

export class SyncUpdatedItems extends PollJob {
	private sync: synctime = {
		id: 1, // This is a placeholder value. It will be updated after the first run.
		failed_items: 0,
		synced_items: 0, // Synced items since last batch.
		batch_size: 1000,
		last_synced_time: new Date(),
	};
	private targetCollection = "videos";

	constructor() {
		super("sync-updated-items", "*/25 * * * * *");
	}

	async once(): Promise<void> {
		const syncTime = await prisma.synctime.findFirst({});

		this.sync = syncTime ?? this.sync;
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
			take: this.sync.batch_size ?? 1000,
			where: {
				status: "processed",
				// Only fetch items that have been updated since the last sync.
				updated_at: { gt: this.sync.last_synced_time ?? new Date() },
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
	}

	private async upsertDocuments(
		docs: OverrideProperties<VideoTranslation, { id: string }>[],
	): Promise<void> {
		let failedDocs = 0;
		let succeededDocs = 0;

		logger.info(`Total docs in queue: ${docs.length}`, {
			label: "sync-service",
		});

		const health = await typesense.health.retrieve();

		if (!health.ok) {
			logger.error("Typesense is not ready.", {
				label: "sync-service",
			});
			return;
		}

		await Promise.all(
			docs.map(async (doc) => {
				try {
					await tryCatch<void, Promise<VideoTranslation> | null>(
						async () =>
							(await typesense
								.collections(this.targetCollection)
								.documents()
								.upsert(doc)) as VideoTranslation,
						null,
					)();
					succeededDocs++;
				} catch {
					failedDocs++;
				}
			}),
		);
		if (failedDocs > 0) {
			logger.error(`${failedDocs} documents failed to upsert`, {
				label: "sync-service",
			});
		}

		this.sync.failed_items = failedDocs;
		this.sync.synced_items = succeededDocs;
		await this.updateSyncTime();
	}

	private async updateSyncTime(): Promise<void> {
		const result = await prisma.synctime.update({
			where: { id: this.sync.id },
			data: {
				last_synced_time: new Date(),
				failed_items: this.sync.failed_items,
				synced_items: this.sync.synced_items,
			},
		});
		this.sync = result;
	}
}
