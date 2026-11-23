import {
  type EnvironmentId,
  type ModelSelection,
  PROVIDER_DISPLAY_NAMES,
  type ProviderOptionDescriptor,
  type ServerProvider,
  type ThreadId,
} from "@t3tools/contracts";
import { deriveReportedModelSelection } from "@t3tools/client-runtime/state/thread-execution";
import { useGT } from "gt-react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { useQuietThreadProjection } from "../../state/entities";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { getTriggerDisplayModelName } from "./providerIconUtils";
import { ThreadDetailsSection } from "./ThreadDetailsSection";
import {
  compareRunSelection,
  limitsAreStale,
  pickedRunSelection,
  type RunSelectionRow,
} from "./ThreadDetailsRun.logic";
import { UsageRow } from "./ThreadDetailsUsage";

function modelLabel(provider: ServerProvider | undefined, slug: string): string {
  const model = provider?.models.find((candidate) => candidate.slug === slug);
  return model ? getTriggerDisplayModelName(model, provider?.driver) : slug;
}

function optionDescriptor(
  provider: ServerProvider | undefined,
  slugs: ReadonlyArray<string | null>,
  id: string,
): ProviderOptionDescriptor | undefined {
  for (const slug of slugs) {
    const descriptor = provider?.models
      .find((model) => model.slug === slug)
      ?.capabilities?.optionDescriptors?.find((candidate) => candidate.id === id);
    if (descriptor) return descriptor;
  }
  return undefined;
}

function optionLabel(descriptor: ProviderOptionDescriptor, value: string): string {
  return descriptor.type === "select"
    ? (descriptor.options.find((option) => option.id === value)?.label ?? value)
    : value;
}

/** What the thread's last run asked for beside what its provider says it runs, and how old the limits are. */
export function ThreadDetailsRun(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providers: readonly ServerProvider[];
}) {
  const gt = useGT();
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  const projection = useQuietThreadProjection({
    environmentId: props.environmentId,
    threadId: props.threadId,
  })?.projection;
  if (!projection) return null;
  const picked: ModelSelection = pickedRunSelection(projection);
  const reported = deriveReportedModelSelection(projection);
  const provider = props.providers.find((entry) => entry.instanceId === picked.instanceId);
  const providerName =
    provider?.displayName ??
    (provider ? (PROVIDER_DISPLAY_NAMES[provider.driver] ?? provider.driver) : picked.instanceId);
  const rows = compareRunSelection(picked, reported);
  const slugs = [rows[0]?.reported ?? null, picked.model];
  const checkedAt = provider?.usageLimits?.checkedAt;

  const renderRow = (row: RunSelectionRow) => {
    const descriptor = row.id === "model" ? undefined : optionDescriptor(provider, slugs, row.id);
    if (row.id !== "model" && !descriptor) return null;
    const format = (value: string) =>
      descriptor ? optionLabel(descriptor, value) : modelLabel(provider, value);
    const shown = row.reported ?? row.picked;
    if (shown === null) return null;
    const label = descriptor ? descriptor.label : gt("Model", { $context: "thread details row" });
    return (
      <UsageRow
        key={row.id}
        label={label}
        fill={null}
        tone={row.differs ? "warning" : null}
        value={format(shown)}
        tooltip={
          <>
            {row.picked !== null ? (
              <span className="text-foreground">
                {gt("Picked: {value}", { value: format(row.picked) })}
              </span>
            ) : null}
            {row.reported !== null ? (
              <span className={row.picked === null ? "text-foreground" : "text-muted-foreground"}>
                {gt("{provider} runs: {value}", {
                  provider: providerName,
                  value: format(row.reported),
                })}
              </span>
            ) : reported === null ? (
              <span className="text-muted-foreground">
                {gt("{provider} doesn't report what it runs", { provider: providerName })}
              </span>
            ) : null}
          </>
        }
      />
    );
  };

  return (
    <ThreadDetailsSection
      headingId="thread-details-run-heading"
      title={gt("Model in use")}
      showHeading={false}
    >
      <div className="grid grid-cols-[auto_minmax(3rem,1fr)_auto] gap-x-3 text-xs">
        {rows.map(renderRow)}
        {checkedAt ? (
          <UsageRow
            label={gt("Limits checked")}
            fill={null}
            tone={limitsAreStale(checkedAt, now) ? "warning" : null}
            value={formatRelativeTimeLabel(checkedAt, now)}
            opensUsage
            tooltip={
              <span className="text-foreground">
                {limitsAreStale(checkedAt, now)
                  ? gt("Limits are over 10 minutes old and may be out of date")
                  : gt("{provider} limits are up to date", { provider: providerName })}
              </span>
            }
          />
        ) : null}
      </div>
    </ThreadDetailsSection>
  );
}
