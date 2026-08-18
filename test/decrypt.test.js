jest.mock('crypto', () => ({
  createECDH : jest.fn(() => ({ setPrivateKey : jest.fn() })),
}));
jest.mock('http_ece', () => ({
  decrypt : jest.fn(() => require('buffer').Buffer.from('{"message":"ok"}')),
}));

const ece = require('http_ece');
const decrypt = require('../src/utils/decrypt');

describe('decrypt', function() {
  beforeEach(function() {
    ece.decrypt.mockClear();
  });

  it('extracts named parameters from composite headers', function() {
    const result = decrypt(
      {
        appData : [
          {
            key   : 'crypto-key',
            value : 'p256ecdsa=signature==; dh=public-key==; keyid=p256dh',
          },
          {
            key   : 'encryption',
            value : 'keyid=p256dh; salt=random-salt==',
          },
        ],
        rawData : Buffer.from('encrypted'),
      },
      {
        privateKey : 'private-key',
        authSecret : 'auth-secret',
      }
    );

    expect(result).toEqual({ message : 'ok' });
    expect(ece.decrypt.mock.calls[0][1].dh).toEqual('public-key==');
    expect(ece.decrypt.mock.calls[0][1].salt).toEqual('random-salt==');
  });

  it('rejects a crypto-key header without a dh parameter', function() {
    expect(() =>
      decrypt(
        {
          appData : [
            { key : 'crypto-key', value : 'p256ecdsa=signature' },
            { key : 'encryption', value : 'salt=random-salt' },
          ],
          rawData : Buffer.from('encrypted'),
        },
        { privateKey : 'private-key', authSecret : 'auth-secret' }
      )
    ).toThrow('crypto-key header is missing dh parameter');
  });
});
