# Age rating + privacy nutrition (publisher forms)

## IARC / PEGI / ESRB inventory

| Item | Present? | Notes |
|---|---|---|
| Cartoon / fantasy violence | No | Historical war, not gore camera |
| Realistic violence | Mild | Battles and sieges are reports + cinematic stills/video of armies, walls, guns. No dismemberment. |
| Sexual content | Implied adult only | Fade-to-black household scenes. Kiss → chamber → veil → fade. No graphic sex. |
| Nudity | No | |
| Profanity | Mild period Turkish | |
| Drugs / alcohol | No gameplay | |
| Gambling with real money | No | Cosmetic IAP only |
| User interaction | Yes | Letters, P2P duel, reports, blocks |
| Location sharing | No | |
| Unrestricted web | No | |

Suggested: PEGI 12 / ESRB T / IARC 12+.

Children (age < 16 in-game) never enter romance. Confirmed by domain tests.

## Apple privacy nutrition

- Email address: used for account, not tracking
- User ID: account
- Gameplay content: saves, world seat
- Tracking: false (PrivacyInfo.xcprivacy)
- Product interaction: purchases (StoreKit when live)

## Google Data safety

`store/android/data-safety.json`

Collected: email, user id, gameplay. Encrypted in transit. Users can request deletion. Not shared with advertisers.
