import type { AudienceTopic, GameState, Locale, PalaceRoomId } from "@/domains/types";
import { yearlyForecast } from "@/domains/world/engine";

type Line = { tr: string; en: string; expression: "idle" | "speak" | "stern" | "weary" | "warm" };

const ROOM_AIR: Record<PalaceRoomId, Line> = {
  taht: {
    tr: "Taht odasında meşaleler yanıyor. Söz burada hüküm olur.",
    en: "Torches hold the throne hall. A word spoken here becomes law.",
    expression: "idle",
  },
  divan: {
    tr: "Kubbealtı sessiz. Kalemler bekliyor.",
    en: "The dome is quiet. The pens are waiting.",
    expression: "idle",
  },
  harem: {
    tr: "Haremde ses yavaş. Burada devlet, nefesten konuşulur.",
    en: "Voices stay low in the harem. The state is spoken in breaths.",
    expression: "idle",
  },
  hazine: {
    tr: "Akçe kokusu, mürekkep ve toz. Defter yalan söylemez.",
    en: "Coin, ink and dust. The ledger does not lie.",
    expression: "idle",
  },
  hasoda: {
    tr: "Has odada yalnızlık var. Pencere Boğaz'a bakar.",
    en: "The private chamber keeps its silence. The window looks to the Bosphorus.",
    expression: "idle",
  },
  bahce: {
    tr: "Serviler rüzgârı keser. Avlu, tahttan daha doğru konuşur.",
    en: "Cypress cuts the wind. The court speaks more honestly than the throne.",
    expression: "idle",
  },
  elci: {
    tr: "Elçi salonu soğuk tutulur. Söz ucuz, mühür pahalıdır.",
    en: "The envoy hall is kept cool. Words are cheap; the seal is not.",
    expression: "idle",
  },
  sehzade: {
    tr: "Şehzade kanadında harita ve kılıç yan yana.",
    en: "In the princes' wing, map and sword share a wall.",
    expression: "idle",
  },
  askeri: {
    tr: "Sefer odasında toz ve demir. Haber geç gelir, karar çabuk ister.",
    en: "Dust and iron in the war room. News comes late; decisions cannot.",
    expression: "idle",
  },
};

export function roomAtmosphere(room: PalaceRoomId, locale: Locale): string {
  return ROOM_AIR[room][locale];
}

