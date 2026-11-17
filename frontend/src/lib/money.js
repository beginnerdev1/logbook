const PESO_INPUT =
  /^(?:[0-9]+|[1-9][0-9]{0,2}(?:,[0-9]{3})+)(?:\.[0-9]{1,2})?$/;
const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function parsePesos(input) {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== "string") {
    throw new TypeError("Peso amount must be entered as text.");
  }

  const text = input.trim();
  if (!text) return undefined;
  if (!PESO_INPUT.test(text)) {
    throw new Error("Enter a non-negative peso amount with up to 2 decimals.");
  }

  const [wholeText, decimalText = ""] = text.replaceAll(",", "").split(".");
  const centavos =
    BigInt(wholeText) * 100n + BigInt(decimalText.padEnd(2, "0"));
  if (centavos > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Peso amount is too large.");
  }

  return Number(centavos);
}

export function formatPesos(amountCentavos) {
  if (!Number.isSafeInteger(amountCentavos) || amountCentavos < 0) {
    throw new TypeError(
      "Amount must be a non-negative integer number of centavos.",
    );
  }

  return pesoFormatter.format(amountCentavos / 100);
}
