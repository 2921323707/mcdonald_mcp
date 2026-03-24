/**
 * 麦当劳 MCP 本地调度平台 — 前端逻辑 v3
 * 支持参数化工具表单 + 直接调用工具 + 地址自动注入
 */

const API = "";

// ============================================================
// DOM 引用
// ============================================================
const $toolsList      = document.getElementById("tools-list");
const $toolCount      = document.getElementById("tool-count");
const $chatMessages   = document.getElementById("chat-messages");
const $chatInput      = document.getElementById("chat-input");
const $btnSend        = document.getElementById("btn-send");
const $btnRefresh     = document.getElementById("btn-refresh");
const $connBadge      = document.getElementById("connection-badge");
const $footerStatus   = document.getElementById("footer-status");
const $resultPanel    = document.getElementById("result-panel");
const $resultContent  = document.getElementById("result-content");
const $btnCloseResult = document.getElementById("btn-close-result");
const $quickActions   = document.getElementById("quick-actions");

// 地址选择器 DOM
const $addrLoading    = document.getElementById("addr-loading");
const $addrContent     = document.getElementById("addr-content");
const $addrList        = document.getElementById("addr-list");
const $addrError       = document.getElementById("addr-error");
const $addrErrorText   = document.getElementById("addr-error-text");
const $btnRefreshAddr  = document.getElementById("btn-refresh-addr");

// 餐品选择器 DOM
const $mealsSelector  = document.getElementById("meals-selector");
const $mealsList       = document.getElementById("meals-list");
const $mealsCount      = document.getElementById("meals-count");
const $btnClearMeals   = document.getElementById("btn-clear-meals");
const $btnCalculate    = document.getElementById("btn-calculate");
const $btnCreateOrder  = document.getElementById("btn-create-order");

// ============================================================
// 状态
// ============================================================
let toolsMeta = [];       // 工具元信息
let currentAddress = null; // 当前选中的配送地址
let isLoading = false;
let cachedMeals = [];      // 缓存的餐品列表 (query-meals 结果)
let selectedMeals = {};    // 选中的餐品 { productCode: { name, price, quantity } }

// ============================================================
// 初始化
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
    bindEvents();
    await checkStatus();
    await loadAddress();
    await loadToolsMeta();
});

// ============================================================
// 事件绑定
// ============================================================
function bindEvents() {
    $btnSend.addEventListener("click", handleSend);
    $btnRefresh.addEventListener("click", () => loadToolsMeta(true));
    $btnRefreshAddr && $btnRefreshAddr.addEventListener("click", () => loadAddress(true));
    $btnCloseResult.addEventListener("click", () => $resultPanel.classList.add("hidden"));
    $btnClearMeals && $btnClearMeals.addEventListener("click", clearSelectedMeals);
    $btnCalculate && $btnCalculate.addEventListener("click", calculateSelectedMeals);
    $btnCreateOrder && $btnCreateOrder.addEventListener("click", orderSelectedMeals);

    $chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    $chatInput.addEventListener("input", () => {
        $chatInput.style.height = "auto";
        $chatInput.style.height = Math.min($chatInput.scrollHeight, 120) + "px";
    });
}

// ============================================================
// 检查连接状态
// ============================================================
async function checkStatus() {
    try {
        const res = await fetch(`${API}/api/status`);
        const data = await res.json();
        setConnectionStatus(data.connected, data.connected ? "已连接" : (data.init_error ? "初始化失败" : "未连接"));
    } catch (err) {
        setConnectionStatus(false, "网络错误");
    }
}

function setConnectionStatus(online, text) {
    $connBadge.className = `badge ${online ? "badge-online" : "badge-offline"}`;
    $connBadge.querySelector(".badge-text").textContent = text;
    $footerStatus.textContent = online ? "✓ MCP Server 连接正常" : `✗ ${text}`;
}

