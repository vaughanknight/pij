import { describe, expect, it } from "vitest";

import {
	buildSeeArgs,
	clampOutput,
	DEFAULT_SEE_MODEL,
	DEFAULT_SEE_PROMPT,
	expandPath,
	imageExt,
	isSubagentChild,
	isSupportedImage,
	resolveSeeModel,
	resolveSeePrompt,
	SEE_MODEL_ENV,
	seeChildEnv,
	validateSeeRequest,
} from "./store.js";

describe("image classification", () => {
	it("detects supported extensions case-insensitively", () => {
		for (const p of [
			"a.png",
			"A.PNG",
			"shot.jpeg",
			"x.JPG",
			"y.webp",
			"z.gif",
			"/abs/path/to/f.Png",
		]) {
			expect(isSupportedImage(p)).toBe(true);
		}
	});
	it("rejects unsupported / extensionless paths", () => {
		for (const p of ["a.heic", "b.tiff", "c.txt", "noext", "/dir.png/file", "trailingdot."]) {
			expect(isSupportedImage(p)).toBe(false);
		}
	});
	it("imageExt ignores directory dots and dotfiles", () => {
		expect(imageExt("/a.b.c/img.png")).toBe(".png");
		expect(imageExt(".gitignore")).toBe("");
		expect(imageExt("plain")).toBe("");
	});
});

describe("path expansion", () => {
	it("expands ~ and ~/ against home", () => {
		expect(expandPath("~", "/home/me", "/cwd")).toBe("/home/me");
		expect(expandPath("~/pics/a.png", "/home/me", "/cwd")).toBe("/home/me/pics/a.png");
	});
	it("passes absolute paths through and resolves relative against cwd", () => {
		expect(expandPath("/abs/a.png", "/home/me", "/cwd")).toBe("/abs/a.png");
		expect(expandPath("scratch/a.png", "/home/me", "/work/repo")).toBe("/work/repo/scratch/a.png");
		expect(expandPath("a.png", "/home/me", "/work/repo/")).toBe("/work/repo/a.png");
	});
});

describe("model + prompt resolution", () => {
	it("prefers explicit override, then env, then default", () => {
		expect(resolveSeeModel({}, "x/y")).toBe("x/y");
		expect(resolveSeeModel({ [SEE_MODEL_ENV]: "env/m" })).toBe("env/m");
		expect(resolveSeeModel({})).toBe(DEFAULT_SEE_MODEL);
		expect(resolveSeeModel({ [SEE_MODEL_ENV]: "  " }, "  ")).toBe(DEFAULT_SEE_MODEL);
	});
	it("prompt falls back to the default when blank", () => {
		expect(resolveSeePrompt("look closely")).toBe("look closely");
		expect(resolveSeePrompt("   ")).toBe(DEFAULT_SEE_PROMPT);
		expect(resolveSeePrompt()).toBe(DEFAULT_SEE_PROMPT);
	});
});

describe("child argv + env", () => {
	it("builds a --no-tools --no-extensions -p @path argv with the @ prefix and model", () => {
		expect(buildSeeArgs({ absPath: "/x/y.png", model: "m/n", prompt: "hi" })).toEqual([
			"--no-tools",
			"--no-extensions",
			"--model",
			"m/n",
			"-p",
			"@/x/y.png",
			"hi",
		]);
	});
	it("forces PI_SUBAGENT_CHILD on the child env without mutating the base", () => {
		const base = { PATH: "/usr/bin" } as NodeJS.ProcessEnv;
		const env = seeChildEnv(base);
		expect(env.PI_SUBAGENT_CHILD).toBe("1");
		expect(env.PATH).toBe("/usr/bin");
		expect(base.PI_SUBAGENT_CHILD).toBeUndefined();
	});
});

describe("subagent guard", () => {
	it("treats PI_SUBAGENT_CHILD / PI_SUBAGENT_DEPTH as a child", () => {
		expect(isSubagentChild({ PI_SUBAGENT_CHILD: "1" })).toBe(true);
		expect(isSubagentChild({ PI_SUBAGENT_DEPTH: "2" })).toBe(true);
		expect(isSubagentChild({})).toBe(false);
	});
});

describe("request validation", () => {
	it("rejects empty paths", () => {
		const r = validateSeeRequest("   ");
		expect(r).toMatchObject({ ok: false, reason: "empty" });
	});
	it("rejects unsupported types with a convert hint", () => {
		const r = validateSeeRequest("/x/photo.heic");
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.reason).toBe("unsupported");
			expect(r.message).toContain("sips");
		}
	});
	it("accepts a supported image and reports its ext", () => {
		expect(validateSeeRequest("/x/y.PNG")).toEqual({ ok: true, ext: ".png" });
	});
});

describe("output clamping", () => {
	it("passes short output through and truncates long output", () => {
		expect(clampOutput("hello", 100)).toBe("hello");
		const big = "a".repeat(50);
		expect(clampOutput(big, 10)).toBe(`${"a".repeat(10)}\n… [truncated]`);
	});
});
