# RP LAND 운영 안내

운영 사이트: https://rp-land.rpland.workers.dev

이미 운영 중인 사이트를 업데이트하려면 **1번**만 따르면 됩니다. 명령은 PowerShell에서 한 줄씩 실행하고, 오류가 나면 다음 단계로 넘어가지 마세요.

## 1. 업데이트와 백업

```powershell
Set-Location "$HOME\Documents\RP__LAND"
git pull
pnpm install --frozen-lockfile
pnpm run build
pnpm db:backup
pnpm exec wrangler deploy --config .\dist\server\wrangler.json
```

빌드에는 개인 Cloudflare 연결 설정이 기본으로 적용됩니다. 매번 환경변수를 입력할 필요는 없습니다. 배포 마지막에 사이트 주소와 `Current Version ID`가 나오면 새 버전이 배포된 것입니다. 사이트를 새로고침해서 확인하세요.

DB 구조를 바꾸는 업데이트에서만, 변경 안내에 따라 백업 후 배포 전에 아래 명령을 실행합니다.

```powershell
pnpm exec wrangler d1 migrations apply DB --remote --config .\dist\server\wrangler.json
```

### 백업 보관

`pnpm db:backup`은 운영 D1을 PC의 `.backups` 폴더에 날짜가 붙은 SQL 파일로 저장합니다. 내보내는 동안 DB 조회가 일시 중단될 수 있으므로 이용이 적은 시간에 실행하세요.

백업에는 계정 해시와 비공개 글도 포함됩니다. 파일과 로그의 임시 다운로드 링크를 공개하지 마세요. `.backups`는 Git에서 제외되며, 안전한 별도 위치에도 복사해 두는 것이 좋습니다. 자동 백업이나 자동 복원은 설정되어 있지 않습니다.

## 2. 새 PC에서 준비하기

Git과 Node.js 22.13 이상을 설치한 뒤 실행합니다.

```powershell
npm install --global pnpm@11.25.0
Set-Location "$HOME\Documents"
git clone https://github.com/lesesang/RP__LAND.git
Set-Location .\RP__LAND
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm exec wrangler whoami
```

브라우저에서 운영 Cloudflare 계정으로 로그인하고 Wrangler 접근을 허용합니다. 저장소 폴더가 이미 있다면 복제하지 말고 그 폴더에서 `git pull`을 실행하세요. 준비가 끝나면 1번 순서로 업데이트합니다.

## 3. 연결 대상

| 항목 | 값 |
| --- | --- |
| Worker | `rp-land` |
| Cloudflare 계정 ID | `c7968b6871f33603b8f201fbfe66f877` |
| D1 이름 | `rp-land` |
| D1 ID | `0c2063d5-ddfe-4d46-a6c9-269417d63a27` |
| 코드에서 사용하는 DB 이름 | `DB` |

이 값들은 비밀번호나 API 토큰이 아닌 리소스 식별자입니다. 실제 계정과 게시글은 위 D1에 저장됩니다. GitHub 업데이트와 재배포는 데이터를 초기화하지 않습니다.

`vite.config.ts`가 연결 설정을 만들고, 빌드 결과는 `dist/server/wrangler.json`에 기록됩니다. `dist` 파일을 직접 수정하면 다음 빌드에서 덮어써집니다. 다른 계정·DB로 이전할 때만 `CLOUDFLARE_ACCOUNT_ID`, `RP_PERSONAL_D1_ID`를 바꿔 빌드하세요. 백업 명령은 위 운영 대상만 허용하므로 이전 시 백업 스크립트의 대상 검사도 함께 변경해야 합니다.

## 4. 최초 총관리자 지정

**총관리자가 아직 없는 경우에만 필요합니다.** 일반 업데이트 때 다시 설정하지 않습니다.

