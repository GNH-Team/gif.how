import { chain, map, pipe, tryCatch } from "rambda";
import type { OverrideProperties } from "type-fest";
import type { sync_service, video_translations } from "@prisma/client";

import { PollJob } from "./service";

import logger from "../utils/logger";
import prisma from "../utils/prisma";
import typesense from "../utils/typesense";
import { DateTime } from "luxon";
import config from "../utils/env";

const JOB_NAME = "sync-updated-items";

type VideoTranslation = Pick<
	video_translations,
	"languages_code" | "keywords" | "title" | "slug" | "id"
>;
export class SyncUpdatedItems extends PollJob {
	private sync: sync_service = {
		id: 1, // This is a placeholder value. It will be updated after the first run.
		failed_items: 0,
		synced_items: 0, // Synced items since last batch.
		batch_size: 1000,
		last_sync_time: new Date(0),
	};
	private targetCollection = "videos";

	constructor() {
		super(JOB_NAME, "*/25 * * * * *");
	}

	async once(): Promise<void> {
		const syncTime = await prisma.sync_service.findFirst({});

		if (syncTime === null) {
			await prisma.sync_service.create({
				data: this.sync,
			});
		}
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
				// biome-ignore lint/style/noNonNullAssertion: <It's safe to assume that last_sync_time is not null.>
				updated_at: { gt: this.sync.last_sync_time! },
			},
		});

		if (staleItems.length === 0) {
			logger.info("No new or updated items to sync.", {
				label: JOB_NAME,
			});
			return;
		}

		logger.info(`Found ${staleItems.length} item(s) to sync.`, {
			label: JOB_NAME,
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
			label: JOB_NAME,
		});

		const health = await typesense.health.retrieve();

		if (!health.ok) {
			logger.error("Typesense is not ready.", {
				label: JOB_NAME,
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
				label: JOB_NAME,
			});
		}

		this.sync.failed_items = failedDocs;
		this.sync.synced_items = succeededDocs;
		await this.updateSyncTime();
	}

	private async updateSyncTime(): Promise<void> {
		// ! This might not be the best way to handle timezone conversion.
		const offsetHours = config.TZ === "UTC" ? 0 : 7;

		const last_sync_time = DateTime.now()
			.setZone(config.TZ)
			.plus({ hours: offsetHours })
			.toJSDate();

		const data = {
			failed_items: this.sync.failed_items,
			synced_items: this.sync.synced_items,
			last_sync_time,
		};
		const result = await prisma.sync_service.upsert({
			where: { id: this.sync.id },
			create: data,
			update: data,
		});
		this.sync = result;
	}
}
