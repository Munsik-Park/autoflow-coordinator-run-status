import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { RunStatus, Snapshot, StepStatus } from '../types'

const PANE = 'run-status'
const POLL_MS = 5000
// Named to /run-status for every active run; no name means this session's own.
const ALL_RUNS = '--all'
const MAX_NAME_CELLS = 34
const snapshot = atom(
  { plugin: 'run-status', key: 'snapshot' } as const,
  { runs: [] } as Snapshot,
  { shape: 'snapshot-2' },
)

const STEP_MARK: Record<StepStatus['state'], { mark: string; color?: string }> = {
  pass: { mark: '✓', color: 'success' },
  fail: { mark: '✗', color: 'error' },
  noted: { mark: '·' },
  awaiting: { mark: '…', color: 'warning' },
  running: { mark: '▶', color: 'claude' },
  unknown: { mark: '?' },
}

// A session state that asks for the coordinator's attention.
const SESSION_COLOR: Record<string, string> = {
  'waiting-input': 'warning',
  'idle-pending': 'warning',
  stall: 'error',
}

const elapsed = (sec: number | null) => {
  if (sec === null) return ''
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  return `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m`
}

// Hangul syllables take two cells in a terminal; the marks in a step's name take one.
const cells = (text: string) =>
  [...text].reduce((sum, c) => sum + ((c.codePointAt(0) ?? 0) >= 0xac00 ? 2 : 1), 0)
const pad = (text: string, width: number) => text + ' '.repeat(Math.max(1, width - cells(text)))
// A name past its column would push the verdict out of the pane, so it is cut to leave one cell before the verdict.
const fit = (text: string, width: number) => {
  if (cells(text) < width) return text
  let kept = ''
  for (const c of text) {
    if (cells(kept + c) > width - 2) break
    kept += c
  }
  return `${kept}…`
}

const title = (run: RunStatus) =>
  [
    run.name.replace(/-\d{4}-\d\d-\d\d-.*$/, ''),
    run.issue && `#${run.issue}`,
    run.reference,
  ]
    .filter(Boolean)
    .join(' · ')

// A return goes back to an earlier stage; a rerun repeats the module on what it judged before.
const ENTRY_MARK = { return: '↩ ', rerun: '↺ ' } as const
const stepName = (step: StepStatus) =>
  `${step.entry ? ENTRY_MARK[step.entry] : ''}${step.label}${step.cause ? ` ← ${step.cause}` : ''}`
const stepNote = (step: StepStatus) =>
  step.state === 'running'
    ? [step.session_state, step.idle_sec === null ? '' : `idle ${elapsed(step.idle_sec)}`].filter(Boolean).join(' · ')
    : (step.verdict ?? '')

const nowLine = (now: StepStatus | null) =>
  now ? `Now: ${now.session ?? '?'} ${now.label} · ${stepNote(now)}` : 'Now: no step in progress'

let timer: Timer | undefined
let cwd: string | undefined
let isPolling = false

async function poll($: EngineInterface) {
  // A look can outlast the period when a screen read is slow.
  if (isPolling) return
  isPolling = true
  try {
    const { target } = await read($, snapshot)
    // -B: no bytecode written into the tool clone by a look.
    const argv = ['python3', '-B', `${cwd}/tools/status.py`, ...(target === ALL_RUNS ? [] : [target ?? '--caller'])]
    const done = await $.process.run(argv, { cwd })
    const value: Snapshot =
      done.exitCode === 0
        ? { ...(JSON.parse(done.stdout) as Snapshot), target }
        : { runs: [], target, error: done.stderr.trim().split('\n').pop() }
    await update($, snapshot, () => value)
  } catch (e) {
    await update($, snapshot, value => ({ ...value, runs: [], error: String(e) }))
  } finally {
    isPolling = false
  }
}

async function start($: EngineInterface) {
  timer ??= $.clock.every(POLL_MS, () => void poll($))
  await poll($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    await $.command.register({
      name: 'run-status',
      description: "Show the flow of this session's coordination run in a pane; name a run, or --all for every active run",
      argumentHint: '[run | --all]',
    })
    // A reload drops the timer; a pane still open keeps its place and needs it back.
    const panes = await $.ui.panes()
    if (panes.some(pane => pane.id === PANE)) await start($)

    return next(e)
  })

  on('command.run', { command: 'run-status' }, async ($, e) => {
    if (!cwd || !(await $.fs.exists(`${cwd}/tools/status.py`))) {
      return { text: `tools/status.py is not under ${cwd}: open this in the coordination directory.` }
    }
    const target = e.args.trim() || undefined
    await update($, snapshot, value => ({ ...value, target }))
    await $.ui.open({ id: PANE, title: 'Runs' })
    await start($)
    // The newest step is the last row. `end` keeps up as the flow grows, until the person moves
    // the window. The list of every run has no one end to follow. The pane stands without this.
    if (target !== ALL_RUNS) await $.ui.scroll({ in: PANE, to: 'end' }).catch(() => undefined)

    return { text: `Run status pane: ${target ?? "this session's run"}` }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      timer?.cancel()
      timer = undefined
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { runs, target, error } = await read($, snapshot)

    return (
      <Box flexDirection="column">
        {error && <Text color="error">{error}</Text>}
        {!error && runs.length === 0 && <Text dimColor>{target === ALL_RUNS ? 'No active run.' : 'No run in this session.'}</Text>}
        {runs.map(run => {
          const isLive = run.sessions.some(s => s.state !== 'exited')
          // In the list of every active run, one nothing runs in may be stale: its last step is enough.
          const shown = target !== ALL_RUNS || isLive ? run.steps : run.steps.slice(-1)
          const hidden = run.steps.length - shown.length
          const nameCells = Math.min(MAX_NAME_CELLS, Math.max(0, ...shown.map(step => cells(stepName(step)))) + 2)

          return (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold>{title(run)}</Text>
              {isLive || run.now ? <Text bold>{nowLine(run.now)}</Text> : <Text dimColor>No step in progress</Text>}
              {run.error && <Text dimColor>{run.error}</Text>}
              {hidden > 0 && <Text dimColor>… {hidden} earlier</Text>}
              {shown.map((step, i) => {
                const { mark, color } = STEP_MARK[step.state]
                const isFirstOfSession = i === 0 || shown[i - 1]?.session !== step.session
                const note = stepNote(step)
                const noteColor = step.state === 'running' ? SESSION_COLOR[step.session_state ?? ''] : color

                return (
                  <Text wrap="truncate-end" dimColor={!isLive && target === ALL_RUNS}>
                    {(isFirstOfSession ? (step.session ?? '?') : '').padEnd(4)}
                    <Text color={color}>{mark}</Text>
                    {' '}
                    <Text color={step.entry === 'return' ? 'warning' : undefined}>{pad(fit(stepName(step), nameCells), nameCells)}</Text>
                    <Text color={noteColor}>{note}</Text>
                  </Text>
                )
              })}
            </Box>
          )
        })}
      </Box>
    )
  })
}
