import { describe } from "mocha";
import assert from "assert";
import { execSync } from "child_process";
import { readFileSync } from "fs";

describe("the import test generator", () => {
  it("should generate the golden output", async () => {
    // Throws error is exit code is not 0.
    const result = execSync("protoc -I test/vendor --plugin=protoc-gen-imports=lib/test/imports/generator.js --imports_out=testout test/vendor/google/api/annotations.proto");

    const golden = readFileSync("test/imports/imports.txt.golden").toString();
    const actual = readFileSync("testout/imports.txt").toString();

    assert.equal(actual, golden);
  });
});
