import { ArrowRightIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Plain GET form so semantic search works even before hydration. Gradient-bordered input from the vivid design. */
export function SearchForm({
  defaultValue = "",
  autoFocus = false,
  size = "lg",
}: {
  defaultValue?: string;
  autoFocus?: boolean;
  size?: "lg" | "md";
}) {
  const lg = size === "lg";
  return (
    <form action="/search" className="flex gap-2.5">
      <div
        className={cn(
          "vivid-gradient min-w-0 flex-1 rounded-[14px] p-[1.5px]",
          lg ? "shadow-[0_8px_30px_rgba(45,212,191,0.18)]" : "[animation:none] opacity-90",
        )}
      >
        <label
          className={cn(
            "relative flex items-center gap-2.5 overflow-hidden rounded-[12.5px] bg-background px-3.5",
            lg ? "h-11" : "h-[41px]",
          )}
        >
          <SearchIcon className="size-[18px] shrink-0 text-vivid-a" />
          <input
            name="q"
            type="search"
            defaultValue={defaultValue}
            autoFocus={autoFocus}
            placeholder="Search everything you have discussed… e.g. “that regex for parsing dates”"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          {lg && (
            <span className="animate-sweep pointer-events-none absolute inset-y-0 left-0 w-[90px] [background:linear-gradient(100deg,transparent,rgba(255,255,255,0.09),transparent)]" />
          )}
        </label>
      </div>
      <Button type="submit" className={cn("rounded-[14px] px-6 text-[15px]", lg ? "h-[47px]" : "h-11")}>
        Search
        {lg && <ArrowRightIcon data-icon="inline-end" />}
      </Button>
    </form>
  );
}
