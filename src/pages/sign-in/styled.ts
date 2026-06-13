import type { CSSProperties } from "react"

// When a per-element className is provided, drop the inline style entirely
// — your CSS becomes the single source of truth. Without this swap, inline
// `style` would beat any rule from a Tailwind utility / external stylesheet
// short of `!important`, which is the exact mismatch the classNames prop
// is meant to eliminate.
//
// Shared between sign-in-form.tsx and sign-in-page.tsx so a future change
// to the swap contract (e.g. allowing className + a subset of the fallback
// style) is made in one place — the diverging copy is the more dangerous
// of the two failure modes.
export function styled(
  className: string | undefined,
  fallback: CSSProperties,
): { className?: string; style?: CSSProperties } {
  return className ? { className } : { style: fallback }
}

export function joinClassNames(...parts: Array<string | undefined>): string | undefined {
  const filtered = parts.filter((p): p is string => Boolean(p))
  return filtered.length === 0 ? undefined : filtered.join(" ")
}
