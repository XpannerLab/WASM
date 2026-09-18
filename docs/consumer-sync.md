# WASM 자동 발행 및 소비 저장소 PR

`main` 루트의 `app_wasm.js`, `app_wasm.wasm`, `app_proxy_win.exe` 중 하나라도 변경되면 자동 실행합니다. 원본 SHA를 고정하고, 산출물 묶음을 날짜 버전의 GitHub Release로 발행한 후 FE·desktop PR을 생성합니다. 제품 자동 머지·배포는 하지 않습니다.

## 대상

| 파일 | 대상 저장소 (XpannerDev) | 경로 | PR base |
| --- | --- | --- | --- |
| app_wasm.js / app_wasm.wasm | xpanner-connect-excavator-fe | public/wasm/ | develop |
| app_proxy_win.exe | xpanner-x1-excavator-desktop | electron/resources/wasm-proxy/ | develop |

원본은 XpannerLab/WASM 루트이며 render_batch/, render_instanced/는 제외합니다. 개별 파일 변경도 새 묶음 후보이며 나머지 파일은 같은 커밋의 기존 파일을 포함합니다.

## 인증 및 최초 설정

1. GitHub App을 XpannerDev의 위 두 저장소에 설치합니다. Contents와 Pull requests에 Read and write를 부여합니다.
2. **XpannerLab/WASM**의 Actions variable에 `WASM_SYNC_APP_CLIENT_ID`, secret에 `WASM_SYNC_APP_PRIVATE_KEY`(PEM 전체 내용)를 등록합니다.
3. 조직 정책에서 actions/checkout, actions/create-github-app-token, actions/github-script, peter-evans/create-pull-request를 허용합니다. 소비 저장소 ruleset은 `codex/sync-wasm-*` 브랜치 생성·갱신을 허용해야 합니다.
4. WASM의 발행 job은 `GITHUB_TOKEN`의 `contents: write`를 요청합니다. 소비 job은 WASM을 읽기만 하며, 대상 PR 쓰기는 App 토큰으로 처리합니다. App을 XpannerLab에 추가 설치할 필요는 없습니다.
5. main에 workflow·스크립트·테스트·문서를 함께 반영합니다. 문서/workflow 변경만으로는 실행되지 않습니다. 최초 실행은 Actions의 **Sync WASM artifacts to consumers → Run workflow → main** 또는 다음 산출물 변경 push를 사용합니다.

현재 단계부터 실행하면 **실제 태그·Release·PR을 생성**합니다. 테스트는 아래 로컬 명령으로 실행하며 GitHub에 쓰지 않습니다.

## 발행 기록

- 원본: 이벤트의 `github.sha`. 최신 main을 다시 조회하지 않습니다.
- 버전: 한국 시간 기준 `wasm-YYYY.MM.DD.N`. 예약 중인 draft와 기존 태그를 포함해 당일 순번을 결정합니다. 발행 처리 순서를 뜻하며 원본 커밋의 선후·호환성을 의미하지 않습니다.
- 중복 키: 파일 이름과 세 파일 SHA-256을 조합한 bundle ID. 동일 SHA의 재실행뿐 아니라 **다른 SHA라도 동일한 묶음이면 기존 발행본을 재사용**합니다.
- 최초 원본 SHA를 canonical source로 유지합니다. 실행 summary에 이번 이벤트 SHA와 canonical SHA를 모두 표시합니다. 개별 중복 이벤트마다 별도 영구 원장 항목을 생성하지는 않습니다.
- 과거 파일 묶음으로 되돌린 push도 기존 버전을 재사용합니다. 이미 닫거나 머지한 소비 PR은 다시 만들지 않으므로 이 동작은 자동 롤백이 아닙니다. 의도적인 롤백 기능은 후속 작업입니다.

Release 초안의 본문에 기계가 읽는 manifest를 함께 저장합니다. 날짜가 바뀌어 재시도하더라도 같은 초안·버전을 재사용합니다. HTML 주석 형태의 `wasm-release-manifest-v1` 기록은 삭제·수정하지 마세요.

태그가 원본 SHA를 가리키는지 확인하고 아래 파일을 첨부합니다.

- app_wasm.js, app_wasm.wasm, app_proxy_win.exe
- wasm-manifest.json: 버전, 원본 저장소·SHA, 발행 예약 시간, bundle ID, 파일 해시·크기, 이전 버전 및 차이
- change-report.md: 파일별 변경·동일 여부와 검사 범위

첨부한 파일을 다시 다운로드하여 내용 해시를 확인한 뒤 draft를 발행합니다. 이미 발행한 asset이나 태그는 덮어쓰지 않습니다. 지연된 과거 실행이 최신 표시를 덮지 않도록 `make_latest: false`로 발행하며, GitHub의 Latest 표시를 배포 기준으로 사용하지 않습니다.

파일 헤더 검사는 수행하지만 JS/WASM 런타임·함수·프록시 호환성 검사는 아직 없습니다. 보고서에는 미실행 및 기능 변경 설명 미제공을 명시합니다. 비교 기준은 직전에 발행 예약된 완료 버전이며, 원본 커밋의 직전 버전과 다를 수 있습니다.

## 실패 복구와 소비 PR

