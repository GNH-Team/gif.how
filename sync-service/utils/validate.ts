import Ajv from "ajv";

const ajv = new Ajv();

// Custom keyword: uniqueObjectValues
ajv.addKeyword({
	keyword: "uniqueObjectValues",
	type: "object",
	compile: (_schema: boolean) => (data: object) => {
		const values = Object.values(data);
		const uniqueValues = new Set(values);
		return uniqueValues.size === values.length;
	},
	errors: false,
});

export default ajv;
