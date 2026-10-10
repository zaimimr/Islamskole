import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import {
  decodeText,
  detectStatementSource,
  detectDelimiter,
  parseAmount,
  parseDate,
  parseDelimited,
  parseDnbRows,
  parseDnbSheets,
  parseVippsRows,
  vippsFundsItemToTransaction,
} from "../src/lib/bank-statement.ts";
import { isZip, readXlsxRows, readXlsxSheets } from "../src/lib/xlsx-rows.ts";
import {
  findPaymentMatch,
  matchAll,
  parseMsnList,
  phonesMatch,
  suggestStatus,
} from "../src/lib/reconciliation-match.ts";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

test("amounts in Norwegian and English formats become signed øre", () => {
  assert.equal(parseAmount("2 500,00"), 250000);
  assert.equal(parseAmount("12.340,50"), 1234050);
  assert.equal(parseAmount("1,234.50"), 123450);
  assert.equal(parseAmount("-500,00"), -50000);
  assert.equal(parseAmount("− 75,5"), -7550);
  assert.equal(parseAmount("(100,00)"), -10000);
  assert.equal(parseAmount("kr 1 000"), 100000);
  assert.equal(parseAmount("12.500"), 1250000);
  assert.equal(parseAmount("249.9"), 24990);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("abc"), null);
});

test("dates in common export formats", () => {
  assert.equal(parseDate("01.09.2026"), "2026-09-01");
  assert.equal(parseDate("1.9.26"), "2026-09-01");
  assert.equal(parseDate("2026-09-07T10:15:00Z"), "2026-09-07");
  assert.equal(parseDate("07/09/2026 10:15"), "2026-09-07");
  assert.equal(parseDate("46266"), "2026-09-01");
  assert.equal(parseDate("31.02.2026"), null);
  assert.equal(parseDate("Saldo"), null);
});

test("text decoding handles BOM and Windows-1252", () => {
  const latin = Uint8Array.from([0x49, 0x6e, 0x6e, 0x20, 0x70, 0xe5, 0x20, 0x6b, 0x6f, 0x6e, 0x74, 0x6f]);
  assert.equal(decodeText(latin), "Inn på konto");
  const bom = Uint8Array.from([0xef, 0xbb, 0xbf, ...Buffer.from("Dato;Beløp")]);
  assert.equal(decodeText(bom), "Dato;Beløp");
});

test("delimited parser keeps quoted delimiters and newlines", () => {
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ";");
  assert.equal(detectDelimiter('a,b\n"1,5",2'), ",");
  assert.deepEqual(parseDelimited('a;b\n"x;y";"line\nbreak"\n\n"q""uote";2'), [
    ["a", "b"],
    ["x;y", "line\nbreak"],
    ['q"uote', "2"],
  ]);
});

test("DNB export parses in and out lines with stable ids", () => {
  const rows = parseDelimited(decodeText(fixture("dnb-export.csv")));
  const result = parseDnbRows(rows, "12345678901");
  assert.equal(result.errors.length, 0);
  assert.equal(result.transactions.length, 5);
  const [school, payout, rent, giftA, giftB] = result.transactions;
  assert.equal(school.amount, 250000);
  assert.equal(school.bookedOn, "2026-09-01");
  assert.equal(school.account, "12345678901");
  assert.equal(payout.amount, 1234050);
  assert.equal(rent.amount, -800000);
  assert.equal(giftA.amount, 50000);
  assert.notEqual(giftA.externalId, giftB.externalId);
  assert.match(giftA.externalId, /^dnb:[0-9a-f]{32}$/);

  const again = parseDnbRows(rows, "12345678901");
  assert.deepEqual(
    again.transactions.map((row) => row.externalId),
    result.transactions.map((row) => row.externalId),
  );
});

test("DNB export in Windows-1252 with preamble lines still finds the header", () => {
  const text = `Kontoutskrift\r\nKonto 1234.56.78901\r\n${decodeText(fixture("dnb-export.csv"))}`;
  const bytes = Uint8Array.from([...text].map((char) => char.charCodeAt(0)));
  const decoded = decodeText(bytes);
  assert.match(decoded, /Overføring/);
  const result = parseDnbRows(parseDelimited(decoded), "12345678901");
  assert.equal(result.transactions.length, 5);
});

test("DNB file without known columns gives a clear error", () => {
  const result = parseDnbRows([["Navn", "Telefon"], ["Ola", "123"]], "12345678901");
  assert.equal(result.transactions.length, 0);
  assert.match(result.errors[0], /Fant ikke kolonnene/);
});

