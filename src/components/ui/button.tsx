import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium tracking-wide transition-[opacity,transform,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-ivory text-ink hover:opacity-90",
        ghost: "bg-transparent text-ivory ring-1 ring-line hover:bg-raised",
        gilt: "bg-transparent text-gilt ring-1 ring-gilt/40 hover:bg-raised",
        crimson: "bg-crimson text-ivory hover:opacity-90",
      },
      size: {
        md: "min-h-11 px-4",
        sm: "min-h-10 px-3 text-xs",
        block: "min-h-11 w-full px-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
