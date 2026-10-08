import type { Province } from "@/domains/types";
import { fillProvince } from "@/domains/economy/model";

type CoreProvince = Omit<
  Province,
  "ownerId" | "agriculture" | "production" | "trade" | "customs" | "port" | "grain" | "prosperity" | "unrest"
>;
type Blueprint = CoreProvince & { home: string };

const P = (
  id: string,
  nameKey: string,
  region: string,
  x: number,
  y: number,
  development: number,
  taxBase: number,
  manpower: number,
  fort: number,
  religion: string,
  culture: string,
  neighbors: string[],
  home: string,
): Blueprint => ({
  id,
  nameKey,
  region,
  x,
  y,
  development,
  taxBase,
  manpower,
  loyalty: 70,
  fort,
  religion,
  culture,
  neighbors,
  home,
});

/** Positions are percentages on the palace portolan (west ← → east, north ↑). */
export const PROVINCE_BLUEPRINTS: Blueprint[] = [
  P("konstantiniyye", "prov.konstantiniyye", "rumeli", 62, 31, 22, 420, 8000, 4, "islam", "turk", ["edirne", "bursa", "selanik", "kefe"], "player"),
  P("edirne", "prov.edirne", "rumeli", 57, 27, 16, 260, 4500, 3, "islam", "turk", ["konstantiniyye", "sofya", "selanik"], "player"),
  P("bursa", "prov.bursa", "anadolu", 65, 35, 15, 240, 4200, 2, "islam", "turk", ["konstantiniyye", "ankara", "aydin"], "player"),
  P("ankara", "prov.ankara", "anadolu", 73, 33, 12, 180, 3600, 2, "islam", "turk", ["bursa", "konya", "sivas", "karaman"], "player"),
  P("aydin", "prov.aydin", "anadolu", 62, 41, 11, 160, 2800, 1, "islam", "turk", ["bursa", "antalya", "rodos"], "player"),
  P("selanik", "prov.selanik", "rumeli", 55, 35, 13, 200, 3200, 2, "islam", "rum", ["konstantiniyye", "edirne", "atina", "sofya"], "player"),
  P("sofya", "prov.sofya", "rumeli", 52, 28, 10, 140, 2600, 2, "islam", "bulgar", ["edirne", "belgrad", "selanik"], "player"),
  P("konya", "prov.konya", "anadolu", 71, 41, 11, 150, 3000, 2, "islam", "turk", ["ankara", "karaman", "antalya", "halep"], "karaman"),
  P("karaman", "prov.karaman", "anadolu", 74, 44, 10, 130, 2400, 2, "islam", "turk", ["konya", "ankara", "sivas", "halep"], "karaman"),
  P("antalya", "prov.antalya", "anadolu", 67, 47, 9, 120, 1800, 1, "islam", "turk", ["aydin", "konya", "kibris"], "player"),
  P("sivas", "prov.sivas", "anadolu", 78, 33, 9, 110, 2200, 2, "islam", "turk", ["ankara", "trabzon", "erzurum", "karaman"], "player"),
  P("trabzon", "prov.trabzon", "karadeniz", 82, 26, 10, 140, 2000, 3, "hiristiyan", "rum", ["sivas", "erzurum", "kefe"], "trabzon"),
  P("erzurum", "prov.erzurum", "dogu", 86, 31, 8, 90, 1800, 2, "islam", "turk", ["sivas", "trabzon", "diyarbakir", "tebriz"], "akkoyunlu"),
  P("diyarbakir", "prov.diyarbakir", "dogu", 84, 39, 9, 100, 2000, 2, "islam", "kurt", ["erzurum", "halep", "bagdat", "tebriz"], "akkoyunlu"),
  P("halep", "prov.halep", "sam", 78, 46, 14, 220, 3400, 3, "islam", "arap", ["karaman", "konya", "sam", "diyarbakir"], "memluk"),
  P("sam", "prov.sam", "sam", 76, 52, 13, 200, 3000, 2, "islam", "arap", ["halep", "kudus", "bagdat"], "memluk"),
  P("kudus", "prov.kudus", "sam", 73, 58, 8, 90, 1400, 2, "islam", "arap", ["sam", "kahire", "kibris"], "memluk"),
  P("kibris", "prov.kibris", "ada", 69, 50, 7, 80, 900, 2, "hiristiyan", "rum", ["antalya", "kudus", "rodos"], "venedik"),
  P("rodos", "prov.rodos", "ada", 60, 49, 6, 70, 800, 3, "hiristiyan", "latin", ["aydin", "kibris", "atina"], "venedik"),
  P("atina", "prov.atina", "rumeli", 53, 43, 8, 90, 1600, 1, "hiristiyan", "rum", ["selanik", "mora", "rodos"], "player"),
  P("mora", "prov.mora", "rumeli", 51, 49, 7, 80, 1400, 1, "hiristiyan", "rum", ["atina"], "player"),
  P("belgrad", "prov.belgrad", "rumeli", 49, 23, 11, 160, 2800, 3, "hiristiyan", "sirp", ["sofya", "budin", "bosna"], "macar"),
  P("budin", "prov.budin", "orta_avrupa", 46, 17, 12, 180, 3000, 3, "hiristiyan", "macar", ["belgrad", "bosna"], "macar"),
  P("bosna", "prov.bosna", "rumeli", 45, 27, 8, 90, 1800, 2, "islam", "bosnak", ["belgrad", "budin"], "player"),
  P("venedik", "prov.venedik", "italya", 38, 26, 18, 360, 2500, 2, "hiristiyan", "latin", ["bosna"], "venedik"),
  P("kahire", "prov.kahire", "misir", 64, 70, 20, 380, 7000, 3, "islam", "arap", ["iskenderiye", "kudus", "medine"], "memluk"),
  P("iskenderiye", "prov.iskenderiye", "misir", 58, 65, 14, 240, 3200, 2, "islam", "arap", ["kahire"], "memluk"),
  P("medine", "prov.medine", "hicaz", 76, 74, 6, 40, 800, 1, "islam", "arap", ["kahire", "mekke"], "memluk"),
  P("mekke", "prov.mekke", "hicaz", 78, 80, 7, 50, 900, 1, "islam", "arap", ["medine"], "memluk"),
  P("bagdat", "prov.bagdat", "irak", 90, 49, 12, 200, 2800, 2, "islam", "arap", ["diyarbakir", "sam", "basra"], "akkoyunlu"),
  P("basra", "prov.basra", "irak", 93, 58, 9, 140, 1800, 1, "islam", "arap", ["bagdat"], "akkoyunlu"),
  P("tebriz", "prov.tebriz", "iran", 94, 34, 13, 210, 3200, 3, "islam", "turkmen", ["erzurum", "diyarbakir"], "akkoyunlu"),
  P("kefe", "prov.kefe", "karadeniz", 73, 17, 8, 110, 1600, 2, "islam", "tatar", ["konstantiniyye", "trabzon"], "kirim"),
];

