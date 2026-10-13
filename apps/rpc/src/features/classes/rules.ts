// Join codes skip look-alike characters (0/O, 1/I/L). 31^7 codes make a clash unlikely enough that one is
// left to the unique constraint.
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const newJoinCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(7)), (b) => codeAlphabet[b % codeAlphabet.length]).join("");

// What people type: case, spaces and dashes don't matter.
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[\s-]/g, "");

// "Surname, First name M.I.", as the sign-up form asks; otherwise the last word is taken as the surname.
export function splitName(name: string) {
  const [last = "", first] = name.split(/,(.*)/s).map((part) => part.trim());
  if (first) return { lastName: last, firstName: first };
  const words = name.trim().split(/\s+/);
  return words.length > 1
    ? { firstName: words.slice(0, -1).join(" "), lastName: words.at(-1)! }
    : { firstName: "", lastName: name.trim() };
}
