import { initialShipments, loads } from "./demo-data.js";
export async function installAuthMock(page, options = {}) {
  const state = {
    emailOtpEnabled: true,
    role: "business",
    member: true,
    badCode: false,
    failSave: false,
    revision: 0,
    data: structuredClone({ shipments: initialShipments, loads, jobs: [] }),
    ...options,
  };
  await page.route("**/auth-config.json", (route) =>
    route.fulfill({
      json: {
        url: "https://auth.shypit.test",
        publicKey: "sb_publishable_test",
        emailOtpEnabled: state.emailOtpEnabled,
      },
    }),
  );
  await page.route("https://auth.shypit.test/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    if (path === "/auth/v1/otp") return route.fulfill({ json: {} });
    if (path === "/auth/v1/verify" || path === "/auth/v1/token")
      return state.badCode
        ? route.fulfill({ status: 400, json: { error: "invalid code" } })
        : route.fulfill({
            json: {
              access_token: "test-valid-access",
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            },
          });
    if (request.headers().authorization !== "Bearer test-valid-access")
      return route.fulfill({ status: 401, json: { error: "unauthorized" } });
    if (path === "/auth/v1/logout") return route.fulfill({ status: 204 });
    if (path === "/auth/v1/user")
      return route.fulfill({
        json: {
          id: "11111111-1111-4111-8111-111111111111",
          email: state.role + "@example.test",
        },
      });
    if (path === "/rest/v1/memberships")
      return route.fulfill({
        json: state.member
          ? [
              {
                workspace_id: "22222222-2222-4222-8222-222222222222",
                role: state.role,
                display_name:
                  state.role === "business"
                    ? "Acme Supply Co."
                    : "Jordan Miller",
              },
            ]
          : [],
      });
    if (path === "/rest/v1/workspaces") {
      if (!state.member)
        return route.fulfill({ status: 403, json: { error: "denied" } });
      if (request.method() === "PATCH") {
        if (state.failSave)
          return route.fulfill({ status: 403, json: { error: "denied" } });
        if (url.searchParams.get("revision") !== "eq." + state.revision)
          return route.fulfill({ json: [] });
        state.data = request.postDataJSON().data;
        state.revision++;
      }
      return route.fulfill({
        json: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            data: state.data,
            revision: state.revision,
          },
        ],
      });
    }
    return route.fulfill({ status: 404, json: { error: "not found" } });
  });
  return state;
}
export async function signIn(page) {
  await page.getByLabel("Work email").fill("member@example.test");
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await page.getByLabel("Email verification code").fill("123456");
  await page.getByRole("button", { name: "Verify & sign in" }).click();
}
