# run-status

A mod that shows the state of [autoflow-coordinator](https://github.com/Munsik-Park/autoflow-coordinator) runs in a Claude Code pane: the current step, the module flow and the verdicts, refreshed every 5 seconds.

## Requirements

- Claude Code
- A clone of autoflow-coordinator. The mod calls `tools/status.py` in the working directory, so it works only in a session opened in the coordination directory.
- python3

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install run-status --marketplace Munsik-Park/autoflow-coordinator-run-status
```

From a shell:

```
claude plugin install run-status --marketplace Munsik-Park/autoflow-coordinator-run-status
```

In the desktop app, choose + next to the prompt, Plugins, Add marketplace, enter `Munsik-Park/autoflow-coordinator-run-status`, then press Add plugin.

## Usage

```
/run-status            the run created in this session
/run-status <run>      the named run
/run-status --all      every active run
```

## Development

```
claude --plugin-dir <this folder>
claude plugin validate <this folder>
claude plugin test <this folder>
```
