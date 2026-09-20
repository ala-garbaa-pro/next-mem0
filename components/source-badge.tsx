import { cn } from "@/lib/utils";
import type { Source } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export const SOURCE_LABEL: Record<Source, string> = {
  claude: "Claude",
  chatgpt: "ChatGPT",
  codex: "Codex",
  gemini: "Gemini",
  other: "Other",
};

// Tinted pills from the vivid design (dark) with darker text for light mode.
const STYLE: Record<Source, string> = {
  claude: "bg-[rgba(251,146,60,0.18)] text-orange-700 dark:text-[oklch(0.83_0.13_60)]",
  chatgpt: "bg-[rgba(52,211,153,0.18)] text-emerald-700 dark:text-[oklch(0.84_0.13_165)]",
  codex: "bg-[rgba(167,139,250,0.2)] text-violet-700 dark:text-[oklch(0.82_0.12_295)]",
  gemini: "bg-[rgba(56,189,248,0.18)] text-sky-700 dark:text-[oklch(0.84_0.11_225)]",
  other: "bg-glass-hover text-muted-foreground",
};

export function SourceBadge({ source, className }: { source: Source; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("font-semibold", STYLE[source], className)}>
      {SOURCE_LABEL[source]}
    </Badge>
  );
}
