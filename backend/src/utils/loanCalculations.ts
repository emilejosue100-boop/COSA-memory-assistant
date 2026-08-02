export const DEFAULT_INTEREST_RATE = 0.05;

export function calculateTotalInterest(
  principal: number,
  interestRate: number,
  termMonths: number
): number {
  return principal * interestRate * termMonths;
}

export function calculateTotalOwed(
  principal: number,
  interestRate: number,
  termMonths: number
): number {
  return principal + calculateTotalInterest(principal, interestRate, termMonths);
}

export function addMonthsToDate(isoDate: string, months: number): string {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}
