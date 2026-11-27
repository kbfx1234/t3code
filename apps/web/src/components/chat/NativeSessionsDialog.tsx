import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import {
  createEnvironmentRpcQueryAtomFamily,
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  WS_METHODS,
  type AcpRegistryListSessionsResult,
  type AcpRegistrySession,
  type EnvironmentId,
  type ProjectId,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import { useState } from "react";

import { connectionAtomRuntime } from "../../connection/runtime";
import { m } from "../../i18n/messages";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { toastManager } from "../ui/toast";

// Read fresh on every open; the list only lives while the picker shows it.
const nativeSessionList = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:native-sessions:list",
  tag: WS_METHODS.serverListAcpRegistrySessions,
  staleTimeMs: 0,
  idleTtlMs: 0,
});

interface NativeSessionsTarget {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly projectId: ProjectId;
  readonly providerName: string;
}

/** `/chat`: the provider's saved sessions in this project, each opened as a T3 thread. */
export function NativeSessionsDialog(
  props: NativeSessionsTarget & {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
  },
) {
  const { open, onOpenChange, ...target } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <T>Earlier sessions</T>
          </DialogTitle>
          <DialogDescription>
            <NativeSessionsDescription providerName={target.providerName} />
          </DialogDescription>
        </DialogHeader>
        {open ? <NativeSessionsList {...target} onOpened={() => onOpenChange(false)} /> : null}
      </DialogPopup>
    </Dialog>
  );
}

function NativeSessionsDescription(props: { readonly providerName: string }) {
  const gt = useGT();
  return gt(
    "Includes sessions started in the {provider} terminal app. Opening one copies its messages into a T3 thread.",
    { provider: props.providerName },
  );
}

function NativeSessionsList(props: NativeSessionsTarget & { readonly onOpened: () => void }) {
  const gt = useGT();
  const navigate = useNavigate();
  const canOpen = useEnvironmentScope(props.environmentId, AuthOrchestrationOperateScope);
  const query = useEnvironmentQuery<AcpRegistryListSessionsResult, unknown>(
    nativeSessionList({
      environmentId: props.environmentId,
      input: { instanceId: props.instanceId, projectId: props.projectId },
    }),
  );
  const importSession = useAtomCommand(serverEnvironment.importAcpRegistrySession, {
    reportFailure: false,
  });
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);
  const sessions = query.data?.sessions;

  const openSession = async (session: AcpRegistrySession) => {
    if (openingSessionId !== null) return;
    let threadId = session.nativeHistoryPending === true ? null : session.importedThreadId;
    if (threadId === null) {
      setOpeningSessionId(session.sessionId);
      const result = await importSession({
        environmentId: props.environmentId,
        input: {
          instanceId: props.instanceId,
          projectId: props.projectId,
          sessionId: session.sessionId,
          title: session.title,
          updatedAt: session.updatedAt,
        },
      });
      setOpeningSessionId(null);
      if (result._tag !== "Success") {
        if (isAtomCommandInterrupted(result)) return;
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: gt("Could not open the session"),
          ...(error instanceof Error
            ? { description: thrownErrorMessage(error, m) ?? error.message }
            : {}),
        });
        return;
      }
      threadId = result.value.threadId;
    }
    props.onOpened();
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams({ environmentId: props.environmentId, threadId }),
    });
  };

  return (
    <>
      <DialogPanel>
        {query.error !== null ? (
          <p className="text-sm text-destructive-foreground">{query.error}</p>
        ) : sessions === undefined ? (
          <p className="text-sm text-muted-foreground">
            <T>Loading…</T>
          </p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {gt("{provider} has no saved sessions in this project.", {
              provider: props.providerName,
            })}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {sessions.map((session) => (
              <li key={session.sessionId}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-start text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-60"
                  disabled={!canOpen || openingSessionId !== null}
                  onClick={() => void openSession(session)}
                >
                  <span className="min-w-0 truncate">{session.title ?? session.sessionId}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {openingSessionId === session.sessionId
                      ? gt("Importing")
                      : session.importedThreadId !== null
                        ? gt("Imported")
                        : session.updatedAt === null
                          ? ""
                          : formatRelativeTimeLabel(session.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogPanel>
      {query.error !== null ? (
        <DialogFooter variant="bare">
          <Button size="sm" variant="outline" disabled={query.isPending} onClick={query.refresh}>
            <T>Try again</T>
          </Button>
        </DialogFooter>
      ) : null}
    </>
  );
}
