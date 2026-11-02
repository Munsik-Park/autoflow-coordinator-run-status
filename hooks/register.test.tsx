import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'run-status',
  component: 'Pane',
  requestId: 'run-status',
  props: {
    title: 'Runs',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const step = (over: object) => ({
  session: 'S1',
  label: 'analysis-1',
  state: 'pass',
  verdict: '통과',
  entry: null,
  cause: null,
  session_state: null,
  idle_sec: null,
  ...over,
})
const REVIEW = step({ session: 'S2', label: 'review-1', state: 'running', verdict: null, session_state: 'working', idle_sec: 180 })
const LOOK = {
  runs: [
    {
      name: 'demo-553-2026-10-31-192740-1cf01b8a',
      issue: '553',
      reference: 'analysis-review',
      now: REVIEW,
      steps: [
        step({}),
        step({ label: 'hypothesis-1', state: 'fail', verdict: '품질 목표 미달' }),
        step({ label: 'analysis-2', entry: 'return', cause: 'hypothesis-1' }),
        step({ label: 'hypothesis-2', entry: 'rerun', cause: 'hypothesis-1' }),
        step({ label: 'delivery-2', entry: 'rerun' }),
        REVIEW,
      ],
      sessions: [{ name: 'S2', surface: '%2', state: 'working', turns: 1, pending: 0, idle_sec: 180 }],
    },
    {
      name: 'old-run',
      issue: '7',
      reference: null,
      now: null,
      steps: [step({ label: 'first-1' }), step({ label: 'last-1' })],
      sessions: [{ name: 'S1', surface: '%1', state: 'exited', turns: 1, pending: 0, idle_sec: 9 }],
    },
  ],
}

function engine(on: any, run: (argv: string[]) => object) {
  on('command.register', () => ({ value: { command: 'run-status' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('clock.every', () => ({ value: { cancel() {} } }))
  on('fs.exists', () => ({ value: true }))
  on('process.run', (_: unknown, e: { argv: string[] }) => ({ value: run(e.argv) }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
}

const START = { cwd: '/tool', surface: 'terminal', isInteractive: true } as const
const ok = (look: object) => ({ exitCode: 0, stdout: JSON.stringify(look), stderr: '' })
const open = ($: any, args = '') => $.command.run({ command: 'run-status', args })

test('the pane says where the run stands, then its flow', async ($, on) => {
  engine(on, () => ok(LOOK))
  await $.session.start(START)
  await open($)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^demo-553/ }))?.text).toBe('demo-553 · #553 · analysis-review')
  expect((await ui.find({ type: 'Text', text: /^Now/ }))?.text).toBe('Now: S2 review-1 · working · idle 3m')
  expect((await ui.find({ type: 'Text', text: /hypothesis-1/ }))?.text).toContain('✗ hypothesis-1')
  expect((await ui.find({ type: 'Text', text: /hypothesis-1/ }))?.text).toContain('품질 목표 미달')
  expect((await ui.find({ type: 'Text', text: /analysis-2/ }))?.text).toContain('✓ ↩ analysis-2 ← hypothesis-1')
  expect((await ui.find({ type: 'Text', text: /hypothesis-2/ }))?.text).toContain('✓ ↺ hypothesis-2 ← hypothesis-1')
  expect((await ui.find({ type: 'Text', text: /delivery-2/ }))?.text).toContain('↺ delivery-2 ')
  expect((await ui.find({ type: 'Text', text: /analysis-1/ }))?.text).toContain('S1  ✓')
  expect((await ui.find({ type: 'Text', text: /analysis-2/ }))?.text).toContain('    ✓')
  expect((await ui.find({ type: 'Text', text: /▶ review-1/ }))?.text).toContain('working · idle 3m')
  await ui.unmount()
})

test('the verdicts stand in one column whatever marks the names carry', async ($, on) => {
  engine(on, () => ok(LOOK))
  await $.session.start(START)
  await open($)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const column = async (name: RegExp) => (await ui.find({ type: 'Text', text: name }))?.text.indexOf('통과')
  const plain = await column(/analysis-1/)
  expect(plain).toBeGreaterThan(0)
  expect(await column(/delivery-2/)).toBe(plain)
  expect(await column(/analysis-2/)).toBe(plain)
  await ui.unmount()
})

test('a step row stays on one row', async ($, on) => {
  engine(on, () => ok(LOOK))
  await $.session.start(START)
  await open($)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /▶ review-1/ }))?.props.wrap).toBe('truncate-end')
  await ui.unmount()
})

test('in the list of every active run, one nothing runs in shows its last step alone', async ($, on) => {
  const seen: string[][] = []
  engine(on, argv => {
    seen.push(argv)
    return ok(LOOK)
  })
  await $.session.start(START)
  await open($, '--all')

  expect(seen.at(-1)?.at(-1)).toBe('/tool/tools/status.py')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /first-1/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /last-1/ }))?.text).toContain('✓ last-1')
  expect((await ui.find({ type: 'Text', text: /1 earlier/ }))?.text).toContain('1 earlier')
  await ui.unmount()
})

test('a named run goes to the tool and shows its whole flow', async ($, on) => {
  const seen: string[][] = []
  engine(on, argv => {
    seen.push(argv)
    return ok({ runs: [LOOK.runs[1]] })
  })
  await $.session.start(START)
  await open($, ' old-run ')

  expect(seen.at(-1)?.at(-1)).toBe('old-run')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /first-1/ }))?.text).toContain('first-1')
  await ui.unmount()
})

test('a failing tool is shown, not swallowed', async ($, on) => {
  engine(on, () => ({ exitCode: 1, stdout: '', stderr: 'Traceback\nboom' }))
  await $.session.start(START)
  await open($)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('boom')
  await ui.unmount()
})

test('no name asks for this session\'s run and says when it has none', async ($, on) => {
  const seen: string[][] = []
  engine(on, argv => {
    seen.push(argv)
    return ok({ runs: [] })
  })
  await $.session.start(START)
  await open($)

  expect(seen.at(-1)?.at(-1)).toBe('--caller')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('No run in this session.')
  await ui.unmount()
})

test('--all with no active run says so', async ($, on) => {
  engine(on, () => ok({ runs: [] }))
  await $.session.start(START)
  await open($, '--all')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('No active run.')
  await ui.unmount()
})
