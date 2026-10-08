# İki hesap canlı QA

Otomatik testler **tek süreçte iki kullanıcı kimliği** simüle eder. Gerçek iki insan oturumu değildir.

## Otomatik (bu kod tabanında çalıştırıldı)

- meydan FSM: kabul yalnızca konuk, Hazırım, nizam, kilit süresi
- aynı nizamın ikinci yazımı yok sayılır
- yavaş kabulde ev sahibi hemen teslim olmaz (her iki tarafın bağlantı saati sıfırlanır)
- açık çağrı süresi dolunca terk; sahte zafer yok
- kopuş penceresi → teslim, netice sunucuda
- aynı tohum → her iki saltanatta ayna sonuç
- kamu görünümü rakip nizamını ve kilit öncesi tohumu sızdırmaz
P2P “canlı hat” savaş sonucu yazmaz; meydan HTTPS otoritesindedir.
- native mağaza, native köprü yokken sandbox’a düşmez
- talim düellosu yalnızca yapay zekâ serdarına açılır; oyuncu `START_DUEL` ile canlı meydanı atlatamaz
- lobi ayrılışı teslim değil terk’tir; ev sahibi açık çağrıyı geri alabilir
- bildirim tıklanınca `/oyun?meydan=` veya `tahticihan://meydan/` aynı meydana bağlar

TURN: `/api/ice` kiralar. `TURN_URLS` + (`TURN_SECRET` veya `TURN_USERNAME`/`TURN_CREDENTIAL`) yoksa STUN-only bildirilir. Rekabetçi meydan TURN olmadan da sunucuda yürür.

TURN: `/api/ice` kiralar. `TURN_URLS` + (`TURN_SECRET` veya `TURN_USERNAME`/`TURN_CREDENTIAL`) yoksa STUN-only bildirilir. Rekabetçi meydan TURN olmadan da sunucuda yürür.

## HARİCİ — iki gerçek hesap (bu oturumda çalıştırılmadı)

İki tarayıcı veya iki cihaz, iki ayrı giriş.

1. Hesap A: Osmanlı’ya cülûs.
2. Hesap B: Karaman’a cülûs.
3. Cihan → B’nin adı → **Meydan oku**.
4. B kabul eder. İkisi de **Hazırım**. İkisi nizam seçer.
5. Aynı netice görünür. Hazine/ordu yalnız sunucu settle ile değişir.
6. B’nin sekmesini canlı iken kapat: teslim penceresinden sonra A’nın meydanı doktrinle kapanır. Tohumu client seçmez.
7. Aynı nizamı iki kez gönder: ikinci yazım yok sayılır.
8. A, B çevrimdışıyken meydan okur: çağrı 120 sn içinde kabul edilmezse terk edilir, zafer yazılmaz.
9. Aynı anda A→B ve B→A: tek aktif meydan kalır (eşsiz dizin).
10. A ikinci sekmede açılır: aynı meydana bağlanır, ikinci oturum açılmaz.
11. Bildirim: B kapalıyken A meydan okursa, FCM/APNs bağlıysa B bildirime basınca `/oyun?meydan=` açılır. Credential yoksa bildirim kuyruğa yazılır, gitmez.

Bu liste iki insanla koşulmadan **iki hesap E2E = yapılmadı**.

## Mağaza / native (HARİCİ)

- iOS: Mac’te Archive, Team ID, Sign in with Apple (App ID), Production APNs, StoreKit ürünleri.
- Android: upload keystore, Play Console ürünleri, App Links SHA-256, FCM.
- Canlı ödeme: sandbox HMAC tarayıcı içindir; native köprü ödeme olmadan berat yazmaz.
