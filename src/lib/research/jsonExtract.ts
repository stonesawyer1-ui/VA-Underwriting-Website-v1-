/**
 * Claude occasionally emits an otherwise well-formed JSON object with a raw,
 * unescaped control character (a literal newline/tab) inside a string value,
 * or a trailing comma before a closing bracket — both invalid JSON but easy
 * to repair without touching legitimate content. Shared by every research
 * call that asks Claude for structured JSON after a web-search tool loop.
 */
export function sanitizeJsonText(text: string): string {
  return text.replace(/[\r\n\t]+/g, " ").replace(/,\s*([\]}])/g, "$1");
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("No JSON object found in research response.");
  }
  const jsonSlice = candidate.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(jsonSlice);
  } catch {
    return JSON.parse(sanitizeJsonText(jsonSlice));
  }
}
