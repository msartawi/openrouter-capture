/** Redact session/credential-looking values before writing capture artifacts. */

const SENSITIVE_KEY =
  /(?:SID|sid|_sessionTOKEN|sessionTOKEN|sessionToken|token|Token|password|Password|passwd|Passwd|Authorization|authorization|cookie|Cookie|nonce|Nonce)/;

export function redactSecrets(text: string): string {
  if (!text) return text;

  let out = text;

  // XML / HTML style: <ParaName>password</ParaName><ParaValue>…</ParaValue>
  out = out.replace(
    /(<ParaName>\s*(?:password|passwd|SID|_sessionTOKEN|sessionTOKEN|token)\s*<\/ParaName>\s*<ParaValue>)([^<]*)(<\/ParaValue>)/gi,
    "$1[REDACTED]$3",
  );

  // query / form: key=value
  out = out.replace(
    /([?&]?(?:SID|sid|_sessionTOKEN|sessionTOKEN|token|password|passwd|Authorization)=)([^&\s"'<>]+)/gi,
    "$1[REDACTED]",
  );

  // JSON-ish: "token": "…"
  out = out.replace(
    /("(?:SID|sid|_sessionTOKEN|sessionTOKEN|token|Token|password|Password|Authorization)"\s*:\s*")([^"]*)(")/g,
    "$1[REDACTED]$3",
  );

  // Cookie header fragments
  out = out.replace(
    /((?:Set-Cookie|Cookie)\s*:\s*[^=\s]+=)([^;\s]+)/gi,
    "$1[REDACTED]",
  );

  return out;
}

export function redactQuery(
  query: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redactSecrets(v);
  }
  return out;
}
