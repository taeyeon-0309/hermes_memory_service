import { describe, expect, it } from "vitest";
import { buildMemoryGuidancePrompt } from "../prompt/memory-guidance";

describe("memory-guidance", () => {
  it("contains the key memory behavior rules for host prompt injection", () => {
    const guidance = buildMemoryGuidancePrompt();

    expect(guidance).toContain("memory tool");
    expect(guidance).toContain("target=user");
    expect(guidance).toContain("target=memory");
    expect(guidance).toContain("Do not store temporary task progress");
    expect(guidance).toContain("stable preference");
    expect(guidance).toContain("recall is available");
  });
});