1. 사이트에서 사용할 계정으로 가입하고 로그인합니다.
2. 아래 명령으로 설정 키를 만들고 Worker에 등록합니다.
3. 사이트의 **내 계정 → 총관리자 설정**에 같은 키를 입력합니다.

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$setupKey = [Convert]::ToBase64String($bytes)
Write-Host "총관리자 설정 키: $setupKey"
pnpm exec wrangler secret put ADMIN_SETUP_TOKEN --config .\dist\server\wrangler.json
```

`Enter a secret value`에는 표시된 키 값만 붙여 넣습니다. 이 키는 계정 로그인 비밀번호가 아닙니다. 총관리자가 지정된 뒤에는 같은 키로 다른 계정을 승격할 수 없습니다. 부관리자는 총관리자가 회원 목록에서 임명합니다.

## 5. 오류가 날 때

| 상황 | 확인할 내용 |
| --- | --- |
| `pnpm`을 찾을 수 없음 | 2번의 pnpm 설치 후 새 PowerShell 창에서 재시도 |
| Cloudflare 인증·권한 오류 | `pnpm exec wrangler login` 후 `whoami`로 계정 확인 |
| 총관리자 설정 키가 서버에 없다는 안내 | 올바른 Worker에 `ADMIN_SETUP_TOKEN` 등록 |
| 설정 키를 확인하라는 안내 | 입력값이 등록한 키와 같은지 확인. 앞뒤 공백도 구분 |
| 이미 총관리자가 지정되었다는 안내 | 기존 총관리자 계정 사용. 키 재발급으로 바뀌지 않음 |
| 시도 횟수 제한 | 안내된 시간이 지난 뒤 재시도. 같은 접속 주소는 제한을 공유할 수 있음 |
| 배포 후 이전 화면이 보임 | PC에서 Ctrl + F5, 휴대폰에서 페이지 새로고침 |

비밀번호 자동 복구와 공개 데이터 초기화 API는 제공하지 않습니다. 계정 문제를 해결하려고 DB 전체를 초기화하지 마세요.

## 참고

- [Cloudflare D1 시작하기](https://developers.cloudflare.com/d1/get-started/)
- [D1 마이그레이션](https://developers.cloudflare.com/d1/reference/migrations/)
- [D1 내보내기·가져오기](https://developers.cloudflare.com/d1/best-practices/import-export-data/)

## 비밀글 비밀번호 확인 기능

비밀번호 확인 권한은 작성자·공유 편집자·총관리자·부관리자에게 있습니다. 확인해도 입장 권한은 생기지 않으며 열람 비밀번호를 입력해야 합니다. 계정 로그인 비밀번호에는 적용되지 않습니다.

서버는 확인용 비밀번호를 AES-GCM으로 암호화해 보관합니다. 다음 명령은 프로젝트 폴더에서 **처음 한 번만** 실행하세요. 이미 설정한 암호화 키를 새로 생성하거나 덮어쓰면 보관된 비밀번호를 읽을 수 없으므로, 키는 안전한 비밀번호 관리자에 별도로 보관하세요. 키를 GitHub나 대화에 올리지 마세요.

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$entryPasswordKey = [Convert]::ToBase64String($bytes)
$entryPasswordKey | pnpm exec wrangler secret put ENTRY_PASSWORD_KEY --config .\dist\server\wrangler.json
```

키는 `$entryPasswordKey` 변수에 있으며, Cloudflare에 저장한 뒤에도 백업을 보관해야 합니다. 데이터베이스에도 새 테이블이 필요합니다. 빌드 후 아래 명령으로 마이그레이션을 적용하고 배포하세요.

```powershell
pnpm exec wrangler d1 migrations apply DB --remote --config .\dist\server\wrangler.json
pnpm exec wrangler deploy --config .\dist\server\wrangler.json
```

해시만 저장된 비밀번호는 원문을 복구할 수 없습니다. 암호화 키가 설정된 상태에서 올바른 비밀번호로 한 번 입장하면 확인용 암호문이 보관됩니다. 비밀번호 확인 자체는 입장 쿠키를 발급하지 않습니다. 직접 비밀번호를 입력해 입장한 경우의 기존 1시간 열람 유효기간은 유지됩니다.