const dnbHeader = [
  "Kontonummer", "Kontonavn", "Valuta", "Bokført-dato", "Forklarende tekst",
  "Status", "Transaksjonstype", "Rentedato", "Ut", "Inn", "Arkivref.", "Referanse",
];

const dnbRow = (overrides = {}) => {
  const row = ["1234.56.78901", "Skole", "NOK", "46266", "VIPPS MOBILEPAY AS", "B", "Overføring", "46266", "", "98.25", "123456789", ""];
  for (const [index, value] of Object.entries(overrides)) row[index] = value;
  return row;
};

test("DNB kontoinfo finds its header after the account list and keeps bank descriptions", () => {
  const rows = [
    ["Konto", "Kontonavn"],
    ...Array.from({ length: 8 }, () => ["1234.56.78901", "Skole"]),
    dnbHeader,
    dnbRow(),
    dnbRow({ 3: "46267.0", 4: "Husleie", 8: "-194.5", 9: "", 10: "123456790" }),
  ];
  const parsed = parseDnbRows(rows, "");
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.transactions.length, 2);
  assert.equal(parsed.transactions[0].account, "12345678901");
  assert.equal(parsed.transactions[0].message, "VIPPS MOBILEPAY AS");
  assert.equal(suggestStatus(parsed.transactions[0]).status, "ignorert");
  assert.equal(parsed.transactions[1].amount, -19450);
});

test("DNB workbook uses bank amounts, skips manual rows and reports malformed bank rows", () => {
  const rows = [
    [...dnbHeader, "Beløp", "Beskrivelse"],
    [...dnbRow(), "9999", "Manuell beskrivelse"],
    [...dnbRow({ 0: "", 3: "", 4: "", 9: "", 10: "" }), "500", "Manuell Vipps-rad"],
    dnbRow({ 3: "" }),
    dnbRow({ 9: "ugyldig" }),
    dnbRow({ 8: "100" }),
  ];
  const parsed = parseDnbRows(rows, "");
  assert.equal(parsed.transactions.length, 1);
  assert.equal(parsed.transactions[0].amount, 9825);
  assert.equal(parsed.transactions[0].message, "VIPPS MOBILEPAY AS");
  assert.equal(parsed.skipped, 1);
  assert.equal(parsed.errors.length, 3);
  assert.match(parsed.errors[0], /ugyldig dato/);
  assert.match(parsed.errors[1], /ugyldig beløp/);
  assert.match(parsed.errors[2], /både/);
});

test("DNB sheets exclude larger Vipps reports and include every bank sheet", () => {
  const vipps = [
    ["MSN/Vippsnummer", "Bokføringsdato", "Beløp", "PSP-referanse"],
    ...Array.from({ length: 10 }, () => ["60206", "46266", "200", "123"]),
  ];
  const parsed = parseDnbSheets([
    [["Navn", "Saldo"], ["Skole", "9999"]],
    vipps,
    [dnbHeader, dnbRow()],
    [dnbHeader, dnbRow({ 0: "9876.54.32109" })],
    [dnbHeader, dnbRow({ 9: "feil" })],
  ], "11111111111");
  assert.equal(parsed.transactions.length, 2);
  assert.deepEqual(parsed.transactions.map((row) => row.account), ["12345678901", "98765432109"]);
  assert.equal(parsed.errors.length, 1);
  assert.match(parsed.errors[0], /ugyldig beløp/);
  assert.equal(parseDnbSheets([vipps], "11111111111").transactions.length, 0);
  assert.match(parseDnbSheets([], "").errors[0], /Fant ikke kolonnene/);
});

test("DNB archive references keep overlapping and reordered exports deduplicated", () => {
  const first = dnbRow({ 4: "Giro skolepenger", 11: "1234" });
  const second = dnbRow({ 4: "Giro skolepenger", 10: "123456790", 11: "1234" });
  const parsed = parseDnbRows([dnbHeader, first, second], "");
  const reordered = parseDnbRows([dnbHeader, second, first], "");
  assert.notEqual(parsed.transactions[0].externalId, parsed.transactions[1].externalId);
  assert.deepEqual(reordered.transactions.map((row) => row.externalId), parsed.transactions.map((row) => row.externalId).reverse());
  assert.equal(parseDnbRows([dnbHeader, second], "").transactions[0].externalId, parsed.transactions[1].externalId);
  assert.equal(parseDnbRows([dnbHeader, dnbRow({ 10: "123456789.0", 4: "Giro skolepenger", 11: "1234" })], "").transactions[0].externalId, parsed.transactions[0].externalId);
  assert.equal(parsed.transactions[0].reference, "1234");
});

