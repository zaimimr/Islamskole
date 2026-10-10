import { createHash } from "node:crypto";

export type TransactionSource = "vipps" | "dnb";

export type ParsedTransaction = {
  source: TransactionSource;
  account: string;
  externalId: string;
  bookedOn: string;
  bookedAt: string | null;
  amount: number;
  currency: string;
  counterpartyName: string | null;
  counterpartyPhone: string | null;
  message: string | null;
  reference: string | null;
  pspReference: string | null;
  entryType: string | null;
  raw: Record<string, string>;
};

export type ParseResult = {
  transactions: ParsedTransaction[];
  skipped: number;
  errors: string[];
};

export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function countOutsideQuotes(line: string, char: string): number {
  let count = 0;
  let quoted = false;
  for (const current of line) {
    if (current === '"') quoted = !quoted;
    else if (current === char && !quoted) count++;
  }
  return count;
}

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 10);
  let best = ";";
  let bestScore = 0;
  for (const candidate of [";", "\t", ","]) {
    const score = Math.max(0, ...lines.map((line) => countOutsideQuotes(line, candidate)));
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function parseDelimited(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"' && field.trim() === "") {
      field = "";
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows
    .map((cells) => cells.map((cell) => cell.trim()))
    .filter((cells) => cells.some((cell) => cell !== ""));
}

export function normalizeHeader(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]/g, "");
}

export function parseAmount(value: string | null | undefined): number | null {
  if (value == null) return null;
  let text = String(value)
    .replace(/[\s  ]/g, "")
    .replace(/kr\.?|nok/gi, "")
    .replace(/−/g, "-");
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.endsWith("-")) {
    negative = !negative;
    text = text.slice(0, -1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (!/^[\d.,']+$/.test(text) || !/\d/.test(text)) return null;
  text = text.replace(/'/g, "");
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    text = text.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    const parts = text.split(",");
    text = parts.length === 2 ? parts.join(".") : parts.join("");
  } else if (lastDot >= 0) {
    const parts = text.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      text = parts.join("");
    }
  }
  const number = Number(text);
  if (!Number.isFinite(number)) return null;
  const ore = Math.round(number * 100);
  return negative ? -ore : ore;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function validDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseDate(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text));
    if (serial < 20000 || serial > 80000) return null;
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const nordic = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/);
  if (nordic) {
    const year = nordic[3].length === 2 ? 2000 + Number(nordic[3]) : Number(nordic[3]);
    return validDate(year, Number(nordic[2]), Number(nordic[1]));
  }
  return null;
}

export function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

type Columns<K extends string> = Partial<Record<K, number>>;

function findColumns<K extends string>(
  header: string[],
  aliases: Record<K, string[]>,
): Columns<K> {
  const normalized = header.map(normalizeHeader);
  const columns: Columns<K> = {};
  for (const key of Object.keys(aliases) as K[]) {
    for (const alias of aliases[key]) {
      const index = normalized.indexOf(alias);
      if (index >= 0 && !Object.values(columns).includes(index)) {
        columns[key] = index;
        break;
      }
    }
  }
  return columns;
}

function locateHeader<K extends string>(
  rows: string[][],
  aliases: Record<K, string[]>,
  required: (columns: Columns<K>) => boolean,
): { index: number; columns: Columns<K> } | null {
  for (let index = 0; index < Math.min(rows.length, 15); index++) {
    const columns = findColumns(rows[index], aliases);
    if (required(columns)) return { index, columns };
  }
  return null;
}

function cell(row: string[], index: number | undefined): string {
  return index == null ? "" : (row[index] ?? "").trim();
}

function rawRecord(header: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  header.forEach((name, index) => {
    const key = name.trim() || `kolonne${index + 1}`;
    if (row[index]) record[key] = row[index];
  });
  return record;
}

function occurrenceCounter() {
  const seen = new Map<string, number>();
  return (key: string) => {
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return count;
  };
}

