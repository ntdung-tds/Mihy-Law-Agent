"use strict";
const loginScreen = document.querySelector("#login-screen");
const dashboard = document.querySelector("#dashboard");
const form = document.querySelector("#login-form");
const emailEl = document.querySelector("#login-email");
const passwordEl = document.querySelector("#login-password");
const workspaceEl = document.querySelector("#login-workspace");
const loginError = document.querySelector("#login-error");
const loginButton = document.querySelector("#login-submit");
const resultEl = document.querySelector("#run-result");
const runButton = document.querySelector("#run-check");
const logoutButton = document.querySelector("#logout");
const selectedNames = new Map();

async function request(path, init = {}) {
  const response = await fetch(path, {credentials: "same-origin", cache: "no-store", ...init});
  let data = {};
  try { data = await response.json(); } catch (_) { data = {code: "DEPENDENCY_UNAVAILABLE"}; }
  return {status: response.status, data};
}
function showLogin() {
  dashboard.hidden = true;
  loginScreen.hidden = false;
  resultEl.textContent = "Chưa yêu cầu dữ liệu.";
  resultEl.className = "run-result";
}
function showWorkspace(session) {
  loginScreen.hidden = true;
  dashboard.hidden = false;
  document.querySelector("#account-name").textContent = session.email;
  document.querySelector("#workspace-name").textContent =
    selectedNames.get(session.tenant_id) || "Không gian được cấp quyền";
  loginError.hidden = true;
  passwordEl.value = "";
}
function describe(code) {
  if (code === 401) return "Thông tin đăng nhập hoặc không gian làm việc không hợp lệ.";
  if (code === 403) return "Yêu cầu bị từ chối. Vui lòng tải lại trang.";
  if (code === 503) return "Dịch vụ đang gián đoạn. Hãy thử lại.";
  return "Không thể xử lý yêu cầu. Vui lòng kiểm tra thông tin.";
}
async function loadWorkspaces() {
  workspaceEl.replaceChildren();
  const choose = document.createElement("option");
  choose.value = ""; choose.textContent = "Chọn không gian làm việc";
  workspaceEl.append(choose);
  const {status, data} = await request("/api/workspaces");
  if (status !== 200 || !Array.isArray(data.workspaces)) {
    choose.textContent = "Không tải được danh sách kiểm thử";
    workspaceEl.disabled = true;
    return;
  }
  for (const workspace of data.workspaces) {
    if (!workspace || typeof workspace.id !== "string"
        || typeof workspace.label !== "string") continue;
    selectedNames.set(workspace.id, workspace.label);
    const option = document.createElement("option");
    option.value = workspace.id;
    option.textContent = workspace.label +
      (workspace.type === "personal" ? " · Cá nhân" : " · Tổ chức");
    workspaceEl.append(option);
  }
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  if (!emailEl.value.trim() || !passwordEl.value || !workspaceEl.value) {
    loginError.textContent = "Nhập email, mật khẩu và chọn không gian làm việc.";
    loginError.hidden = false;
    return;
  }
  loginButton.disabled = true; loginButton.textContent = "Đang xác thực…";
  try {
    const {status, data} = await request("/api/login", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        email: emailEl.value.trim().toLowerCase(),
        password: passwordEl.value,
        tenant_id: workspaceEl.value,
      }),
    });
    if (status === 200 && data.ok === true) {
      showWorkspace({email: data.email, tenant_id: data.tenant_id});
    } else {
      loginError.textContent = describe(status);
      loginError.hidden = false;
    }
  } catch (_) {
    loginError.textContent = "Không thể kết nối tới bản cài đặt.";
    loginError.hidden = false;
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Đăng nhập →";
    passwordEl.value = "";
  }
});
runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  resultEl.className = "run-result";
  resultEl.textContent = "Đang kiểm tra quyền và tải dữ liệu…";
  try {
    const {status, data} = await request("/api/run?run_id=fixture-run");
    if (status === 200) {
      resultEl.className = "run-result ok";
      resultEl.textContent = "Đã kết nối API · Mã: " + data.run_id +
        " · Trạng thái: " + (data.status === "queued" ? "Đang xếp hàng" : data.status);
    } else if (status === 404) {
      resultEl.className = "run-result denied";
      resultEl.textContent = "Không có kết quả hoặc bạn chưa được cấp quyền truy cập hồ sơ.";
    } else if (status === 401) {
      showLogin();
      loginError.textContent = "Phiên đã hết hạn hoặc quyền truy cập đã bị thu hồi.";
      loginError.hidden = false;
    } else {
      resultEl.className = "run-result denied";
      resultEl.textContent = "Không thể truy xuất tiến trình. Vui lòng thử lại.";
    }
  } catch (_) {
    resultEl.className = "run-result denied";
    resultEl.textContent = "Không thể kết nối tới API.";
  } finally { runButton.disabled = false; }
});
logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    const {status} = await request("/api/logout", {
      method: "POST", headers: {"Content-Type": "application/json"}, body: "{}",
    });
    if (status === 200 || status === 401) {
      showLogin();
      emailEl.focus();
    } else {
      resultEl.className = "run-result denied";
      resultEl.textContent = "Chưa thể đăng xuất an toàn. Vui lòng thử lại.";
    }
  } catch (_) {
    resultEl.className = "run-result denied";
    resultEl.textContent = "Không thể kết nối dịch vụ đăng xuất.";
  } finally { logoutButton.disabled = false; }
});
(async function init() {
  await loadWorkspaces();
  try {
    const {status, data} = await request("/api/session");
    if (status === 200 && data.authenticated === true) showWorkspace(data);
    else showLogin();
  } catch (_) { showLogin(); }
})();
