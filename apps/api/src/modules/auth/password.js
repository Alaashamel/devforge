import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

const ARGON2ID = 2;

export function createPasswordService({
  memoryCost = 65536,
  timeCost = 3,
  parallelism = 1,
} = {}) {
  return {
    async hash(password) {
      return argonHash(password, { algorithm: ARGON2ID, memoryCost, timeCost, parallelism });
    },
    async verify(password, hashed) {
      try {
        return await argonVerify(hashed, password);
      } catch {
        return false;
      }
    },
  };
}
