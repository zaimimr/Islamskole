export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function matchesWord(term: string, word: string): boolean {
  if (word.includes(term)) return true;
  if (term.length < 4 || /\d/.test(term)) return false;
  const tolerance = term.length >= 8 ? 2 : 1;
  if (Math.abs(term.length - word.length) > tolerance) return false;
  let previous = Array.from({ length: word.length + 1 }, (_, index) => index);
  let beforePrevious = previous;
  for (let row = 1; row <= term.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= word.length; column += 1) {
      const cost = term[row - 1] === word[column - 1] ? 0 : 1;
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + cost,
      );
      if (
        row > 1 && column > 1 &&
        term[row - 1] === word[column - 2] &&
        term[row - 2] === word[column - 1]
      ) {
        current[column] = Math.min(current[column], beforePrevious[column - 2] + 1);
      }
    }
    beforePrevious = previous;
    previous = current;
  }
  return previous[word.length] <= tolerance;
}

export function matchesSearch(query: string, text: string): boolean {
  const terms = normalizeSearch(query.slice(0, 120)).split(" ").filter(Boolean);
  if (terms.length === 0) return true;
  const normalized = normalizeSearch(text);
  const words = normalized.split(" ");
  return terms.every((term) =>
    normalized.includes(term) || words.some((word) => matchesWord(term, word)),
  );
}
