// Navigation hint only. Membership and finance permissions are always checked by the server.
const key = "shypit.banking-return.v1";
export function rememberBanking(workspaceId) {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ workspaceId, expires: Date.now() + 30 * 60 * 1000 }),
    );
  } catch {}
}
export function bankingDestination() {
  try {
    const hint = JSON.parse(sessionStorage.getItem(key));
    return hint &&
      typeof hint.workspaceId === "string" &&
      hint.expires > Date.now()
      ? hint.workspaceId
      : null;
  } catch {
    return null;
  }
}
export function clearBankingDestination() {
  try {
    sessionStorage.removeItem(key);
  } catch {}
}
