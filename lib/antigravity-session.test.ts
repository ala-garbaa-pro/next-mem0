/** Unit tests for the Antigravity (Gemini CLI / IDE) parser. Run with `bun run test:unit`. */
import { describe, expect, test } from "bun:test";
import { parseAntigravitySteps, type AntigravityStep } from "./antigravity-session";
import { firstAtPath, protoStrings } from "./protobuf";

// ---------- a tiny protobuf encoder, so the fixtures are real wire format ----------

function varint(n: number): number[] {
  const out: number[] = [];
  while (n > 127) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}

/** One length-delimited field: `field` holding `body` (a string's bytes or a nested message). */
function lenField(field: number, body: Uint8Array | string): Uint8Array {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  return Uint8Array.from([...varint(field * 8 + 2), ...varint(bytes.length), ...bytes]);
}

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

/** A step whose text sits at the given dotted path, e.g. "19.2". */
function stepAt(path: string, text: string): Uint8Array {
  const fields = path.split(".").map(Number);
  let payload: Uint8Array | string = text;
  for (let i = fields.length - 1; i >= 0; i--) payload = lenField(fields[i], payload);
  return payload as Uint8Array;
}

const user = (text: string, idx = 0): AntigravityStep => ({ idx, stepType: 14, payload: b64(stepAt("19.2", text)) });
const assistant = (text: string, idx = 1): AntigravityStep => ({ idx, stepType: 15, payload: b64(stepAt("20.1", text)) });

describe("protoStrings", () => {
  test("addresses a nested string by its field path", () => {
    const s = protoStrings(stepAt("19.2", "why is the build slow?"));
    expect(firstAtPath(s, ["19.2"])).toBe("why is the build slow?");
  });

  test("keeps a short string as text rather than decoding it as a nested message", () => {
    // "hi" is also a well-formed varint field, which is the trap this guards against.
    const s = protoStrings(stepAt("19.2", "hi"));
    expect(firstAtPath(s, ["19.2"])).toBe("hi");
  });

  test("falls through the preference order and returns empty when nothing matches", () => {
    const s = protoStrings(stepAt("20.8", "second choice"));
    expect(firstAtPath(s, ["20.1", "20.8"])).toBe("second choice");
    expect(firstAtPath(s, ["99.1"])).toBe("");
  });

  test("survives bytes that are not protobuf at all", () => {
    expect(() => protoStrings(Uint8Array.from([0xff, 0xff, 0xff]))).not.toThrow();
  });
});

describe("parseAntigravitySteps", () => {
  test("reads the turns and keeps the conversation id", () => {
    const c = parseAntigravitySteps([user("why is the build slow?"), assistant("Check the cache.")], { id: "conv-1" });
    expect(c.cliSessionId).toBe("conv-1");
    expect(c.source).toBe("gemini");
    expect(c.messages).toEqual([
      { role: "user", content: "why is the build slow?" },
      { role: "assistant", content: "Check the cache." },
    ]);
  });

  test("ignores every step kind that is not a turn", () => {
    const c = parseAntigravitySteps(
      [
        user("real question"),
        // 90 is an injected <EPHEMERAL_MESSAGE>, 98 a "# Conversation History" digest, 17 an error,
        // 21 a tool call — none are things the user or the model said in this conversation.
        { idx: 1, stepType: 90, payload: b64(stepAt("103.1", "The following is an <EPHEMERAL_MESSAGE>…")) },
        { idx: 2, stepType: 98, payload: b64(stepAt("111.1", "# Conversation History\nEarlier chats…")) },
        { idx: 3, stepType: 17, payload: b64(stepAt("24.3.1", "Agent execution terminated due to error.")) },
        { idx: 4, stepType: 21, payload: b64(stepAt("30.1", "read_file(a.ts)")) },
        assistant("real answer", 5),
      ],
      { id: "conv-1" },
    );
    expect(c.messages.map((m) => m.content)).toEqual(["real question", "real answer"]);
  });

  test("merges the assistant steps a tool call split apart", () => {
    const c = parseAntigravitySteps(
      [
        user("build it"),
        assistant("Starting now.", 1),
        { idx: 2, stepType: 15, payload: b64(stepAt("99.1", "")) }, // an intermediate step with no prose
        assistant("Done — it compiles.", 3),
      ],
      { id: "conv-1" },
    );
    expect(c.messages).toHaveLength(2);
    expect(c.messages[1].content).toBe("Starting now.\n\nDone — it compiles.");
  });

  test("strips control characters that Postgres would reject", () => {
    const c = parseAntigravitySteps([user("\u0000We tried \u0000VRL\u0000 once"), assistant("ok\u0000")], { id: "c" });
    expect(c.messages[0].content).toBe("We tried VRL once");
    expect(c.messages[1].content).toBe("ok");
    for (const m of c.messages) expect(m.content).not.toContain("\u0000");
  });

  test("titles the conversation after the first user line, or the given name", () => {
    const steps = [user("why is the build slow?\nmore detail"), assistant("ok")];
    expect(parseAntigravitySteps(steps, { id: "c" }).title).toBe("why is the build slow?");
    expect(parseAntigravitySteps(steps, { id: "c", name: "Build times" }).title).toBe("Build times");
  });

  test("skips a step whose payload will not decode instead of failing the import", () => {
    const c = parseAntigravitySteps(
      [{ idx: 0, stepType: 14, payload: "not base64 protobuf!!" }, assistant("still here")],
      { id: "c" },
    );
    expect(c.messages).toEqual([{ role: "assistant", content: "still here" }]);
  });

  test("throws when there is no conversation id", () => {
    expect(() => parseAntigravitySteps([user("hi")], { id: "" })).toThrow("no id");
  });
});
