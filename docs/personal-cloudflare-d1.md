# RP LAND 개인 Cloudflare D1 배포

2026-10-08 현재 운영 대상은 개인 Cloudflare의 `rp-land` Worker와 D1입니다. 예전 Sites 사이트는 삭제되었으며 이 저장소의 기본 빌드는 개인 Worker를 대상으로 합니다.

## 준비 상태

- 계정: Cloudflare 계정 `c7968b6871f33603b8f201fbfe66f877`
- D1 이름: `rp-land`
- D1 ID: `0c2063d5-ddfe-4d46-a6c9-269417d63a27`
- 기존 RP LAND 자료는 최근 초기화되어 새 D1에는 옮길 계정/게시물이 없습니다.
- 환경변수를 지정하지 않아도 위 개인 D1과 계정 ID로 빌드합니다. 예전 Sites 대상으로의 빌드는 차단됩니다.
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
$env:RP_PERSONAL_D1_ID = "0c2063d5-ddfe-4d46-a6c9-269417d63a27"
$env:CLOUDFLARE_ACCOUNT_ID = "c7968b6871f33603b8f201fbfe66f877"
pnpm install --frozen-lockfile
pnpm run build
```

`wrangler whoami`가 해당 계정으로 로그인되어 있어야 합니다. 앞서 `whoami`는 성공했지만 D1 API가 `Authentication error [code: 10000]`를 반환했습니다. 대시보드에서 D1이 이미 만들어졌으니 중복 생성하지 마세요. OAuth 오류가 계속되면 Cloudflare 대시보드의 **My Profile → API Tokens**에서 계정 범위를 `c7968b6871f33603b8f201fbfe66f877`로 제한한 토큰을 만드세요. D1 마이그레이션과 새 Worker 배포에 필요한 `D1:Edit`과 Workers Admin 권한을 부여합니다. 토큰은 PowerShell의 현재 세션에만 잠깐 설정하며 GitHub나 채팅에 붙여 넣지 않습니다.

PowerShell에서 토큰을 가려서 입력하려면:

```powershell
$secureToken = Read-Host "Cloudflare API token" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $env:CLOUDFLARE_API_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
}
```

배포와 secret 등록이 끝나면 환경변수를 지웁니다.

```powershell
Remove-Item Env:\CLOUDFLARE_API_TOKEN
$secureToken.Dispose()
```

빌드가 끝난 뒤 D1에 빈 스키마를 적용합니다.

```powershell
pnpm exec wrangler d1 migrations apply DB --remote --config .\dist\server\wrangler.json
```

Cloudflare 안내에 나온 바인딩은 `rp_land`였지만, 앱은 `DB`라는 이름으로 DB를 읽습니다. 저장소 설정이 `DB` 바인딩과 `rp-land` D1을 연결하므로 별도 설정을 추가할 필요가 없습니다. `drizzle/` 마이그레이션도 포함되며, 마이그레이션은 순서대로 적용됩니다.

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
- 공개 초기화 API는 제거되어 `RESET_TOKEN`은 더 이상 사용하지 않습니다.

## Cloudflare 공식 안내

- [D1 만들기 및 Worker에 연결](https://developers.cloudflare.com/d1/get-started/)
- [마이그레이션](https://developers.cloudflare.com/d1/reference/migrations/)
- [내보내기와 가져오기](https://developers.cloudflare.com/d1/best-practices/import-export-data/)


## 일상 업데이트와 백업

기본 운영 대상이 저장소에 지정되어 있어 새 PowerShell 창에서도 다음 명령으로 업데이트합니다.

```powershell
git pull
pnpm run build
pnpm db:backup
pnpm exec wrangler deploy --config .\dist\server\wrangler.json
```

백업은 현재 로그인한 Cloudflare 계정으로 운영 D1을 SQL 파일로 내보냅니다. `.backups` 폴더는 Git에서 제외됩니다. 백업 파일에는 계정 해시와 비공개 글도 포함되므로 공개하거나 GitHub에 올리지 마세요. 별도의 안전한 위치에 복사해서 보관하세요. 자동 백업 스케줄은 생성하지 않습니다. 복원은 덮어쓰기 위험이 있으므로 자동 실행하지 않습니다.

2026-10-08 인증 제한 개선에는 DB 마이그레이션이 필요 없습니다. 공개 HTTP 초기화 API는 제거했습니다. 가입은 접속 주소별 15분 20회, 로그인과 비밀 스레드 인증은 접속 주소 전체 100회 및 주소·대상별 20회로 제한합니다. 같은 공유기나 프록시를 사용하는 이용자는 주소별 제한을 공유할 수 있습니다. 분산 공격 방어를 완전히 대체하지는 않습니다.
