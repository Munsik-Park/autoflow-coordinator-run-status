export type SessionStatus = {
  name: string
  surface: string
  state: string
  turns: number
  pending: number
  idle_sec: number | null
}

export type StepStatus = {
  session: string | null
  label: string
  state: 'pass' | 'fail' | 'noted' | 'awaiting' | 'running' | 'unknown'
  verdict: string | null
  entry: 'return' | 'rerun' | null
  cause: string | null
  session_state: string | null
  idle_sec: number | null
}

export type RunStatus = {
  name: string
  issue?: string
  branch?: string
  reference: string | null
  now: StepStatus | null
  steps: StepStatus[]
  sessions: SessionStatus[]
  error?: string
}

/** target: the run named to /run-status, or absent for every active run. */
export type Snapshot = { runs: RunStatus[]; target?: string; error?: string }

declare module 'claude-code' {
  interface PluginState {
    'run-status': { snapshot: Shaped<Snapshot> }
  }
}
