const crypto = require(`crypto`);
const baseX = require(`base-x`).default;

const BASE62 = baseX("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz");
const SECRET = "super_secret_key";

function encodeCursor(obj) {
  const json = Buffer.from(JSON.stringify(obj));
  const hmac = crypto
    .createHmac("sha256", SECRET)
    .update(json)
    .digest()
    .subarray(0, 6); // include first 6 bytes for short token

  const payload = Buffer.concat([json, hmac]);
  return BASE62.encode(payload); 
}

function decodeCursor(cursor) {
  const payload = Buffer.from(BASE62.decode(cursor));
  const jsonPart = payload.subarray(0, payload.length - 6);
  const sigPart = payload.subarray(payload.length - 6);

  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(jsonPart)
    .digest()
    .subarray(0, 6);

  if (!crypto.timingSafeEqual(sigPart, expected)) {
    return null;
    // throw new Error("Invalid cursor: signature mismatch");
  }

  return JSON.parse(jsonPart.toString());
}

module.exports = {
    encodeCursor,
    decodeCursor
}