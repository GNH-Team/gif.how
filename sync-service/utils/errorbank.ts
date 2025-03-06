import type { SnakeCasedProperties } from "type-fest";

/**
 * Mapping of descriptive error names to their custom error codes.
 * This mapping provides additional context and a more expressive way
 * to reference errors throughout your codebase.
 */
export const ErrorNames = {
	// Client/Validation Errors
	INVALID_INPUT: "GNH-100",
	MISSING_REQUIRED_FIELDS: "GNH-101",
	MALFORMED_SEARCH_QUERY: "GNH-102",

	// Video Processing Errors
	VIDEO_NOT_FOUND: "GNH-200",
	VIDEO_PROCESSING_ERROR: "GNH-201",
	UNSUPPORTED_VIDEO_FORMAT: "GNH-202",
	VIDEO_TRANSCODING_FAILED: "GNH-203",
	VIDEO_METADATA_EXTRACTION_FAILED: "GNH-204",

	// Search & Indexing Errors
	SEARCH_INDEX_ERROR: "GNH-300",
	INVALID_SEARCH_PARAMETERS: "GNH-301",
	SEARCH_SERVICE_UNAVAILABLE: "GNH-302",

	// Server/Infrastructure Errors
	INTERNAL_SERVER_ERROR: "GNH-500",
	DATABASE_CONNECTION_FAILED: "GNH-501",
	SERVICE_UNAVAILABLE: "GNH-502",
	VIDEO_STORAGE_ERROR: "GNH-503",
	THUMBNAIL_GENERATION_FAILED: "GNH-504",

	// Cache Errors
	CACHE_MISS: "GNH-600",
	CACHE_UPDATE_FAILED: "GNH-601",
} as const satisfies SnakeCasedProperties<
	Record<Uppercase<string>, ErrorCatalogIndex>
>;

export type ErrorNames = typeof ErrorNames;
export type ErrorCatalogIndex = `GNH-${number}`;
export type ErrorCatalog = Record<ErrorCatalogIndex, string>;

/**
 * A catalog of internal error codes and their default messages.
 * Codes are grouped by functionality.
 * * 100 - 199: Client/Validation Errors
 * * 200 - 299: Video Processing Errors
 * * 300 - 399: Search & Indexing Errors
 * * 500 - 599: Server/Infrastructure Errors
 * * 600 - 699: Cache Errors
 */
export const ErrorCatalog: ErrorCatalog = {
	//* Client/Validation Errors (100 Series)
	"GNH-100": "Invalid input provided. Please verify your request data.",
	"GNH-101": "Missing required fields. Please check the request parameters.",
	"GNH-102": "Malformed search query. Please refine your query parameters.",

	//* Video Processing Errors (200 Series)
	"GNH-200": "Video not found. The requested video does not exist.",
	"GNH-201":
		"Video processing error. An error occurred during video processing.",
	"GNH-202":
		"Unsupported video format. The provided video format is not supported.",
	"GNH-203":
		"Video transcoding failed. Unable to transcode video to the desired format.",
	"GNH-204":
		"Video metadata extraction failed. Unable to extract video metadata.",

	//* Search & Indexing Errors (300 Series)
	"GNH-300":
		"Search index error. Unable to search videos due to an index error.",
	"GNH-301":
		"Invalid search parameters. Please review your search query parameters.",
	"GNH-302":
		"Search service unavailable. The search service is currently unavailable.",
	//* Server/Infrastructure Errors (500 Series)
	"GNH-500":
		"Internal server error. An unexpected error occurred on the server.",
	"GNH-501": "Database connection failed. Unable to connect to the database.",
	"GNH-502":
		"Service unavailable. The requested service is temporarily unavailable.",
	"GNH-503":
		"Video storage error. Unable to save or retrieve video from storage.",
	"GNH-504": "Thumbnail generation failed. Unable to generate video thumbnail.",

	//* Cache Errors (600 Series)
	"GNH-600": "Cache miss. The requested data is not available in the cache.",
	"GNH-601": "Cache update failed. Unable to update the cache data.",
};
