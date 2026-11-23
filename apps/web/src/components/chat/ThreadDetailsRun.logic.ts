import type { ModelSelection } from "@t3tools/contracts";
import type { ThreadStructure } from "@t3tools/client-runtime/state/shell";
import { getModelSelectionStringOptionValue } from "@t3tools/shared/model";

export interface RunSelectionRow {
  /** `model`, or the option's id. */
  readonly id: string;
  readonly picked: string | null;
  readonly reported: string | null;
  /** The provider reports another value than the run asked for. */
  readonly differs: boolean;
}

const LIMITS_STALE_AFTER_MS = 10 * 60_000;

/** What the latest started run asked for; before any run, the thread's own pick. */
export function pickedRunSelection(
  projection: Pick<ThreadStructure, "thread" | "runs">,
): ModelSelection {
  const run = projection.runs.reduce<ThreadStructure["runs"][number] | null>(
    (latest, candidate) =>
      candidate.startedAt !== null && (latest === null || candidate.ordinal > latest.ordinal)
        ? candidate
        : latest,
    null,
  );
  return run?.modelSelection ?? projection.thread.modelSelection;
}

function stringOptionIds(selection: ModelSelection | null): string[] {
  const options = selection?.options;
  if (!Array.isArray(options)) return [];
  return options.flatMap((option) => (typeof option.value === "string" ? [option.id] : []));
}

/**
 * Pairs each value the run picked with the one its provider reports running.
 * A default model resolves to a real one, so only an explicit pick can differ.
 */
export function compareRunSelection(
  picked: ModelSelection,
  reported: ModelSelection | null,
): RunSelectionRow[] {
  const own = reported?.instanceId === picked.instanceId ? reported : null;
  const pickedModel = picked.model.trim();
  const rows: RunSelectionRow[] = [
    {
      id: "model",
      picked: pickedModel || null,
      reported: own?.model ?? null,
      differs:
        own !== null &&
        pickedModel !== "" &&
        pickedModel !== "default" &&
        own.model !== pickedModel,
    },
  ];
  for (const id of new Set([...stringOptionIds(picked), ...stringOptionIds(own)])) {
    const pickedValue = getModelSelectionStringOptionValue(picked, id) ?? null;
    const reportedValue = getModelSelectionStringOptionValue(own, id) ?? null;
    rows.push({
      id,
      picked: pickedValue,
      reported: reportedValue,
      differs: pickedValue !== null && reportedValue !== null && pickedValue !== reportedValue,
    });
  }
  return rows;
}

export function limitsAreStale(checkedAt: string, now: number): boolean {
  const checked = Date.parse(checkedAt);
  return !Number.isFinite(checked) || now - checked > LIMITS_STALE_AFTER_MS;
}