const dnbAliases = {
  date: ["dato", "bokfortdato", "bokforingsdato", "transaksjonsdato", "date"],
  text: ["forklarendetekst", "forklaring", "beskrivelse", "tekst", "transaksjonstekst", "description"],
  out: ["utfrakonto", "uttak", "ut", "belopsut", "debet"],
  in: ["innpakonto", "innskudd", "inn", "belopinn", "kredit"],
  amount: ["belop", "amount", "sum"],
  valueDate: ["rentedato", "valutadato"],
  counterparty: ["motpart", "avsendermottaker", "fratil", "navn", "avsender", "mottaker"],
  message: ["melding", "kid", "meldingkid", "referanse"],
  currency: ["valuta", "currency"],
  account: ["kontonummer", "konto", "account", "accountnumber"],
  archiveReference: ["arkivref", "arkivreferanse"],
  vippsAccount: ["msnvippsnummer", "vippsnummer", "msn", "merchantserialnumber"],
};

export function parseDnbSheets(sheets: string[][][], account: string): ParseResult {
  const recognized = sheets.filter((rows) => locateDnbHeader(rows)).map((rows) => parseDnbRows(rows, account));
  if (recognized.length === 0) return parseDnbRows(sheets[0] ?? [], account);
  return {
    transactions: recognized.flatMap((result) => result.transactions),
    skipped: recognized.reduce((sum, result) => sum + result.skipped, 0),
    errors: recognized.flatMap((result) => result.errors),
  };
}

function locateDnbHeader(rows: string[][]) {
  return locateHeader(
    rows,
    dnbAliases,
    (columns) =>
      columns.date != null &&
      columns.vippsAccount == null &&
      (columns.in != null || columns.out != null || columns.amount != null),
  );
}

export function parseDnbRows(rows: string[][], account: string): ParseResult {
  const located = locateDnbHeader(rows);
  if (!located) {
    return {
      transactions: [],
      skipped: 0,
      errors: [
        "Fant ikke kolonnene i DNB-filen. Forventet blant annet «Dato», «Forklaring», «Ut fra konto» og «Inn på konto».",
      ],
    };
  }
  const { index: headerIndex, columns } = located;
  const header = rows[headerIndex];
  const nextOccurrence = occurrenceCounter();
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];
  let skipped = 0;

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const line = headerIndex + offset + 2;
    const bookedOn = parseDate(cell(row, columns.date));
    const incoming = parseAmount(cell(row, columns.in));
    const outgoing = parseAmount(cell(row, columns.out));
    const single = parseAmount(cell(row, columns.amount));
    const hasSeparateAmounts = columns.in != null || columns.out != null;
    const amount =
      incoming && incoming !== 0
        ? Math.abs(incoming)
        : outgoing && outgoing !== 0
          ? -Math.abs(outgoing)
          : hasSeparateAmounts ? 0 : single ?? 0;
    const invalidAmount = [columns.in, columns.out, ...(hasSeparateAmounts ? [] : [columns.amount])]
      .some((index) => cell(row, index) !== "" && parseAmount(cell(row, index)) == null);
    if (invalidAmount) {
      errors.push(`Linje ${line}: ugyldig beløp.`);
      return;
    }
    if (incoming && outgoing) {
      errors.push(`Linje ${line}: beløp i både «Inn» og «Ut».`);
      return;
    }
    if (!bookedOn) {
      if (row.some((value) => /\d/.test(value)) && amount !== 0) {
        errors.push(`Linje ${line}: ugyldig dato «${cell(row, columns.date)}»`);
      } else {
        skipped++;
      }
      return;
    }
    if (amount === 0) {
      skipped++;
      return;
    }
    const rowAccount = cell(row, columns.account).replace(/[\s.]/g, "") || account;
    if (!/^\d{11}$/.test(rowAccount)) {
      errors.push(`Linje ${line}: mangler gyldig kontonummer med 11 siffer.`);
      return;
    }
    const text = cell(row, columns.text).replace(/\s+/g, " ");
    const archiveReference = cell(row, columns.archiveReference).replace(/\.0+$/, "");
    const reference = cell(row, columns.message);
    const key = `${bookedOn}|${amount}|${text.toLowerCase()}${archiveReference ? `|${archiveReference}|${reference}` : ""}`;
    const occurrence = nextOccurrence(`${rowAccount}|${key}`);
    transactions.push({
      source: "dnb",
      account: rowAccount,
      externalId: `dnb:${shortHash(`${key}|${occurrence}`)}`,
      bookedOn,
      bookedAt: null,
      amount,
      currency: cell(row, columns.currency).toUpperCase() || "NOK",
      counterpartyName: cell(row, columns.counterparty) || null,
      counterpartyPhone: null,
      message: [text, cell(row, columns.message)].filter(Boolean).join(" · ") || null,
      reference: reference || null,
      pspReference: null,
      entryType: amount > 0 ? "inn" : "ut",
      raw: rawRecord(header, row),
    });
  });

  return { transactions, skipped, errors };
}

