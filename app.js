(() => {
  "use strict";

  const SETTINGS_KEY = "fa_settings";
  const ENTRIES_KEY = "fa_entries";
  const RING_LEN = 2 * Math.PI * 86;

  const MEALS = {
    breakfast: { label: "มื้อเช้า", icon: "🌅" },
    lunch: { label: "มื้อกลางวัน", icon: "☀️" },
    dinner: { label: "มื้อเย็น", icon: "🌙" },
    snack: { label: "ของว่าง", icon: "🍪" },
  };

  const $ = (id) => document.getElementById(id);

  // ---------- Storage ----------
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  const DEFAULT_BASE_URL = "https://gen.ai.kku.ac.th/api/v1";
  const DEFAULT_MODEL = "claude-sonnet-5.5";
  let settings = Object.assign(
    { apiKey: "", baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL, goal: 2000 },
    load(SETTINGS_KEY, {})
  );
  // settings saved by earlier versions of the app (direct OpenAI / Anthropic)
  if (settings.baseUrl === DEFAULT_BASE_URL && /^(gpt-4o|claude-.*-\d-\d$)/.test(settings.model)) settings.model = DEFAULT_MODEL;
  if (settings.apiKey.startsWith("sk-ant-") || settings.apiKey.startsWith("sk-proj-")) settings.apiKey = "";
  let entries = load(ENTRIES_KEY, []);

  function saveEntries() {
    if (save(ENTRIES_KEY, entries)) return true;
    // storage full: drop thumbnails from the oldest entries and retry
    for (const e of entries) {
      if (e.thumb) {
        e.thumb = null;
        if (save(ENTRIES_KEY, entries)) return true;
      }
    }
    return false;
  }

  // ---------- Dates ----------
  const pad = (n) => String(n).padStart(2, "0");
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayKey = () => dateKey(new Date());
  let viewDate = todayKey();

  function shiftDate(key, days) {
    const [y, m, d] = key.split("-").map(Number);
    return dateKey(new Date(y, m - 1, d + days));
  }
  function dateLabel(key) {
    if (key === todayKey()) return "วันนี้";
    if (key === shiftDate(todayKey(), -1)) return "เมื่อวาน";
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }
  function guessMeal() {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return "breakfast";
    if (h >= 11 && h < 15) return "lunch";
    if (h >= 17 && h < 22) return "dinner";
    return "snack";
  }

  // ---------- UI helpers ----------
  let toastTimer;
  function toast(msg, isError = false) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("error", isError);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), isError ? 4500 : 2500);
  }
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- Render ----------
  function render() {
    const dayEntries = entries.filter((e) => e.date === viewDate);
    const total = dayEntries.reduce((s, e) => s + (Number(e.calories) || 0), 0);
    const goal = Number(settings.goal) || 2000;
    const pct = Math.round((total / goal) * 100);

    $("dateLabel").textContent = dateLabel(viewDate);
    $("nextDay").disabled = viewDate >= todayKey();
    $("totalCal").textContent = total.toLocaleString();
    $("goalCal").textContent = goal.toLocaleString();
    $("remainCal").textContent = Math.max(goal - total, 0).toLocaleString();
    $("countMeals").textContent = dayEntries.length;
    $("pctCal").textContent = pct + "%";

    const ring = $("ringFg");
    ring.style.strokeDashoffset = RING_LEN * (1 - Math.min(total / goal, 1));
    ring.classList.toggle("over", total > goal);

    const list = $("entryList");
    list.innerHTML = "";
    $("emptyState").hidden = dayEntries.length > 0;

    for (const mealKey of Object.keys(MEALS)) {
      const group = dayEntries.filter((e) => e.meal === mealKey).sort((a, b) => a.time.localeCompare(b.time));
      if (!group.length) continue;
      const sum = group.reduce((s, e) => s + (Number(e.calories) || 0), 0);
      const meal = MEALS[mealKey];
      const wrap = document.createElement("div");
      wrap.className = "meal-group";
      wrap.innerHTML = `<div class="meal-head"><span>${meal.icon} ${meal.label}</span><span>${sum.toLocaleString()} kcal</span></div>`;
      for (const e of group) {
        const row = document.createElement("div");
        row.className = "entry";
        const thumb = e.thumb
          ? `<img class="entry-thumb" src="${e.thumb}" alt="" />`
          : `<div class="entry-thumb">${meal.icon}</div>`;
        const detail = e.items && e.items.length > 1 ? ` · ${e.items.length} รายการ` : "";
        row.innerHTML = `
          ${thumb}
          <div class="entry-info">
            <div class="entry-name">${escapeHtml(e.name)}</div>
            <div class="entry-meta">${e.time} น.${detail}</div>
          </div>
          <div class="entry-cal">${Number(e.calories).toLocaleString()} kcal</div>
          <button class="entry-del" aria-label="ลบ">✕</button>`;
        row.querySelector(".entry-del").onclick = () => {
          if (!confirm(`ลบ "${e.name}" ?`)) return;
          entries = entries.filter((x) => x.id !== e.id);
          saveEntries();
          render();
        };
        wrap.appendChild(row);
      }
      list.appendChild(wrap);
    }
  }

  // ---------- Image processing ----------
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }
  function resize(img, maxSide, quality, square = false) {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (square) {
      const s = Math.min(img.width, img.height);
      c.width = c.height = maxSide;
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, maxSide, maxSide);
    } else {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      ctx.drawImage(img, 0, 0, c.width, c.height);
    }
    return c.toDataURL("image/jpeg", quality);
  }

  // ---------- AI (OpenAI-compatible gateway, e.g. KKU IntelSphere) ----------
  const PROMPT = `คุณเป็นนักโภชนาการผู้เชี่ยวชาญ วิเคราะห์รูปภาพอาหารนี้
ระบุอาหารแต่ละอย่างที่เห็น ประมาณขนาดสัดส่วน และประเมินแคลอรี่ (kcal) ให้สมจริงที่สุด
ตอบเป็น JSON อย่างเดียว ห้ามมีข้อความอื่น ตามรูปแบบนี้:
{"is_food": true, "dish_name": "ชื่อเมนูโดยรวมภาษาไทย", "items": [{"name": "ชื่ออาหารภาษาไทย", "portion": "ขนาดโดยประมาณ", "calories": 0}], "total_calories": 0}
ถ้ารูปไม่ใช่อาหาร ให้ตอบ {"is_food": false, "dish_name": "", "items": [], "total_calories": 0}`;

  const apiUrl = (path) => (settings.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "") + path;

  // models may wrap the JSON in ```json fences or add a sentence around it
  function parseJson(text) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("ไม่ได้รับผลการวิเคราะห์ ลองใหม่อีกครั้ง");
    return JSON.parse(text.slice(start, end + 1));
  }

  async function analyze(dataUrl) {
    const res = await fetch(apiUrl("/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model || DEFAULT_MODEL,
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      let msg = `เกิดข้อผิดพลาด (${res.status})`;
      try {
        const err = await res.json();
        const m = (err.error && (err.error.message || err.error)) || err.message || err.detail;
        if (typeof m === "string") msg = m;
      } catch {}
      if (res.status === 401 || res.status === 403) msg = "API Key ไม่ถูกต้อง กรุณาตรวจสอบในหน้าตั้งค่า";
      if (res.status === 429) msg = "เรียกใช้งานถี่เกินไปหรือโควต้าหมด ลองใหม่อีกครั้งภายหลัง";
      throw new Error(msg);
    }
    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    const text = Array.isArray(content) ? content.map((c) => c.text || "").join("") : content || "";
    return parseJson(text);
  }

  async function loadModels() {
    const sel = $("model");
    try {
      const res = await fetch(apiUrl("/models"), {
        headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      const ids = (data.data || []).map((m) => m.id);
      if (!ids.length) return;
      const current = sel.value || settings.model;
      sel.innerHTML = ids.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join("");
      if (!ids.includes(current)) sel.insertAdjacentHTML("afterbegin", `<option>${escapeHtml(current)}</option>`);
      sel.value = current;
    } catch {}
  }

  // ---------- Capture flow ----------
  let pending = null; // { thumb, dishName, items: [{name, calories, portion}] }
  let selectedMeal = guessMeal();

  async function handleFile(file) {
    if (!file) return;
    if (!settings.apiKey) {
      toast("กรุณาใส่ API Key ในหน้าตั้งค่าก่อน", true);
      openSettings();
      return;
    }
    try {
      const src = await readFile(file);
      const img = await loadImage(src);
      const big = resize(img, 1024, 0.85);
      const thumb = resize(img, 160, 0.7, true);

      $("previewImg").src = big;
      $("preview").hidden = false;
      $("result").hidden = true;
      $("loading").hidden = false;
      setCaptureDisabled(true);

      const out = await analyze(big);
      if (out.is_food === false || !out.items || !out.items.length) {
        throw new Error("ไม่พบอาหารในรูปนี้ ลองถ่ายใหม่อีกครั้ง");
      }
      pending = {
        thumb,
        dishName: out.dish_name || out.items.map((i) => i.name).join(", "),
        items: out.items.map((i) => ({
          name: String(i.name || "อาหาร"),
          calories: Math.round(Number(i.calories) || 0),
          portion: i.portion || "",
        })),
      };
      showResult();
    } catch (err) {
      toast(err.message || "วิเคราะห์ไม่สำเร็จ", true);
      $("preview").hidden = true;
    } finally {
      $("loading").hidden = true;
      setCaptureDisabled(false);
    }
  }

  function setCaptureDisabled(v) {
    $("btnCamera").disabled = v;
    $("btnGallery").disabled = v;
  }

  function showResult() {
    const box = $("resultItems");
    box.innerHTML = "";
    pending.items.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "result-row";
      row.innerHTML = `
        <input type="text" value="${escapeHtml(item.name)}" placeholder="ชื่อเมนู" />
        <input type="number" value="${item.calories}" min="0" inputmode="numeric" placeholder="kcal" />
        <button class="row-del" aria-label="ลบ">✕</button>
        ${item.portion ? `<div class="portion">≈ ${escapeHtml(item.portion)}</div>` : ""}`;
      const [nameIn, calIn] = row.querySelectorAll("input");
      nameIn.oninput = () => (item.name = nameIn.value);
      calIn.oninput = () => {
        item.calories = Math.max(0, Math.round(Number(calIn.value) || 0));
        updateResultTotal();
      };
      row.querySelector(".row-del").onclick = () => {
        pending.items.splice(idx, 1);
        showResult();
      };
      box.appendChild(row);
    });
    updateResultTotal();
    document.querySelectorAll("#mealPick button").forEach((b) => b.classList.toggle("active", b.dataset.meal === selectedMeal));
    $("result").hidden = false;
    $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function updateResultTotal() {
    $("resultTotal").textContent = pending.items.reduce((s, i) => s + i.calories, 0).toLocaleString();
  }

  function resetCapture() {
    pending = null;
    $("result").hidden = true;
    $("preview").hidden = true;
    $("previewImg").removeAttribute("src");
  }

  function savePending() {
    const items = pending.items.filter((i) => i.name.trim());
    if (!items.length) return toast("ต้องมีอย่างน้อย 1 รายการ", true);
    const now = new Date();
    // saving while viewing a past day records it on that day
    entries.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: viewDate,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      meal: selectedMeal,
      name: items.length === 1 ? items[0].name : pending.dishName || items.map((i) => i.name).join(", "),
      calories: items.reduce((s, i) => s + i.calories, 0),
      items,
      thumb: pending.thumb,
    });
    if (!saveEntries()) toast("พื้นที่จัดเก็บเต็ม บันทึกไม่สำเร็จ", true);
    else toast("บันทึกเรียบร้อย ✓");
    resetCapture();
    render();
  }

  // ---------- Settings ----------
  function openSettings() {
    $("apiKey").value = settings.apiKey;
    $("baseUrl").value = settings.baseUrl;
    const sel = $("model");
    if (![...sel.options].some((o) => o.value === settings.model)) {
      sel.insertAdjacentHTML("afterbegin", `<option>${escapeHtml(settings.model)}</option>`);
    }
    sel.value = settings.model;
    $("goal").value = settings.goal;
    $("settingsModal").hidden = false;
    loadModels();
  }
  function closeSettings() {
    $("settingsModal").hidden = true;
  }

  // ---------- Events ----------
  $("btnCamera").onclick = () => $("fileInput").click();
  $("btnGallery").onclick = () => $("galleryInput").click();
  for (const id of ["fileInput", "galleryInput"]) {
    $(id).onchange = (e) => {
      handleFile(e.target.files[0]);
      e.target.value = "";
    };
  }
  $("btnManual").onclick = () => {
    pending = { thumb: null, dishName: "", items: [{ name: "", calories: 0, portion: "" }] };
    $("preview").hidden = true;
    showResult();
    $("resultItems").querySelector("input").focus();
  };
  $("btnAddItem").onclick = () => {
    pending.items.push({ name: "", calories: 0, portion: "" });
    showResult();
  };
  $("mealPick").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    selectedMeal = b.dataset.meal;
    document.querySelectorAll("#mealPick button").forEach((x) => x.classList.toggle("active", x === b));
  };
  $("btnCancel").onclick = resetCapture;
  $("btnSave").onclick = savePending;

  $("prevDay").onclick = () => {
    viewDate = shiftDate(viewDate, -1);
    render();
  };
  $("nextDay").onclick = () => {
    if (viewDate < todayKey()) viewDate = shiftDate(viewDate, 1);
    render();
  };

  $("btnSettings").onclick = openSettings;
  $("btnCloseSettings").onclick = closeSettings;
  $("settingsModal").onclick = (e) => {
    if (e.target.id === "settingsModal") closeSettings();
  };
  $("btnSaveSettings").onclick = () => {
    settings = {
      apiKey: $("apiKey").value.trim(),
      baseUrl: $("baseUrl").value.trim() || DEFAULT_BASE_URL,
      model: $("model").value || DEFAULT_MODEL,
      goal: Math.max(500, Number($("goal").value) || 2000),
    };
    save(SETTINGS_KEY, settings);
    closeSettings();
    render();
    toast("บันทึกการตั้งค่าแล้ว ✓");
  };
  $("btnClear").onclick = () => {
    if (!confirm("ต้องการลบประวัติการกินทั้งหมดใช่ไหม?")) return;
    entries = [];
    saveEntries();
    closeSettings();
    render();
    toast("ล้างข้อมูลแล้ว");
  };

  render();
})();
