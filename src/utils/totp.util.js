import crypto from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(str) {
  const clean = String(str)
    .toUpperCase()
    .replace(/=+$/, "")
    .replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function buildOtpauthUrl({
  issuer = "BloodLink Admin",
  account,
  secret,
}) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function hotp(secretBuffer, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secretBuffer).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, "0");
}

export function generateTotp(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / 30);
  return hotp(base32Decode(secret), counter);
}

export function verifyTotp(secret, code, window = 1) {
  const codeStr = String(code);
  if (!/^\d{6}$/.test(codeStr)) return false;
  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    const candidate = generateTotp(secret, now + i * 30_000);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(codeStr)))
      return true;
  }
  return false;
}
