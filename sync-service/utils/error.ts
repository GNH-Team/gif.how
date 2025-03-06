import { Type } from "@sinclair/typebox";
import { ErrorCatalog, ErrorNames, type ErrorCatalogIndex } from "./errorbank";
import ajv from "./validate";

/**
 * Custom error class for internal backend usage.
 * It encapsulates a custom error code, a default or overridden message,
 * an HTTP status code, and an operational flag.
 */
export class CustomError extends Error {
	public readonly code: string;
	public readonly isOperational: boolean;

	/**
	 * Creates an instance of CustomError.
	 *
	 * @param code - Custom error code (e.g., "GNH-400").
	 * @param message - Optional custom message. If omitted, the default message from ErrorCatalog is used.
	 * @param isOperational - Flag indicating if the error is operational (defaults to true).
	 */
	constructor(code: ErrorCatalogIndex, message?: string, isOperational = true) {
		const defaultMessage = ErrorCatalog[code] || "An error occurred.";

		super(message || defaultMessage);
		this.code = code;
		this.isOperational = isOperational;

		// Set the prototype explicitly to maintain correct instanceof checks.
		Object.setPrototypeOf(this, CustomError.prototype);

		// Capture stack trace if available (useful for debugging in V8 engines).
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, CustomError);
		}
	}
}

export const ErrorCatalogSchema = Type.Record(
	// Validate that keys match the pattern "GNH-XXX"
	Type.String({ pattern: "^GNH-\\d{3}$" }),
	Type.String(),
	{
		description: "Mapping of error codes to messages",
		uniqueObjectValues: true,
	},
);

// Schema for ErrorNames: keys are descriptive names and values must be valid error codes.
export const ErrorNamesSchema = Type.Record(
	Type.String(),
	Type.String({ pattern: "^GNH-\\d{3}$" }),
	{
		description: "Mapping of error names to error codes",
		uniqueObjectValues: true,
	},
);

const validateErrorCatalog = ajv.compile(ErrorCatalogSchema);
const validCatalog = validateErrorCatalog(ErrorCatalog);

if (!validCatalog) {
	console.error("ErrorCatalog validation errors:", validateErrorCatalog.errors);
	throw new Error("ErrorCatalog validation failed");
}

// Validate ErrorNames
const validateErrorNames = ajv.compile(ErrorNamesSchema);
const validNames = validateErrorNames(ErrorNames);

if (!validNames) {
	console.error("ErrorNames validation errors:", validateErrorNames.errors);
	throw new Error("ErrorNames validation failed");
}
