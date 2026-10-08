import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ornament";
import { PortraitActor } from "@/components/game/PortraitActor";
import { consultAdvisor } from "@/server/api/npc";
import { audienceLine } from "@/domains/palace/dialogue";
import { comingOfAge } from "@/domains/palace/identity";
import { DIVAN_OFFICES } from "@/domains/divan/offices";
import type { AudienceTopic, GameAction, GameState, Locale, Office } from "@/domains/types";
import { cn } from "@/lib/cn";

const TOPICS: AudienceTopic[] = ["hal", "nasihat", "sir", "dilek"];
const OFFICES = new Set<string>([...DIVAN_OFFICES, "musahib"]);

export function Audience({
  state,
  characterId,
  locale,
  t,
  busy,
  act,
  onClose,
}: {
  state: GameState;
  characterId: string;
  locale: Locale;
  t: (k: string, v?: Record<string, string | number>) => string;
  busy: boolean;
  act: (a: GameAction) => void;
  onClose: () => void;
}) {
  const [topic, setTopic] = useState<AudienceTopic>("hal");
  const [spoken, setSpoken] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const npc = state.npcs.find((n) => n.id === characterId);
  const member = state.members.find((m) => m.id === characterId);
  const isRuler = characterId === state.ruler.id;
  const name = isRuler ? state.ruler.givenName : npc?.name ?? member?.givenName ?? "";
  const portrait = isRuler ? state.ruler.portrait : npc?.portrait ?? member?.portrait ?? "vizier";
  const age = isRuler ? state.year - state.ruler.birthYear : member ? state.year - member.birthYear : npc ? state.year - npc.birthYear : 44;
  const line = audienceLine(state, characterId, topic, locale);
  const office = npc?.office;
  const canAsk = office && OFFICES.has(office) && comingOfAge(age);

  async function ask() {
    if (!canAsk || q.trim().length < 2 || asking) return;
    setAsking(true);
    try {
      const res = await consultAdvisor({ data: { office: office as Office, question: q.trim(), locale } });
      setAnswer(res.text);
    } catch (err) {
      toast(String(err instanceof Error ? err.message : err));
    } finally {
      setAsking(false);
    }
  }

  return (
    <Panel>
      <div className="flex items-start gap-3">
        <div className="w-24 shrink-0">
          <PortraitActor
            portrait={portrait}
            name={name}
            age={age}
            expression={spoken ? line.expression : "idle"}
            speaking={spoken}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-gilt">{t("audience.title")}</p>
              <h3 className="font-display text-2xl">{name}</h3>
              <p className="text-xs text-silk">
                {npc ? t(`office.${npc.office}`) : member ? t(`role.${member.role}`) : t("role.sultan")}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={onClose}>
              {t("audience.close")}
            </Button>
          </div>
          <p className="mt-3 text-sm text-silk">{t("audience.prompt")}</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {TOPICS.map((tp) => (
              <Button
                key={tp}
                size="sm"
                variant={topic === tp ? "gilt" : "ghost"}
                onClick={() => {
                  setTopic(tp);
                  setSpoken(false);
                }}
              >
                {t(`audience.${tp}`)}
              </Button>
            ))}
          </div>
          {comingOfAge(age) ? (
            <p className={cn("mt-4 text-sm", spoken && "text-ivory")}>{spoken ? line.text : "…"}</p>
          ) : (
            <p className="mt-4 text-sm text-silk">{t("audience.youth")}</p>
          )}
          {comingOfAge(age) && (
            <Button className="mt-3" size="sm" disabled={busy} onClick={() => { setSpoken(true); act({ type: "AUDIENCE", characterId, topic }); }}>
              {t("audience.speak")}
            </Button>
          )}
          {canAsk && (
            <div className="mt-4 grid gap-2">
              <textarea
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("npc.ask")}
                className="min-h-16 w-full rounded-md bg-ink/60 p-2 text-sm ring-1 ring-line"
              />
              <Button size="sm" variant="gilt" disabled={asking || q.trim().length < 2} onClick={() => void ask()}>
                {asking ? t("npc.thinking") : t("npc.askBtn")}
              </Button>
              {answer && <p className="text-sm text-ivory">{answer}</p>}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
