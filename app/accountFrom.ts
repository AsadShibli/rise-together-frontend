// Email wins when both boxes are filled. Phone is used only when email is blank.
export function accountFrom(data: FormData) {
  const email = String(data.get("email") ?? "").trim();
  const phone = String(data.get("phone") ?? "").trim();
  const password = data.get("password");
  if (email) return { email, password };
  return { phone, password };
}
