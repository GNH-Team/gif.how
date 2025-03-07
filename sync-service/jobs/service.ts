import { CronJob, sendAt } from "cron";

import logger from "../utils/logger";

export abstract class PollJob {
	public id: string;
	public isSideEffect = false;
	public schedule: string;
	abstract run(): Promise<void>;
	public once?(): Promise<void>;

	constructor(id: string, schedule: string, isSideEffect?: boolean) {
		this.id = id;
		this.schedule = schedule;
		this.isSideEffect = isSideEffect ?? this.isSideEffect;
	}
}

export class PollingService {
	private jobs: PollJob[];
	private cronjobs: Record<PollJob["id"], CronJob<() => void, null>> = {};

	constructor(jobs: PollJob[]) {
		this.jobs = jobs;
	}

	async exec(): Promise<void> {
		for (const job of this.jobs) {
			if (job.once) await job.once();

			// Skip side effect jobs
			if (job.isSideEffect) return;

			const cronjob = new CronJob(
				job.schedule,
				job.run.bind(job),
				() => {
					logger.info(`${job.id} ran`);
				},
				true,
				"Asia/Ho_Chi_Minh",
			);

			const dt = sendAt(job.schedule);
			cronjob.addCallback(() => {
				logger.info(`${job.id} ran at ${dt.toISOTime()}`, {
					label: "sync-service",
				});
			});
			cronjob.errorHandler = (error) => {
				logger.error(
					`Error executing poll job: ${job.id} at ${dt.toISOTime()}`,
					error,
					{
						label: "sync-service",
					},
				);
			};
			this.cronjobs[job.id] = cronjob;
		}
	}

	async stop(id: string): Promise<void> {
		if (this.cronjobs[id]) {
			this.cronjobs[id].stop();
			delete this.cronjobs[id];

			logger.info(`Stopped job: ${id}`, {
				label: "sync-service",
			});
		}
	}
}
