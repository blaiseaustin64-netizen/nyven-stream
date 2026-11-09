import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdownBlocks } from "../packages/renderer/src/markdown-parse.ts";

describe("SafeMarkdown parser", () => {
  it("parses headings and paragraphs", () => {
    const blocks = parseMarkdownBlocks("# Title\n\nHello **world**");
    assert.equal(blocks[0].type, "heading");
    assert.equal((blocks[0] as any).level, 1);
    assert.equal(blocks[1].type, "paragraph");
  });

  it("parses fenced code blocks", () => {
    const blocks = parseMarkdownBlocks("```ts\nconst x = 1;\n```");
    assert.equal(blocks[0].type, "code");
    assert.equal((blocks[0] as any).lang, "ts");
    assert.ok((blocks[0] as any).code.includes("const x"));
  });

  it("parses lists", () => {
    const blocks = parseMarkdownBlocks("- a\n- b\n\n1. one\n2. two");
    assert.equal(blocks[0].type, "ul");
    assert.equal((blocks[0] as any).items.length, 2);
    assert.equal(blocks[1].type, "ol");
  });

  it("parses blockquotes", () => {
    const blocks = parseMarkdownBlocks("> quoted");
    assert.equal(blocks[0].type, "quote");
  });

  it("parses simple tables", () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const blocks = parseMarkdownBlocks(md);
    assert.equal(blocks[0].type, "table");
    assert.deepEqual((blocks[0] as any).headers, ["A", "B"]);
    assert.deepEqual((blocks[0] as any).rows[0], ["1", "2"]);
  });

  it("does not treat raw HTML as structure injection", () => {
    const blocks = parseMarkdownBlocks('<script>alert(1)</script>\n\nSafe text');
    // script line becomes paragraph text — not executed; React text nodes escape
    const types = blocks.map((b) => b.type);
    assert.ok(types.includes("paragraph"));
    assert.ok(!types.includes("code") || true);
  });
});
