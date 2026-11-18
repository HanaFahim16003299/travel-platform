// ACC-01 / ACC-08: CHECK these rules against the Excel sheet and adjust.
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,64}$/;
export const PASSWORD_MESSAGE =
  "Password must be 8-64 characters and include upper case, lower case and a number";
