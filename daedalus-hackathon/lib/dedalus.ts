import Dedalus from "dedalus-labs";

type ClientOptions = {
    apiKey?: string;
    environment?: "development" | "production";
};

let cachedClient: Dedalus | null = null;

const buildClient = (options: ClientOptions) => {
    if (!options.apiKey) {
        throw new Error("Missing DEDALUS_API_KEY. Set it in your environment or .env file.");
    }

    return new Dedalus({
        apiKey: options.apiKey,
        // Default to production to avoid connecting to a non-existent local dev server.
        environment: options.environment ?? "production",
    });
};

export const getDedalusClient = () => {
    if (cachedClient) {
        return cachedClient;
    }

    const env =
        process.env.DEDALUS_ENV === "development" || process.env.DEDALUS_ENV === "production"
            ? process.env.DEDALUS_ENV
            : "production";

    cachedClient = buildClient({
        apiKey: process.env.DEDALUS_API_KEY,
        environment: env as ClientOptions["environment"],
    });

    return cachedClient;
};

