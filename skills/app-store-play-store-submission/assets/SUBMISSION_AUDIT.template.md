# Submission audit — <version> (<build>) — <date>

> Replace this file before every submission and resubmission (`docs/SUBMISSION_AUDIT.md`). PASS needs evidence: a
> command's output, a file's content, a screenshot path. A FAIL ships only as an accepted risk below.

## App Store

| # | Check | Result | Evidence |
|---|---|---|---|
| A1 | Release build launches and stays up on the newest iOS and iPadOS, phone and tablet | | |
| A2 | No placeholder text, dead buttons or broken links; backend up; demo account in review information | | |
| A3 | Features that are not account-based work without registering (5.1.1(v)) | | |
| A4 | Account deletion inside the app | | |
| A5 | Third-party/social login offered → an equivalent privacy-preserving option too (4.8) | | |
| A6 | Personal data to a third-party AI only after in-app disclosure and permission (5.1.2(i)) | | |
| A7 | Privacy policy linked in the app and the listing; names collected data, uses, third parties | | |
| A8 | Purpose strings for every permission, every shipped language; refusals handled | | |
| A9 | Background modes = only the ones used (printed from the generated Info.plist) | | |
| A10 | Digital goods use in-app purchase; other payment channels off on iOS (3.1.1) | | |
| A11 | Subscriptions: what/period/store price before purchase, restore, Terms + privacy links in app **and** listing | | |
| A12 | Screenshots captured on this platform; no other platform's names or chrome (2.3.10) | | |
| A13 | App Privacy answers match docs/DATA_INVENTORY.md | | |
| A14 | User-generated content: filter, report, block, contact (1.2) | | |

## Google Play

| # | Check | Result | Evidence |
|---|---|---|---|
| G1 | Bundle signed by the upload key (not debug); version code higher than any uploaded | | |
| G2 | Store app-signing certificate registered for sign-in providers | | |
| G3 | In-app account deletion **and** a web deletion page, declared in Data safety | | |
| G4 | Data safety answers match docs/DATA_INVENTORY.md | | |
| G5 | Payments: digital goods through Play Billing, or the owner accepted the risk | | |
| G6 | AI-generated content can be reported/flagged in the app | | |
| G7 | Merged manifest: only the permissions and foreground services in use, each declared | | |
| G8 | Target API level meets the current requirement | | |
| G9 | Closed-testing gate satisfied or not applicable (account type) | | |

## Accepted risks (owner's decision, dated)

| Risk | Accepted by | Date | Lever that removes it |
|---|---|---|---|
| | | | |

## Cannot be checked from here — please confirm in the console

-
