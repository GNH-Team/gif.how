import { isNil } from "rambda";
import type { sync_service, video_translations } from "@prisma/client";
import type { OverrideProperties } from "type-fest";
import type { SearchResponse } from "typesense/lib/Typesense/Documents";

import { PollJob } from "./service";
import logger from "../utils/logger";
import prisma from "../utils/prisma";
import typesense from "../utils/typesense";

const JOB_NAME = "prune-removed-items";

type VideoTranslation = OverrideProperties<
	Pick<
		video_translations,
		"id" | "languages_code" | "keywords" | "title" | "slug"
	>,
	{ id: string }
>;

export class PruneRemovedItems extends PollJob {
	// This sync_service record keeps track of this job’s state.
	private sync: sync_service | null = null;
	private targetCollection = "videos";

	constructor() {
		// Schedule as needed. Here we use the same cron pattern as the sync job.
		super(JOB_NAME, "*/30 * * * * *");
	}

	// Initializes the sync record for the prune job.
	async once(): Promise<void> {
		const syncRecord = await prisma.sync_service.findFirst({
			where: {},
			orderBy: { id: "asc" },
		});
		this.sync = syncRecord;
	}

	async run(): Promise<void> {
		if (isNil(this.sync)) {
			await this.once();
			return;
		}

		// Retrieve a batch of documents from Typesense with a wildcard search.
		let searchResult: SearchResponse<VideoTranslation>;
		try {
			searchResult = await typesense
				.collections<VideoTranslation>(this.targetCollection)
				.documents()
				.search({
					q: "*",
					query_by: ["title", "keywords", "slug"],
					per_page: this.sync.batch_size ?? 1000,
					page: 1,
				});
		} catch (error) {
			logger.error("Error retrieving documents from Typesense.", {
				error,
				label: JOB_NAME,
			});
			return;
		}

		logger.debug("Search hits:", searchResult.hits);

		// Extract document IDs from the search hits.
		if (isNil(searchResult.hits)) {
			return;
		}
		const docIds: string[] = searchResult.hits.map((hit) => hit.document.id);

		// Fetch all current video translation IDs from the database that are published.
		const translations = await prisma.video_translations.findMany({
			select: { id: true },
			where: {
				id: { in: docIds.map(Number) },
				status: "published",
			},
			take: this.sync.batch_size ?? 1000,
		});

		const validIds = new Set(translations.map((t) => String(t.id)));

		// Identify documents that either do not exist in the database or are not published.
		const docsToPrune = docIds.filter((docId) => !validIds.has(docId));

		if (docsToPrune.length === 0) {
			logger.info("No items to prune.", { label: JOB_NAME });
			return;
		}

		logger.info(`Found ${docsToPrune.length} item(s) to prune.`, {
			label: JOB_NAME,
		});

		// Attempt to delete each stale document from Typesense.
		const failedDocs: string[] = [];
		const succeededDocs: string[] = [];

		await Promise.all(
			docsToPrune.map(async (docId) => {
				try {
					await typesense
						.collections(this.targetCollection)
						.documents(docId)
						.delete();
					succeededDocs.push(docId);
				} catch (error) {
					logger.error(`Failed to delete document ${docId}`, {
						error,
						label: JOB_NAME,
					});
					failedDocs.push(docId);
				}
			}),
		);

		if (failedDocs.length > 0) {
			logger.error(`${failedDocs.length} document(s) failed to delete.`, {
				label: JOB_NAME,
			});
		}
	}
}