function pickOfficeVoice(s: GameState, office: string, topic: AudienceTopic, locale: Locale): string {
  const f = yearlyForecast(s);
  const wars = s.relations.filter((r) => r.treaty === "war").length;
  const lines: Record<string, Record<AudienceTopic, Line>> = {
    sadrazam: {
      hal: {
        tr: `Hünkârım, hazine ${Math.round(s.treasury)} akçe. Yıllık bakiye ${f.net >= 0 ? "artı" : "eksi"}. ${wars ? `${wars} cephe açık.` : "Hudut şimdilik durgun."}`,
        en: `My sovereign, the treasury holds ${Math.round(s.treasury)} akçe. The year ${f.net >= 0 ? "gains" : "loses"}. ${wars ? `${wars} front(s) open.` : "The border is quiet."}`,
        expression: "speak",
      },
      nasihat: {
        tr: "Sefer açacaksak ulufeyi önce görelim. Aç ocak, fethi yolda yer.",
        en: "If we march, pay the ocak first. A hungry host eats the conquest on the road.",
        expression: "speak",
      },
      sir: {
        tr: "Divanda iki kalem var: biri size, biri kendine yazar. İsim vermeyeyim; bakış yeter.",
        en: "Two pens sit in the Divan: one writes for you, one for itself. A look is enough.",
        expression: "stern",
      },
      dilek: {
        tr: "Kubbealtı bu yıl bir kez daha toplansın. Nizam, meşaleden çok sözle tutulur.",
        en: "Let the council sit once more this year. Order is held by words more than by torches.",
        expression: "speak",
      },
    },
    seyhulislam: {
      hal: {
        tr: `Takva ${s.piety}. ${s.taxRate > 0.16 ? "Öşür ağır; hutbe de ağırlaşır." : "Vergi kaldıırılabilir."} Adalet mülkün temelidir.`,
        en: `Piety stands at ${s.piety}. ${s.taxRate > 0.16 ? "The tithe is heavy; the pulpit will follow." : "The levy is bearable."} Justice is the foundation.`,
        expression: "speak",
      },
      nasihat: {
        tr: "Hüküm keskin olmasın, net olsun. Halk korkudan değil, teraziden emin olsun.",
        en: "Let judgement be clear, not sharp. The people should trust the scales, not the whip.",
        expression: "speak",
      },
      sir: {
        tr: "Ulema kapı arkasında fısıldar. Cami birikirse, minare de birikir.",
        en: "The scholars whisper behind the door. When mosques wait, minarets wait with them.",
        expression: "stern",
      },
      dilek: {
        tr: "Bir medrese daha, kılıçtan ucuzdur. İlim, tahtı taşır.",
        en: "Another madrasa costs less than a campaign. Learning carries the throne.",
        expression: "speak",
      },
    },
    kaptan: {
      hal: {
        tr: `Donanma ${s.army.navy} kadırga. ${s.army.navy < 20 ? "Ege'de Venedik cüret eder." : "Deniz tutulabilir."}`,
        en: `The navy counts ${s.army.navy} galleys. ${s.army.navy < 20 ? "Venice will test the Aegean." : "The sea can be held."}`,
        expression: "speak",
      },
      nasihat: {
        tr: "Rodos ve Mora deryadan alınır. Kara seferi deryayı unutturmasın.",
        en: "Rhodes and the Morea fall from the water. A land war must not make us forget the sea.",
        expression: "speak",
      },
      sir: {
        tr: "Tersanede kereste gecikir. Bunu defterdarın kulağına söylemedim.",
        en: "Timber is late at the arsenal. I have not told the treasurer's ear.",
        expression: "stern",
      },
      dilek: {
        tr: "Beş kadırga daha. O zaman Ege'de isimimiz yürür.",
        en: "Five more galleys. Then our name walks the Aegean.",
        expression: "speak",
      },
    },
    defterdar: {
      hal: {
        tr: `Gelir ${f.income}, masraf ${f.upkeep}. ${s.treasury < 1000 ? "Hazine dar; seferden önce öşür veya terhis." : "Sefer kaldırılabilir."}`,
        en: `Income ${f.income}, upkeep ${f.upkeep}. ${s.treasury < 1000 ? "The chest is thin." : "A campaign can be borne."}`,
        expression: "speak",
      },
      nasihat: {
        tr: "Ulufe orduyu yer. İmar da yer. İkisini bir yılda doyurmak, tahtı incitir.",
        en: "Pay eats the host. Works eat the rest. Feeding both in one year bruises the throne.",
        expression: "speak",
      },
      sir: {
        tr: "Bazı kalemler gece yazılır. Gündüz defter temiz görünür.",
        en: "Some lines are written at night. By day the ledger looks clean.",
        expression: "stern",
      },
      dilek: {
        tr: "Öşürü bir parmak indirin. Halk verir; ocak da susar.",
        en: "Lower the tithe a finger. The people will give; the ocak will quiet.",
        expression: "speak",
      },
    },
    nisanci: {
      hal: {
        tr: "Mühür hazır. En soğuk kapı ile en ılık kapı aynı haftada değişir.",
        en: "The seal is ready. The coldest gate and the warmest can change in a week.",
        expression: "speak",
      },
      nasihat: {
        tr: "İttifak kılıçtan ucuzdur. Elçiye yüz verin, orduya yol kalır.",
        en: "Alliance is cheaper than steel. Receive the envoy; keep the road for the host.",
        expression: "speak",
      },
      sir: {
        tr: "Venedik'in adamı çarşıda. Balık değil, haber alır.",
        en: "A Venetian walks the market. He is not buying fish.",
        expression: "stern",
      },
      dilek: {
        tr: "Kırım'a bir hilat. Az akçe, çok gönül.",
        en: "A robe of honour to Crimea. Little coin, much heart.",
        expression: "speak",
      },
    },
    musahib: {
      hal: {
        tr: "Saray bugün durgun. Sizin yüzünüz, duvardaki nakıştan daha çok konuşuluyor.",
        en: "The palace is still today. Your face is spoken of more than the tiles.",
        expression: "speak",
      },
      nasihat: {
        tr: "Has odaya çekilin biraz. Yorgun hükümdar, yanlış mühür basar.",
        en: "Take the private chamber a while. A tired sovereign stamps the wrong seal.",
        expression: "warm",
      },
      sir: {
        tr: "Avluda bir fısıltı: şehzade sancağı erken istiyor.",
        en: "A whisper in the court: the prince wants his sanjak early.",
        expression: "speak",
      },
      dilek: {
        tr: "Bahçede yürüyün. Taht, çınar gölgesinde daha yumuşak düşünülür.",
        en: "Walk the garden. The throne thinks more softly under a plane tree.",
        expression: "warm",
      },
    },
  };
  const pack = lines[office] ?? lines.sadrazam;
  return pack[topic][locale];
}

