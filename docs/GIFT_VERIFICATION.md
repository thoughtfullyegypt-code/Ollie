# A Seat Saved for You verification

This record contains executed gift checks and screenshots. Development checkout exercises the application’s authoritative reservation, payment-event, fulfillment, and gift-activation logic without collecting money. It does not establish external Stripe Checkout or webhook delivery.

## Verification scope

The browser checks cover the birthday sender journey, anonymous draft recovery through authentication, a confirmed development payment, signed-out recipient reading, a predefined thank-you, verified explicit seat claim, sender management, private metadata, and reduced-motion rendering. Other occasion variations and revoked/replaced gift links are included where recorded below.

## Results

- Final backend suite: **81 passed, 0 failed, 0 skipped** in **9.26 seconds**. This includes the existing 65 checks and 16 gift checks for pricing, ownership, links, privacy, responses, lifecycle, invalid-lookup budgets, and late payment fulfillment support.
- Full browser regression suite: **11 passed, 0 failed, 0 skipped** in **1.1 minutes** against the final optimized local application on 2026-10-22. This includes the existing nine journeys and both gift journeys.
- Final focused gift browser rerun: **2 passed, 0 failed, 0 skipped** in **24.1 seconds** after screenshot positioning and occasion-specific fixture refinements. The birthday UI journey passed in 19.6 seconds; the already-owned seats, four other occasion variations, and revoked/replaced-link checks passed in 3.5 seconds. Application source was unchanged after the full regression run.
- The birthday test uses the actual anonymous builder, reload recovery, magic-link verification, server-priced adjacent-pair checkout, explicit development payment event, confirmed gift activation, copy/download controls, signed-out reveal, anonymous thank-you, and verified one-use claim flow. The recipient creates no new order. The sender dashboard reflects the thank-you and relinquished guest; the sender cannot edit that guest after claim.
- Privacy checks verify no shared caching or referrer leakage, generic metadata, invitation images whose URLs contain no claim credentials, no private letter in public table data, passive reading without ownership change, and safe literal rendering of malicious HTML after a sender edits the letter.
- The four other occasion variations were opened in a narrow mobile browser with reduced motion. Their private letters remain readable without animation; existing paid neighboring seats cost $0, and generating a replacement or revoking the gift disables the old bearer link.
- Mobile checks cover 390-pixel and 320-pixel widths without horizontal overflow, separated preview artwork and heading bounds, and the opened letter occupying at least half its height within the viewport. Reduced-motion occasion views retain the paired character scene and all message content.
- `npm run typecheck` and the final optimized production build passed. The browser suite ran against that optimized build; it did not use a development server.

The final desktop and mobile captures were refreshed and inspected for clipping, spacing, readable type, character visibility and control overlap. The mobile builder keeps its heading below the artwork; the letter-reading capture shows the full heading and readable message; all five occasion captures retain both guests and the occasion prop. Secret link inputs are masked in the captured owner views. These images contain clearly identified development fixtures and do not establish real customer activity.

| Capture                         | Artifact                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| Mobile sender builder           | [gift-builder-mobile.png](../screenshots/gift-builder-mobile.png)                     |
| Desktop sender builder          | [gift-builder-desktop.png](../screenshots/gift-builder-desktop.png)                   |
| Desktop recipient preview       | [gift-preview-desktop.png](../screenshots/gift-preview-desktop.png)                   |
| Confirmed gift sharing          | [gift-ready-desktop.png](../screenshots/gift-ready-desktop.png)                       |
| Mobile private invitation       | [gift-invitation-mobile.png](../screenshots/gift-invitation-mobile.png)               |
| Birthday pair at the table      | [gift-birthday-scene-mobile.png](../screenshots/gift-birthday-scene-mobile.png)       |
| Letter reading position, phone  | [gift-letter-reading-mobile.png](../screenshots/gift-letter-reading-mobile.png)       |
| Readable private letter         | [gift-letter-mobile.png](../screenshots/gift-letter-mobile.png)                       |
| Sender management and thank-you | [gift-sender-dashboard-desktop.png](../screenshots/gift-sender-dashboard-desktop.png) |
| Public invitation image         | [gift-invitation-image.png](../screenshots/gift-invitation-image.png)                 |
| Congratulations                 | [gift-congratulations-mobile.png](../screenshots/gift-congratulations-mobile.png)     |
| Thank you                       | [gift-thank-you-mobile.png](../screenshots/gift-thank-you-mobile.png)                 |
| I miss you                      | [gift-miss-you-mobile.png](../screenshots/gift-miss-you-mobile.png)                   |
| Just because                    | [gift-just-because-mobile.png](../screenshots/gift-just-because-mobile.png)           |

## Configuration and launch limits

No real card charge, donation, external message, or public deployment is authorized or performed by these checks. Production authentication/email delivery, hosted Stripe Checkout and signed webhooks, operator support and adopted service/refund/privacy terms, tax configuration, and operational launch checks remain required. Donation eligibility and accounting continue through the normal order process.

Physical iPhone/Safari testing and production network performance are not established by local Chromium viewport and touch emulation.
