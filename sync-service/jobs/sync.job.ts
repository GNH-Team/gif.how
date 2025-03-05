import { chain, map, pipe, tryCatch } from "rambda";
import logger from "../utils/logger";
import prisma from "../utils/prisma";
import { PollJob } from "./service";
import typesense from "../utils/typesense";
import type { video, video_translations } from "@prisma/client";
import type { Simplify } from "type-fest";

type VideoTranslation = Pick<
	video_translations,
	"languages_code" | "keywords" | "title" | "slug"
>;

type UnprocessedData = Pick<video, "id" | "updated_at"> & {
	video_translations: VideoTranslation[];
};

type ProcessedData = Simplify<VideoTranslation> & {
	id: string;
	updated_at: number;
};

export class SyncUpdatedItems extends PollJob {
	private lastSyncTime: Date = new Date(0);
	private targetCollection = "videos";
	private maxBatchSize = 1000; // Maximum number of items to sync in a single run.

	constructor() {
		super("sync-updated-items", "*/10 * * * * *");
	}

	async run(): Promise<void> {
		const staleItems: UnprocessedData[] = await prisma.video.findMany({
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

		const docs = pipe<
			[UnprocessedData[]],
			Array<{
				item: Simplify<Omit<UnprocessedData, "video_translations">>;
				translation: VideoTranslation;
			}>,
			ProcessedData[]
		>(
			chain((item) =>
				item.video_translations.map((translation) => ({
					item: { id: item.id, updated_at: item.updated_at },
					translation,
				})),
			),
			map(({ item, translation }) =>
				this.processTranslation(item, translation),
			),
		)(staleItems);

		await this.upsertDocuments(docs);

		// Update the last sync time.
		this.lastSyncTime = new Date();

		// Update last sync time in the database.
		this.updateLastSyncTime(staleItems.map((item) => item.id));
	}

	private processTranslation(
		item: Omit<UnprocessedData, "video_translations">,
		translation: VideoTranslation,
	): ProcessedData {
		logger.info(`Process ${item.id} with ${translation.languages_code}`, {
			label: "sync-service",
		});
		const doc = {
			id: String(item.id),
			updated_at: Math.floor(new Date(item.updated_at ?? 0).getTime() / 1000),
			...translation,
		} satisfies ProcessedData;

		return doc;
	}

	private async updateLastSyncTime(
		items: UnprocessedData["id"][],
	): Promise<void> {
		await prisma.video
			.updateMany({
				where: {
					id: { in: items },
				},
				data: { updated_at: this.lastSyncTime },
			})
			.then(() => {
				logger.info("Last sync time updated in the database.", {
					label: "sync-service",
				});
			});
	}

	private async upsertDocuments(docs: ProcessedData[]): Promise<void> {
		const failedDocs: string[] = [];
		await Promise.all(
			docs.map(async (doc) => {
				const result = await tryCatch<void, Promise<ProcessedData> | null>(
					async () =>
						(await typesense
							.collections(this.targetCollection)
							.documents()
							.upsert(doc)) as ProcessedData,
					null,
				)();

				if (!result) failedDocs.push(doc.id);
			}),
		);
		if (failedDocs.length > 0) {
			logger.error(`Failed to upsert documents: ${failedDocs.join(", ")}`, {
				label: "sync-service",
			});
		}
	}
}
