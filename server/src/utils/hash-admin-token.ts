export {};

const token = process.argv[2];
if (!token || token.length < 24) {
  console.error(
    'Usage: bun run admin:hash -- <token-of-at-least-24-characters>',
  );
  process.exit(1);
}

console.log(await Bun.password.hash(token, { algorithm: 'argon2id' }));
