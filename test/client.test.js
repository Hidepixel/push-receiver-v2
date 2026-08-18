jest.mock('../src/utils/decrypt', () => jest.fn());

const decrypt = require('../src/utils/decrypt');
const Client = require('../src/client');

describe('Client', function() {
  it('drops a message with an invalid ECDH public key', function() {
    const error = new Error('Public key is not valid for specified curve');
    error.code = 'ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY';
    decrypt.mockImplementation(() => {
      throw error;
    });

    const client = new Client({ keys : {} }, []);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() =>
      client._onDataMessage({ persistentId : 'invalid-public-key-message' })
    ).not.toThrow();
    expect(client._persistentIds).toContain('invalid-public-key-message');
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
