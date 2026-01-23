Cypress.Commands.add("apiLogin", (email: string, password: string) => {
  const apiUrl = Cypress.env("apiUrl") || "/api";

  return cy
    .request({
      method: "POST",
      url: `${apiUrl}/auth/login`,
      body: { email, password },
      failOnStatusCode: false
    })
    .then((res) => {
      if (res.status !== 200) {
        throw new Error(res.body?.error || "API login failed");
      }

      const token =
        res.body?.token ||
        res.body?.accessToken ||
        res.body?.data?.token ||
        res.body?.data?.accessToken;

      const user = res.body?.user || res.body?.data?.user || res.body?.data;

      if (!token) throw new Error("No token returned from /api/auth/login");
      if (!user) throw new Error("No user returned from /api/auth/login");

      window.localStorage.setItem("token", token);
      window.localStorage.setItem("user", JSON.stringify(user));

      return { token, user };
    });
});
