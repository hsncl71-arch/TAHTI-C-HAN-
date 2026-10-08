import { counselIdentityNote } from "@/domains/palace/dialogue";
import type { GameState, Office } from "@/domains/types";
import { yearlyForecast } from "@/domains/world/engine";
import { holderOf, sitting } from "@/domains/divan/offices";
import { historyCounselNote } from "@/domains/history/engine";

const ROLE_VOICE: Record<string, { tr: (s: GameState) => string; en: (s: GameState) => string }> = {
  sadrazam: {
    tr: (s) => {
      const f = yearlyForecast(s);
      const wars = s.relations.filter((r) => r.treaty === "war").length;
      const me = holderOf(s, "sadrazam");
      return `Hünkârım, hazine ${Math.round(s.treasury)} akçe. Yıllık bakiye ${f.net >= 0 ? "artı" : "eksi"} ${Math.abs(f.net)}. ${wars ? `${wars} cephe açık; sulh veya seferden biri seçilmeli.` : "Hudutlar şimdilik sakin."} Nizam ${s.stability}. Nüfuzum ${me?.influence ?? "—"}; Kubbealtı ${sitting(s).length} kişi. Divanı ihmal etmeyelim.`;
    },
    en: (s) => {
      const f = yearlyForecast(s);
      const wars = s.relations.filter((r) => r.treaty === "war").length;
      const me = holderOf(s, "sadrazam");
      return `My sovereign, the treasury holds ${Math.round(s.treasury)} akçe. Yearly balance is ${f.net}. ${wars ? `${wars} front(s) open.` : "The borders are quiet."} Order sits at ${s.stability}. My influence is ${me?.influence ?? "—"}. Do not neglect the Divan.`;
    },
  },
  seyhulislam: {
    tr: (s) =>
      `Şeriat terazisi takvada durur: ${s.piety}. ${s.taxRate > 0.16 ? "Öşür ağır; ulema homurdanır." : "Vergi kaldıırılabilir."} Camiler ${s.buildings.cami}, medreseler ${s.buildings.medrese}. Kazaskerler ilmiyeyi taşır.`,
    en: (s) =>
      `Piety stands at ${s.piety}. ${s.taxRate > 0.16 ? "The tithe is heavy; the ulema mutter." : "The levy is bearable."} Mosques ${s.buildings.cami}, madrasas ${s.buildings.medrese}. The kazaskers carry the learned estate.`,
  },
  kaptan: {
    tr: (s) =>
      `Donanma ${s.army.navy} kadırga. Tersane ${s.buildings.tersane}. ${s.army.navy < 20 ? "Ege'de Venedik cüret eder." : "Deniz tutulabilir."} Mora ve Rodos, deryadan alınır.`,
    en: (s) =>
      `The navy counts ${s.army.navy} galleys. Arsenals: ${s.buildings.tersane}. ${s.army.navy < 20 ? "Venice will test the Aegean." : "The sea can be held."} Morea and Rhodes fall from the water.`,
  },
  defterdar: {
    tr: (s) => {
      const f = yearlyForecast(s);
      const debt = f.debt;
      const people = s.economy?.people;
      return `Defter açık: gelir ${f.income}, masraf ${f.upkeep}, bakiye ${f.net}. ${debt ? `Borç ${debt} akçe.` : "Borç yok."} Reaya: refah ${people?.prosperity ?? "—"}, vergi baskısı ${people?.taxPressure ?? "—"}. ${s.treasury < 1000 ? "Hazine tehlikede; seferden önce öşür veya terhis." : "Sefer kaldırabiliriz."}`;
    },
    en: (s) => {
      const f = yearlyForecast(s);
      return `The ledger: income ${f.income}, upkeep ${f.upkeep}, balance ${f.net}. ${f.debt ? `Debt ${f.debt}.` : "No debt."} ${s.treasury < 1000 ? "The treasury is in danger." : "A campaign can be borne."}`;
    },
  },
  nisanci: {
    tr: (s) => {
      const foe = [...s.relations].sort((a, b) => a.value - b.value)[0];
      const friend = [...s.relations].sort((a, b) => b.value - a.value)[0];
      return `Mühür: en soğuk kapı ${foe?.realmId ?? "—"}, en ılık ${friend?.realmId ?? "—"}. İttifak ve hediye, kılıçtan ucuzdur.`;
    },
    en: (s) => {
      const foe = [...s.relations].sort((a, b) => a.value - b.value)[0];
      const friend = [...s.relations].sort((a, b) => b.value - a.value)[0];
      return `Coldest gate: ${foe?.realmId ?? "—"}. Warmest: ${friend?.realmId ?? "—"}. Alliance and gifts are cheaper than steel.`;
    },
  },
  kazasker_rumeli: {
    tr: (s) => `Rumeli kazası nizam ${s.stability} üzerine durur. Kadılar sadakat ister; ağır öşür mahkemeyi doldurur.`,
    en: (s) => `Rumelia's courts rest on order ${s.stability}. Heavy tithes fill the kadi's hall.`,
  },
  kazasker_anadolu: {
    tr: (s) => `Anadolu ilmiyesi medrese ${s.buildings.medrese} ile nefes alır. Fetva ile kanun yan yana yürüsün.`,
    en: (s) => `Anatolia's scholars breathe through ${s.buildings.medrese} madrasas. Let fatwa walk beside kanun.`,
  },
  yeniceri_agasi: {
    tr: (s) => `Ocak ${s.army.janissary} nefer, morali ${s.army.morale}. Ulufe gecikirse kazan konuşur. Ağanın sözü ocakla ölçülür.`,
    en: (s) => `The ocak counts ${s.army.janissary}, morale ${s.army.morale}. Delay the pay and the kettles speak.`,
  },
  kubbe_vezir: {
    tr: (s) => `Kubbe altında her vezir kendi hesabını tutar. Sadrazamın gölgesi uzarsa, tahtın ışığı kısılır.`,
    en: (s) => `Under the dome each vizier keeps his own ledger. If the grand vizier's shadow lengthens, the throne's light thins.`,
  },
  beylerbeyi: {
    tr: (s) => `Eyalet sadakati hududu tutar. Düşük gönül, isyan tohumudur. Sancaklara bakılmalı.`,
    en: (s) => `Provincial loyalty holds the border. A sour heart is the seed of revolt. Watch the sanjaks.`,
  },
  reisulkuttab: {
    tr: (s) => `Kalem, kılıçtan önce gider. Ahidnameler düzgünse sefer ucuzlar.`,
    en: (s) => `The pen travels before the sword. Clean treaties make cheap campaigns.`,
  },
};

