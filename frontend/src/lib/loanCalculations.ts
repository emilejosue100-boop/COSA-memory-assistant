export const DEFAULT_INTEREST_RATE = 0.05;

export function calculateTotalInterest(
  principal: number,
  interestRate: number,
  termMonths: number
): number {
  return principal * interestRate * termMonths;
}

export function calculateTotalOwed(
  principalUsd: number,
  interestRate: number,
  termMonths: number
): number {
  return principalUsd + calculateTotalInterest(principalUsd, interestRate, termMonths);
}
