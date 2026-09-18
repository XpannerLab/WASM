# WASM 산출물 자동 PR

`main` 루트 산출물이 바뀌면 [sync-consumers.yml](../.github/workflows/sync-consumers.yml)이 두 소비 저장소에 파일 변경 PR을 생성합니다. npm 패키지 발행이나 개발자의 npm 업데이트 명령은 필요하지 않습니다.

| 원본 (XpannerLab/WASM) | 대상 저장소 (XpannerDev) | 대상 파일 | PR base |
| --- | --- | --- | --- |
| `app_wasm.js` | xpanner-connect-excavator-fe | `public/wasm/app_wasm.js` | develop |
| `app_wasm.wasm` | xpanner-connect-excavator-fe | `public/wasm/app_wasm.wasm` | develop |
| `app_proxy_win.exe` | xpanner-x1-excavator-desktop | `electron/resources/wasm-proxy/app_proxy_win.exe` | develop |

`render_batch/`, `render_instanced/`의 파일은 대상이 아닙니다. base를 바꾸려면 workflow의 matrix를 수정합니다.

## 최초 설정

1. 자동화용 GitHub App을 만들고 Repository permissions에서 **Contents: Read and write**, **Pull requests: Read and write**를 부여합니다. Webhook은 필요하지 않습니다.
2. App을 **XpannerDev** 조직에 설치하고 위 FE, desktop 저장소 두 곳만 선택합니다. 조직 관리자의 설치/권한 승인이 필요할 수 있습니다.
3. App의 Client ID를 **XpannerLab/WASM → Settings → Secrets and variables → Actions → Variables**에 `WASM_SYNC_APP_CLIENT_ID`로 등록합니다.
4. App에서 생성한 private key의 PEM 내용 전체를 같은 저장소의 Actions **Secrets**에 `WASM_SYNC_APP_PRIVATE_KEY`로 등록합니다. 파일이나 키 원문을 Git에 커밋하지 않습니다.
5. 조직 Actions 정책이 `actions/checkout`, `actions/create-github-app-token`, `peter-evans/create-pull-request` 사용을 허용하는지 확인합니다. 대상 저장소의 브랜치 ruleset도 App의 `codex/sync-wasm-artifacts` 브랜치 생성/갱신을 허용해야 합니다.
6. workflow를 WASM의 `main`에 반영한 뒤 Actions에서 **Sync WASM artifacts to consumers → Run workflow → main**을 실행합니다. 워크플로 파일 추가만으로는 자동 실행되지 않습니다.
7. 실행 summary와 각 저장소의 PR을 확인하고, 파일 경로·Source 커밋·기존 CI 결과를 검토합니다. 변경이 없으면 해당 저장소에는 PR이 생성되지 않습니다.

소스는 WASM 자체의 읽기 전용 `GITHUB_TOKEN`으로 체크아웃합니다. 대상은 XpannerDev에 설치한 App의 저장소별 토큰으로 접근하므로 App을 XpannerLab에 설치할 필요는 없습니다. App 생성 계정과 설치 조직이 다르면 해당 조직에 설치 가능한 App으로 설정해야 합니다.

App 토큰은 각 job 안에서 발급하고 종료 시 폐기합니다. 대상 PR의 `pull_request` CI도 실행할 수 있습니다. 현재 desktop build workflow는 수동 실행 방식이므로 PR 생성만으로 desktop 빌드가 시작되지는 않습니다.

## 갱신 동작과 운영

- 실행 시작 시 최신 `main`의 SHA 하나를 고정하고 두 job이 같은 소스를 사용합니다. 과거 실행의 **전체 job을 재실행**하면 최신 main을 동기화합니다. 실패 job만 재실행하면 이전 snapshot SHA를 재사용하므로, 복구 시 전체 재실행 또는 Run workflow를 사용합니다. 과거 버전 배포용으로 사용하지 않습니다.
- 세 산출물이 누락되거나 비어 있으면 실패합니다. WASM/EXE 헤더와 Git LFS 포인터 여부도 확인합니다. 이것은 파일 형식 검사이며 런타임 호환성을 보증하지 않습니다.
- JS와 WASM은 반드시 같은 빌드의 파일을 **한 커밋으로** 올립니다. EXE까지 호환성 변경이 있다면 세 파일을 함께 올립니다. 파일을 따로 커밋하면 중간 상태도 PR에 반영될 수 있습니다.
- 각 저장소의 `codex/sync-wasm-artifacts` 브랜치를 자동화 전용으로 사용합니다. 열린 PR이 있으면 그 PR을 최신 내용으로 갱신하므로 수동 변경을 쌓지 않습니다.
- 대상 base와 파일 내용이 같으면 새 커밋/PR을 만들지 않습니다. 변경이 다시 발생하면 새 PR을 만들거나 기존 열린 PR을 갱신합니다.
- 실행을 직렬화하고 두 대상 job은 독립적으로 처리합니다. 한쪽만 실패했다면 권한/로그를 확인한 후 **전체 workflow를 재실행**해 두 대상에 최신 스냅샷을 적용합니다.
- PR 본문에 소스 커밋, 실행 링크, 대상 파일별 SHA-256을 기록합니다. 두 저장소의 PR 머지는 독립적이므로 호환성이 필요한 변경은 같은 Source SHA인지 확인하고 함께 검증·배포합니다.
- 자동 머지/배포는 포함하지 않습니다. PR 승인과 머지는 기존 팀 절차를 따릅니다. 개발자는 머지된 브랜치를 pull하면 파일을 받습니다.
- LFS를 도입할 경우 먼저 source checkout에 LFS 다운로드를 추가해야 합니다. 현재 workflow는 포인터 파일을 그대로 배포하는 대신 실패합니다.
- 빌드 workflow가 기본 `GITHUB_TOKEN`으로 산출물을 push하는 구조로 바뀌면 push 이벤트가 후속 workflow를 트리거하지 않을 수 있습니다. 그때는 빌드 완료 후 명시적 dispatch 또는 workflow 연결을 추가합니다.

## 기존 dev-wasm 패키지와 관계

이 경로는 `dev-wasm`을 거치지 않습니다. 기존 npm 패키지와 publish workflow를 유지해도 이 자동화와 독립적입니다. 소비 프로젝트에 나중에 `copy:wasm`/`prebuild` 같은 npm 패키지 복사 훅을 추가하면 Git의 최신 파일을 덮어쓸 수 있으므로 직접 파일 관리 방식과 중복 적용하지 않습니다.

## 참고

- [GitHub App 토큰 생성과 다른 조직 설치 지정](https://github.com/actions/create-github-app-token)
- [PR 생성·갱신 동작과 인증 권한](https://github.com/peter-evans/create-pull-request)
