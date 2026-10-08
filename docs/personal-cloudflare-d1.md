# RP LAND 개인 Cloudflare D1 배포

2026-10-08 현재 저장소 설정 기준입니다. 기존 Sites 사이트와 그 D1은 유지되고, 아래 작업은 별도 `rp-land` Worker와 개인 D1을 만듭니다. 개인 Worker는 `workers.dev` 주소를 사용합니다.

## 준비 상태

- 계정: Cloudflare 계정 `c7968b6871f33603b8f201fbfe66f877`
- D1 이름: `my-db-RP-Land`
- D1 ID: `58ef2317-7ed0-41e0-a055-106589cf0239`
- 기존 RP LAND 자료는 최근 초기화되어 새 D1에는 옮길 계정/게시물이 없습니다.
- 이 저장소는 `RP_DEPLOY_TARGET=personal`일 때에만 위 D1과 계정 ID를 개인 Worker 설정에 반영합니다. 기본 Sites 빌드는 계속 기존 Sites 연결을 사용합니다.
- RP LAND에는 자체 ID/비밀번호 로그인이 있으므로 ChatGPT 전용 로그인에 의존하지 않습니다.

## 1. 저장소를 Windows에 받기

PowerShell에서 쓰기 가능한 폴더로 이동합니다. PowerShell은 CMD와 달리 `%USERPROFILE%`/`cd /d` 문법을 쓰지 않습니다.

```powershell
Set-Location "$HOME\Documents"
git clone https://github.com/lesesang/RP__LAND.git
Set-Location .\RP__LAND
```

저장소가 이미 있다면 `git pull`로 최신 변경을 받습니다. Node.js 22.13 이상과 pnpm이 필요합니다.

## 2. 개인 Worker 빌드 및 DB 구조 적용

아래 값을 현재 PowerShell 창에 설정합니다. 이 값은 비밀 토큰이 아닙니다.

```powershell
$env:RP_DEPLOY_TARGET = "personal"
$env:RP_PERSONAL_D1_ID = "58ef2317-7ed0-41e0-a055-106589cf0239"
$env:CLOUDFLARE_ACCOUNT_ID = "c7968b6871f33603b8f201fbfe66f877"
pnpm install --frozen-lockfile
pnpm run build
```

`wrangler whoami`가 해당 계정으로 로그인되어 있어야 합니다. 앞서 받은 `Authentication error [code: 10000]`가 계속되면 D1 대시보드에서 이미 DB가 만들어졌는지 확인하고, Cloudflare 대시보드에서 D1 권한이 있는지 확인하세요. API 토큰을 이 저장소나 채팅에 넣지 마세요.

빌드가 끝난 뒤 D1에 빈 스키마를 적용합니다.

```powershell
pnpm exec wrangler d1 migrations apply DB --remote --config .\dist\server\wrangler.json
```

개인용 빌드 설정은 `DB` 바인딩을 방금 만든 D1 UUID와 연결하며 `drizzle/`의 마이그레이션 경로도 포함합니다. 마이그레이션은 순서대로 적용됩니다.

## 3. Worker 배포와 총관리자 키 설정

```powershell
pnpm exec wrangler deploy --config .\dist\server\wrangler.json
```

배포가 끝나면 초기 총관리자 설정 키를 만들고 Worker 비밀값으로 등록합니다. 다음 PowerShell 명령은 256비트 임의 키를 만들어 화면에 한 번 보여 줍니다. 키를 안전한 곳에 잠시 복사해 둔 뒤 명령이 요청할 때 입력하세요.

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$setupKey = [Convert]::ToBase64String($bytes)
Write-Host "초기 총관리자 설정 키: $setupKey"
pnpm exec wrangler secret put ADMIN_SETUP_TOKEN --config .\dist\server\wrangler.json
```

그다음 Worker의 `workers.dev` 주소에 접속해 계정을 가입하고 로그인한 뒤, **내 계정 → 총관리자 설정**에 키를 입력합니다. 이 키는 브라우저 코드나 GitHub에 넣지 않습니다. 현재 앱은 첫 SUPER 계정이 정해진 뒤 추가 계정의 승격을 막습니다.

## 중요한 점

- `pnpm run build`를 다시 하면 `dist/`가 갱신됩니다. 개인 대상 변수 세 개를 같은 PowerShell 창에 유지하세요.
- 현재 Workers 배포는 RP LAND 서버와 D1만 옮깁니다. 사용자 정의 도메인, 기존 Sites 주소, 접근 정책은 자동 이전되지 않습니다.
- 개인 Worker로 옮기면 계정과 게시물은 이제 본인 Cloudflare D1에 저장됩니다. 배포 후 주소와 로그인/스레드 저장을 직접 확인한 뒤 이용자에게 새 주소를 공유하세요.
- `RESET_TOKEN`은 설정하지 마세요. 실제 전체 데이터 초기화를 위한 비밀값이며 개인 운영에는 필요 없습니다.

## Cloudflare 공식 안내

- [D1 만들기 및 Worker에 연결](https://developers.cloudflare.com/d1/get-started/)
- [마이그레이션](https://developers.cloudflare.com/d1/reference/migrations/)
- [내보내기와 가져오기](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
