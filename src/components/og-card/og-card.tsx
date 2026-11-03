import { cn } from "@/lib/utils";

// Bar widths (% of the page) for the page's lines; every fifth line is a section heading.
const lines = [88, 72, 90, 64, 84, 80, 58, 86, 76, 90, 62, 82, 70, 88, 66];
// The lines drawn in amber: the ones the parser picked out.
const picked = new Set([1, 2, 7, 11]);

/** A CV page as grey bars, with the picked-out lines in amber. No real content. */
const Page = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "flex h-[600px] w-[460px] flex-col gap-4 overflow-hidden rounded-md bg-white p-10 shadow-2xl",
      className,
    )}
  >
    <div className="h-7 w-56 rounded bg-primary-500" />
    <div className="h-3.5 w-40 rounded bg-primary-400" />
    <div className="mt-3 mb-1 h-px bg-neutral-200" />
    {lines.map((width, i) => (
      <div
        key={i}
        className={cn(
          "h-3 rounded",
          i % 5 === 0 ? "mt-3 h-4 bg-neutral-700" : "bg-neutral-300",
          picked.has(i) && "bg-primary-400",
        )}
        style={{ width: `${i % 5 === 0 ? 34 : width}%` }}
      />
    ))}
  </div>
);

// What the parser picked out, as the result shows it. Labels only; no real content.
const fields = [
  ["Name", true],
  ["Email", true],
  ["Phone", true],
  ["Experience", true],
  ["Education", false],
] as const;

/** The fields read off the page, as a small panel over its corner. */
const Fields = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "flex w-[270px] flex-col gap-3.5 rounded-xl border border-foreground/10 bg-surface p-6 shadow-2xl",
      className,
    )}
  >
    {fields.map(([label, found]) => (
      <div key={label} className="flex items-center justify-between font-heading text-[24px] leading-none">
        <span>{label}</span>
        <span className={found ? "text-primary" : "text-muted-foreground"}>{found ? "✓" : "?"}</span>
      </div>
    ))}
  </div>
);

/**
 * The link preview image (og:image), 1200×630, always dark: the question and the caption on the
 * left, a CV page tilting in from the right with the fields read off it. Everything to read stays
 * inside the central safe zone and X's crop. Rendered to `public/og.png` by `pnpm og`.
 */
export const OgCard = () => {
  return (
    <div
      data-og-card
      className="dark relative h-[630px] w-[1200px] overflow-hidden bg-background text-foreground"
    >
      <Page className="absolute top-[90px] right-[40px] -rotate-[4deg]" />
      <Fields className="absolute top-[350px] right-[70px] rotate-[2deg]" />
      {/* A faint amber edge, so the card doesn't turn into a black box in dark feeds. */}
      <div className="absolute inset-0 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-primary-400)_35%,transparent),inset_0_0_72px_color-mix(in_oklab,var(--color-primary-400)_12%,transparent)]" />

      <div className="relative flex h-full flex-col px-24 py-18">
        {/* The header's logo, without the menu. */}
        <div className="flex items-center gap-2 font-logo text-[28px] leading-none font-semibold tracking-[-0.03em]">
          <span className="notch inline-flex items-center rounded-lg bg-primary py-1 pr-4 pl-2 text-[24px] tracking-[-0.02em] text-primary-foreground">
            ats
          </span>
          <span>
            <span className="text-primary">.</span>jakoblui
          </span>
        </div>
        <div className="flex-1" />
        <h1 className="font-heading text-[92px] leading-[0.92] font-bold tracking-[-0.05em]">
          Would a<span className="block">simple ATS</span>
          <span className="block text-primary">read your CV?</span>
        </h1>
        <p className="mt-9 font-heading text-[30px] leading-none font-medium tracking-[-0.02em] text-muted-foreground">
          Read in your browser <span className="text-primary">→</span> checked by you
        </p>
      </div>
    </div>
  );
};
