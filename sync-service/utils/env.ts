import { Type, type Static } from "@sinclair/typebox";

import logger from "./logger";
import ajv from "./validate";

// Define our configuration schema using TypeBox
const ConfigSchema = Type.Object({
	TYPESENSE_HOST: Type.Optional(Type.String({ default: "localhost" })),
	TYPESENSE_PORT: Type.Optional(Type.Number({ default: 8108 })),
	TYPESENSE_PROTOCOL: Type.Optional(Type.String({ default: "http" })),
	LOKI_URL: Type.Optional(Type.String({ default: "http://localhost:3100" })),
	LOG_LEVEL: Type.Optional(Type.String({ default: "info" })),
	TZ: Type.Optional(Type.String({ default: "UTC" })),
	NODE_ENV: Type.Optional(Type.String({ default: "development" })),

	TYPESENSE_API_KEY: Type.String(), // Required
	DATABASE_URL: Type.String() //Required
});

// Extract the type from the schema
export type ConfigType = Static<typeof ConfigSchema>;

export class Config {
	private config: ConfigType;

	constructor() {
		// Compile the validator
		const validate = ajv.compile<ConfigType>(ConfigSchema);

		// Create an object from environment variables
		const envConfig: Record<string, unknown> = {};

		// Only collect defined environment variables
		for (const key in ConfigSchema.properties) {
			if (process.env[key] !== undefined) {
				envConfig[key] = process.env[key];
			}
		}

		// Validate configuration
		const valid = validate(envConfig);

		if (!valid) {
			console.error("Configuration validation failed", {
				errors: validate.errors,
			});
			throw new Error("Configuration validation failed");
		}

		this.config = envConfig as ConfigType;
	}

	public get<T extends keyof ConfigType>(key: T): ConfigType[T] {
		return this.config[key];
	}

	public getAll(): ConfigType {
		return this.config;
	}
}

// Create a singleton instance of the configuration
const configInstance = new Config();


// Export the strongly typed configuration
export const config: ConfigType = configInstance.getAll();

console.log(config)

export default config;
