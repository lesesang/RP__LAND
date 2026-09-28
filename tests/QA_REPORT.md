# RP LAND 역할별 기능 검증
검증 일시: 2026-09-27T00:57:01.565Z (UTC)
검증 대상: 배포된 소스 `34c6e2a2a39274b49665284b570c438190708f8c`.
결과: 실제 HTTP 통합 검증 247개 통과, 서식·주사위 검증 38개 통과.

> 2026-09-28 후속 검증에서 이 보고서 이후 재현된 오류 5건과 수정 내용은 [QA_REPORT_ROUND2.md](QA_REPORT_ROUND2.md)에 정리했습니다. 아래 "추가 수정이 필요한 제품 오류는 발견되지 않았습니다"는 이 문서 작성 시점의 결과입니다.

## 환경과 계정

실제 배포 코드의 Cloudflare Worker를 실행하고, 별도 D1 데이터베이스에 회원가입·로그인으로 계정을 만들었습니다. 총관리자는 테스트 전용 설정 키로 지정했고, 부관리자는 총관리자의 임명 API를 사용했습니다.

|역할|계정 수|용도|
|---|---:|---|
|총관리자|1|최초 설정, 임명·해임, 강제 탈퇴, 콘텐츠 관리|
|부관리자|2|각각 수정·가림·해제·삭제·카테고리 관리, 상위 권한 거부|
|일반회원|3|동시에 활성화한 작성자·공동 편집자·제3자|
|추가 일반회원|1|자진 탈퇴 후 세션·게시물 확인|
|비로그인 방문자|계정 없음|공개 조회, 비밀글·쓰기·관리 기능 접근 거부|

검증 중에는 1명의 총관리자, 2명의 부관리자, 3명의 일반회원이 동시에 활성화돼 있는지 확인했습니다. 이후 탈퇴 시나리오에 사용한 계정은 테스트 DB 안에서 비활성화했습니다. 운영 사이트 계정이나 게시글은 변경하지 않았습니다.

## 확인한 기능

- 회원가입, 중복·잘못된 입력, 로그인 실패·성공, 로그아웃, 저장된 캐릭터명, 회원 목록.
- 최초 총관리자 설정과 재설정 거부, 부관리자 2명의 임명·해임·재임명, 일반회원 강제 탈퇴, 자진 탈퇴, 세션 즉시 무효화.
- 스레드·위키 생성·조회·수정·삭제 권한, 검색·카테고리 필터, 카테고리 생성·이름 변경.
- 공동 편집 공유·조회·취소, 권한 재공유 거부, 취소 직후 접근 차단.
- 일반 레스 등록·수정 거부·가림·해제·삭제, 번호 보존, 숨긴 본문·다이스의 노출 차단.
- 모든 역할의 본인 연습장 주사위 레스 수정·삭제, 타인 레스 권한, 숨긴 본인 레스 편집, 삭제 후 번호 재정렬.
- 1,500개 한도에서 동시 등록, 삭제 후 한 자리만 재사용, 이전 삭제 표시 레스 제외.
- 다이스의 0·1억 경계, 양수·음수 보정, 여러 양식, 100개 중복 없는 추출, 불가능한 조합 거부, 클라이언트 결과 위조 무시, 코드 속 양식 미실행.
- 비밀글 본문 검색 제외, 작성자·관리자도 비밀번호 필요, 열람 권한과 편집 권한의 분리.
- 예약순 정렬·10개 단위 페이지, 메타 정보 숨김, 비노출 예약 관리, 미리 열람 차단·허용, 공동 편집자 접근, 공개 전 레스 금지.
- 예약 작성자의 공개 전 삭제, 예약 취소·즉시 공개, 공개 후 삭제 권한 변경, 재예약 거부.
- 줄바꿈·연속 빈 줄·앞뒤 줄바꿈 저장, 루비·색상·투명글·접어보기·마크다운 렌더링, 앵커 제한, 위험한 HTML·링크 차단.
- 교차 출처 쓰기, 잘못된 JSON, 잘못된 Content-Type 거부.

## 범위

이번 실행은 실제 로그인 세션을 사용하는 서버 기능 테스트와 React 서식 렌더링 테스트입니다. 모든 화면의 버튼을 브라우저에서 일일이 클릭한 검사는 아니며, 실서비스 네트워크·기기별 화면·장시간 부하에 대한 검증으로 해석하면 안 됩니다. 주사위 UI, 줄바꿈 표시, 예약 설정 화면은 직전 배포 검증에서 별도로 확인했습니다.

이번 실행에서 실패한 검증이나 추가 수정이 필요한 제품 오류는 발견되지 않았습니다. 이는 모든 입력 조합에 오류가 없다는 보장은 아닙니다.

