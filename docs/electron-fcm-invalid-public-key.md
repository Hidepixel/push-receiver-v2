# Electron FCM `ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY` ERROR

## Conclusion

The failure is in the Electron FCM receiver dependency, not in Windows crypto or the machine's stored ECDH private key.

`push-receiver-v2@2.2.0` assumes that the complete values of the incoming headers are exactly `dh=<key>` and `salt=<salt>`:

```js
dh: cryptoKey.value.slice(3),
salt: salt.value.slice(5),
```

A valid legacy Web Push `Crypto-Key` header can contain multiple semicolon-separated parameters, for example:

```text
dh=<ephemeral-public-key>; p256ecdsa=<application-server-public-key>
```

The dependency passes everything after `dh=`—including the `p256ecdsa` parameter—to `http_ece`. That is decoded as the remote P-256 public key and passed to `ECDH.computeSecret()`. Node then correctly throws `ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY` because the resulting bytes are not a valid point on the curve.

This diagnosis is high confidence because:

1. The reported stack follows this exact path: `push-receiver-v2` decrypt → `http_ece` → `ECDH.computeSecret()`.
2. The installed dependency contains the fragile `.slice(3)` implementation at `electron/node_modules/push-receiver-v2/src/utils/decrypt/index.js:17`.
3. The same defect and stack were fixed upstream in Eneris `push-receiver` PR #33 by parsing named semicolon-separated header parameters.
4. Node documents this exact error as the result of passing `computeSecret()` a public key outside the curve.

The Windows path in the stack only identifies where the packaged ASAR is installed. This code is platform-independent and could fail on macOS/Linux for a message with the same header shape.


### Dependency choices

- Our app(Sioslife) depends on `Electron v25` and this electron version uses `Node v18` under the hood.
- `push-receiver-v2@2.2.0` is the currently installed package and is marked unmaintained by its repository.
- Its suggested replacement, `@liamcottle/push-receiver@0.0.4`, still contains the same `.slice(3)` decrypt implementation, so a package-name swap alone does **not** fix this error.
- No published Eneris version is both Node 18-compatible and fixed:

  | Eneris version | Node requirement | Header parsing | Drop-in compatible? |
  | --- | --- | --- | --- |
  | `3.1.5` | `>=14` | vulnerable `.slice(3)` | No; class-based API and old sender-ID registration flow |
  | `4.0.2`–`4.3.0` | `>=20` | vulnerable `.slice(3)` | No; class-based API |
  | `4.3.1` | `>=20` | fixed named-parameter parsing | No; class-based API |

- `@eneris/push-receiver@4.3.1` is the first Eneris release containing this specific fix. Ignoring its engine declaration would be unsupported and would still require rewriting the manager from the current `register()`/`listen()` module API to Eneris's `PushReceiver` instance API.
- The lowest-risk immediate repair is therefore a small reproducible patch/fork of the current dependency, followed by a planned migration to a maintained receiver.

## Recommended fix design

Patch or replace `push-receiver-v2` so it parses header parameters by name rather than by fixed prefix slicing. Parsing must:

- split parameters on `;`;
- trim whitespace;
- split each parameter at its first `=` (base64 padding may itself contain `=`);
- select `dh` from `crypto-key` and `salt` from `encryption` regardless of order;
- reject a message locally if either named parameter is absent.

Also isolate per-message decrypt errors inside the receiver. One malformed remote message must be logged and dropped without becoming a process-level uncaught exception. Avoid logging key/header values; parameter names and decoded lengths are enough for diagnostics.

Do not edit `node_modules` only: that change will disappear on install/build. Use a pinned maintained package, a repository-owned fork, or a reproducible package patch.

## How to confirm on an affected PC

Instrument the receiver immediately before decrypting one message and record only:

- the parameter names present in `crypto-key` and `encryption`;
- the extracted `dh` string length;
- the decoded `dh` byte length and first byte.

A valid uncompressed P-256 public key is 65 bytes and starts with `0x04`. The expected confirmation is that the raw `crypto-key` contains another parameter after `dh` and the old extraction produces a value that does not decode to that shape.

Deleting stored FCM credentials may temporarily alter queued messages or issue a new token, but it does not repair this parser and is not a durable fix.

## Sources

- Node.js Crypto API, `ecdh.computeSecret()`: https://nodejs.org/api/crypto.html#ecdhcomputesecretotherpublickey-inputencoding-outputencoding
- Web Push protocol explanation showing the composite `Crypto-Key: dh=...; p256ecdsa=...` form: https://web.dev/articles/push-notifications-web-push-protocol#crypto-key-header
- Eneris fix with the identical failure mode: https://github.com/Eneris/push-receiver/pull/33
- Fixed upstream decrypt implementation: https://github.com/Eneris/push-receiver/blob/master/src/utils/decrypt.ts
- Current dependency repository (maintenance warning): https://github.com/javajuice1337/push-receiver-v2
- Suggested replacement's still-fragile decrypt implementation: https://github.com/liamcottle/push-receiver/blob/master/src/utils/decrypt/index.js
- Eneris package runtime/API requirements: https://github.com/Eneris/push-receiver
