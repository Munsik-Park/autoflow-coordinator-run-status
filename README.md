# run-status

[autoflow-coordinator](https://github.com/Munsik-Park/autoflow-coordinator) 회차의 진행 상태를 Claude Code pane에 표시하는 mod다. 현재 단계, 모듈 흐름, 판정을 5초마다 갱신한다.

## 요구 사항

- Claude Code
- autoflow-coordinator clone. mod는 작업 디렉터리의 `tools/status.py`를 호출하므로, 조율 디렉터리에서 연 세션에서만 동작한다.
- python3

## 설치

Claude Code 터미널 세션의 프롬프트에서:

```
/plugin install run-status --marketplace Munsik-Park/autoflow-coordinator-run-status
```

shell에서:

```
claude plugin install run-status --marketplace Munsik-Park/autoflow-coordinator-run-status
```

desktop app에서는 프롬프트 옆의 +, Plugins, Add marketplace에 `Munsik-Park/autoflow-coordinator-run-status`를 입력한 뒤 Add plugin을 누른다.

## 사용

```
/run-status            이 세션에서 만든 회차
/run-status <회차>      지정한 회차
/run-status --all      active 회차 전체
```

## 개발

```
claude --plugin-dir <이 폴더>
claude plugin validate <이 폴더>
claude plugin test <이 폴더>
```
