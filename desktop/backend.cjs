// Utility processes bootstrap CommonJS reliably; the service itself remains ESM.
import('../src/server/server.mjs').catch((error) => {
  console.error(error);
  process.exit(1);
});
