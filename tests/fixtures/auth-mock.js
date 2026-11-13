import { initialShipments, loads } from "./demo-data.js";
export async function installAuthMock(page, options = {}) {
  const state = {
    passwordEnabled: true,
    googleEnabled: true,
    memberships: null,
    workspaceData: {},
    workspaceRevisions: {},
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
        passwordEnabled: state.passwordEnabled,
        googleEnabled: state.googleEnabled,
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
              expires_at:
                state.expiresAt || Math.floor(Date.now() / 1000) + 3600,
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
    if (path === "/rest/v1/memberships") {
      let members = state.member
        ? state.memberships || [
            {
              workspace_id: "22222222-2222-4222-8222-222222222222",
              role: state.role,
              display_name:
                state.role === "business" ? "Acme Supply Co." : "Jordan Miller",
            },
          ]
        : [];
      const filter = url.searchParams.get("workspace_id");
      if (filter)
        members = members.filter((m) => "eq." + m.workspace_id === filter);
      return route.fulfill({ json: members });
    }
    if (path === "/rest/v1/workspaces") {
      if (!state.member)
        return route.fulfill({ status: 403, json: { error: "denied" } });
      const id = (
        url.searchParams.get("id") || "eq.22222222-2222-4222-8222-222222222222"
      ).slice(3);
      if (
        state.memberships &&
        !state.memberships.some((m) => m.workspace_id === id)
      )
        return route.fulfill({ json: [] });
      const multi = Boolean(state.memberships);
      const revision = multi
        ? state.workspaceRevisions[id] || 0
        : state.revision;
      if (request.method() === "PATCH") {
        if (state.failSave)
          return route.fulfill({ status: 403, json: { error: "denied" } });
        if (url.searchParams.get("revision") !== "eq." + revision)
          return route.fulfill({ json: [] });
        if (multi) {
          state.workspaceData[id] = request.postDataJSON().data;
          state.workspaceRevisions[id] = revision + 1;
        } else {
          state.data = request.postDataJSON().data;
          state.revision++;
        }
      }
      return route.fulfill({
        json: [
          {
            id,
            data: multi
              ? state.workspaceData[id] || structuredClone(state.data)
              : state.data,
            revision: multi
              ? state.workspaceRevisions[id] || 0
              : state.revision,
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

export async function passwordSignIn(
  page,
  email = "preview@example.test",
  password = "Example-only-preview-password!",
) {
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
