import type { ToolSource } from "./toolClients";

const buildSourceKey = (source: ToolSource) => {
  const normalizedUrl = source.url?.trim();
  if (normalizedUrl) {
    return `url:${normalizedUrl}`;
  }
  const normalizedTitle = source.title?.trim().toLowerCase() ?? "";
  return `title:${normalizedTitle}`;
};

const normalizeSource = (source: ToolSource): ToolSource => ({
  ...source,
  url: source.url?.trim() ?? "",
});

export const mergeSourcesByUrl = (
  previous: ToolSource[],
  next: ToolSource[],
): ToolSource[] => {
  const merged = new Map<string, ToolSource>();

  [...(previous || []), ...(next || [])]
    .filter((src): src is ToolSource => Boolean(src))
    .forEach((src) => {
      const normalized = normalizeSource(src);
      const key = buildSourceKey(normalized);
      merged.set(key, normalized);
    });

  return Array.from(merged.values());
};
