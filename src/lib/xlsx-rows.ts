import { inflateRawSync } from "node:zlib";

type ZipEntry = { name: string; method: number; size: number; offset: number };

export function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function readEntries(buffer: Buffer): ZipEntry[] {
  let end = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 66000); index--) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new Error("Filen er ikke en gyldig Excel-fil.");
  const count = buffer.readUInt16LE(end + 10);
  let pointer = buffer.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(pointer + 10);
    const size = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const offset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString("utf8", pointer + 46, pointer + 46 + nameLength);
    entries.push({ name, method, size, offset });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntry(buffer: Buffer, entry: ZipEntry): string {
  const nameLength = buffer.readUInt16LE(entry.offset + 26);
  const extraLength = buffer.readUInt16LE(entry.offset + 28);
  const start = entry.offset + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + entry.size);
  if (entry.method === 0) return data.toString("utf8");
  if (entry.method === 8) return inflateRawSync(data).toString("utf8");
  throw new Error("Excel-filen bruker en komprimering som ikke støttes.");
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

function textRuns(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeXml(match[1]))
    .join("");
}

function columnIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "").toUpperCase();
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

export function readXlsxRows(bytes: Uint8Array): string[][] {
  return readXlsxSheets(bytes)[0];
}

export function readXlsxSheets(bytes: Uint8Array): string[][][] {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = readEntries(buffer);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const sheets = entries
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  if (sheets.length === 0) throw new Error("Fant ikke noe ark i Excel-filen.");

  const sharedEntry = byName.get("xl/sharedStrings.xml");
  const shared = sharedEntry
    ? [...readEntry(buffer, sharedEntry).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
        textRuns(match[1]),
      )
    : [];

  return sheets.map((sheet) => sheetRows(readEntry(buffer, sheet), shared));
}

function sheetRows(sheetXml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    let next = 0;
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const ref = attributes.match(/\br="([A-Z]+\d*)"/i)?.[1];
      const index = ref ? columnIndex(ref) : next;
      const type = attributes.match(/\bt="([^"]+)"/)?.[1];
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s" && raw != null) value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = textRuns(body);
      else if (raw != null) value = decodeXml(raw);
      while (row.length < index) row.push("");
      row[index] = value.trim();
      next = index + 1;
    }
    rows.push(row);
  }
  return rows;
}
