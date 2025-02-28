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

interface ProcessedData {
	id: string;
	updated_at: number;
	lang: VideoTranslation["languages_code"];
	content: Simplify<Omit<VideoTranslation, "languages_code">>;
}

export class SyncUpdatedItems extends PollJob {
	private lastSyncTime: Date = new Date(0);
	private targetCollection = "videos";
	private maxBatchSize = 1000;

	constructor() {
		super("sync-updated-items", "*/30 * * * * *");
	}

	async run(): Promise<void> {
		await this.syncUpdatedItems();
	}

	private processTranslation(
		item: UnprocessedData,
		translation: VideoTranslation,
	): ProcessedData {
		const doc = {
			id: String(item.id),
			lang: translation.languages_code,
			content: {
				keywords: translation.keywords,
				title: translation.title,
				slug: translation.slug,
			},
			updated_at: Math.floor(new Date(item.updated_at ?? 0).getTime() / 1000),
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

	private async syncUpdatedItems(): Promise<void> {
		const freshItems: UnprocessedData[] = await prisma.video.findMany({
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
				updated_at: { gt: this.lastSyncTime },
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

		const docs = pipe<
			[UnprocessedData[]],
			Array<{
				item: UnprocessedData;
				translation: VideoTranslation;
			}>,
			ProcessedData[]
		>(
			chain((item) =>
				item.video_translations.map((translation) => ({ item, translation })),
			),
			map(({ item, translation }) =>
				this.processTranslation(item, translation),
			),
		)(freshItems);

		await this.upsertDocuments(docs);

		// Update the last sync time.
		this.lastSyncTime = new Date();

		// Update last sync time in the database.
		this.updateLastSyncTime(freshItems.map((item) => item.id));
	}
}
