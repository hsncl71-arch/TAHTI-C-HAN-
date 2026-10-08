# Mağaza Product ID — Hasan’ın oluşturması gerekenler

Kod tarafı bu kimliklere kilitlidir. App Store Connect ve Google Play Console’da **aynı** kimlikler açılmadan canlı ödeme işlemez. Canlı ödeme bu listesiz hazır sayılmaz.

## Apple (App Store Connect → In-App Purchases / Subscriptions)

Bundle: `com.tahticihan.app`

| Tür | Product ID | Not |
|---|---|---|
| Auto-renewable, 1 ay | `com.tahticihan.premium.monthly` | Cihan Beratı |
| Auto-renewable, 1 yıl | `com.tahticihan.premium.yearly` | Cihan Beratı |
| Non-consumable | `com.tahticihan.kaftan.night` | kozmetik |
| Non-consumable | `com.tahticihan.kaftan.crimson` | kozmetik |
| Non-consumable | `com.tahticihan.kaftan.ivory` | kozmetik |
| Non-consumable | `com.tahticihan.palace.night` | kozmetik |
| Non-consumable | `com.tahticihan.palace.dawn` | kozmetik |
| Non-consumable | `com.tahticihan.banner.tugh` | kozmetik |
| Non-consumable | `com.tahticihan.banner.hilal` | kozmetik |

Abonelik grubu önerisi: `cihan_berat`.

## Google Play (Monetization → Products)

applicationId: `com.tahticihan.app`

| Tür | Product ID |
|---|---|
| Subscription | `cihan_premium_monthly` |
| Subscription | `cihan_premium_yearly` |
| In-app (managed, one-time) | `cihan_kaftan_night` |
| In-app | `cihan_kaftan_crimson` |
| In-app | `cihan_kaftan_ivory` |
| In-app | `cihan_palace_night` |
| In-app | `cihan_palace_dawn` |
| In-app | `cihan_banner_tugh` |
| In-app | `cihan_banner_hilal` |

Pay-to-win ürün yok. Altın, ordu, zafer satılmaz.
