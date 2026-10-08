import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowsKenBurns, allowsVideo, defaultQuality, GFX_QUALITIES, qualityClass } from "./quality.ts";

describe("graphics quality", () => {
  it("ships three device profiles and never lets low quality play video", () => {
    assert.deepEqual(GFX_QUALITIES, ["low", "medium", "high"]);
    assert.equal(allowsVideo("low"), false);
    assert.equal(allowsVideo("medium"), true);
    assert.equal(allowsVideo("medium", true), false);
    assert.equal(allowsKenBurns("high"), true);
    assert.equal(allowsKenBurns("medium"), false);
    assert.equal(allowsKenBurns("high", true), false);
    assert.equal(qualityClass("medium"), "gfx-medium");
    assert.ok(["low", "medium", "high"].includes(defaultQuality()));
  });
});
