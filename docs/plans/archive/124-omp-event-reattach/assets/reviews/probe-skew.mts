import { PijDaemonClient } from "/Users/jordanknight/pi-hacking/fs3-omp-event-reattach/.pi/extensions/pij/adapters/daemon-http.js";

// Fake daemon: every attach SUCCEEDS (HTTP 200 + hello) but the stream ends
// immediately — the shape of a daemon that is up but restarting/half-healthy.
function immediatelyClosing(): Response {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream<Uint8Array>({
			start(c) {
				c.enqueue(encoder.encode(`${JSON.stringify({ hello: true, v: 99, build: "probe" })}\n`));
				c.close();
			},
		}),
	);
}

const delays: number[] = [];
let attaches = 0;
const client = new PijDaemonClient(
	{ addr: "127.0.0.1:7461", stateDir: "/tmp/state" },
	"secret",
	{
		fetch: (async () => {
			attaches += 1;
			return immediatelyClosing();
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
const notices: string[] = [];
const stop = await client.watchEvents(
	() => {},
	(e) => console.log("onError:", e.message),
	(n) => notices.push(n),
);
await new Promise((r) => setTimeout(r, 300));
stop();
console.log("attaches in 300ms:", attaches);
console.log("first 12 backoff delays:", delays.slice(0, 12));
console.log("distinct delays:", [...new Set(delays)]);
console.log("notices emitted:", notices.length);
}
void main();
