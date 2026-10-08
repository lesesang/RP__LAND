# RP LAND를 개인 Cloudflare D1으로 옮기는 방법

2026-10-08 현재 프로젝트 기준. 이 문서는 이전 안내이며 실제 저장소나 운영 데이터를 변경하지 않았다.

## 현재 구조

GitHub는 소스 코드 저장소다. 계정·스레드·위키·레스는 Sites가 연결한 D1에 저장된다. 코드의 `db/raw.ts`는 `env.DB`를 사용하고 `.openai/hosting.json`에는 논리적 연결 이름 `DB`만 들어 있다. 실제 데이터베이스 ID와 연결은 Sites 배포가 관리한다. 현재 제공된 Sites 설정에서 개인 계정의 database_id를 직접 지정하는 경로는 확인되지 않았다. 개인 D1 ID를 일반 환경변수에 넣는 것만으로는 연결되지 않는다.

## 선택

| 방식 | 장점 | 필요한 작업·단점 |
| --- | --- | --- |
| 사이트 서버와 DB 모두 개인 Cloudflare로 이전 — 권장 | D1 기본 연결을 그대로 사용, 운영·백업·요금 관리가 본인 계정에 모임 | 개인 Workers 배포 설정, 새 주소 또는 개인 도메인, 직접 운영 필요 |
| Sites 화면·서버 유지 + 개인 Worker API + 개인 D1 | 현재 Sites 주소 유지 가능 | 인증된 서버 간 API와 DB 접근 코드 수정 필요, 네트워크 왕복·실패 처리·두 배포 관리 |

Cloudflare는 Worker에서 D1에 접근할 때 기본 바인딩 사용을 권장한다. 외부 프로젝트 접근에는 인증된 Worker API를 두는 방법이 있다. D1 관리 REST API를 모든 레스 읽기·쓰기에 직접 사용하는 방식은 관리 API 제한과 추가 지연 때문에 권장하지 않는다.

## 권장 이전 순서

1. 개인 Cloudflare 계정에서 D1과 Workers를 준비한다. GitHub `lesesang/RP__LAND`의 최신 코드를 별도 이전 브랜치로 받는다. 기존 Sites 운영본은 유지한다. 프로젝트에 맞는 Node.js(22.13 이상)와 pnpm을 준비한다.
2. 저장소에서 `pnpm install --frozen-lockfile`, `pnpm exec wrangler login`, `pnpm exec wrangler d1 create rp-land`를 실행한다. 생성 결과의 실제 database_id를 보관한다.
3. 개인 배포용 설정을 만든다. 현재 `vite.config.ts`의 예시 D1 ID를 개인 배포용 설정에서 실제 ID로 연결하고 Worker 이름·계정·정적 파일 설정을 구성한다. 연결 이름은 `DB`를 유지한다. Sites 전용 개발 인증 플러그인과 배포 절차는 개인 배포 경로에서 분리한다. 빌드 결과 `dist/server/wrangler.json`만 수동 수정하면 다음 빌드 때 덮어써지므로 소스 설정을 고쳐야 한다.

   D1 연결 항목 예시(전체 배포 설정이 아님):

   ```json
   {
     "d1_databases": [{
       "binding": "DB",
       "database_name": "rp-land",
       "database_id": "생성된 실제 UUID",
       "migrations_dir": "./drizzle"
     }]
   }
   ```

   migrations_dir는 실제 사용하는 설정 파일 위치 기준으로 맞춘다. 위 예시는 저장소 루트 설정 기준이다.

4. 새 빈 DB라면 저장소의 `drizzle/*.sql`을 순서대로 적용한다. 개인 배포 설정을 `wrangler.personal.jsonc`로 준비한 경우:

   ```sh
   pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.personal.jsonc
   ```

   데이터를 유지하려면 먼저 기존 운영 DB의 일관된 백업을 확보한다. 현재 Sites 관리 DB가 개인 Cloudflare 계정에 보이는 것은 아니므로, 개인 계정으로 로그인했다고 기존 DB를 export할 수 있는 것은 아니다. 관리 DB에 대한 적법한 내보내기 경로가 필요하며, 현재 노출된 도구에는 완전한 SQL 내보내기 기능이 없어 별도 준비가 필요하다. 로컬 테스트 DB는 운영 백업이 아니다.

   기존 DB 접근 권한과 SQL 백업을 확보한 경우 Cloudflare의 표준 명령은 다음과 같다.

   ```sh
   pnpm exec wrangler d1 export OLD_DATABASE --remote --output backup.sql
   pnpm exec wrangler d1 execute DB --remote --file backup.sql --config wrangler.personal.jsonc
   ```

   전체 스키마가 포함된 백업을 빈 DB에 복원하는 경로와, 마이그레이션으로 스키마를 만든 뒤 데이터만 복원하는 경로 중 하나를 사용한다. 같은 CREATE/ALTER를 두 번 적용하지 않도록 마이그레이션 이력도 맞춘다. 계정 비밀번호 해시는 그대로 보존하되 로그인 세션·비밀글 열람 세션은 이전 후 다시 로그인하도록 폐기하는 것이 좋다.

5. 개인 Workers 환경에 필요한 비밀값을 등록한다. 완전히 새 DB라면 새 ADMIN_SETUP_TOKEN으로 최초 총관리자를 설정한다. 이미 총관리자 계정을 옮겼다면 초기 설정 키는 필요 없다. RESET_TOKEN은 일반 운영에 등록하지 않는다. 토큰을 GitHub나 브라우저 코드에 넣지 않는다.
6. 빌드 후 개인 배포 설정에 맞춰 Workers에 배포한다. 현재의 Sites 배포 명령을 그대로 사용하면 개인 계정으로 이전되지 않는다. 개인 Worker 배포는 새 workers.dev 주소 또는 개인 도메인에서 제공된다. 기존 chatgpt.site 주소가 자동 이전되지는 않는다. Sites의 외부 접근 제한 또한 자동 이전되지 않으므로 공개 여부 또는 Cloudflare Access 정책을 별도로 정한다.
7. 새 주소에서 로그인, 역할 권한, 스레드·위키·레스 저장, 주사위, 비밀글, 예약, 카테고리 변경을 검증한다. 기존 데이터 보존 시 전환 직전 쓰기를 잠시 중지하고 최종 백업/복원 후 이용자를 새 주소로 안내해 양쪽 DB에 글이 갈라지는 일을 방지한다.

## 현재 Sites 주소를 유지하려면

개인 Worker에 D1을 연결하고 인증된 API를 만든 뒤, Sites 서버가 그 API를 호출하도록 `db/raw.ts`와 쿼리·배치 처리 경로를 수정한다. 브라우저에 관리 API 토큰을 전달하거나 임의 SQL 실행 API를 공개하지 않는다. 현재 앱의 배치 작업이 원자성을 유지하도록 설계해야 한다. 이 방식은 추가 구현이 필요하며 설정 한 줄만 바꾸는 작업이 아니다.

## 공식 참고 문서

- D1 생성·바인딩: https://developers.cloudflare.com/d1/get-started/
- 바인딩과 REST API 비교: https://developers.cloudflare.com/workers/runtime-apis/bindings/
- SQL 내보내기·가져오기: https://developers.cloudflare.com/d1/best-practices/import-export-data/
- 마이그레이션: https://developers.cloudflare.com/d1/reference/migrations/
- 외부 접근용 Worker API: https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1/
