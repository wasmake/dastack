import { describe, expect, it } from "vitest";

import { readBody, readJson } from "@/server/api";

function streamingRequest(chunks: string[]): Request {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request("http://localhost/api/test", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("bounded API request bodies", () => {
  it("rejects a chunked body as soon as it exceeds the byte limit", async () => {
    await expect(
      readBody(streamingRequest(["1234", "5"]), 4),
    ).rejects.toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
  });

  it("parses valid chunked JSON without a content-length header", async () => {
    await expect(
      readJson(streamingRequest(['{"ok":', "true}"])),
    ).resolves.toEqual({ ok: true });
  });
});
