// A plain scan, not `/\/+$/`: that regex retries from every slash in a run,
// so an input of many slashes followed by one other character takes quadratic
// time. The proxy calls this on every request.
export function stripTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value[end - 1] === "/") end--
  return value.slice(0, end)
}
