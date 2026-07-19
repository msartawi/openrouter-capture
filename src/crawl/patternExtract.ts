const TAG_RE =
  /[?&]_tag=([A-Za-z0-9_./-]+\.(?:lua|lp|gch)|[A-Za-z0-9_./-]+)/gi;
const TYPE_TAG_RE =
  /_type=(menuView|menuData|hiddenData|loginData)[^"'<\s]*_tag=([A-Za-z0-9_./-]+)/gi;
const OBJ_RE = /<(OBJ_[A-Z0-9_]+)>/gi;
const PARA_NAME_RE = /<ParaName>([^<]+)<\/ParaName>/gi;
const IF_ACTION_RE = /IF_ACTION[=:]?\s*["']?([A-Za-z]+)/gi;

export function extractTagsFromText(text: string): string[] {
  const tags = new Set<string>();
  for (const re of [TAG_RE, TYPE_TAG_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const tag = (m[2] ?? m[1] ?? "").trim();
      if (tag) tags.add(tag);
    }
  }
  return [...tags].sort();
}

export function extractObjectNames(xml: string): string[] {
  const names = new Set<string>();
  OBJ_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OBJ_RE.exec(xml)) !== null) {
    names.add(m[1]);
  }
  return [...names].sort();
}

export function extractParaNames(xml: string): string[] {
  const names = new Set<string>();
  PARA_NAME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PARA_NAME_RE.exec(xml)) !== null) {
    names.add(m[1].trim());
  }
  return [...names].sort();
}

export function extractActions(text: string): string[] {
  const actions = new Set<string>();
  IF_ACTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IF_ACTION_RE.exec(text)) !== null) {
    actions.add(m[1]);
  }
  if (/\bApply\b/i.test(text)) actions.add("Apply");
  if (/\bCancel\b/i.test(text)) actions.add("Cancel");
  return [...actions].sort();
}

export function classifySessionState(
  body: string,
): "valid" | "timeout" | "unknown" {
  if (/SessionTimeout/i.test(body) || /session\s*time\s*out/i.test(body)) {
    return "timeout";
  }
  if (/OBJ_|ajax_response_xml_root|IF_ERRORID/i.test(body)) {
    return "valid";
  }
  return "unknown";
}

export function parseQuery(url: string): Record<string, string> {
  try {
    const u = new URL(url);
    const out: Record<string, string> = {};
    u.searchParams.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  } catch {
    return {};
  }
}
