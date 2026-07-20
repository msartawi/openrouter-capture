import assert from "node:assert/strict";
import {
  deriveAjaxTagsFromTemplate,
  harvestMenuTreeJson,
} from "../dist/crawl/menuParser.js";
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

const harvested = harvestMenuTreeJson(
  `var menuTreeJSON = [{"id":"internet","name":"Internet","children":[{"id":"ponopticalinfo","name":"PON","area":[{"area":"poninfo_status_t.lp"}]}]}];`,
);
assert.equal(harvested.tags.includes("poninfo_status_t.lp"), true);
assert.equal(harvested.tree[0]?.tag, "internet");

assert.ok(
  deriveAjaxTagsFromTemplate("firewall_config_t.lp").includes(
    "firewall_config_lua.lua",
  ),
);
assert.ok(deriveAjaxTagsFromTemplate("sntp_t.lp").includes("sntp_data"));

assert.equal(
  classifySessionState(
    "<html>\n<head><title>404 Not Found</title><script>SessionTimeout</script></head></html>",
  ),
  "unknown",
);

console.log("redact smoke ok");