- 발행 실패: 실패한 원래 workflow를 재실행하면 draft·태그·기존 asset을 찾아 재개합니다. 업로드 실패로 남은 `starter` asset은 draft 안에서만 제거 후 재업로드합니다.
- 이미 업로드된 파일이나 태그가 기록과 다르면 중단합니다. published Release는 자동 수정하지 않습니다.
- API 실패는 건너뛰지 않고 job 실패로 남깁니다. 태그/Release 생성 요청은 조직 정책이나 대상 커밋의 workflow 변경 관련 권한 제한으로 실패할 수 있으므로 403/404 로그를 확인해야 합니다. 다른 커밋으로 바꿔서 우회하지 않습니다.
- 소비 PR의 branch는 `codex/sync-wasm-<canonical source SHA>`입니다. 같은 산출물의 다른 이벤트에서도 같은 PR을 사용합니다. 제목과 본문에는 Release 버전·링크를 기록합니다.
- 기존 열린 PR은 완료된 PR 생성 작업으로 취급해 다시 갱신하지 않습니다. 이미 닫거나 머지한 PR도 건너뛰어 팀 결정을 유지합니다. 대상 base 변경에 대한 자동 rebase는 수행하지 않습니다.
- 한쪽 PR 생성이 실패하면 해당 job 또는 전체 실행을 재실행합니다. 성공한 쪽은 기존 PR을 보고 건너뛰며 실패한 쪽만 다시 처리합니다. 파일이 base와 같아 PR이 필요 없던 경우에는 재실행 때 다시 비교합니다.
- PR 자체를 소비 처리 상태의 기준으로 사용합니다. 별도 mutable 상태 asset은 만들지 않습니다. Release 보고서의 소비 저장소 링크에서 해당 source branch의 열린/닫힌 PR을 조회할 수 있으며 구체적 결과는 Actions summary에 남습니다.
- 새 PR이 생성되거나 기존 새 PR이 확인된 뒤, 원본 커밋의 조상에 해당하는 이전 자동 PR을 닫습니다. 상세 범위는 아래 소비 버전 기록 절을 참고하세요.
- 이전 고정 브랜치 `codex/sync-wasm-artifacts`의 PR은 자동 삭제하지 않습니다. 전환 시 수동으로 확인합니다.

## 소비 버전 기록과 이전 PR 정리

각 소비 저장소 루트의 `wasm-version.json`을 산출물과 같은 PR에 포함합니다. schemaVersion, version, sourceRepository, sourceCommit, releaseTag, releaseUrl 및 해당 저장소의 파일 경로별 SHA-256·크기를 기록합니다. 바이너리가 같아도 묶음 버전이 바뀌면 기록 파일만 변경되는 PR이 생길 수 있습니다. 이 파일은 빌드 정보에 자동 포함되지 않으며 빌드 연동은 후속 작업입니다.

원본 저장소의 Git 조상 관계를 사용해 버전 선후를 판단합니다. 날짜 버전의 숫자 순서나 PR 생성 시간으로 판단하지 않습니다.

- 대상 base의 버전 기록 또는 이미 열린/머지된 자동 PR이 더 새로운 원본이면 과거 실행의 PR 생성을 `superseded-source`로 건너뜁니다.
- 공통 선후 관계를 판정할 수 없는 이력이나 잘못된 버전 기록은 수동 확인을 위해 실패시킵니다.
- 새 PR 생성이 실패하면 기존 PR을 닫지 않습니다. 새 PR을 확인한 후에만 이전 PR을 정리합니다.
- 정리 대상은 같은 저장소·base, SHA별 자동 브랜치 및 `wasm-consumer-source` 표시가 일치하는 열린 PR입니다. 산출물·wasm-version.json 외의 파일 변경이 있으면 보존합니다.
- PR은 닫기만 하고 브랜치를 삭제하거나 댓글·알림 메시지를 직접 게시하지 않습니다. 실패 후 재실행하면 아직 열린 이전 PR의 정리를 다시 시도합니다.
- 이전 단계에서 만든 표시 없는 열린 PR은 동일 SHA 실행 때 갱신하여 버전 기록을 추가합니다. 다른 SHA의 표시 없는 PR과 기존 고정 브랜치 PR은 자동으로 닫지 않습니다.
- 보호 규칙으로 머지를 강제 차단하는 기능은 아닙니다. 닫힌 PR을 사람이 재개하거나 실행 도중 PR을 머지하는 상황까지 완전히 막으려면 소비 저장소의 required check가 추가로 필요합니다.
- 새 버전 반영 PR은 여전히 팀 리뷰·호환성 확인 후 머지합니다.

## 대기열과 남은 범위

`queue: max`는 실행 하나 외에 최대 100개를 대기시킵니다. 대기 진입 순서와 push 순서는 다를 수 있으며 큐 초과·취소·실패의 자동 재수집은 아직 없습니다. 필요한 실행은 Actions에서 찾아 재실행합니다. 모든 업로드 이력을 무제한으로 보존하는 시스템은 아닙니다.

후속 작업:

- 제품 빌드 정보와 진단 화면에 WASM 버전 포함
- 명시적 이전 버전 복구 PR
- required status check 기반의 머지 시점 재검증과 누락 실행 자동 복구
- export/import 차이, 로딩·필수 함수·프록시 테스트

이 방식은 dev-wasm/npm 패키지와 독립적입니다. 소비 프로젝트에서 npm 패키지 복사 훅으로 Git의 산출물을 덮어쓰지 않도록 합니다.

## 로컬 검증

Node.js와 Python이 필요합니다. 외부 npm 의존성 없이 다음을 실행합니다.

```sh
node --test tests/*.test.cjs
```

테스트는 임시 파일과 메모리상의 GitHub API 대역을 사용합니다. 실제 API 요청, push, Release·PR 생성은 하지 않습니다.

## 참고

- [Release REST API](https://docs.github.com/en/rest/releases/releases)
- [Release assets REST API](https://docs.github.com/en/rest/releases/assets)
- [Concurrency queue](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [GitHub App token](https://github.com/actions/create-github-app-token)
