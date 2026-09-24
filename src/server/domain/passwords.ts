/**
 * First password for a student login: the last 6 digits of their phone number.
 * Easy to tell and remember; the student must replace it on first login.
 */
export function defaultStudentPassword(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) throw new Error("Phone number is too short for a default password.");
  return digits.slice(-6);
}

export const NEW_PASSWORD_MIN = 8;

/** Rules for a password a person chooses for themselves. Returns an error message or null. */
export function newPasswordError(password: string, phone: string): string | null {
  if (password.length < NEW_PASSWORD_MIN) return `Use at least ${NEW_PASSWORD_MIN} characters.`;
  const digits = phone.replace(/\D/g, "");
  if (digits && (password === digits || password.includes(digits.slice(-6)))) {
    return "Do not use your phone number in your password.";
  }
  if (/^(\d)\1+$/.test(password) || password === "12345678" || password.toLowerCase() === "password") {
    return "This password is too easy to guess.";
  }
  return null;
}
