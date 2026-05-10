// Smoke scenario for scratch — verifies AC-11 (D-005: customType
// entries survive /compact). Runs via `npm run smoke -- scratch`.
//
// Each step sends keystrokes to a tmux session running pi (autoload from
// pij root) and optionally checks that captured-pane output matches a
// regex.
//
// Important: send strings avoid shell-special characters ($, `, \, ")
// per D-014. Note bodies use hyphens instead of spaces to keep grep
// patterns simple.

export default {
	name: "scratch",
	bootSeconds: 5,
	steps: [
		// Add two distinct notes with grep-friendly bodies.
		{
			send: "/scratch add scratch-smoke-alpha",
			expect: /saved \[#1\]/,
			delay: 2000,
		},
		{
			send: "/scratch add scratch-smoke-bravo",
			expect: /saved \[#2\]/,
			delay: 2000,
		},
		// Verify they're both visible pre-compact (sanity check).
		{
			send: "/scratch list",
			expect: /scratch-smoke-alpha[\s\S]*scratch-smoke-bravo/,
			delay: 2000,
		},
		// Force compaction. /compact on a near-empty session may be a
		// no-op; that's fine — what we care about is whether scratch's
		// customType entries survive whatever /compact does.
		{
			send: "/compact",
			delay: 30_000,
		},
		// The load-bearing assertion: after /compact, both notes must
		// still appear in /scratch list. If they don't, D-005 is
		// falsified and the snapshot fallback (T008) ships before v0.2.
		{
			send: "/scratch list",
			expect: /(?=.*scratch-smoke-alpha)(?=.*scratch-smoke-bravo)/s,
			delay: 3000,
		},
	],
};
