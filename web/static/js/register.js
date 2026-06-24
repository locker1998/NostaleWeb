const registerForm = document.getElementById("register-form");
const usernameInput = document.getElementById("register-username");
const passwordInput = document.getElementById("register-password");
const confirmInput = document.getElementById("register-password-confirm");
const submitBtn = document.getElementById("register-submit");
const errorEl = document.getElementById("register-error");

function setFormEnabled(enabled) {
  usernameInput.disabled = !enabled;
  passwordInput.disabled = !enabled;
  confirmInput.disabled = !enabled;
  submitBtn.disabled = !enabled;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function formatNetworkError() {
  return (
    "Could not reach the server. Start it with NostaleWeb.exe"
  );
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");

  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const confirm = confirmInput.value;

  if (password !== confirm) {
    showError("Passwords do not match.");
    confirmInput.focus();
    return;
  }

  setFormEnabled(false);

  try {
    const response = await fetch("/api/register", {
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
      showError(result.error || "Registration failed.");
      return;
    }

    sessionStorage.setItem(
      "nosbazaar.notice",
      JSON.stringify({
        type: "success",
        message: result.message || "Account created successfully.",
      }),
    );
    window.location.href = "/";
  } catch {
    showError(formatNetworkError());
  } finally {
    setFormEnabled(true);
  }
});

for (const link of document.querySelectorAll('a[href="/play/login"]')) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    void window.SessionFlow.navigateToLogin();
  });
}
