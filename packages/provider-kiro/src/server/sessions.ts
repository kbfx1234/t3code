import {
  AcpRegistryListSessionsResult,
  AcpRegistryOperationError,
  type AcpRegistryOperationErrorReason,
  type ServerProvider,
} from "@t3tools/contracts";
import type { ProviderInstance } from "@t3tools/provider-core/server/driver";
import type * as EffectAcpSchema from "effect-acp/compat";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import type { KiroSettings } from "../settings.ts";
import { makeKiroAcpRuntime } from "./acpSupport.ts";

type KiroNativeSessions = NonNullable<ServerProvider["nativeSessions"]> & {
  readonly canDelete: boolean;
};
type KiroSessionManagement = NonNullable<ProviderInstance["acpSessionManagement"]>;

const LIST_TIMEOUT = "30 seconds";

/** Listing and loading only: T3 never deletes a Kiro session the TUI or Orca may still use. */
export function kiroNativeSessions(
  initialized: EffectAcpSchema.InitializeResponse,
): KiroNativeSessions {
  return {
    canList: initialized.agentCapabilities?.sessionCapabilities?.list != null,
    canLoad: initialized.agentCapabilities?.loadSession === true,
    canResume: initialized.agentCapabilities?.sessionCapabilities?.resume != null,
    canDelete: false,
  };
}

const opaque = (value: string | null | undefined, maxLength: number) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : undefined;
};
const text = (value: string | null | undefined, maxLength: number) => {
  const trimmed = value?.trim().slice(0, maxLength);
  return trimmed ? trimmed : null;
};

/** Bounds Kiro's `session/list` page to the wire contract; out-of-range entries are dropped. */
export function kiroSessionPage(
  initialized: EffectAcpSchema.InitializeResponse,
  listed: EffectAcpSchema.ListSessionsResponse,
): AcpRegistryListSessionsResult {
  const capabilities = kiroNativeSessions(initialized);
  return AcpRegistryListSessionsResult.make({
    sessions: listed.sessions.slice(0, 256).flatMap((session) => {
      const sessionId = opaque(session.sessionId, 1_024);
      const cwd = opaque(session.cwd, 4_096);
      if (sessionId === undefined || cwd === undefined) return [];
      return [
        {
          sessionId,
          cwd,
          additionalDirectories: (session.additionalDirectories ?? [])
            .flatMap((directory) => opaque(directory, 4_096) ?? [])
            .slice(0, 32),
          title: text(session.title, 1_024),
          updatedAt: text(session.updatedAt, 128),
          importedThreadId: null,
        },
      ];
    }),
    nextCursor: opaque(listed.nextCursor, 2_048) ?? null,
    canLoad: capabilities.canLoad,
    canResume: capabilities.canResume,
    canDelete: capabilities.canDelete,
  });
}

const unsupported = (reason: AcpRegistryOperationErrorReason, message: string) =>
  Effect.fail(new AcpRegistryOperationError({ reason, message }));

/** Kiro's half of T3's native-session import: list a project's sessions, nothing else. */
export function makeKiroSessionManagement(input: {
  readonly settings: KiroSettings;
  readonly environment: NodeJS.ProcessEnv;
  readonly spawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly random: SecureRandom.SecureRandom["Service"];
}): KiroSessionManagement {
  const listSessions = Effect.fn("KiroSessions.list")(
    function* (request: { readonly cwd: string; readonly cursor?: string }) {
      const runtime = yield* makeKiroAcpRuntime({
        settings: input.settings,
        environment: input.environment,
        cwd: request.cwd,
        clientInfo: { name: "t3-code-session-manager", version: "0.0.0" },
      });
      const initialized = yield* runtime.initialize();
      return kiroSessionPage(initialized, yield* runtime.listSessions(request.cursor));
    },
    (effect) =>
      effect.pipe(
        Effect.scoped,
        Effect.timeoutOrElse({
          duration: LIST_TIMEOUT,
          orElse: () =>
            Effect.fail(
              new AcpRegistryOperationError({
                reason: "probe_failed",
                message: "The Kiro session list request timed out.",
              }),
            ),
        }),
        Effect.mapError((error) =>
          error._tag === "AcpRegistryOperationError"
            ? error
            : new AcpRegistryOperationError({
                reason:
                  error._tag === "AcpRequestError" && error.code === -32601
                    ? "session_list_unsupported"
                    : "probe_failed",
                message: "Could not list Kiro sessions.",
                cause: error,
              }),
        ),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, input.spawner),
        Effect.provideService(SecureRandom.SecureRandom, input.random),
      ),
  );
  return {
    listSessions,
    deleteSession: () =>
      unsupported("session_delete_unsupported", "T3 does not delete Kiro sessions."),
    logout: () => unsupported("logout_unsupported", "Sign out of Kiro with `kiro-cli logout`."),
    listProviders: () => unsupported("providers_unsupported", "Kiro has no provider settings."),
    setProvider: () => unsupported("providers_unsupported", "Kiro has no provider settings."),
    disableProvider: () => unsupported("providers_unsupported", "Kiro has no provider settings."),
  };
}
