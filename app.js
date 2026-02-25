(function () {
  "use strict";

  const STORAGE_CODE_KEY = "calm_app_relationship_code";
  const STORAGE_DEVICE_KEY = "calm_app_device_id";

  const config = window.APP_CONFIG || {};
  const supabaseUrl = (config.SUPABASE_URL || "").replace(/\/$/, "");
  const supabaseKey = config.SUPABASE_ANON_KEY || "";

  const state = {
    relationshipCode: "",
    deviceId: getOrCreateDeviceId(),
  };

  const el = {
    relationshipCode: document.getElementById("relationshipCode"),
    openSessionBtn: document.getElementById("openSessionBtn"),
    sessionStatus: document.getElementById("sessionStatus"),

    reflectionCard: document.getElementById("reflectionCard"),
    reflectionForm: document.getElementById("reflectionForm"),
    triggerType: document.getElementById("triggerType"),
    currentFeeling: document.getElementById("currentFeeling"),
    currentNeed: document.getElementById("currentNeed"),

    partnerCard: document.getElementById("partnerCard"),
    partnerAnswer: document.getElementById("partnerAnswer"),
    reloadPartnerBtn: document.getElementById("reloadPartnerBtn"),

    commitmentCard: document.getElementById("commitmentCard"),
    commitmentForm: document.getElementById("commitmentForm"),
    nextCommitment: document.getElementById("nextCommitment"),
    myCommitment: document.getElementById("myCommitment"),
    otherCommitment: document.getElementById("otherCommitment"),

    toolsCard: document.getElementById("toolsCard"),
    resetSessionBtn: document.getElementById("resetSessionBtn"),
  };

  function init() {
    if (!supabaseUrl || !supabaseKey) {
      setStatus(
        "Bitte zuerst SUPABASE_URL und SUPABASE_ANON_KEY in config.js eintragen.",
        true
      );
    }

    const savedCode = localStorage.getItem(STORAGE_CODE_KEY);
    if (savedCode) {
      el.relationshipCode.value = savedCode;
    }

    el.openSessionBtn.addEventListener("click", openSession);
    el.reflectionForm.addEventListener("submit", onReflectionSubmit);
    el.reloadPartnerBtn.addEventListener("click", loadPartnerReflection);
    el.commitmentForm.addEventListener("submit", onCommitmentSubmit);
    el.resetSessionBtn.addEventListener("click", resetLocalSession);

    registerServiceWorker();
  }

  async function openSession() {
    const rawCode = (el.relationshipCode.value || "").trim();
    const normalizedCode = rawCode.replace(/\D/g, "");

    if (!/^\d{6}$/.test(normalizedCode)) {
      setStatus("Bitte einen gueltigen 6-stelligen Code eingeben.", true);
      return;
    }

    state.relationshipCode = normalizedCode;
    localStorage.setItem(STORAGE_CODE_KEY, normalizedCode);
    setStatus("Session geoeffnet.");

    showAppSections();
    await loadPartnerReflection();
    await loadCommitments();
  }

  async function onReflectionSubmit(event) {
    event.preventDefault();
    if (!hasOpenSession()) return;

    const payload = {
      relationship_code: state.relationshipCode,
      author_id: state.deviceId,
      trigger_type: el.triggerType.value,
      feeling: el.currentFeeling.value.trim(),
      need_text: el.currentNeed.value.trim(),
    };

    if (!payload.trigger_type || !payload.feeling || !payload.need_text) {
      setStatus("Bitte alle Pflichtfelder ausfuellen.", true);
      return;
    }

    try {
      await apiRequest({
        method: "POST",
        table: "reflections",
        body: [payload],
      });
      el.reflectionForm.reset();
      setStatus("Antwort gespeichert.");
    } catch (err) {
      setStatus(`Speichern fehlgeschlagen: ${err.message}`, true);
    }
  }

  async function loadPartnerReflection() {
    if (!hasOpenSession()) return;

    try {
      const params = new URLSearchParams({
        relationship_code: `eq.${state.relationshipCode}`,
        order: "created_at.desc",
        limit: "20",
      });

      const rows = await apiRequest({
        method: "GET",
        table: `reflections?${params.toString()}`,
      });

      const partnerEntry = rows.find((r) => r.author_id !== state.deviceId);
      renderPartnerReflection(partnerEntry || null);
    } catch (err) {
      el.partnerAnswer.innerHTML = `<p class="subtle">Fehler beim Laden: ${escapeHtml(
        err.message
      )}</p>`;
    }
  }

  async function onCommitmentSubmit(event) {
    event.preventDefault();
    if (!hasOpenSession()) return;

    const commitmentText = el.nextCommitment.value.trim();
    if (!commitmentText) {
      setStatus("Bitte ein Commitment eintragen.", true);
      return;
    }

    const payload = {
      relationship_code: state.relationshipCode,
      author_id: state.deviceId,
      commitment_text: commitmentText,
      updated_at: new Date().toISOString(),
    };

    try {
      await apiRequest({
        method: "POST",
        table: "commitments?on_conflict=relationship_code,author_id",
        body: [payload],
        extraHeaders: {
          Prefer: "resolution=merge-duplicates",
        },
      });
      el.commitmentForm.reset();
      await loadCommitments();
      setStatus("Commitment gespeichert.");
    } catch (err) {
      setStatus(`Commitment fehlgeschlagen: ${err.message}`, true);
    }
  }

  async function loadCommitments() {
    if (!hasOpenSession()) return;

    try {
      const params = new URLSearchParams({
        relationship_code: `eq.${state.relationshipCode}`,
        order: "updated_at.desc",
      });

      const rows = await apiRequest({
        method: "GET",
        table: `commitments?${params.toString()}`,
      });

      const mine = rows.find((r) => r.author_id === state.deviceId) || null;
      const other = rows.find((r) => r.author_id !== state.deviceId) || null;

      renderCommitment(el.myCommitment, "Mein Commitment", mine);
      renderCommitment(el.otherCommitment, "Anderes Commitment", other);
    } catch (err) {
      el.myCommitment.innerHTML = `<p class="subtle">Fehler beim Laden: ${escapeHtml(
        err.message
      )}</p>`;
      el.otherCommitment.innerHTML = "";
    }
  }

  function renderPartnerReflection(entry) {
    if (!entry) {
      el.partnerAnswer.innerHTML =
        '<p class="subtle">Noch keine Antwort der anderen Person gefunden.</p>';
      return;
    }

    el.partnerAnswer.innerHTML = [
      `<div class="meta">${formatDate(entry.created_at)}</div>`,
      `<p><strong>Trigger:</strong> ${escapeHtml(entry.trigger_type)}</p>`,
      `<p><strong>Gefuehl:</strong> ${escapeHtml(entry.feeling)}</p>`,
      `<p><strong>Braucht gerade:</strong> ${escapeHtml(entry.need_text)}</p>`,
    ].join("");
  }

  function renderCommitment(target, title, entry) {
    if (!entry) {
      target.innerHTML = `<p class="subtle">${title}: noch nichts gespeichert.</p>`;
      return;
    }

    target.innerHTML = [
      `<p><strong>${escapeHtml(title)}</strong></p>`,
      `<div class="meta">${formatDate(entry.updated_at)}</div>`,
      `<p>${escapeHtml(entry.commitment_text)}</p>`,
    ].join("");
  }

  function hasOpenSession() {
    if (!state.relationshipCode) {
      setStatus("Bitte zuerst eine Session oeffnen.", true);
      return false;
    }
    return true;
  }

  function showAppSections() {
    el.reflectionCard.classList.remove("hidden");
    el.partnerCard.classList.remove("hidden");
    el.commitmentCard.classList.remove("hidden");
    el.toolsCard.classList.remove("hidden");
  }

  function setStatus(message, isError = false) {
    el.sessionStatus.textContent = message;
    el.sessionStatus.style.color = isError ? "#8c4d4d" : "";
  }

  function resetLocalSession() {
    localStorage.removeItem(STORAGE_CODE_KEY);
    state.relationshipCode = "";
    el.relationshipCode.value = "";
    el.reflectionCard.classList.add("hidden");
    el.partnerCard.classList.add("hidden");
    el.commitmentCard.classList.add("hidden");
    el.toolsCard.classList.add("hidden");
    setStatus("Lokale Session-Daten wurden geloescht.");
  }

  async function apiRequest({ method, table, body, extraHeaders }) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase Konfiguration fehlt");
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const reason = data && data.message ? data.message : response.statusText;
      throw new Error(reason || "Unbekannter API-Fehler");
    }

    return data;
  }

  function getOrCreateDeviceId() {
    const existing = localStorage.getItem(STORAGE_DEVICE_KEY);
    if (existing) return existing;

    const id =
      "d-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(STORAGE_DEVICE_KEY, id);
    return id;
  }

  function formatDate(isoString) {
    if (!isoString) return "ohne Zeitstempel";
    try {
      return new Date(isoString).toLocaleString("de-DE");
    } catch (_) {
      return isoString;
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("./sw.js").catch(function () {
          // Offline support is optional, fail silently.
        });
      });
    }
  }

  init();
})();
