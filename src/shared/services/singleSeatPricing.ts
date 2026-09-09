export type SingleSeatQuote = {
  baseFare: number;
  addOnTotal: number;
  discountAmount: number;
  amountDue: number;
};

export const roundJpy = (value: number) => Math.floor(value + 0.5);

export function singleSeatQuote(input: {
  unitPrice: number;
  seats: number;
  discountPercent?: number;
  addOnTotal?: number;
}): SingleSeatQuote {
  const { unitPrice, seats, discountPercent = 0, addOnTotal = 0 } = input;
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0 || !Number.isSafeInteger(seats) || seats < 1 || !Number.isSafeInteger(addOnTotal) || addOnTotal < 0 || !Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new RangeError("invalid single-seat quote input");
  }
  const baseFare = unitPrice * seats;
  const discountAmount = roundJpy(unitPrice * discountPercent / 100);
  return { baseFare, addOnTotal, discountAmount, amountDue: baseFare + addOnTotal - discountAmount };
}
