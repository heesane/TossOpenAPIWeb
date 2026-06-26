export function toNumber(value: string | number | null | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function toPercent(value: string | number | null | undefined) {
  return toNumber(value) * 100;
}
