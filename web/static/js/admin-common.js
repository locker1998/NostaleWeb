const adminLogoutBtn = document.getElementById("admin-logout-btn");

adminLogoutBtn?.addEventListener("click", () => {
  adminLogoutBtn.disabled = true;
  void window.SessionFlow.logoutToAdminLogin().finally(() => {
    adminLogoutBtn.disabled = false;
  });
});
