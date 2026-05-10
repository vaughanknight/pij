// Smoke scenario for scratch. Runs via `npm run smoke -- scratch`.
//
// Each step sends keystrokes into a tmux session running pi (autoload from
// pij root) and (optionally) checks that captured output matches a regex.

export default {
	name: "scratch",
	steps: [
		{
			send: "/scratch",
			expect: /not implemented/,
			delay: 1500,
		},
		// TODO: add real steps once /scratch is implemented
	],
};
