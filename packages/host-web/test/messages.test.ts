import { describe, expect, it } from "vitest";
import { missingKeys } from "@boardroom/core";
import { messages } from "../src/messages";

describe("library messages", () => {
  it("has the same keys in Chinese and English", () => {
    expect(missingKeys(messages)).toEqual({ zh: [], en: [] });
  });
});