// ============================================================
// 配送地址加载与选择
// ============================================================
async function loadAddress(refresh = false) {
    $addrLoading.classList.remove("hidden");
    $addrContent.classList.add("hidden");
    $addrError.classList.add("hidden");

    try {
        const url = refresh ? `${API}/api/addresses/refresh` : `${API}/api/addresses`;
        if (refresh) {
            await fetch(url, { method: "POST" });
            // 等待后台刷新完成（最多5秒）
            await new Promise(r => setTimeout(r, 500));
        }
        const res = await fetch(`${API}/api/addresses`);
        const data = await res.json();

        if (data.error) {
            $addrLoading.classList.add("hidden");
            $addrError.classList.remove("hidden");
            $addrErrorText.textContent = data.error;
            return;
        }

        $addrLoading.classList.add("hidden");

        if (!data.loaded) {
            $addrLoading.classList.remove("hidden");
            $addrLoading.querySelector("span").textContent = "正在加载…";
            return;
        }

        if (!data.addresses || data.addresses.length === 0) {
            $addrError.classList.remove("hidden");
            $addrErrorText.textContent = data.error || "暂无配送地址，请在麦当劳App中添加";
            return;
        }

        currentAddress = data.selected || data.addresses[0];
        renderAddressList(data.addresses);
        $addrContent.classList.remove("hidden");
    } catch (err) {
        $addrLoading.classList.add("hidden");
        $addrError.classList.remove("hidden");
        $addrErrorText.textContent = `加载失败: ${err.message}`;
    }
}

function renderAddressList(addresses) {
    $addrList.innerHTML = addresses.map((addr, idx) => {
        const isSelected = currentAddress && currentAddress.addressId === addr.addressId;
        const shortAddr = (addr.fullAddress || "").slice(-20);
        return `
        <div class="addr-item ${isSelected ? "addr-item-selected" : ""}"
             data-index="${idx}" title="${escapeHtml(addr.fullAddress || "")}">
            <div class="addr-item-main">
                <div class="addr-contact">${escapeHtml(addr.contactName || "")} ${escapeHtml(addr.phone || "")}</div>
                <div class="addr-store">${escapeHtml(addr.storeName || "")}</div>
            </div>
            ${isSelected ? '<div class="addr-check">✓</div>' : ""}
        </div>`;
    }).join("");

    $addrList.querySelectorAll(".addr-item").forEach(item => {
        item.addEventListener("click", async () => {
            const idx = parseInt(item.dataset.index, 10);
            const addr = addresses[idx];
            try {
                await fetch(`${API}/api/addresses/select`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ addressId: addr.addressId }),
                });
            } catch (_) {}
            currentAddress = addr;
            renderAddressList(addresses);
            addBotMessage(`已切换配送地址：${addr.storeName}`);
        });
    });
}

// ============================================================
// 加载工具元信息（含参数分类）
// ============================================================
async function loadToolsMeta(refresh = false) {
    $toolsList.innerHTML = `
        <div class="tools-placeholder">
            <div class="spinner"></div>
            <p>正在加载工具列表…</p>
        </div>`;

    try {
        const url = refresh ? `${API}/api/tools/meta?refresh=1` : `${API}/api/tools/meta`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
            $toolsList.innerHTML = `<div class="tools-placeholder"><p>⚠️ ${data.error}</p></div>`;
            return;
        }

        toolsMeta = data.tools || [];
        $toolCount.textContent = toolsMeta.length;

        if (toolsMeta.length === 0) {
            $toolsList.innerHTML = `<div class="tools-placeholder"><p>暂无可用工具</p></div>`;
            return;
        }

        renderToolCards(toolsMeta);
        renderQuickActions(toolsMeta);
    } catch (err) {
        $toolsList.innerHTML = `<div class="tools-placeholder"><p>加载失败: ${err.message}</p></div>`;
    }
}

// ============================================================
// 渲染工具列表（区分直接调用/需参数）
// ============================================================
function renderToolCards(tools) {
    $toolsList.innerHTML = tools.map((tool) => {
        const isDirect = tool.callType === "direct";
        const badgeClass = isDirect ? "type-badge-direct" : "type-badge-param";
        const badgeText = isDirect ? "直接调用" : "需要参数";
        const descText = (tool.description || "暂无描述").split("\n")[0].slice(0, 80);

        return `
        <div class="tool-card" data-tool="${escapeHtml(tool.name)}" data-type="${tool.callType}">
            <div class="tool-card-header">
                <div class="tool-card-name">${escapeHtml(tool.name)}</div>
                <span class="type-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="tool-card-desc">${escapeHtml(descText)}</div>
            ${!isDirect && tool.params.length > 0 ? renderParamTags(tool.params) : ""}
        </div>`;
    }).join("");

    // 绑定点击事件
    $toolsList.querySelectorAll(".tool-card").forEach((card) => {
        card.addEventListener("click", () => {
            const name = card.dataset.tool;
            const type = card.dataset.type;
            const tool = toolsMeta.find(t => t.name === name);

            if (type === "direct") {
                callToolDirect(name);
            } else if ((name === "calculate-price" || name === "create-order") && Object.keys(selectedMeals).length > 0) {
                // 有已选餐品时直接快捷调用
                const items = buildItemsFromSelected();
                addMessage("user", `${name === "calculate-price" ? "计算价格" : "下单"}: ${JSON.stringify(items)}`);
                callToolWithArgs(name, { items });
            } else {
                showParamForm(tool);
            }
        });
    });
}

