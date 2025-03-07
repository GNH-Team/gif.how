import logger from "../utils/logger";
import { PollJob } from "./service";
import typesense from "../utils/typesense";

export class CreateCollection extends PollJob {
	private targetCollection = "videos";

	async run(): Promise<void> {
		throw new Error("Method not implemented.");
	}

	constructor() {
		super("create-collection", "", true);
	}

	async once(): Promise<void> {
		await this.ensureCollectionExists();
	}

	private async ensureCollectionExists(): Promise<void> {
		const exists = await typesense.collections(this.targetCollection).exists();

		if (exists) return;

		logger.info(
			`Collection ${this.targetCollection} does not exist. Creating...`,
			{
				label: "sync-service",
			},
		);

		await typesense.collections().create({
			name: this.targetCollection,
			fields: [{ name: ".*", type: "auto" }],
			enable_nested_fields: true,
		});
		logger.info(`Collection ${this.targetCollection} created.`, {
			label: "sync-service",
		});
	}
}
