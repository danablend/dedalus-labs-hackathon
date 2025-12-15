import { NextRequest } from "next/server";
import { DedalusRunner } from "dedalus-labs";
import { getDedalusClient } from "@/lib/dedalus";

const DEFAULT_MODEL = process.env.DEDALUS_PROVIDER_MODEL ?? "openai/gpt-4o-mini";
export const maxDuration = 300; // keep the route alive for long MCP + streaming runs
const MCP_SERVERS = [
    "joerup/exa-mcp", // Semantic search
    "simon-liang/brave-search-mcp", // Web search
];

const SYSTEM_MESSAGE = {
    role: "system",
    content: [
        "You are the Elf Compliance Council crafting a festive yet legally sound airspace compliance memo for Santa's sleigh during worldwide Christmas Eve deliveries.",
        "MANDATORY: call MCP server tools to search the live web before drafting.",
        "MANDATORY: ground every claim in real aviation regulations while mentioning Santa, his reindeer team, and the gift-delivery mission; cite source names + URLs from tool results for each factual point.",
        "Keep the tone warmly Christmassy but stay precise and regulatory-focused.",
        "Use this exact outline:",
        "PART I: ISSUE",
        "PART II: FACTS",
        "PART III: ANALYSIS",
        "PART IV: ACTIONS",
        "REFERENCES:",
        "- Bullet list of sourced links or evidence pulled from MCP tool calls.",
    ].join("\n"),
} as const;

export async function POST(req: NextRequest) {
    try {
        const payload = await req.json().catch(() => ({}));
        const messages = Array.isArray(payload?.messages) ? payload.messages : [];
        const model = typeof payload?.model === "string" && payload.model.trim() ? payload.model : DEFAULT_MODEL;

        const client = getDedalusClient();
        const runner = new DedalusRunner(client);
        const allMessages = [SYSTEM_MESSAGE, ...messages];

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                const send = (data: string) => controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                const done = () => {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                };
                const heartbeat = setInterval(() => send(JSON.stringify({ ping: Date.now() })), 15000);
                const stopHeartbeat = () => clearInterval(heartbeat);

                try {
                    const result = await runner.run({
                        messages: allMessages,
                        stream: true,
                        model: "openai/gpt-4.1",
                        mcpServers: MCP_SERVERS,
                        autoExecuteTools: true,
                    });

                    if (result && typeof result === "object" && Symbol.asyncIterator in result) {
                        for await (const chunk of result as AsyncIterable<unknown>) {
                            const json = typeof (chunk as { model_dump_json?: () => string }).model_dump_json === "function"
                                ? (chunk as { model_dump_json: () => string }).model_dump_json()
                                : JSON.stringify(chunk);
                            send(json);
                        }
                        done();
                        stopHeartbeat();
                        return;
                    }

                    const single = await runner.run({
                        messages: allMessages,
                        model,
                        stream: false,
                        mcpServers: MCP_SERVERS,
                        autoExecuteTools: true,
                    });
                    send(JSON.stringify(single));
                    done();
                } catch (error) {
                    send(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }));
                    done();
                } finally {
                    stopHeartbeat();
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return new Response(`data: ${JSON.stringify({ error: message })}\n\n`, {
            status: 500,
            headers: { "Content-Type": "text/event-stream" },
        });
    }
}