function renderParamTags(params) {
    const tags = params.map(p => {
        const req = p.required ? ' <span class="req">*</span>' : '';
        return `<span class="param-tag">${escapeHtml(p.label)}${req}</span>`;
    }).join("");
    return `<div class="tool-card-params">${tags}</div>`;
}

function renderQuickActions(tools) {
    const quickTexts = [
        "最近有什么活动？",
        "帮我一键领券",
        "我有多少积分？",
        "查看可用优惠券",
    ];
    $quickActions.innerHTML = quickTexts.map(t =>
        `<button class="quick-btn">${t}</button>`
    ).join("");

    $quickActions.querySelectorAll(".quick-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            $chatInput.value = btn.textContent;
            handleSend();
        });
    });
}

// ============================================================
// 参数表单弹出（在聊天区域显示）
// ============================================================
function showParamForm(tool) {
    // 移除之前的表单
    const oldForm = document.getElementById("param-form-card");
    if (oldForm) oldForm.remove();

    // 移除聊天区的欢迎卡片
    const welcome = $chatMessages.querySelector(".welcome-card");
    if (welcome) welcome.remove();

    const formId = `form-${Date.now()}`;
    const params = tool.params || [];

    // 过滤掉 object/array 类型的复杂参数（items 等），给予提示
    const simpleParams = params.filter(p => p.type !== "array" && p.type !== "object");
    const complexParams = params.filter(p => p.type === "array" || p.type === "object");

    // 标记哪些字段会被后端自动注入
    const autoInjectable = ["beCode", "storeCode", "addressId"];

    let formHTML = `
    <div class="param-form-card" id="param-form-card">
        <div class="param-form-header">
            <span class="param-form-icon">🔧</span>
            <div>
                <div class="param-form-title">${escapeHtml(tool.name)}</div>
                <div class="param-form-subtitle">${escapeHtml((tool.description || "").split("\n")[0].slice(0, 100))}</div>
            </div>
        </div>
        ${currentAddress ? `<div class="param-form-hint">
            📍 自动填充：<span class="addr-hint-chip">${escapeHtml(currentAddress.storeName)}</span>
            <span class="code-chip">beCode: ${escapeHtml(currentAddress.beCode)}</span>
            <span class="code-chip">storeCode: ${escapeHtml(currentAddress.storeCode)}</span>
        </div>` : ""}
        <form id="${formId}" class="param-form">`;

    for (const p of simpleParams) {
        const reqMark = p.required ? '<span class="req">*</span>' : '';
        const inputType = p.type === "integer" ? "number" : "text";
        const isAutoInject = autoInjectable.includes(p.name) && !p.required;
        const autoFillValue = isAutoInject && currentAddress ? currentAddress[p.name] || "" : "";
        const readonlyAttr = isAutoInject && currentAddress ? "readonly" : "";
        const hintText = isAutoInject && currentAddress
            ? `（已从配送地址自动填充：${currentAddress.storeName}）`
            : (p.description ? p.description.split("\n")[0].slice(0, 50) : p.name);
        formHTML += `
            <div class="param-field">
                <label for="${formId}-${p.name}">${escapeHtml(p.label)} ${reqMark}</label>
                <input type="${inputType}" id="${formId}-${p.name}" name="${p.name}"
                       placeholder="${escapeHtml(hintText)}"
                       value="${autoFillValue}"
                       ${readonlyAttr}
                       ${p.required ? 'required' : ''} />
            </div>`;
    }

    if (complexParams.length > 0) {
        const isOrderTool = tool.name === "calculate-price" || tool.name === "create-order";
        let autoItemsValue = "";
        let autoHint = `参数: ${complexParams.map(p => p.label).join(", ")} — 请填写 JSON 格式`;
        let selectedSummary = "";

        // 自动从已选餐品填充 items
        if (isOrderTool && Object.keys(selectedMeals).length > 0) {
            autoItemsValue = JSON.stringify(buildItemsFromSelected(), null, 2);
            const selectedNames = Object.entries(selectedMeals).map(([code, m]) => {
                return `${m.name || code} x${m.quantity}`;
            }).join("、");
            selectedSummary = `<div class="param-meals-summary">✅ 已选餐品：${escapeHtml(selectedNames)}</div>`;
            autoHint = `<span style="color:#4ADE80">已自动从已选餐品填充，点击「调用工具」直接提交</span>`;
        }

        formHTML += `
            <div class="param-field">
                <label>${escapeHtml(complexParams.map(p => p.label).join(", ") || "复杂参数")} (JSON)</label>
                ${selectedSummary}
                <textarea id="${formId}-complex" name="_complex" rows="${isOrderTool && Object.keys(selectedMeals).length > 0 ? 3 : 2}"
                          placeholder='${escapeHtml(JSON.stringify(Object.fromEntries(complexParams.map(p => [p.name, p.type === "array" ? [] : {}])), null, 2))}'
                          ${isOrderTool && Object.keys(selectedMeals).length > 0 ? "readonly" : ""}>${escapeHtml(autoItemsValue)}</textarea>
                <div class="param-hint">${autoHint}</div>
            </div>`;
    }

    formHTML += `
            <div class="param-form-actions">
                <button type="button" class="btn-cancel" onclick="document.getElementById('param-form-card').remove(); document.getElementById('result-panel').classList.add('hidden');">取消</button>
                <button type="submit" class="btn-submit">调用工具</button>
            </div>
        </form>
    </div>`;

    $resultPanel.classList.remove("hidden");
    $resultContent.innerHTML = formHTML;
    scrollToBottom();

    // 绑定表单提交
    document.getElementById(formId).addEventListener("submit", (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const args = {};

        for (const p of simpleParams) {
            const val = formData.get(p.name);
            if (val !== null && val !== "") {
                args[p.name] = p.type === "integer" ? parseInt(val, 10) : val;
            }
        }

        // 解析复杂参数
        const complexStr = formData.get("_complex");
        if (complexStr && complexStr.trim()) {
            try {
                const complexObj = JSON.parse(complexStr);
                Object.assign(args, complexObj);
            } catch (err) {
                alert("JSON 格式错误，请检查复杂参数输入");
                return;
            }
        }

        // 移除表单
        document.getElementById("param-form-card").remove();
        $resultPanel.classList.add("hidden");

        // 调用工具
        addMessage("user", `调用工具: ${tool.name}\n参数: ${JSON.stringify(args, null, 2)}`);
        callToolWithArgs(tool.name, args);
    });
}