const vippsAliases = {
  date: [
    "dato",
    "salgsdato",
    "transaksjonsdato",
    "betalingsdato",
    "tidspunkt",
    "tid",
    "date",
    "salesdate",
    "transactiondate",
    "time",
    "timestamp",
    "created",
    "opprettet",
  ],
  settlementDate: [
    "oppgjorsdato",
    "settlementdate",
    "ledgerdate",
    "utbetalingsdato",
    "bookingdate",
  ],
  amount: [
    "belop",
    "bruttobelop",
    "brutto",
    "amount",
    "grossamount",
    "gross",
    "totalt",
    "sum",
    "belopnok",
  ],
  name: ["navn", "kundenavn", "kunde", "betaler", "avsender", "name", "customername", "customer"],
  phone: [
    "telefonnummer",
    "telefon",
    "mobilnummer",
    "mobil",
    "phonenumber",
    "phone",
    "maskedphoneno",
    "mobilenumber",
    "customerphonenumber",
  ],
  message: ["melding", "kommentar", "message", "beskrivelse", "description", "tekst"],
  reference: [
    "ordreid",
    "ordrenummer",
    "ordrenr",
    "ordre",
    "referanse",
    "orderid",
    "reference",
    "orderidreference",
  ],
  psp: [
    "transaksjonsid",
    "transaksjonsnummer",
    "transaksjonsnr",
    "transactionid",
    "pspreference",
    "betalingsid",
  ],
  type: ["transaksjonstype", "type", "transactiontype", "entrytype", "hendelse"],
  account: [
    "msn",
    "msnvippsnumber",
    "vippsnumber",
    "vippsnummer",
    "salgsstednummer",
    "salgsenhetsnummer",
    "merchantserialnumber",
    "salesunitnumber",
    "recipienthandle",
  ],
  status: ["status", "state"],
  currency: ["valuta", "currency"],
};

const skippedVippsTypes =
  /gebyr|fee|utbetal|payout|oppgjor|settlement|top-?up|credit-?note|korreksjon|correction/;
const refundVippsTypes = /refu|tilbake|retur|return/;
const failedVippsStatus = /avbrutt|avvist|feil|kansell|cancel|fail|reject|expire|utlop|reservert|authori/;

function vippsKind(type: string, amount: number): "capture" | "refund" | null {
  const normalized = normalizeHeader(type);
  if (normalized && skippedVippsTypes.test(normalized)) return null;
  if (amount < 0 || refundVippsTypes.test(normalized)) return "refund";
  return "capture";
}

function msnFrom(value: string): string | null {
  const digits = value.replace(/^[A-Za-z]+:/, "").replace(/\D/g, "");
  return digits.length >= 4 ? digits : null;
}

export function vippsExternalId(
  kind: "capture" | "refund",
  pspReference: string | null,
  reference: string | null,
  fallback: string,
): string {
  if (pspReference) return `psp:${pspReference}:${kind}`;
  if (reference) return `ref:${reference}:${kind}`;
  return `hash:${shortHash(fallback)}`;
}

