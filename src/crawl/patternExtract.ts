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
  const trimmed = body.trim();
  // 404/HTML shells often embed the word SessionTimeout in JS — ignore those.
  const looksHtml =
    /^<!DOCTYPE/i.test(trimmed) ||
    /^<html[\s>]/i.test(trimmed) ||
    /<title>\s*404\s+Not Found\s*<\/title>/i.test(trimmed);

  if (looksHtml && !/ajax_response_xml_root|IF_ERRORSTR/i.test(trimmed)) {
    return "unknown";
  }

  const looksAjax =
    /ajax_response_xml_root|IF_ERRORSTR|IF_ERRORID|OBJ_/i.test(trimmed) ||
    (trimmed.startsWith("{") && /sess_token|loginErrMsg/i.test(trimmed));

  if (looksAjax) {
    if (
      /<IF_ERRORSTR>\s*SessionTimeout\s*<\/IF_ERRORSTR>/i.test(trimmed) ||
      /"IF_ERRORSTR"\s*:\s*"SessionTimeout"/i.test(trimmed)
    ) {
      return "timeout";
    }
    if (/OBJ_|IF_ERRORID|ajax_response_xml_root/i.test(trimmed)) {
      return "valid";
    }
  }

  if (!looksHtml && /SessionTimeout/i.test(trimmed)) {
    return "timeout";
  }

  if (/OBJ_|ajax_response_xml_root|IF_ERRORID/i.test(trimmed)) {
    return "valid";
  }
  return "unknown";
}

/** Prefer menuData for lua/lp tags; menuView first only for short view tags. */
export function probeTypesForTag(tag: string): Array<"menuView" | "menuData" | "hiddenData"> {
  if (/\.(lua|lp|gch)$/i.test(tag) || /_lua\.lua$/i.test(tag) || /_data$/i.test(tag)) {
    return ["menuData", "hiddenData", "menuView"];
  }
  return ["menuView", "menuData", "hiddenData"];
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