## 재실행

빌드 후 다음 명령으로 실행합니다. 통합 테스트는 매번 격리된 테스트 DB를 생성합니다.

```sh
node tests/run-local.mjs
node tests/run-render.mjs
```

## 통합 검증 상세

- [x] register
- [x] wrong password
- [x] login
- [x] register
- [x] wrong password
- [x] login
- [x] guest write denied
- [x] created
- [x] nonowner edit denied
- [x] owner delete denied
- [x] share
- [x] shared edit
- [x] cannot reshare
- [x] normal comment immutable
- [x] shared editor cannot hide
- [x] owner hides
- [x] hidden text redacted
- [x] dice
- [x] dice bounds
- [x] comment length
- [x] thread length
- [x] even owner must unlock
- [x] secret body unsearchable
- [x] secret search only title
- [x] wrong secret
- [x] unlock
- [x] unlocked
- [x] comments also locked
- [x] practice own edit
- [x] practice other denied
- [x] wiki shared edit
- [x] ordinary user cannot appoint
- [x] withdraw
- [x] session revoked
- [x] posts preserved anonymously
- [x] wrong bootstrap token denied
- [x] bootstrap creates first super administrator
- [x] bootstrap is one-time only
- [x] max three categories
- [x] three categories accepted
- [x] category filter
- [x] atomic 1500 cap includes hidden comments
- [x] super appoints deputy
- [x] deputy cannot change super
- [x] deputy deletes wiki
- [x] deleted wiki unavailable
- [x] deputy deletes thread
- [x] practice cannot be deleted
- [x] admin activity logged
- [x] multiple inline rolls with positions
- [x] client cannot forge dice
- [x] practice dice can reroll through editing
- [x] practice editing can add dice
- [x] invalid dice rejected
- [x] code example does not roll
- [x] guest cannot delete practice comment
- [x] deputy deletes practice dice comment
- [x] practice deletion removes row and frees capacity
- [x] super deletes practice comment
- [x] deleted practice comment cannot be unhidden
- [x] reset requires separate secret
- [x] normal response deleted
- [x] normal deletion preserves anchor numbering
- [x] normal tombstones retain cap
- [x] full practice refuses overflow
- [x] deputy frees full practice slot
- [x] practice numbers compact in insertion order
- [x] freed practice slot is atomic
- [x] legacy practice tombstones are excluded
- [x] legacy tombstones do not consume cap
- [x] unique draw applies negative modifier per result
- [x] ordinary owner edits rolled practice response
- [x] max boundary plus modifier
- [x] ordinary user cannot delete someone else practice response
- [x] ordinary owner deletes rolled practice response
- [x] impossible unique draw rejected
- [x] zero-only range accepted
- [x] saved response preserves every line break including trailing blank line
- [x] ordinary member creates scheduled thread
- [x] scheduled thread excluded from normal search
- [x] schedule metadata redacted and preview closed
- [x] closed preview blocked on server
- [x] ordinary author can delete pending thread
- [x] even author cannot respond before publication
- [x] pending author shares editing
- [x] authorized editor can edit pending content
- [x] author changes schedule settings
- [x] unlisted schedule omitted
- [x] open preview readable by direct URL
- [x] author can find unlisted schedule
- [x] private schedule list requires login
- [x] secret schedule hidden by default
- [x] secret preview still requires password
- [x] secret schedule may opt into timeline
- [x] ordinary author deletes pending thread
- [x] due thread automatically becomes published
- [x] due thread accepts responses
- [x] ordinary author cannot delete after release
- [x] published thread cannot revert to pending
- [x] schedule pagination uses ten entries
- [x] schedule is ordered by release time across pages
- [x] create sub2
- [x] login sub2
- [x] create user2
- [x] login user2
- [x] create user3
- [x] login user3
- [x] appoint second deputy
- [x] one super, two deputies and three ordinary users active together
- [x] super reads member list
- [x] super creates thread
- [x] super edits own thread
- [x] super posts dice response
- [x] super retains character name
- [x] super cannot edit normal response even when privileged
- [x] super edits own practice dice
- [x] super deletes own practice dice
- [x] deputy1 reads member list
- [x] deputy1 creates thread
- [x] deputy1 edits own thread
- [x] deputy1 posts dice response
- [x] deputy1 retains character name
- [x] deputy1 cannot edit normal response even when privileged
- [x] deputy1 edits own practice dice
- [x] deputy1 deletes own practice dice
- [x] deputy2 reads member list
- [x] deputy2 creates thread
- [x] deputy2 edits own thread
- [x] deputy2 posts dice response
- [x] deputy2 retains character name
- [x] deputy2 cannot edit normal response even when privileged
- [x] deputy2 edits own practice dice
- [x] deputy2 deletes own practice dice
- [x] user1 reads member list
- [x] user1 creates thread
- [x] user1 edits own thread
- [x] user1 posts dice response
- [x] user1 retains character name
- [x] user1 cannot edit normal response even when privileged
- [x] user1 edits own practice dice
- [x] user1 deletes own practice dice
- [x] user2 reads member list
- [x] user2 creates thread
- [x] user2 edits own thread
- [x] user2 posts dice response
- [x] user2 retains character name
- [x] user2 cannot edit normal response even when privileged
- [x] user2 edits own practice dice
- [x] user2 deletes own practice dice
- [x] user3 reads member list
- [x] user3 creates thread
- [x] user3 edits own thread
- [x] user3 posts dice response
- [x] user3 retains character name
- [x] user3 cannot edit normal response even when privileged
- [x] user3 edits own practice dice
- [x] user3 deletes own practice dice
- [x] user2 cannot edit other thread
- [x] user2 cannot delete other thread
- [x] user2 cannot manage categories
- [x] user2 cannot read administrative audit
- [x] user3 cannot edit other thread
- [x] user3 cannot delete other thread
- [x] user3 cannot manage categories
- [x] user3 cannot read administrative audit
- [x] owner shares with ordinary editor
- [x] shared editor cannot list/manage grants
- [x] ordinary shared editor edits
- [x] owner sees shared editor
- [x] owner revokes editing
- [x] revocation immediately enforced
- [x] thread owner hides response
- [x] hidden roll is redacted
- [x] thread owner unhides response
- [x] unhide restores content
- [x] deputy1 edits another thread
- [x] deputy1 hides response
- [x] deputy1 unhides response
- [x] deputy1 reads audit
- [x] deputy1 cannot appoint another deputy
- [x] deputy1 cannot forcibly withdraw member
- [x] deputy1 creates category
- [x] deputy1 renames category
- [x] deputy1 category rename visible
- [x] deputy1 deletes another practice response
- [x] deputy2 edits another thread
- [x] deputy2 hides response
- [x] deputy2 unhides response
- [x] deputy2 reads audit
- [x] deputy2 cannot appoint another deputy
- [x] deputy2 cannot forcibly withdraw member
- [x] deputy2 creates category
- [x] deputy2 renames category
- [x] deputy2 category rename visible
- [x] deputy2 deletes another practice response
- [x] author retrieves hidden practice source
- [x] others cannot retrieve hidden practice source
- [x] owner edits hidden practice source
- [x] editing does not remove moderation
- [x] ordinary author cannot unhide moderated practice response
- [x] wiki editor sharing
- [x] ordinary wiki shared editing
- [x] wiki rejects responses
- [x] wiki ordinary owner cannot delete
- [x] second deputy deletes wiki
- [x] super cannot bypass secret password
- [x] deputy1 cannot bypass secret password
- [x] deputy2 cannot bypass secret password
- [x] ordinary member unlocks secret
- [x] unlocked member posts secret response
- [x] secret unlock does not grant editing
- [x] secret unlock does not grant sharing
- [x] unshared user cannot inspect hidden scheduled thread
- [x] shared ordinary user accesses closed scheduled thread
- [x] shared ordinary editor sees hidden reservation in own management
- [x] shared ordinary editor edits reservation
- [x] shared editor cannot delete reservation
- [x] author cancels delay and publishes immediately
- [x] immediate publication removes pending state
- [x] past scheduled time rejected
- [x] invalid scheduled time rejected
- [x] duplicate username rejected
- [x] invalid username rejected
- [x] short password rejected
- [x] whitespace-only content rejected
- [x] cross-origin write rejected
- [x] non-JSON write rejected
- [x] malformed JSON rejected
- [x] out-of-range modifier rejected
- [x] more than ten dice expressions rejected
- [x] more than one hundred total dice rejected
- [x] one hundred unique dice records complete range
- [x] super cannot demote self
- [x] super cannot withdraw self
- [x] super demotes second deputy
- [x] demotion immediately revokes admin privileges
- [x] super reappoints second deputy
- [x] logout succeeds
- [x] logout clears session identity
- [x] logged-out user cannot write
- [x] login after logout
- [x] super forcibly withdraws member
- [x] forced withdrawal revokes existing session
- [x] withdrawn member cannot log in
- [x] withdrawal requires correct password
- [x] ordinary user voluntarily withdraws
- [x] voluntary withdrawal revokes session