export const FOREIGN_REALMS = [
  { id: "karaman", name: "Karamanoğulları", adjective: "Karamanlı", capitalId: "karaman", color: "#6b5340", religion: "islam", culture: "turk", aiKey: "karaman" },
  { id: "akkoyunlu", name: "Akkoyunlu", adjective: "Akkoyunlu", capitalId: "tebriz", color: "#3f5c4c", religion: "islam", culture: "turkmen", aiKey: "akkoyunlu" },
  { id: "memluk", name: "Memlük Sultanlığı", adjective: "Memlük", capitalId: "kahire", color: "#4a3f58", religion: "islam", culture: "arap", aiKey: "memluk" },
  { id: "venedik", name: "Venedik", adjective: "Venedikli", capitalId: "venedik", color: "#5a3c3c", religion: "hiristiyan", culture: "latin", aiKey: "venedik" },
  { id: "macar", name: "Macar Krallığı", adjective: "Macar", capitalId: "budin", color: "#3d4a5c", religion: "hiristiyan", culture: "macar", aiKey: "macar" },
  { id: "trabzon", name: "Trabzon Rum İmparatorluğu", adjective: "Trabzonlu", capitalId: "trabzon", color: "#4a5a3d", religion: "hiristiyan", culture: "rum", aiKey: "trabzon" },
  { id: "kirim", name: "Kırım Hanlığı", adjective: "Kırımlı", capitalId: "kefe", color: "#5c5a3a", religion: "islam", culture: "tatar", aiKey: "kirim" },
] as const;

export const OSMANLI_SEAT = "osmanli";

export const OSMANLI_TEMPLATE = {
  id: OSMANLI_SEAT,
  name: "Osmanlı Devleti",
  adjective: "Osmanlı",
  capitalId: "konstantiniyye",
  color: "#8a1f1a",
  religion: "islam",
  culture: "turk",
  aiKey: "osmanli",
} as const;

export type SeatId = typeof OSMANLI_SEAT | (typeof FOREIGN_REALMS)[number]["id"];

export const SEAT_CATALOG: { id: SeatId; name: string; adjective: string; capitalId: string; color: string; religion: string; culture: string; aiKey: string }[] = [
  OSMANLI_TEMPLATE,
  ...FOREIGN_REALMS,
];

export function seatById(id: string) {
  return SEAT_CATALOG.find((s) => s.id === id) ?? OSMANLI_TEMPLATE;
}

export function instantiateProvinces(playerRealmId: string, seatId: string = OSMANLI_SEAT): Province[] {
  return PROVINCE_BLUEPRINTS.map((b) => {
    const { home, ...rest } = b;
    let ownerId: string;
    if (seatId === OSMANLI_SEAT) {
      ownerId = home === "player" ? playerRealmId : home;
    } else {
      ownerId = home === seatId ? playerRealmId : home === "player" ? OSMANLI_SEAT : home;
    }
    return fillProvince({
      ...rest,
      ownerId,
      loyalty: ownerId === playerRealmId ? 78 : 62,
      agriculture: 0,
      production: 0,
      trade: 0,
      customs: 0,
      port: "none",
      grain: 0,
      prosperity: 0,
      unrest: 0,
    });
  });
}