export function cannedCounsel(state: GameState, office: Office | string, locale: "tr" | "en"): string {
  const voice = ROLE_VOICE[office] ?? ROLE_VOICE.sadrazam;
  return voice[locale](state);
}

export function counselSystemPrompt(state: GameState, office: string, locale: "tr" | "en"): string {
  const npc = holderOf(state, office as Office) ?? state.npcs.find((n) => n.office === office);
  const f = yearlyForecast(state);
  const rivals = (npc?.rivals ?? [])
    .map((id) => state.npcs.find((n) => n.id === id)?.name)
    .filter(Boolean)
    .join(", ");
  return [
    `You are ${npc?.name ?? office}, ${office} at the court of ${state.ruler.title} ${state.ruler.givenName} of house ${state.ruler.dynastyName}.`,
    counselIdentityNote(state),
    `Year ${state.year}. Capital ${state.realm.capitalId}. Treasury ${Math.round(state.treasury)}, prestige ${state.prestige}, piety ${state.piety}, order ${state.stability}.`,
    `Your loyalty ${npc?.loyalty ?? "?"}, skill ${npc?.competence ?? "?"}, influence ${npc?.influence ?? "?"}, wealth ${npc?.wealth ?? "?"}, favour with the sovereign ${npc?.favor ?? "?"}.`,
    rivals ? `Rivals: ${rivals}.` : "You keep your rivals unnamed.",
    `Forecast income ${f.income}, upkeep ${f.upkeep}, host strength ${f.power}.`,
    `Stay in character. Reply in ${locale === "tr" ? "courtly Turkish" : "measured English"} in 4-7 sentences. No modern slang. No meta. Advise on the ruler's question using the court reality above. You may colour speech with personality; you do not invent treasury, army or treaty numbers — those are already given.`,
    historyCounselNote(state),
  ].join(" ");
}
