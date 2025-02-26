import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import LokiTransport from "winston-loki";

// Create a Loki transport instance to send logs to Grafana Loki.
const lokiTransport = new LokiTransport({
	host: process.env.LOKI_URL || "http://localhost:3100",
	json: true,
	labels: { app: "sync-service" },
});

const logger = winston.createLogger({
	level: process.env.LOG_LEVEL || "info",
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.json(),
	),
	transports: [
		new winston.transports.Console(),
		new DailyRotateFile({
			filename: "logs/application-%DATE%.log",
			datePattern: "DD-MM-YYYY",
			zippedArchive: true,
			maxSize: "20m",
			maxFiles: "14d",
		}),
		lokiTransport,
	],
	// Handle uncaught exceptions.
	exceptionHandlers: [
		new DailyRotateFile({
			filename: "logs/exceptions-%DATE%.log",
			datePattern: "DD-MM-YYYY",
			zippedArchive: true,
			maxSize: "20m",
			maxFiles: "14d",
		}),
	],
	// Handle unhandled promise rejections.
	rejectionHandlers: [
		new DailyRotateFile({
			filename: "logs/rejections-%DATE%.log",
			datePattern: "DD-MM-YYYY",
			zippedArchive: true,
			maxSize: "20m",
			maxFiles: "14d",
		}),
	],
});

// Override default console methods to ensure all logs are routed through Winston.
console.log = logger.info.bind(logger);
console.error = logger.error.bind(logger);

export default logger;
