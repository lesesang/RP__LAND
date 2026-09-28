# RP LAND 배포 대조 기록

배포 완료: 2026-09-28T10:31:22.534501+00:00

- 서비스: https://rp-land.lesesang123.chatgpt.site
- 변경 내용: 가입 제한, 대소문자 중복 방지, 캐릭터명 검사, 입력 오류 처리 보완
- GitHub 기능 커밋: [9f739a8519a7f59008f27894de34a8d5211b3990](https://github.com/lesesang/RP__LAND/commit/9f739a8519a7f59008f27894de34a8d5211b3990)
- Sites 배포 소스 커밋: `2d1325052dbc4faf9a0df005655582c139cad88d`
- Sites 버전: `appgprj_6ab606ba981881919cc593659c344d60~appgver_9940c2cc6ac88191a25a898870b0bafb`
- 배포 ID: `appgdep_6aba41e404988191afd85072b15543a0`
- 최종 배포 상태: succeeded
- 검증: 격리 환경에서 527건 통과 (HTTP 247, 서식·주사위 38, 계정 구성 167, 악의적 입력 75)

Sites의 소스 저장소와 GitHub는 서로 다른 Git 이력을 사용하므로 커밋 SHA도 다릅니다. Sites SHA를 GitHub에서 조회하지 말고 위 대응 관계의 GitHub 커밋을 사용하세요. 이 기록을 추가하는 문서 전용 커밋은 배포 기능 커밋과 별개입니다.

## 직전 배포

- GitHub 기능 커밋: `258ac7af9f51b7cf94d3c180318fe60dd39bb66a`
- Sites 소스 커밋: `65a316e7ee7fdbad3cd4e6968bd457aa7e0b090b`
- 배포 ID: `appgdep_6ab9f0535a6481919b362d5a522a02b1`

비밀번호 해시의 반복 횟수 증가는 이번 변경에 포함하지 않았습니다. 이유와 동작 규칙은 [추가 개선 보고서](../../tests/QA_HARDENING.md)에 기록했습니다.
