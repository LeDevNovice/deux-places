import { Effect } from "effect";
import {
  PushPayloadTooLarge,
  PushSubscriptionInvalid,
} from "../application/push-sender";

// A push message is one `aes128gcm` record (RFC 8291 §4) of at most 4,096 octets of body: header
// (86) + plaintext + padding delimiter (1) + AES-GCM tag (16) leaves 3,993 octets of plaintext.
const recordSize = 4096;
export const maxPlaintextOctets = 3993;
// Delimiter of the last (here, only) record (RFC 8188 §2). No padding octets follow it.
const lastRecordDelimiter = 0x02;

const ascii = (value: string) => new TextEncoder().encode(value);

const concat = (...parts: ReadonlyArray<Uint8Array>) => {
  const joined = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
};

// HKDF-SHA-256 (RFC 5869) by WebCrypto: extract with `salt`, expand with `info` to `octets`.
const hkdf = (
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  octets: number,
) =>
  Effect.promise(async () => {
    const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
      "deriveBits",
    ]);
    return new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt, info },
        key,
        octets * 8,
      ),
    );
  });

// WebCrypto names the peer key `public` (W3C spec, Cloudflare docs, workerd checked in J1.13);
// worker-configuration.d.ts declares it `$public`, which workerd rejects. A typed variable keeps
// the standard name without a cast.
interface EcdhKeyDeriveParams {
  readonly name: "ECDH";
  readonly public: CryptoKey;
}

// The uncompressed point of a public key: `exportKey("raw")` gives octets, never a JWK.
const exportRaw = (publicKey: CryptoKey) =>
  Effect.promise(async () => {
    const raw = await crypto.subtle.exportKey("raw", publicKey);
    if (!(raw instanceof ArrayBuffer))
      throw new TypeError("raw export did not return octets");
    return new Uint8Array(raw);
  });

const importReceiverKey = (publicKey: Uint8Array) =>
  // Uncompressed P-256 point (X9.62): 65 octets starting with 0x04 (RFC 8291 §3.1, §4).
  publicKey.length !== 65 || publicKey[0] !== 0x04
    ? Effect.fail(
        new PushSubscriptionInvalid({
          reason: "p256dh is not an uncompressed P-256 point",
        }),
      )
    : Effect.tryPromise({
        // Import checks that the point is on the curve (RFC 8291 §7).
        try: () =>
          crypto.subtle.importKey(
            "raw",
            publicKey,
            { name: "ECDH", namedCurve: "P-256" },
            false,
            [],
          ),
        catch: () =>
          new PushSubscriptionInvalid({
            reason: "p256dh is not a point of P-256",
          }),
      });

/**
 * Encrypts one push message for one subscription (RFC 8291 §3, RFC 8188 §2): the body is the
 * content-coding header (salt, record size, sender public key as keyid) and a single record.
 * `sender` (an ECDH P-256 pair) and `salt` (16 octets) must be fresh for every message.
 */
export const encrypt = (input: {
  readonly plaintext: Uint8Array;
  readonly receiver: {
    readonly publicKey: Uint8Array;
    readonly authSecret: Uint8Array;
  };
  readonly sender: CryptoKeyPair;
  readonly salt: Uint8Array;
}) =>
  Effect.gen(function* () {
    const { plaintext, receiver, sender, salt } = input;
    if (plaintext.length > maxPlaintextOctets)
      return yield* new PushPayloadTooLarge({ octets: plaintext.length });
    if (receiver.authSecret.length !== 16)
      return yield* new PushSubscriptionInvalid({
        reason: "auth is not 16 octets",
      });
    const receiverKey = yield* importReceiverKey(receiver.publicKey);
    const senderPublic = yield* exportRaw(sender.publicKey);
    const ecdh: EcdhKeyDeriveParams = { name: "ECDH", public: receiverKey };
    const ecdhSecret = new Uint8Array(
      yield* Effect.promise(() =>
        crypto.subtle.deriveBits(ecdh, sender.privateKey, 256),
      ),
    );
    // RFC 8291 §3.3: key_info = "WebPush: info" || 0x00 || ua_public || as_public
    const keyInfo = concat(
      ascii("WebPush: info\0"),
      receiver.publicKey,
      senderPublic,
    );
    const ikm = yield* hkdf(ecdhSecret, receiver.authSecret, keyInfo, 32);
    // RFC 8188 §2.2, §2.3 (single record: the nonce is not XORed with a sequence number).
    const cek = yield* hkdf(
      ikm,
      salt,
      ascii("Content-Encoding: aes128gcm\0"),
      16,
    );
    const nonce = yield* hkdf(
      ikm,
      salt,
      ascii("Content-Encoding: nonce\0"),
      12,
    );
    const record = new Uint8Array(
      yield* Effect.promise(async () =>
        crypto.subtle.encrypt(
          { name: "AES-GCM", iv: nonce },
          await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
            "encrypt",
          ]),
          concat(plaintext, Uint8Array.of(lastRecordDelimiter)),
        ),
      ),
    );
    // RFC 8188 §2.1: salt (16) || rs (uint32, network order) || idlen (1) || keyid (idlen)
    const rs = new Uint8Array(4);
    new DataView(rs.buffer).setUint32(0, recordSize);
    return concat(
      salt,
      rs,
      Uint8Array.of(senderPublic.length),
      senderPublic,
      record,
    );
  });
