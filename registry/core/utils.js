let uidCount = 0;

export const uid = (prefix = "loom") => `${prefix}-${++uidCount}`;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function debounce(fn, wait = 0) {
  let timeoutId;

  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}
