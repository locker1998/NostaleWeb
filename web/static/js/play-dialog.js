let dialogElements = null;
let primaryHandler = null;
let dialogWired = false;

function findDialogElements() {
  if (dialogElements) {
    return dialogElements;
  }

  for (const base of ["main-info", "login-info"]) {
    const layer = document.getElementById(`${base}-layer`);
    if (!layer) {
      continue;
    }

    dialogElements = {
      layer,
      message: document.getElementById(`${base}-message`),
      primary: document.getElementById(`${base}-primary`),
      secondary: document.getElementById(`${base}-secondary`),
    };
    break;
  }

  return dialogElements;
}

function wireDialog() {
  if (dialogWired) {
    return;
  }

  const dialog = findDialogElements();
  if (!dialog?.primary) {
    return;
  }

  dialogWired = true;
  dialog.primary.addEventListener("click", async () => {
    const handler = primaryHandler;
    if (!handler) {
      hidePlayAlert();
      return;
    }

    dialog.primary.disabled = true;
    try {
      await handler();
    } finally {
      dialog.primary.disabled = false;
    }
  });
}

function hidePlayAlert() {
  const dialog = findDialogElements();
  if (!dialog?.layer) {
    return;
  }

  dialog.layer.hidden = true;
  if (dialog.secondary) {
    dialog.secondary.hidden = true;
  }
  if (dialog.primary) {
    dialog.primary.disabled = false;
  }
  primaryHandler = null;
}

function showPlayAlert(message, onConfirm) {
  wireDialog();
  const dialog = findDialogElements();
  if (!dialog?.layer || !dialog.message || !dialog.primary) {
    void onConfirm?.();
    return;
  }

  dialog.message.textContent = message;
  if (dialog.secondary) {
    dialog.secondary.hidden = true;
  }
  dialog.primary.disabled = false;
  primaryHandler = onConfirm || null;
  dialog.layer.hidden = false;
}

window.PlayDialog = {
  showAlert: showPlayAlert,
  hideAlert: hidePlayAlert,
};
