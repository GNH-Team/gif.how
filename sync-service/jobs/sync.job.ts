import { tryCatch } from "rambda";
import type { OverrideProperties } from "type-fest";
import { DateTime } from "luxon";
import type { sync_service, video_translations } from "@prisma/client";

import { PollJob } from "./service";

import logger from "../utils/logger";
import prisma from "../utils/prisma";
import typesense from "../utils/typesense";

const JOB_NAME = "sync-updated-items";

type VideoTranslation = Pick<
	video_translations,
	"languages_code" | "keywords" | "title" | "slug" | "id"
>;

export class SyncUpdatedItems extends PollJob {
	private sync: sync_service = {
		id: 1, // This is a placeholder value. It will be updated after the first run.
		failed_items: "",
		synced_items: "",
		batch_size: 1000,
		last_sync_time: DateTime.now().toJSDate(),
	};
	private targetCollection = "videos";

	constructor() {
		super(JOB_NAME, "*/25 * * * * *");
	}

	async once(): Promise<void> {
		const syncRecord = await prisma.sync_service.findFirst({
			where: {},
			select: {
				batch_size: true,
				failed_items: true,
				id: true,
				last_sync_time: true,
				synced_items: true,
			},
			take: this.sync.batch_size ?? 1000,
			orderBy: {
				id: "asc",
			},
		});

		if (syncRecord != null) this.sync = syncRecord;
	}

	async run(): Promise<void> {
		// Store current query time to use as next last_sync_time
		const queryTime = DateTime.now().toJSDate();

		const staleItems = await prisma.video_translations.findMany({
			select: {
				id: true,
				languages_code: true,
				keywords: true,
				title: true,
				slug: true,
			},
			orderBy: {
				video: {
					updated_at: "asc",
				},
			},
			where: {
				status: "published",
				video: {
					updated_at: { gte: this.sync.last_sync_time },
				},
			},
		});

		if (!staleItems.length) {
			logger.debug("No new or updated items to sync.", {
				label: JOB_NAME,
			});
			return;
		}

		logger.debug(`Found ${staleItems.length} item(s) to sync.`, {
			label: JOB_NAME,
		});

		// Transform items and change ID type from number to string.
		const docs = staleItems.map((item) => ({
			...item,
			id: String(item.id),
		}));

		await this.upsertDocuments(docs);

		// After processing, update sync time to the stored query time.
		await this.updatesyncRecord(queryTime);
	}

	private async upsertDocuments(
		docs: OverrideProperties<VideoTranslation, { id: string }>[],
	): Promise<void> {
		const failedDocs: string[] = [];
		const succeededDocs: string[] = [];

		logger.debug(`Total docs in queue: ${docs.length}`, {
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
					succeededDocs.push(doc.id);
				} catch {
					failedDocs.push(doc.id);
				}
			}),
		);

		if (failedDocs.length > 0) {
			logger.error(`${failedDocs.length} documents failed to upsert`, {
				label: JOB_NAME,
			});
		}

		this.sync.failed_items = failedDocs.join(",");
		this.sync.synced_items = succeededDocs.join(",");
	}

	private async updatesyncRecord(syncRecord: Date): Promise<void> {
		// Use the provided timestamp instead of current time.
		const data = {
			failed_items: this.sync.failed_items,
			synced_items: this.sync.synced_items,
			last_sync_time: syncRecord,
		};

		const result = await prisma.sync_service.upsert({
			where: { id: this.sync.id },
			create: data,
			update: data,
		});

		this.sync = result;
	}
}
