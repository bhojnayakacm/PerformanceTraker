import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  onWheel,
  ...props
}: React.ComponentProps<"input">) {
  /* Number inputs hijack the wheel event when focused: the user scrolls the
   * page expecting it to scroll, the focused input silently steps its value
   * instead. Across forms with many numeric fields (Daily Logs, Bulk
   * Targets, City Tours) this manifests as invisible data corruption — the
   * user only realises numbers are wrong on save, and even then often
   * misattributes the cause.
   *
   * Fix: blur on wheel. The browser only steps the value if the input is
   * focused at the moment the default action fires; blurring during the
   * bubble phase changes the focus state before defaults run, so the wheel
   * scrolls the page instead.
   *
   * preventDefault won't work here — React 17+ attaches wheel listeners as
   * passive at the document root, so the call is silently ignored and the
   * native step still fires. Blur is the documented React workaround.
   *
   * The handler is composed with any caller-supplied onWheel so this stays
   * drop-in for callers that already wire their own wheel logic. */
  function handleWheel(e: React.WheelEvent<HTMLInputElement>) {
    if (type === "number" && e.currentTarget === document.activeElement) {
      e.currentTarget.blur()
    }
    onWheel?.(e)
  }

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      onWheel={handleWheel}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
