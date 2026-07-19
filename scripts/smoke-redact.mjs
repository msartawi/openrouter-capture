import assert from "node:assert/strict";
import { redactQuery, redactSecrets } from "../dist/redact.js";

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

console.log("redact smoke ok");