// ============================================================
// 直接调用工具
// ============================================================
async function callToolDirect(toolName) {
    addMessage("user", `直接调用: ${toolName}`);
    showTyping();

    try {
        const res = await fetch(`${API}/api/tools/call`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: toolName, arguments: {} }),
        });
        const data = await res.json();
        removeTyping();

        if (data.error) {
            addBotMessage(`调用工具「${toolName}」失败：${data.error}`, null, toolName);
        } else {
            const injected = data.injected || null;
            addBotMessage(`工具「${toolName}」调用成功`, data.result, toolName);
            showResultPanel(toolName, data.result, injected);
        }
    } catch (err) {
        removeTyping();
        addBotMessage(`调用失败: ${err.message}`);
    }
}

// ============================================================
// 带参数调用工具
// ============================================================
async function callToolWithArgs(toolName, args) {
    showTyping();

    try {
        const res = await fetch(`${API}/api/tools/call`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: toolName, arguments: args }),
        });
        const data = await res.json();
        removeTyping();

        if (data.error) {
            addBotMessage(`调用工具「${toolName}」失败：${data.error}`, null, toolName);
        } else {
            const injected = data.injected || null;
            addBotMessage(`工具「${toolName}」调用成功`, data.result, toolName);
            showResultPanel(toolName, data.result, injected);
        }
    } catch (err) {
        removeTyping();
        addBotMessage(`调用失败: ${err.message}`);
    }
}

