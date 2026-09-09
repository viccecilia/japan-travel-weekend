import { describe, expect, it } from "vitest";
import { roundJpy, singleSeatQuote } from "./singleSeatPricing";

describe("single-seat coupon pricing", () => {
  it.each([[10,700,41300],[30,2100,39900],[50,3500,38500],[100,7000,35000]])("discounts one of six seats at %i%%",(discountPercent,discountAmount,amountDue)=>{
    expect(singleSeatQuote({unitPrice:7000,seats:6,discountPercent})).toEqual({baseFare:42000,addOnTotal:0,discountAmount,amountDue});
  });
  it("creates a zero balance only for the covered seat",()=>expect(singleSeatQuote({unitPrice:7000,seats:1,discountPercent:100}).amountDue).toBe(0));
  it("does not discount add-ons",()=>expect(singleSeatQuote({unitPrice:7000,seats:1,discountPercent:100,addOnTotal:1000}).amountDue).toBe(1000));
  it("rounds an exact half yen upward",()=>expect(roundJpy(0.5)).toBe(1));
});