test("DNB accounts must be in the file or supplied as a fallback", () => {
  const header = ["Dato", "Forklaring", "Beløp"];
  const row = ["01.09.2026", "Giro", "200"];
  assert.match(parseDnbRows([header, row], "").errors[0], /kontonummer/);
  assert.equal(parseDnbRows([header, row], "12345678901").transactions[0].amount, 20000);
  assert.match(parseDnbRows([dnbHeader, dnbRow({ 0: "ugyldig" })], "12345678901").errors[0], /kontonummer/);
});

test("mixed XLSX workbook and Windows-1252 kontoinfo export share transaction identities", () => {
  const workbook = parseDnbSheets(readXlsxSheets(fixture("dnb-workbook.xlsx")), "");
  const text = parseDnbRows(parseDelimited(decodeText(fixture("dnb-kontoinfo.txt"))), "");
  assert.equal(workbook.transactions.length, 3);
  assert.equal(workbook.skipped, 1);
  assert.equal(workbook.errors.length, 1);
  assert.deepEqual(workbook.transactions.map((row) => row.amount), [250000, -7550, 20000]);
  assert.equal(text.transactions.length, 1);
  assert.equal(workbook.transactions[0].externalId, text.transactions[0].externalId);
});

test("statement detection prefers bank tables in mixed workbooks and detects Vipps exports", () => {
  assert.equal(detectStatementSource(readXlsxSheets(fixture("dnb-workbook.xlsx"))), "dnb");
  assert.equal(detectStatementSource([parseDelimited(decodeText(fixture("dnb-kontoinfo.txt")))]), "dnb");
  assert.equal(detectStatementSource([parseDelimited(decodeText(fixture("vipps-portal-export.csv")))]), "vipps");
  assert.equal(detectStatementSource([[["Dato", "Beløp"], ["01.09.2026", "200"]]]), "ambiguous");
  assert.equal(detectStatementSource([[["Navn", "Telefon"]]]), null);
});

test("missing statement accounts are explicit and a fallback resolves them", () => {
  const dnb = [["Dato", "Inn på konto"], ["01.09.2026", "200"]];
  const vipps = [["Date", "Amount", "PSP Reference"], ["01.09.2026", "200", "123"]];
  assert.equal(parseDnbRows(dnb, "").missingAccount, true);
  assert.equal(parseVippsRows(vipps, null).missingAccount, true);
  assert.equal(parseDnbRows(dnb, "12345678901").missingAccount, false);
  assert.equal(parseVippsRows(vipps, "60206").missingAccount, false);
});

test("Vipps portal export keeps captures and refunds, skips failed and fees", () => {
  const rows = parseDelimited(decodeText(fixture("vipps-portal-export.csv")));
  const result = parseVippsRows(rows, null);
  assert.equal(result.errors.length, 0);
  assert.equal(result.skipped, 2);
  assert.equal(result.transactions.length, 4);
  const [donation, school, web, refund] = result.transactions;
  assert.equal(donation.account, "60206");
  assert.equal(donation.amount, 20000);
  assert.equal(donation.counterpartyName, "Fatima Ali");
  assert.equal(donation.counterpartyPhone, "xxxx 1234");
  assert.equal(donation.externalId, "psp:3001000001:capture");
  assert.equal(school.account, "610090");
  assert.equal(school.amount, 500000);
  assert.equal(web.reference, "isk-abc123");
  assert.equal(refund.amount, -50000);
  assert.equal(refund.externalId, "psp:3001000004:refund");
});

test("Vipps export without account column uses the chosen account", () => {
  const rows = [
    ["Date", "Name", "Amount", "Message"],
    ["2026-09-05", "Ali", "150.00", "Gave"],
  ];
  assert.equal(parseVippsRows(rows, null).errors.length, 1);
  const result = parseVippsRows(rows, "60206");
  assert.equal(result.transactions[0].account, "60206");
  assert.equal(result.transactions[0].amount, 15000);
  assert.match(result.transactions[0].externalId, /^hash:/);
});

function buildXlsx(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(content));
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, ...centrals, end]));
}

