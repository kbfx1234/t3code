import { type ModelSelection, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { compareRunSelection } from "./ThreadDetailsRun.logic";

const kiro = ProviderInstanceId.make("kiro");

function selection(model: string, options: Record<string, string> = {}): ModelSelection {
  return {
    instanceId: kiro,
    model,
    options: Object.entries(options).map(([id, value]) => ({ id, value })),
  };
}

const differing = (rows: ReturnType<typeof compareRunSelection>) =>
  rows.filter((row) => row.differs).map((row) => row.id);

describe("compareRunSelection", () => {
  it.each([
    {
      name: "the provider runs what was picked",
      picked: selection("claude-opus-5.5", { reasoningEffort: "high", mode: "reviewer" }),
      reported: selection("claude-opus-5.5", { reasoningEffort: "high", mode: "reviewer" }),
      differs: [],
    },
    {
      name: "an effort the model does not offer is never sent",
      picked: selection("claude-opus-5.5", { reasoningEffort: "xhigh" }),
      reported: selection("claude-opus-5.5", { reasoningEffort: "high" }),
      differs: ["reasoningEffort"],
    },
    {
      name: "an agent switch replaced the picked model",
      picked: selection("claude-opus-5.5", { mode: "reviewer" }),
      reported: selection("claude-sonnet-4.5", { mode: "reviewer" }),
      differs: ["model"],
    },
    {
      name: "the default model resolves to a real one",
      picked: selection("default"),
      reported: selection("auto", { mode: "vibe" }),
      differs: [],
    },
    {
      name: "a value only the provider reports is not a mismatch",
      picked: selection("claude-opus-5.5"),
      reported: selection("claude-opus-5.5", { reasoningEffort: "medium" }),
      differs: [],
    },
  ])("$name", ({ picked, reported, differs }) => {
    expect(differing(compareRunSelection(picked, reported))).toEqual(differs);
  });

  it("ignores a report from another provider instance", () => {
    const rows = compareRunSelection(selection("claude-opus-5.5"), {
      ...selection("gpt-5.6-sol"),
      instanceId: ProviderInstanceId.make("codex"),
    });
    expect(rows).toEqual([
      { id: "model", picked: "claude-opus-5.5", reported: null, differs: false },
    ]);
  });
});
