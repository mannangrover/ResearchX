// Account rules, shared by the sign-up, login and account forms.
export const PASSWORD_RULES = [
  ["At least 8 characters", (p) => p.length >= 8],
  ["A capital letter", (p) => /\p{Lu}/u.test(p)],
  ["A lowercase letter", (p) => /\p{Ll}/u.test(p)],
  ["A number", (p) => /\d/.test(p)],
  ["A symbol, like ! @ # $", (p) => /[^\p{L}\p{N}\s]/u.test(p)],
];

export const emailError = (email) =>
  /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.\p{L}{2,}$/u.test(email.trim()) ? "" : "Enter a real email address, like name@university.edu.";

export const nameError = (name) => {
  const clean = name.trim();
  if (!/^\p{L}[\p{L}\p{M} .'’-]*$/u.test(clean) || clean.replace(/[^\p{L}]/gu, "").length < 2) {
    return "Enter your real name, using letters only.";
  }
  return "";
};

export const passwordError = (password) =>
  PASSWORD_RULES.every(([, ok]) => ok(password)) ? "" : "Choose a password that meets all the rules below.";
