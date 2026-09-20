import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[14px] border border-glass-border bg-glass px-3.5 py-3 text-base leading-[23px] transition-colors outline-none hover:bg-glass-hover focus-visible:bg-glass-hover placeholder:text-muted-foreground focus-visible:border-vivid-a/60 focus-visible:ring-3 focus-visible:ring-vivid-a/20 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
