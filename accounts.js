"use strict";

(() => {
  const byId = (id) => document.getElementById(id);
  const dialog = byId("account-dialog");
  const form = byId("account-form");
  const user = byId("account-user");
  const name = byId("account-name");
  const password = byId("account-password");
  const login = byId("login");
  const signup = byId("signup");
  const logout = byId("logout");
  const notice = byId("account-notice");
  const error = byId("account-error");
  const submit = byId("account-submit");
  let action = "login";

  async function api(path = "", data) {
    const response = await fetch("./api/account" + path, data === undefined ? { cache: "no-store" } : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw Error("Accounts need the Python server. You can still create and download figures for free on this page.");
    }
    const body = await response.json();
    if (!response.ok) throw Error(body.error || "The request could not finish. Try again.");
    return body;
  }

  function renderAccount(username) {
    user.textContent = username || "";
    user.hidden = !username;
    login.hidden = Boolean(username);
    signup.hidden = Boolean(username);
    logout.hidden = !username;
  }

  function showError(message = "") {
    error.textContent = message;
    error.hidden = !message;
  }

  async function open(nextAction) {
    action = nextAction;
    const registering = action === "signup";
    byId("account-title").textContent = registering ? "Create your account" : "Log in";
    submit.textContent = registering ? "Sign up" : "Log in";
    password.autocomplete = registering ? "new-password" : "current-password";
    form.reset();
    form.hidden = true;
    notice.textContent = "Checking account availability…";
    showError();
    dialog.showModal();
    try {
      const account = await api();
      if (!dialog.open || action !== nextAction) return;
      if (account.user) {
        renderAccount(account.user);
        dialog.close();
        return;
      }
      notice.textContent = registering ? "Choose a username and a password of at least 12 characters. No payment details are needed." : "Enter your username and password.";
      form.hidden = false;
      name.focus();
    } catch (problem) {
      notice.textContent = problem.message;
    }
  }

  login.addEventListener("click", () => open("login"));
  signup.addEventListener("click", () => open("signup"));
  byId("account-close").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    showError();
    try {
      const account = await api("/" + action, { username: name.value.trim(), password: password.value });
      renderAccount(account.user);
      dialog.close();
    } catch (problem) {
      showError(problem.message);
    } finally {
      submit.disabled = false;
    }
  });

  logout.addEventListener("click", async () => {
    logout.disabled = true;
    try {
      await api("/logout", {});
      renderAccount(null);
      login.focus();
    } catch {
      byId("account-title").textContent = "Account";
      form.hidden = true;
      notice.textContent = "Log out could not finish. Try again.";
      dialog.showModal();
    } finally {
      logout.disabled = false;
    }
  });

  api().then(({ user: username }) => renderAccount(username)).catch(() => {});
})();