// ============================================================
// 发送消息 / 对话
// ============================================================
async function handleSend() {
    const msg = $chatInput.value.trim();
    if (!msg || isLoading) return;

    isLoading = true;
    $btnSend.disabled = true;
    $chatInput.value = "";
    $chatInput.style.height = "auto";

    addMessage("user", msg);
    showTyping();

    try {
        const res = await fetch(`${API}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg }),
        });
        const data = await res.json();
        removeTyping();

        if (data.type === "tool_call") {
            // 检查匹配到的工具是否需要参数
            const matchedMeta = toolsMeta.find(t => t.name === data.tool_used);
            if (matchedMeta && matchedMeta.callType === "parameterized" && matchedMeta.requiredParams.length > 0) {
                // 工具需要参数但用户通过聊天触发，显示参数表单
                addBotMessage(`检测到您想使用工具「${data.tool_used}」，该工具需要输入参数。请在下方表单中填写：`);
                showParamForm(matchedMeta);
            } else {
                addBotMessage(data.reply, data.result, data.tool_used);
                showResultPanel(data.tool_used, data.result);
            }
        } else if (data.type === "error") {
            addBotMessage(data.reply || data.error);
        } else {
            addBotMessage(data.reply);
        }
    } catch (err) {
        removeTyping();
        addBotMessage(`请求失败: ${err.message}`);
    } finally {
        isLoading = false;
        $btnSend.disabled = false;
        $chatInput.focus();
    }
}

// ============================================================
// 消息渲染
// ============================================================
function addMessage(role, text) {
    const div = document.createElement("div");
    div.className = `msg msg-${role}`;
    const avatarLabel = role === "user" ? "U" : "M";
    div.innerHTML = `
        <div class="msg-avatar">${avatarLabel}</div>
        <div class="msg-body"><pre class="msg-pre">${escapeHtml(text)}</pre></div>
    `;
    $chatMessages.appendChild(div);
    scrollToBottom();
}

function addBotMessage(text, toolResult = null, toolName = null) {
    const div = document.createElement("div");
    div.className = "msg msg-bot";

    let bodyHTML = "";
    if (toolName) {
        bodyHTML += `<div class="msg-tool-badge">🔧 ${escapeHtml(toolName)}</div>`;
    }
    bodyHTML += `<div>${escapeHtml(text)}</div>`;

    if (toolResult) {
        const resultStr = typeof toolResult === "string"
            ? toolResult
            : JSON.stringify(toolResult, null, 2);
        bodyHTML += `<div class="msg-tool-result">${escapeHtml(resultStr)}</div>`;
    }

    div.innerHTML = `
        <div class="msg-avatar">M</div>
        <div class="msg-body">${bodyHTML}</div>
    `;
    $chatMessages.appendChild(div);
    scrollToBottom();
}

function showTyping() {
    const div = document.createElement("div");
    div.className = "msg msg-bot";
    div.id = "typing-msg";
    div.innerHTML = `
        <div class="msg-avatar">M</div>
        <div class="msg-body">
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    $chatMessages.appendChild(div);
    scrollToBottom();
}

function removeTyping() {
    const el = document.getElementById("typing-msg");
    if (el) el.remove();
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        $chatMessages.scrollTop = $chatMessages.scrollHeight;
    });
}

// ============================================================
// 结果面板
// ============================================================
function showResultPanel(toolName, result, injected) {
    $resultPanel.classList.remove("hidden");
    const resultStr = typeof result === "string"
        ? result
        : JSON.stringify(result, null, 2);

    let injHTML = "";
    if (injected && (injected.beCode || injected.storeCode)) {
        injHTML = `<div class="result-injected">
            <span class="result-injected-label">📍 自动注入：</span>
            ${injected.beCode ? `<span class="code-chip">beCode: ${escapeHtml(injected.beCode)}</span>` : ""}
            ${injected.storeCode ? `<span class="code-chip">storeCode: ${escapeHtml(injected.storeCode)}</span>` : ""}
            ${injected.addressId ? `<span class="code-chip">addressId: ${escapeHtml(injected.addressId)}</span>` : ""}
        </div>`;
    }

    $resultContent.innerHTML = `
        <div class="result-card">
            <div class="result-card-title">🔧 ${escapeHtml(toolName)}</div>
            ${injHTML}
            <div class="result-card-body">${escapeHtml(resultStr)}</div>
        </div>
    `;
}

// ============================================================
// 餐品勾选面板
// ============================================================

function buildItemsFromSelected() {
    return Object.entries(selectedMeals).map(([productCode, m]) => ({
        productCode,
        quantity: m.quantity,
    }));
}

