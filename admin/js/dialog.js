/* Themed confirmation and notice dialogs shared by admin pages. */
(function () {
  "use strict";

  var backdrop = document.createElement("div");
  backdrop.className = "admin-dialog-backdrop";
  backdrop.hidden = true;
  backdrop.setAttribute("role", "presentation");

  var dialog = document.createElement("section");
  dialog.className = "admin-dialog";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "admin-dialog-title");
  dialog.setAttribute("aria-describedby", "admin-dialog-message");

  var title = document.createElement("h2");
  title.className = "admin-dialog__title";
  title.id = "admin-dialog-title";

  var message = document.createElement("p");
  message.className = "admin-dialog__message";
  message.id = "admin-dialog-message";

  var actions = document.createElement("div");
  actions.className = "admin-dialog__actions";
  var cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn btn--ghost";
  cancel.textContent = "Batal";
  var confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "btn btn--primary";
  confirm.textContent = "Lanjutkan";

  actions.appendChild(cancel);
  actions.appendChild(confirm);
  dialog.appendChild(title);
  dialog.appendChild(message);
  dialog.appendChild(actions);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  var resolver = null;
  var previousFocus = null;

  function close(result) {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    var resolve = resolver;
    resolver = null;
    if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
    previousFocus = null;
    if (resolve) resolve(result);
  }

  function open(options) {
    if (resolver) close(false);
    previousFocus = document.activeElement;
    title.textContent = options.title;
    message.textContent = options.message;
    cancel.hidden = !options.confirmation;
    confirm.textContent = options.confirmLabel || (options.confirmation ? "Lanjutkan" : "Tutup");
    confirm.className = "btn " + (options.danger ? "btn--danger" : "btn--primary");
    backdrop.hidden = false;
    confirm.focus();
    return new Promise(function (resolve) { resolver = resolve; });
  }

  confirm.addEventListener("click", function () { close(true); });
  cancel.addEventListener("click", function () { close(false); });
  backdrop.addEventListener("click", function (event) {
    if (event.target === backdrop) close(false);
  });
  document.addEventListener("keydown", function (event) {
    if (backdrop.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close(false);
    } else if (event.key === "Tab") {
      event.preventDefault();
      (event.shiftKey && !cancel.hidden ? cancel : confirm).focus();
    }
  });

  window.SLDialog = {
    confirm: function (options) {
      options.confirmation = true;
      return open(options);
    },
    alert: function (options) {
      options.confirmation = false;
      return open(options);
    }
  };
})();
