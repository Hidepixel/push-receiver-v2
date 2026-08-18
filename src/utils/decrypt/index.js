const crypto = require('crypto');
const ece = require('http_ece');

module.exports = decrypt;

function parseHeaderParams(header) {
  const params = {};

  header.split(';').forEach(part => {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) return;

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key) params[key] = value;
  });

  return params;
}

// https://tools.ietf.org/html/draft-ietf-webpush-encryption-03
function decrypt(object, keys) {
  const cryptoKey = object.appData.find(item => item.key === 'crypto-key');
  if (!cryptoKey) throw new Error('crypto-key is missing');
  const encryption = object.appData.find(item => item.key === 'encryption');
  if (!encryption) throw new Error('salt is missing');

  const cryptoKeyParams = parseHeaderParams(cryptoKey.value);
  const encryptionParams = parseHeaderParams(encryption.value);
  if (!cryptoKeyParams.dh) {
    throw new Error('crypto-key header is missing dh parameter');
  }
  if (!encryptionParams.salt) {
    throw new Error('encryption header is missing salt parameter');
  }

  const dh = crypto.createECDH('prime256v1');
  dh.setPrivateKey(keys.privateKey, 'base64');
  const params = {
    version    : 'aesgcm',
    authSecret : keys.authSecret,
    dh         : cryptoKeyParams.dh,
    privateKey : dh,
    salt       : encryptionParams.salt,
  };
  const decrypted = ece.decrypt(object.rawData, params);
  return JSON.parse(decrypted);
}