export function audienceLine(
  state: GameState,
  characterId: string,
  topic: AudienceTopic,
  locale: Locale,
): { text: string; expression: Line["expression"]; speaker: string } {
  if (characterId === state.ruler.id) {
    const age = state.year - state.ruler.birthYear;
    const self: Record<AudienceTopic, Line> = {
      hal: {
        tr: `Ben ${state.ruler.givenName}. ${age} yaşındayım. Bu kaftan, bu yüz — başka surete girilmez.`,
        en: `I am ${state.ruler.givenName}, aged ${age}. This kaftan, this face — I do not become another man.`,
        expression: "idle",
      },
      nasihat: {
        tr: "Aynaya bakılır, tahta değil. Karar mizacımdan çıkar.",
        en: "Look to the mirror, not the throne. Judgement comes from temper.",
        expression: "stern",
      },
      sir: {
        tr: "Yorgunluk kemikte. Bunu divana söylemem.",
        en: "Fatigue sits in the bone. I will not tell the Divan.",
        expression: "weary",
      },
      dilek: {
        tr: "Has oda yeter. Bir gece sükûn, bir yıl hüküm.",
        en: "The private chamber is enough. One night of quiet, a year of rule.",
        expression: "warm",
      },
    };
    return { text: self[topic][locale], expression: self[topic].expression, speaker: state.ruler.givenName };
  }

  const npc = state.npcs.find((n) => n.id === characterId);
  if (npc) {
    return {
      text: pickOfficeVoice(state, npc.office, topic, locale),
      expression: topic === "sir" ? "stern" : "speak",
      speaker: npc.name,
    };
  }

  const m = state.members.find((x) => x.id === characterId);
  if (!m) {
    return {
      text: locale === "tr" ? "Bu odada kimse yok." : "No one stands in this room.",
      expression: "idle",
      speaker: "",
    };
  }
  const age = state.year - m.birthYear;
  const family: Record<string, Record<AudienceTopic, Line>> = {
    valide: {
      hal: {
        tr: `Oğul, ${age} yıllık anayım. Taht soğuktur; ananın sözü evde kalmasın.`,
        en: `Son, I have been a mother ${age} years. The throne is cold; do not leave a mother's word at the door.`,
        expression: "speak",
      },
      nasihat: {
        tr: "Vezire güven, hepsine değil. Birini yakın tut, birini uzakta.",
        en: "Trust a vizier, not all of them. Keep one near and one far.",
        expression: "speak",
      },
      sir: {
        tr: "Haremde gönül hesabı tutulur. Haseki ile şehzade arasında ince ip var.",
        en: "The harem keeps its own ledger of hearts. A thin cord runs between the haseki and the prince.",
        expression: "stern",
      },
      dilek: {
        tr: "Bana kulak ver. Ben senin adını tahttan önce koydum.",
        en: "Hear me. I set your name before the throne did.",
        expression: "warm",
      },
    },
    hatun: {
      hal: {
        tr: "Efendimiz, şehzadeler avluda. Bir bakışları yeter; kalemden önce yüz.",
        en: "My lord, the princes are in the court. A glance is enough — face before the pen.",
        expression: "speak",
      },
      nasihat: {
        tr: "Gece kararları gündüzü bozar. Has odada yatın, divanda uyanın.",
        en: "Night judgements spoil the day. Sleep in the private chamber; wake in the Divan.",
        expression: "warm",
      },
      sir: {
        tr: "Valide'nin gözü her kapıda. Bu kötü değil — kör saray daha tehlikeli.",
        en: "The valide's eye is on every door. That is not the worst fate. A blind palace is.",
        expression: "speak",
      },
      dilek: {
        tr: "Bahçede bir saat. Taht, gül kokusunu unutmasın.",
        en: "An hour in the garden. Let the throne not forget the smell of roses.",
        expression: "warm",
      },
    },
    sehzade: {
      hal: {
        tr: age < 16
          ? "Şehzade henüz dersinde. Kapıdan ses gelir, yüz görünmez."
          : "Baba, sancağa gitmek istiyorum. Saray duvarı dar geliyor.",
        en: age < 16
          ? "The prince is still at his lessons. A voice at the door, no face yet."
          : "Father, I want the sanjak. The palace wall is too narrow.",
        expression: "speak",
      },
      nasihat: {
        tr: age < 16 ? "Hoca, kılıçtan önce kalem diyor." : "Beni Edirne'ye gönderin. Orada adam olunur.",
        en: age < 16 ? "The tutor says pen before sword." : "Send me to Edirne. Men are made there.",
        expression: "speak",
      },
      sir: {
        tr: "Kardeşimle aynı sofrada oturmak ağır. Bunu anneye söylemedim.",
        en: "Sharing a table with my brother sits heavy. I have not told mother.",
        expression: "stern",
      },
      dilek: {
        tr: "Bir at, bir hoca, bir sancak. Üçü de yeter.",
        en: "A horse, a tutor, a sanjak. The three are enough.",
        expression: "speak",
      },
    },
    sultan_kizi: {
      hal: {
        tr: age < 16 ? "Sultan henüz beşikte büyüyor." : "Babam, elçiler adımı soruyor. Ben henüz tahtı sormuyorum.",
        en: age < 16 ? "The princess is still growing." : "Father, envoys ask my name. I do not yet ask for the throne.",
        expression: "speak",
      },
      nasihat: {
        tr: "Haremde gül gibi durayım; diken sizde kalsın.",
        en: "Let me stand like a rose in the harem. Keep the thorn with you.",
        expression: "warm",
      },
      sir: {
        tr: "Düğün sözü dolaşıyor. Ben duydum, siz duymadınız belki.",
        en: "Talk of a wedding is walking. I heard it; perhaps you did not.",
        expression: "speak",
      },
      dilek: {
        tr: "Bana kitap. Kaftandan önce harf.",
        en: "Books for me. Letters before kaftans.",
        expression: "speak",
      },
    },
    akraba: {
      hal: {
        tr: "Hanedan uzağından geldim. Kan var, taht yok — bu da bir yer.",
        en: "I come from the edge of the house. Blood without a throne is still a place.",
        expression: "speak",
      },
      nasihat: {
        tr: "Uzak yeğen sadık kalır; yakın oğul bazen kalmaz.",
        en: "A distant cousin stays loyal; a near son sometimes does not.",
        expression: "speak",
      },
      sir: {
        tr: "Sancak bekleyen çok. Ben beklemem, dururum.",
        en: "Many wait for a sanjak. I do not wait; I stand.",
        expression: "idle",
      },
      dilek: {
        tr: "Bir küçük görev. İsim yeter, taht istemem.",
        en: "A small office. A name is enough; I do not want the throne.",
        expression: "speak",
      },
    },
  };
  const pack = family[m.role] ?? family.akraba;
  return { text: pack[topic][locale], expression: pack[topic].expression, speaker: m.givenName };
}

export function counselIdentityNote(state: GameState): string {
  const face = state.ruler.identity.face;
  const age = state.year - state.ruler.birthYear;
  return [
    `The sovereign is ${state.ruler.givenName} of house ${state.ruler.dynastyName}, age ${age}.`,
    `Locked likeness: ${state.ruler.portrait}. ${face.bone}; ${face.eyes}; ${face.beard}; ${face.marks}; complexion ${face.complexion}.`,
    `Do not describe a different face, age, or clothing from another portrait. He is the same man in every room.`,
    `Clothing now: ${state.ruler.clothing}. Constitution (game status, not medical): ${state.ruler.healthFlags.constitution}.`,
  ].join(" ");
}
