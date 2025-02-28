import type { Entries } from "type-fest";
import logger from "./logger";

// Define the expected types for our environment variables.
type EnvValueType = "string" | "number" | "boolean";

interface EnvVarSchema<T> {
	type: EnvValueType;
	required?: boolean;
	defaultValue?: T;
}

// Define our overall configuration type.
export interface ConfigType {
	TYPESENSE_HOST: string;
	TYPESENSE_PORT: number;
	TYPESENSE_PROTOCOL: string;
	TYPESENSE_API_KEY: string;
	LOKI_URL: string;
}

// Define the configuration schema.
const schema: SchemaDefinition = {
	TYPESENSE_HOST: {
		type: "string",
		required: true,
	},
	TYPESENSE_PORT: {
		type: "number",
		required: false,
		defaultValue: 8108,
	},
	TYPESENSE_PROTOCOL: {
		type: "string",
		required: false,
		defaultValue: "http",
	},
	TYPESENSE_API_KEY: {
		type: "string",
		required: true,
	},
	LOKI_URL: {
		type: "string",
		required: true,
	},
};

// A schema maps friendly property names to a configuration for that environment variable.
type SchemaDefinition = {
	[propName in keyof ConfigType]: EnvVarSchema<unknown>;
};

export class Config {
	private config: ConfigType;

	/**
	 * Converts the string value to the target type.
	 */
	private convertValue(key: string, value: unknown, type: EnvValueType) {
		switch (type) {
			case "number": {
				const num = Number(value);
				if (Number.isNaN(num)) {
					throw new Error(
						`Environment variable ${key} should be a number, got: ${value}`,
					);
				}
				return num;
			}
			case "boolean": {
				// Convert common truthy values.
				return ["true", "1", "yes"].includes(String(value).toLowerCase());
			}
			default:
				return value as string;
		}
	}

	/**
	 * Loads and validates the configuration based on the schema.
	 */
	private loadConfig(schema: SchemaDefinition): ConfigType {
		const entries = Object.entries(schema) as Entries<SchemaDefinition>;

		return entries.reduce(
			(acc, [propName, { type, defaultValue, required }]) => {
				if (process.env[propName] === undefined && required) {
					logger.error(`Missing required environment variable: ${propName}`);
					throw new Error();
				}

				const rawValue =
					this.convertValue(propName, process.env[propName], type) ||
					defaultValue;

				return Object.assign(acc, { [propName]: rawValue });
			},
			{} as ConfigType,
		);
	}

	constructor(schema: SchemaDefinition) {
		this.config = this.loadConfig(schema);
	}

	public get<T extends keyof ConfigType>(key: T): ConfigType[T] {
		return this.config[key];
	}

	public getAll(): ConfigType {
		return this.config;
	}
}

// Create a singleton instance of the configuration.
const configInstance = new Config(schema);

// Export the strongly typed configuration.
export const config: ConfigType = configInstance.getAll();
export default config;
