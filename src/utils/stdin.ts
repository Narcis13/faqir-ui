// Read all of stdin as a UTF-8 string. Works under both the Bun runtime and the
// compiled Node bundle (process.stdin is an async-iterable Readable on both).
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