export function parseVippsRows(rows: string[][], fallbackAccount: string | null): ParseResult {
  const located = locateHeader(
    rows,
    vippsAliases,
    (columns) =>
      (columns.date != null || columns.settlementDate != null) && columns.amount != null,
  );
  if (!located) {
    return {
      transactions: [],
      skipped: 0,
      errors: [
        "Fant ikke kolonnene i Vipps-filen. Forventet minst en dato-kolonne og en beløp-kolonne.",
      ],
    };
  }
  const { index: headerIndex, columns } = located;
  const header = rows[headerIndex];
  const nextOccurrence = occurrenceCounter();
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];
  let skipped = 0;

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const line = headerIndex + offset + 2;
    const rawAmount = parseAmount(cell(row, columns.amount));
    const bookedOn =
      parseDate(cell(row, columns.date)) ?? parseDate(cell(row, columns.settlementDate));
    if (rawAmount == null || rawAmount === 0) {
      skipped++;
      return;
    }
    if (!bookedOn) {
      errors.push(`Linje ${line}: ugyldig dato «${cell(row, columns.date)}»`);
      return;
    }
    const status = normalizeHeader(cell(row, columns.status));
    if (status && failedVippsStatus.test(status)) {
      skipped++;
      return;
    }
    const kind = vippsKind(cell(row, columns.type), rawAmount);
    if (!kind) {
      skipped++;
      return;
    }
    const account = msnFrom(cell(row, columns.account)) ?? fallbackAccount;
    if (!account) {
      errors.push(`Linje ${line}: mangler Vippsnummer. Velg salgssted før du laster opp.`);
      return;
    }
    const amount = kind === "refund" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    const name = cell(row, columns.name) || null;
    const message = cell(row, columns.message) || null;
    const reference = cell(row, columns.reference) || null;
    const pspReference = cell(row, columns.psp) || null;
    const key = `${account}|${bookedOn}|${amount}|${name ?? ""}|${message ?? ""}`;
    const occurrence = nextOccurrence(key);
    transactions.push({
      source: "vipps",
      account,
      externalId: vippsExternalId(kind, pspReference, reference, `${key}|${occurrence}`),
      bookedOn,
      bookedAt: null,
      amount,
      currency: cell(row, columns.currency).toUpperCase() || "NOK",
      counterpartyName: name,
      counterpartyPhone: cell(row, columns.phone) || null,
      message,
      reference,
      pspReference,
      entryType: kind,
      raw: rawRecord(header, row),
    });
  });

  return { transactions, skipped, errors };
}

export type VippsFundsItem = {
  pspReference?: string;
  time?: string;
  ledgerDate?: string;
  entryType?: string;
  reference?: string;
  currency?: string;
  amount?: number;
  recipientHandle?: string;
  message?: string;
  name?: string;
  maskedPhoneNo?: string;
};

export function vippsFundsItemToTransaction(item: VippsFundsItem, msn: string): ParsedTransaction | null {
  const kind =
    item.entryType === "capture" ? "capture" : item.entryType === "refund" ? "refund" : null;
  if (!kind || !item.amount || !item.ledgerDate) return null;
  const amount = kind === "refund" ? -Math.abs(item.amount) : Math.abs(item.amount);
  const handleMsn = item.recipientHandle?.replace(/\D/g, "");
  return {
    source: "vipps",
    account: handleMsn || msn,
    externalId: vippsExternalId(
      kind,
      item.pspReference ?? null,
      item.reference ?? null,
      JSON.stringify(item),
    ),
    bookedOn: item.ledgerDate,
    bookedAt: item.time ?? null,
    amount,
    currency: item.currency ?? "NOK",
    counterpartyName: item.name?.trim() || null,
    counterpartyPhone: item.maskedPhoneNo?.trim() || null,
    message: item.message?.trim() || null,
    reference: item.reference ?? null,
    pspReference: item.pspReference ?? null,
    entryType: kind,
    raw: Object.fromEntries(
      Object.entries(item).map(([key, value]) => [key, String(value ?? "")]),
    ),
  };
}