function updateMealsCount() {
    const count = Object.keys(selectedMeals).length;
    $mealsCount.textContent = count;
    if (count > 0) {
        $mealsSelector.classList.remove("hidden");
    }
}

function renderMealsSelector() {
    if (cachedMeals.length === 0) return;

    // 渲染可勾选餐品列表
    $mealsList.innerHTML = cachedMeals.map(meal => {
        const code = meal.productCode || meal.code || "";
        const name = meal.name || meal.productName || code;
        const price = meal.price || meal.sellPrice || "";
        const isSelected = !!selectedMeals[code];
        const qty = selectedMeals[code]?.quantity || 1;

        return `
        <div class="meal-item ${isSelected ? "meal-item-selected" : ""}" data-code="${escapeHtml(code)}">
            <label class="meal-label">
                <input type="checkbox" class="meal-check" ${isSelected ? "checked" : ""} data-code="${escapeHtml(code)}" />
                <span class="meal-info">
                    <span class="meal-name">${escapeHtml(name)}</span>
                    ${price ? `<span class="meal-price">¥${price / 100}</span>` : ""}
                </span>
            </label>
            ${isSelected ? `
            <div class="meal-qty-ctrl">
                <button class="qty-btn qty-dec" data-code="${escapeHtml(code)}">−</button>
                <span class="qty-num">${qty}</span>
                <button class="qty-btn qty-inc" data-code="${escapeHtml(code)}">+</button>
            </div>` : ""}
        </div>`;
    }).join("");

    // 绑定勾选事件
    $mealsList.querySelectorAll(".meal-check").forEach(cb => {
        cb.addEventListener("change", (e) => {
            const code = e.target.dataset.code;
            if (e.target.checked) {
                // 从缓存中找到对应餐品，保存名称和价格
                const meal = cachedMeals.find(m => (m.productCode || m.code) === code);
                selectedMeals[code] = {
                    name: meal?.name || meal?.productName || code,
                    price: meal?.price || meal?.sellPrice || 0,
                    quantity: 1,
                };
            } else {
                delete selectedMeals[code];
            }
            renderMealsSelector();
            updateMealsCount();
        });
    });

    // 绑定数量增减事件
    $mealsList.querySelectorAll(".qty-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const code = e.currentTarget.dataset.code;
            const delta = e.currentTarget.classList.contains("qty-inc") ? 1 : -1;
            if (selectedMeals[code]) {
                selectedMeals[code].quantity = Math.max(1, selectedMeals[code].quantity + delta);
                renderMealsSelector();
            }
        });
    });
}

function showMealsSelector() {
    if (cachedMeals.length === 0) return;
    $mealsSelector.classList.remove("hidden");
    renderMealsSelector();
    updateMealsCount();
}

function clearSelectedMeals() {
    selectedMeals = {};
    renderMealsSelector();
    updateMealsCount();
}

function calculateSelectedMeals() {
    const items = buildItemsFromSelected();
    if (items.length === 0) {
        alert("请先勾选要计算的餐品");
        return;
    }
    addMessage("user", `计算价格: ${JSON.stringify(items)}`);
    callToolWithArgs("calculate-price", { items });
}

function orderSelectedMeals() {
    const items = buildItemsFromSelected();
    if (items.length === 0) {
        alert("请先勾选要下单的餐品");
        return;
    }
    addMessage("user", `创建订单: ${JSON.stringify(items)}`);
    callToolWithArgs("create-order", { items });
}

// ============================================================
// 拦截 query-meals 结果，自动显示餐品勾选面板
// ============================================================
const _origShowResultPanel = showResultPanel;
showResultPanel = function(toolName, result, injected) {
    _origShowResultPanel(toolName, result, injected);

    // 缓存餐品列表并自动显示勾选面板
    if (toolName === "query-meals") {
        let meals = [];
        try {
            if (result?.structuredContent?.data?.products) {
                meals = result.structuredContent.data.products;
            } else if (result?.data?.products) {
                meals = result.data.products;
            } else if (Array.isArray(result)) {
                meals = result;
            } else if (result?.products) {
                meals = result.products;
            }
        } catch (_) {}

        if (meals.length > 0) {
            cachedMeals = meals;
            showMealsSelector();
        }
    }
};

// ============================================================
// 工具函数
// ============================================================
function escapeHtml(str) {
    if (!str) return "";
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(str).replace(/[&<>"']/g, (c) => map[c]);
}
