import assert from "node:assert/strict";
import test from "node:test";
import { matchesSearch, normalizeSearch } from "../src/lib/search.ts";

const cases = [
  ["Amira Solberg", "Amira Solberg", true],
  [" solberg   AMIRA ", "Amira Solberg", true],
  ["ami sol", "Amira Solberg", true],
  ["Amria Solber", "Amira Solberg", true],
  ["Solbrexg", "Amira Solberg", true],
  ["aase bjorn", "Åse Bjørn", true],
  ["saether", "Sæther", true],
  ["amira@school.no", "Amira Solberg amira@school.no", true],
  ["+47 123 45 678", "+47 123 45 678", true],
  ["12345679", "12345678", false],
  ["ISK12346", "ISK12345", false],
  ["Per", "Pål Solberg", false],
  ["Amira Jensen", "Amira Solberg", false],
  ["zzzzzzzz", "Amira Solberg", false],
  ["", "Amira Solberg", true],
  ["%,()", "Amira Solberg", true],
  ["amira(\"solberg\")", "Amira Solberg", true],
];

for (const [query, text, expected] of cases) {
  test(`search ${JSON.stringify(query)} matches ${JSON.stringify(text)}: ${expected}`, () => {
    assert.equal(matchesSearch(query, text), expected);
  });
}

test("search normalization handles Norwegian letters and accents", () => {
  assert.equal(normalizeSearch("  ÅSE, Bjørn Sæther José  "), "ase bjorn saether jose");
});
