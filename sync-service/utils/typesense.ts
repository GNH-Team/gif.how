import Typesense from "typesense";

import env from "./env";

const typesense = new Typesense.Client({
	nodes: [
		{
			// biome-ignore lint/style/noNonNullAssertion: <Optional properties have default value>
			host: env.TYPESENSE_HOST!,
			// biome-ignore lint/style/noNonNullAssertion: <Optional properties have default value>
			port: env.TYPESENSE_PORT!,
			// biome-ignore lint/style/noNonNullAssertion: <Optional properties have default value>
			protocol: env.TYPESENSE_PROTOCOL!,
		},
	],
	apiKey: env.TYPESENSE_API_KEY,
	connectionTimeoutSeconds: 4,
});

export default typesense;
