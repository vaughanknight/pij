---
description: Minimal hello-world pack — the AC-12 minih contract fixture.
tags: [contract, fixture]
---

Say hello. This is a fixture pack used only by pij's minih contract test
(`contract.test.ts`); it is copied into a temp dir and driven through the real
`runAgent` with a `FakeAgentAdapter`, so no LLM ever reads this prompt.
