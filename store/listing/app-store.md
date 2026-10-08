# App Store Connect — listing templates

Bundle ID: `com.tahticihan.app`  
Name: TAHT-I CİHAN  
Subtitle (30): Osmanlı tahtında bir ömür  
Category: Games / Strategy (secondary: Simulation)  
Age: 12+ (see age-and-privacy.md)

Native Xcode project: `native/ios/TahtiCihan.xcodeproj`  
Set `TAHT_WEB_ORIGIN` in `native/ios/Config.xcconfig` to the deployed HTTPS origin before Archive.

These strings are drafts for the publisher to paste into App Store Connect. Apple Developer hesabı vardır; kopyayı Connect’e yapıştırmak yayıncının işidir.

## Turkish — description

Taht-ı Cihan, fotogerçekçi tarihî bir yaşam ve devlet simülasyonudur. Yalnızca haritadaki bir ülkeyi yönetmezsiniz: hükümdarın yüzü, yaşı, divanı, haremi, hanedanı ve seferleri kalıcı bir dünyada yaşar.

Divan-ı Hümayun gerçek devlet hesabı üretir. Hazine, vergi, ticaret, ulufe ve sefer maliyeti yapay zekâya bırakılmaz. Kuşatma sonucu önce simülasyon motorunda yazılır; sinema bu sonucu temsil eder.

Gerçek oyuncular aynı kalıcı Cihan’da ayrı tahtlara oturabilir. Boş tahtları yapay zekâ tutar. Siz yokken dünya durmaz; kritik olaylarda saltanat bekler.

Oyun pay-to-win değildir. Gerçek para savaş, hazine veya diplomasi sonucu satmaz. Premium ve çarşı yalnızca kozmetik kaftan, saray teması, sancak, hanedan arşivi ve gelişmiş sinema açar.

## English — description

Taht-ı Cihan is a photorealistic historical life and state simulation. You do not only paint a map: you live a sovereign’s face, age, divan, household, dynasty and campaigns in a persistent world.

The Imperial Council produces real state math. Treasury, tax, trade, janissary pay and campaign cost are never left to an LLM. Siege outcomes are written by the simulation first; cinema only represents them.

Real players may sit separate thrones in one lasting Cihan. Empty seats are held by AI. The world does not freeze when you close the app; critical affairs wait for the sovereign.

The game is not pay-to-win. Real money never buys a battle, a treasury or a treaty. Premium and the bazaar unlock cosmetic kaftans, palace themes, banners, the dynasty archive and richer cinema only.

## Keywords (100 chars)

osmanlı,sultan,strateji,hanedan,divan,tarih,fetih,kuşatma,diplomasi,taht

## What’s New (1.0.0)

İlk cülûs. Kalıcı Cihan, Divan, hanedan, kuşatma ve kozmetik çarşı.

## Review notes

Sandbox purchases on a device stay inside StoreKit. Live product IDs must be created in App Store Connect to match `src/domains/commerce/catalog.ts`. Sign in: Google, X, and Sign in with Apple once `APPLE_CLIENT_ID` is set (Guideline 4.8). Account deletion: Settings → type SIL. Subscriptions cancel in Apple subscriptions. Native shell: `native/ios/TahtiCihan.xcodeproj`. Set Team ID + `TAHT_WEB_ORIGIN` before Archive.

## Screenshots

`store/listing/screenshots/`

- iPhone 6.7 inç (1290×2796): `iphone-67-giris.png`, `iphone-67-gizlilik.png`, `iphone-67-kosullar.png`, `iphone-67-giris-kapisi.png`
- iPad 12.9 inç: `ipad-129-giris.png`
- Bunlar herkese açık ekranlardır. Saray içi kareler imzalı oturum ister.

## Support

In-app: /gizlilik /hesap /kosullar /magaza  
Email: zunozaofficial@gmail.com
