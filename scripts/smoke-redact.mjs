import assert from "node:assert/strict";
import { redactQuery, redactSecrets } from "../dist/redact.js";
import {
  classifySessionState,
  probeTypesForTag,
} from "../dist/crawl/patternExtract.js";

assert.match(
  redactSecrets("SID=abc123&_tag=home"),
  /SID=\[REDACTED\]/,
);
assert.match(
  redactSecrets("<ParaName>password</ParaName><ParaValue>secret</ParaValue>"),
  /ParaValue>\[REDACTED\]</,
);
assert.equal(redactQuery({ SID: "x", _tag: "home" }).SID, "[REDACTED]");
assert.equal(redactQuery({ SID: "x", _tag: "home" })._tag, "home");

assert.equal(
  classifySessionState("<html><script>SessionTimeout</script>404</html>"),
  "unknown",
);
assert.equal(
  classifySessionState(
    "<ajax_response_xml_root><IF_ERRORSTR>SessionTimeout</IF_ERRORSTR></ajax_response_xml_root>",
  ),
  "timeout",
);
assert.equal(probeTypesForTag("firewall_homepage_lua.lua")[0], "menuData");

console.log("redact smoke ok");
