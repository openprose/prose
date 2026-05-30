import { cloneAdapterJsonValueV0 } from "../json";
import type {
  ReactorAgentRequest,
  ReactorAgentResponse,
  ReactorAgentSdkAdapter,
  ReactorSandboxRequest,
  ReactorSandboxResponse,
} from "../types";

export type ReactorAgentSdkLaunchHandler = (
  request: ReactorAgentRequest,
) => ReactorAgentResponse;

export type ReactorAgentSdkSandboxHandler = (
  request: ReactorSandboxRequest,
) => ReactorSandboxResponse;

export interface RecordingAgentSdkAdapter extends ReactorAgentSdkAdapter {
  readonly launches: () => readonly ReactorAgentRequest[];
  readonly runSandbox: (
    request: ReactorSandboxRequest,
  ) => ReactorSandboxResponse;
  readonly sandboxRuns: () => readonly ReactorSandboxRequest[];
}

export interface PassthroughAgentSdkAdapterInput {
  readonly launch?: ReactorAgentSdkLaunchHandler;
  readonly sandbox?: ReactorAgentSdkSandboxHandler;
}

const DEFAULT_SANDBOX_RESPONSE: ReactorSandboxResponse = {
  exit_code: 0,
  stdout: "",
  stderr: "",
};

export function createPassthroughAgentSdkAdapter(
  input: PassthroughAgentSdkAdapterInput = {},
): RecordingAgentSdkAdapter {
  const launchHandler: ReactorAgentSdkLaunchHandler =
    input.launch ?? ((request) => ({ payload: request.payload }));
  const sandboxHandler: ReactorAgentSdkSandboxHandler =
    input.sandbox ?? (() => ({ ...DEFAULT_SANDBOX_RESPONSE }));

  const launches: ReactorAgentRequest[] = [];
  const sandboxRuns: ReactorSandboxRequest[] = [];

  return {
    launch(request: ReactorAgentRequest): ReactorAgentResponse {
      const requestCopy = cloneAdapterJsonValueV0(request);
      launches.push(requestCopy);
      return cloneAdapterJsonValueV0(launchHandler(requestCopy));
    },
    runSandbox(request: ReactorSandboxRequest): ReactorSandboxResponse {
      const requestCopy = cloneAdapterJsonValueV0(request);
      sandboxRuns.push(requestCopy);
      return cloneAdapterJsonValueV0(sandboxHandler(requestCopy));
    },
    launches(): readonly ReactorAgentRequest[] {
      return launches.map((launch) => cloneAdapterJsonValueV0(launch));
    },
    sandboxRuns(): readonly ReactorSandboxRequest[] {
      return sandboxRuns.map((run) => cloneAdapterJsonValueV0(run));
    },
  };
}

export function createNullAgentSdkAdapter(
  payload: unknown = null,
): RecordingAgentSdkAdapter {
  return createPassthroughAgentSdkAdapter({
    launch: () => ({ payload: cloneAdapterJsonValueV0(payload) }),
  });
}
