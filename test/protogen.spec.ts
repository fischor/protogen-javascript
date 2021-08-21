import { describe } from "mocha";
import assert from "assert";
import { execSync } from "child_process";
import { readFileSync } from "fs";

describe("the test generator", () => {
    it("should generate the golden output", async () => {

        // Throws error is exit code is not 0.
        const result = execSync("protoc -I test/vendor --plugin=protoc-gen-test=lib/test/generator.js --test_out=testout test/vendor/google/api/annotations.proto")

        const golden = readFileSync("test/golden/google/api/annotations.out.golden").toString()
        const actual = readFileSync("testout/google/api/annotations.out").toString()

        assert.equal(actual, golden)
    })
})