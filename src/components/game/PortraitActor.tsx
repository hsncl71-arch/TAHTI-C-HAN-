import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { AgeBand, ExpressionId, PortraitKey } from "@/domains/types";
import { ageBandClass, ageBandOf, comingOfAge, identitySrc } from "@/domains/palace/identity";

export function PortraitActor({
  portrait,
  name,
  age,
  expression = "idle",
  speaking = false,
  className,
  onClick,
  compact = false,
  robeId = "default",
}: {
  portrait: PortraitKey;
  name: string;
  age: number;
  expression?: ExpressionId;
  speaking?: boolean;
  className?: string;
  onClick?: () => void;
  compact?: boolean;
  robeId?: string;
}) {
  const adult = comingOfAge(age);
  const band: AgeBand = ageBandOf(age);
  const wanted = adult ? identitySrc(portrait, speaking ? "speak" : expression) : "";
  const idle = adult ? identitySrc(portrait, "idle") : "";
  const [src, setSrc] = useState(wanted);

  useEffect(() => {
    setSrc(wanted);
  }, [wanted]);

  const frame = (
    <div
      className={cn(
        "portrait-actor-frame relative overflow-hidden rounded-md bg-raised",
        speaking && "is-speaking",
        ageBandClass(band),
        compact ? "aspect-square" : "aspect-[3/4]",
        robeId === "kaftan.night" && "robe-night",
        robeId === "kaftan.crimson" && "robe-crimson",
        robeId === "kaftan.ivory" && "robe-ivory",
        onClick && "cursor-pointer ring-1 ring-line transition-[box-shadow] duration-200 hover:ring-gilt",
        className,
      )}
    >
      {adult ? (
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          crossOrigin="anonymous"
          onError={() => {
            if (src !== idle) setSrc(idle);
          }}
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-marble">
          <span className="font-display text-3xl text-gilt">{name.slice(0, 1)}</span>
        </div>
      )}
      {speaking && <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gilt/80" />}
    </div>
  );

  if (!onClick) return frame;
  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      {frame}
    </button>
  );
}
