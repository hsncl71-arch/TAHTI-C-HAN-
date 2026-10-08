import type { ChronicleEntry, GameState } from "@/domains/types";

export function akce(n: number): string {
  return `${Math.round(n).toLocaleString("tr-TR")}`;
}

export function formatLog(
  t: (key: string, vars?: Record<string, string | number>) => string,
  entry: ChronicleEntry,
  state?: GameState,
): { title: string; body: string } {
  const vars: Record<string, string | number> = { ...entry.vars };
  if (typeof vars.prov === "string") vars.prov = t(vars.prov);
  if (typeof vars.office === "string") vars.office = t(`office.${vars.office}`);
  if (typeof vars.building === "string") vars.building = t(`building.${vars.building}`);
  if (typeof vars.treaty === "string") vars.treaty = t(`treaty.${vars.treaty}`);
  if (typeof vars.topic === "string") vars.topic = t(`audience.${vars.topic}`) !== `audience.${vars.topic}` ? t(`audience.${vars.topic}`) : vars.topic;
  if (typeof vars.realm === "string") {
    const name = state?.foreign.find((r) => r.id === vars.realm)?.name;
    vars.realm = name ?? vars.realm;
  }
  if (typeof vars.kind === "string") {
    const ck = t(`crisis.kind.${vars.kind}`);
    if (ck !== `crisis.kind.${vars.kind}`) vars.kind = ck;
    else {
      const k = t(`dip.kind.${vars.kind}`);
      if (k !== `dip.kind.${vars.kind}`) vars.kind = k;
    }
  }
  if (typeof vars.city === "string") {
    const city = t(`prov.${vars.city}`);
    if (city !== `prov.${vars.city}`) vars.city = city;
  }
  return { title: t(entry.titleKey, vars), body: t(entry.bodyKey, vars) };
}