test("XLSX export is read with shared strings, inline strings and date serials", () => {
  const bytes = buildXlsx({
    "xl/sharedStrings.xml":
      '<sst><si><t>Dato</t></si><si><t>Forklaring</t></si><si><t>Inn på konto</t></si><si><r><t>Giro </t></r><r><t>Ali &amp; Co</t></r></si></sst>',
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2"><v>46266</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>750.5</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>02.09.2026</t></is></c><c r="C3"><v>100</v></c></row></sheetData></worksheet>',
  });
  assert.equal(isZip(bytes), true);
  const rows = readXlsxRows(bytes);
  assert.deepEqual(rows[1], ["46266", "Giro Ali & Co", "750.5"]);
  assert.deepEqual(rows[2], ["02.09.2026", "", "100"]);
  const result = parseDnbRows(rows, "12345678901");
  assert.equal(result.transactions.length, 2);
  assert.equal(result.transactions[0].bookedOn, "2026-09-01");
  assert.equal(result.transactions[0].amount, 75050);
});

test("XLSX keeps empty rows so DNB errors use the correct Excel row", () => {
  const bytes = buildXlsx({
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Dato</t></is></c><c r="B1" t="inlineStr"><is><t>Inn</t></is></c></row><row r="2"><c r="A2"/></row><row r="3"><c r="A3"><v>46266</v></c><c r="B3" t="inlineStr"><is><t>feil</t></is></c></row></sheetData></worksheet>',
  });
  const parsed = parseDnbRows(readXlsxRows(bytes), "12345678901");
  assert.equal(parsed.skipped, 1);
  assert.equal(parsed.errors[0], "Linje 3: ugyldig beløp.");
});

const tx = (overrides = {}) => ({
  source: "vipps",
  account: "610090",
  amount: 500000,
  bookedOn: "2026-09-06",
  counterpartyPhone: null,
  message: null,
  reference: null,
  pspReference: null,
  ...overrides,
});

const payment = (overrides = {}) => ({
  id: "p1",
  reference: "isk-abc123",
  pspReference: null,
  amount: 500000,
  paidOn: "2026-09-06",
  payerPhone: null,
  ...overrides,
});

test("suggestions: donation account is sadaqa, Vipps payouts in DNB are ignored", () => {
  assert.equal(suggestStatus(tx({ account: "60206" }))?.status, "sadaqa");
  assert.equal(suggestStatus(tx({ account: "610090" })), null);
  assert.equal(suggestStatus(tx({ amount: -100 }))?.status, "ignorert");
  assert.equal(
    suggestStatus(tx({ source: "dnb", account: "12345678901", message: "VIPPS MOBILEPAY AS" }))?.status,
    "ignorert",
  );
  assert.equal(suggestStatus(tx({ source: "dnb", amount: -800000, message: "Husleie" }))?.status, "ignorert");
  assert.equal(suggestStatus(tx({ source: "dnb", message: "Giro Kari" })), null);
});

test("match on Vipps reference, then transaction id", () => {
  assert.deepEqual(findPaymentMatch(tx({ reference: "isk-abc123" }), [payment()]), {
    paymentId: "p1",
    reason: "Samme Vipps-referanse",
  });
  assert.equal(
    findPaymentMatch(tx({ pspReference: "999" }), [payment({ pspReference: "999", amount: 1 })])?.paymentId,
    "p1",
  );
  assert.equal(findPaymentMatch(tx({ reference: "isk-abc123", amount: -100 }), [payment()]), null);
});

test("match on amount, date and phone only when exactly one payment fits", () => {
  const candidates = [
    payment({ id: "a", reference: "manual-1", payerPhone: "+47 912 35 678" }),
    payment({ id: "b", reference: "manual-2", payerPhone: "+47 400 00 000" }),
  ];
  assert.equal(findPaymentMatch(tx({ counterpartyPhone: "xxxx 5678" }), candidates)?.paymentId, "a");
  assert.equal(findPaymentMatch(tx({ counterpartyPhone: "xxxx 5678", bookedOn: "2026-09-07" }), candidates), null);
  assert.equal(
    findPaymentMatch(tx({ counterpartyPhone: "xxxx 5678" }), [
      ...candidates,
      payment({ id: "c", reference: "manual-3", payerPhone: "4791235678" }),
    ]),
    null,
  );
  assert.equal(findPaymentMatch(tx({ counterpartyPhone: "xxxx 5678" }), candidates, new Set(["a"])), null);
});

