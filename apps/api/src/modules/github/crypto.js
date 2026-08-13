import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

function deriveKey(key) {
  return createHash('sha256').update(String(key)).digest();
}

function encodeB64url(buffer) {
  return buffer.toString('base64url');
}

function decodeB64url(value) {
  return Buffer.from(value, 'base64url');
}

export function createGithubCrypto({ key }) {
  const secret = deriveKey(key);

  function encrypt(plaintext) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, secret, iv);
    const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${VERSION}:${encodeB64url(iv)}:${encodeB64url(tag)}:${encodeB64url(ciphertext)}`;
  }

  function decrypt(encoded) {
    const [version, ivPart, tagPart, dataPart] = String(encoded).split(':');
    if (version !== VERSION) {
      throw new Error('Unsupported encrypted payload version');
    }
    const decipher = createDecipheriv(ALGORITHM, secret, decodeB64url(ivPart));
    decipher.setAuthTag(decodeB64url(tagPart));
    return Buffer.concat([
      decipher.update(decodeB64url(dataPart)),
      decipher.final(),
    ]).toString('utf8');
  }

  function sign(payload) {
    const body = encodeB64url(Buffer.from(JSON.stringify(payload), 'utf8'));
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    return `${body}.${signature}`;
  }

  function verify(state) {
    const dot = String(state).lastIndexOf('.');
    if (dot === -1) {
      return null;
    }
    const body = String(state).slice(0, dot);
    const signature = String(state).slice(dot + 1);
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    const received = Buffer.from(signature, 'hex');
    const wanted = Buffer.from(expected, 'hex');
    if (received.length !== wanted.length || !timingSafeEqual(received, wanted)) {
      return null;
    }
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }

  return { encrypt, decrypt, sign, verify };
}
