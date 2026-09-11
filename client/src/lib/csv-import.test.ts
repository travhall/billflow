import { describe, it, expect } from "vitest";
import { parseBillsCSV } from "./csv-import";

describe("parseBillsCSV", () => {
  it("parses a yearly bill with no interval columns as a plain annual bill", () => {
    const csv = "Name,Category,Amount,Frequency,DueDay,DueMonth\nCar Insurance,Insurance,600,yearly,15,6";
    const { valid, errors } = parseBillsCSV(csv);
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0].intervalYears).toBeUndefined();
    expect(valid[0].anchorYear).toBeUndefined();
  });

  it("parses IntervalYears/AnchorYear for a multi-year yearly bill", () => {
    const csv = "Name,Category,Amount,Frequency,DueDay,DueMonth,IntervalYears,AnchorYear\nHome Warranty,Insurance,750,yearly,1,1,3,2028";
    const { valid, errors } = parseBillsCSV(csv);
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0].intervalYears).toBe(3);
    expect(valid[0].anchorYear).toBe(2028);
  });

  it("rejects a multi-year bill missing AnchorYear", () => {
    const csv = "Name,Category,Amount,Frequency,DueDay,DueMonth,IntervalYears\nHome Warranty,Insurance,750,yearly,1,1,3";
    const { valid, errors } = parseBillsCSV(csv);
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/AnchorYear/);
  });

  it("rejects an invalid IntervalYears value", () => {
    const csv = "Name,Category,Amount,Frequency,DueDay,DueMonth,IntervalYears\nHome Warranty,Insurance,750,yearly,1,1,0";
    const { valid, errors } = parseBillsCSV(csv);
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/IntervalYears/);
  });

  it("ignores IntervalYears/AnchorYear for monthly bills", () => {
    const csv = "Name,Category,Amount,Frequency,DueDay,IntervalYears,AnchorYear\nNetflix,Subscriptions,15,monthly,5,3,2028";
    const { valid, errors } = parseBillsCSV(csv);
    expect(errors).toEqual([]);
    expect(valid[0].intervalYears).toBeUndefined();
    expect(valid[0].anchorYear).toBeUndefined();
  });

  it("treats IntervalYears of 1 as not requiring AnchorYear", () => {
    const csv = "Name,Category,Amount,Frequency,DueDay,DueMonth,IntervalYears\nCar Insurance,Insurance,600,yearly,15,6,1";
    const { valid, errors } = parseBillsCSV(csv);
    expect(errors).toEqual([]);
    expect(valid[0].intervalYears).toBe(1);
    expect(valid[0].anchorYear).toBeUndefined();
  });
});
