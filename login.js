const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginBtn = document.getElementById("login-btn");
const usernameInput = document.getElementById("login-username");
const passwordInput = document.getElementById("login-password");

function showLoginError(message) {
  loginError.textContent = message;
  loginError.hidden = false;
}

async function checkExistingSession() {
  try {
    const response = await fetch("/api/me", { credentials: "same-origin" });
    if (response.ok) {
      window.location.href = "/main";
    }
  } catch {
    // Stay on login page.
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true;

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const result = await response.json();

    if (!response.ok) {
      showLoginError(result.error || "Login failed");
      return;
    }

    window.location.href = "/main";
  } catch (err) {
    showLoginError(`Login failed: ${err.message}`);
  } finally {
    loginBtn.disabled = false;
  }
});

document.getElementById("login-cancel").addEventListener("click", () => {
  usernameInput.value = "";
  passwordInput.value = "";
  loginError.hidden = true;
  usernameInput.focus();
});

checkExistingSession();
