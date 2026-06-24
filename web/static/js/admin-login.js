const loginForm = document.getElementById("admin-login-form");
const usernameInput = document.getElementById("admin-login-username");
const passwordInput = document.getElementById("admin-login-password");
const submitBtn = document.getElementById("admin-login-submit");
const errorEl = document.getElementById("admin-login-error");

function setFormEnabled(enabled) {
  usernameInput.disabled = !enabled;
  passwordInput.disabled = !enabled;
  submitBtn.disabled = !enabled;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function formatNetworkError() {
  return "Could not reach the server. Start it with NostaleWeb.exe";
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    showError("Enter your account name and password.");
    return;
  }

  setFormEnabled(false);

  try {
    const response = await fetch("/api/admin-login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    let result = {};
    try {
      result = await response.json();
    } catch {
      // Non-JSON response.
    }

    if (!response.ok) {
      showError(result.error || "Sign in failed.");
      return;
    }

    window.location.href = result.redirect || "/admin";
  } catch {
    showError(formatNetworkError());
  } finally {
    setFormEnabled(true);
  }
});

void window.SessionFlow.redirectIfAuthenticatedForAdmin();
