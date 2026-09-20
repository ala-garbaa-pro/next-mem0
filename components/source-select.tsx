"use client";

import { SOURCES, type Source } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SourceBadge } from "@/components/source-badge";

// Rendered as tinted pills both in the trigger and the list, as in the vivid design.
const ITEMS = Object.fromEntries(SOURCES.map((s) => [s, <SourceBadge key={s} source={s} className="h-[17px] px-2 text-[10px]" />]));

export function SourceSelect({
  name = "source",
  value,
  onValueChange,
  defaultValue = "claude",
  className,
}: {
  name?: string;
  value?: Source;
  onValueChange?: (v: Source) => void;
  defaultValue?: Source;
  className?: string;
}) {
  return (
    <Select
      name={name}
      items={ITEMS}
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      onValueChange={(v) => onValueChange?.(v as Source)}
    >
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SOURCES.map((s) => (
          <SelectItem key={s} value={s}>
            {ITEMS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
