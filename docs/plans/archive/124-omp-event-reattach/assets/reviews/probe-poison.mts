import { PijDaemonClient } from "/Users/jordanknight/pi-hacking/fs3-omp-event-reattach/.pi/extensions/pij/adapters/daemon-http.js";

// Fake daemon: every attach SUCCEEDS and replays the SAME frame (seq 7).
// The consumer always rejects — the shape of a permanently un-consumable
// ("poison") frame, e.g. a payload that fails JSON.parse in pushedMessage.
function withFrame(): Response {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream<Uint8Array>({
			start(c) {
				c.enqueue(encoder.encode(`${JSON.stringify({ hello: true, v: 1, build: "probe" })}\n`));
				c.enqueue(
					encoder.encode(
						`${JSON.stringify({ machine: "local", cursor: 7, event: { v: 1, at: 7, kind: "message.pushed", seat: "s", payload: "not-json" } })}\n`,
					),
				);
				c.close();
			},
		}),
	);
}

const delays: number[] = [];
const sinces: (string | null)[] = [];
let attaches = 0;
let frameDeliveries = 0;
let errors = 0;
const client = new PijDaemonClient(
	{ addr: "127.0.0.1:7461", stateDir: "/tmp/state" },
	"secret",
	{
		fetch: ((url: string) => {
			attaches += 1;
			sinces.push(new URL(String(url)).searchParams.get("since"));
			return Promise.resolve(withFrame());
		}) as unknown as typeof fetch,
		readFile: async () => "secret",
		processStart: () => 1,
		random: () => 0.5,
		sleep: (ms: number) => {
			delays.push(ms);
			return new Promise<void>((r) => setTimeout(r, 1));
		},
	},
);

async function main() {
	const stop = await client.watchEvents(
		() => {
			frameDeliveries += 1;
			return Promise.reject(new Error("consume failed (poison payload)"));
		},
		() => {
			errors += 1;
		},
	);
	await new Promise((r) => setTimeout(r, 300));
	stop();
	console.log("attaches in 300ms:", attaches);
	console.log("same frame delivered N times:", frameDeliveries);
	console.log("onError calls:", errors);
	console.log("distinct backoff delays:", [...new Set(delays)]);
	console.log("distinct since values:", [...new Set(sinces.map((s) => String(s)))]);
}
void main();