test("matchAll never uses one payment twice", () => {
  const result = matchAll(
    [
      { id: "t1", ...tx({ reference: "isk-abc123" }) },
      { id: "t2", ...tx({ reference: "isk-abc123" }) },
    ],
    [payment()],
  );
  assert.equal(result.size, 1);
  assert.equal(result.get("t1")?.paymentId, "p1");
  assert.equal(matchAll([{ id: "t1", ...tx({ reference: "isk-abc123" }) }], [payment()], ["p1"]).size, 0);
});

test("phone comparison and MSN list parsing", () => {
  assert.equal(phonesMatch("4791234567", "91234567"), true);
  assert.equal(phonesMatch("xx", "91234567"), false);
  assert.deepEqual(parseMsnList(""), ["60206", "1111805"]);
  assert.deepEqual(parseMsnList(" 60206; 610090,60206 "), ["60206", "610090"]);
});

test("Vipps Report API items map to the same ids as portal exports", () => {
  const capture = vippsFundsItemToTransaction(
    {
      pspReference: "3001000003",
      time: "2026-09-07T08:15:00.000000Z",
      ledgerDate: "2026-09-07",
      entryType: "capture",
      reference: "isk-abc123",
      currency: "NOK",
      amount: 200000,
      recipientHandle: "NO:1111805",
      name: "Sara Ahmed",
      maskedPhoneNo: "xxxx 9012",
    },
    "1111805",
  );
  assert.equal(capture?.externalId, "psp:3001000003:capture");
  assert.equal(capture?.account, "1111805");
  assert.equal(capture?.amount, 200000);
  assert.equal(capture?.reference, "isk-abc123");
  const portal = parseVippsRows(parseDelimited(decodeText(fixture("vipps-portal-export.csv"))), null);
  assert.equal(portal.transactions[2].externalId, capture?.externalId);

  const refund = vippsFundsItemToTransaction(
    { pspReference: "9", ledgerDate: "2026-09-08", entryType: "refund", amount: -5000 },
    "610090",
  );
  assert.equal(refund?.amount, -5000);
  assert.equal(refund?.externalId, "psp:9:refund");
  assert.equal(
    vippsFundsItemToTransaction({ ledgerDate: "2026-09-08", entryType: "payout-scheduled", amount: -100 }, "610090"),
    null,
  );
});

test("vipps settlement report transaction sheet keeps captures and refunds per sales unit", () => {
  const header = [
    "Sales unit",
    "MSN/Vipps number",
    "Country",
    "Payment solution",
    "Time",
    "Booking date",
    "Type",
    "Amount",
    "Balance",
    "Fee",
    "Net amount",
    "Currency",
    "Customer name",
    "Customer phone number",
    "Message",
    "Category",
    "PSP reference",
    "Order ID/Reference",
  ];
  const rows = [
    header,
    ["Islamskole Elevbetaling", "610090", "Norway", "Open amount", "2026-08-31 09:53:00", "2026-08-31", "Capture", "4000.00", "4000.00", "-70.00", "3930.00", "NOK", "Ola Nordmann", "+47 xxxx 8586", "Inaya, Aimen", "", "111", "222"],
    ["Islamskole Elevbetaling", "610090", "Norway", "", "2026-09-01 00:10:00", "2026-08-31", "Fees retained", "-70.00", "3930.00", "", "", "NOK", "", "", "", "", "21630-20260831", ""],
    ["Islamskole Elevbetaling", "610090", "Norway", "", "2026-09-01 00:10:00", "2026-08-31", "Payout scheduled", "-3930.00", "0.00", "", "", "NOK", "", "", "", "", "21630-2000400", "Utb. 2000400 Vippsnr 610090"],
    ["Islamskole web", "1111805", "Norway", "Recurring", "2026-08-22 15:54:00", "2026-08-22", "Refund", "-10000.00", "0.00", "", "", "NOK", "", "", "", "", "333", "444"],
  ];
  const result = parseVippsRows(rows, null);
  assert.equal(result.errors.length, 0);
  assert.equal(result.skipped, 2);
  assert.deepEqual(
    result.transactions.map((t) => [t.account, t.entryType, t.amount, t.counterpartyPhone, t.reference]),
    [
      ["610090", "capture", 400000, "+47 xxxx 8586", "222"],
      ["1111805", "refund", -1000000, null, "444"],
    ],
  );
});
