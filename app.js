(function () {
  "use strict";

  const STORAGE_CODE_KEY = "calm_app_relationship_code";
  const STORAGE_DEVICE_KEY = "calm_app_device_id";
  const STORAGE_ROLE_KEY = "calm_app_person_role";
  const SECTION_DEFINITIONS = [
    { key: "appreciation", title: "1) Was ich an dir mag / schaetze" },
    { key: "my_mistakes", title: "2) Was ich falsch gemacht habe" },
    { key: "wishes", title: "3) Was ich mir von dir wuensche" },
    {
      key: "my_self_reflection",
      title: "4) Was ich selbst besser haette machen koennen",
    },
    { key: "future_rules", title: "5) Was wir kuenftig besser machen wollen" },
  ];

  const config = window.APP_CONFIG || {};
  const supabaseUrl = (config.SUPABASE_URL || "").replace(/\/$/, "");
  const supabaseKey = config.SUPABASE_ANON_KEY || "";

  const state = {
    relationshipCode: "",
    deviceId: getOrCreateDeviceId(),
    personRole: "batu",
    sectionIndex: 0,
    lines: [],
  };

  const el = {
    relationshipCode: document.getElementById("relationshipCode"),
    personRole: document.getElementById("personRole"),
    openSessionBtn: document.getElementById("openSessionBtn"),
    sessionStatus: document.getElementById("sessionStatus"),

    progressCard: document.getElementById("progressCard"),
    progressText: document.getElementById("progressText"),

    sectionCard: document.getElementById("sectionCard"),
    sectionTitle: document.getElementById("sectionTitle"),
    lineForm: document.getElementById("lineForm"),
    lineInput: document.getElementById("lineInput"),
    myLinesList: document.getElementById("myLinesList"),
    otherLinesList: document.getElementById("otherLinesList"),
    myLinesTitle: document.getElementById("myLinesTitle"),
    otherLinesTitle: document.getElementById("otherLinesTitle"),
    prevSectionBtn: document.getElementById("prevSectionBtn"),
    reloadSectionBtn: document.getElementById("reloadSectionBtn"),
    nextSectionBtn: document.getElementById("nextSectionBtn"),

    finalCard: document.getElementById("finalCard"),
    loadFinalBtn: document.getElementById("loadFinalBtn"),
    finalView: document.getElementById("finalView"),
    finalMine: document.getElementById("finalMine"),
    finalOther: document.getElementById("finalOther"),
    finalMineTitle: document.getElementById("finalMineTitle"),
    finalOtherTitle: document.getElementById("finalOtherTitle"),

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
    const savedRole = localStorage.getItem(STORAGE_ROLE_KEY);
    if (savedRole === "batu" || savedRole === "sevgi") {
      state.personRole = savedRole;
      el.personRole.value = savedRole;
    }

    el.openSessionBtn.addEventListener("click", openSession);
    el.lineForm.addEventListener("submit", onLineSubmit);
    el.prevSectionBtn.addEventListener("click", goToPreviousSection);
    el.nextSectionBtn.addEventListener("click", goToNextSection);
    el.reloadSectionBtn.addEventListener("click", loadAndRenderCurrentSection);
    el.loadFinalBtn.addEventListener("click", loadFinalView);
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
    const role = (el.personRole.value || "").trim();
    if (role !== "batu" && role !== "sevgi") {
      setStatus("Bitte waehlen, ob du Batu oder Sevgi bist.", true);
      return;
    }

    state.relationshipCode = normalizedCode;
    state.personRole = role;
    localStorage.setItem(STORAGE_CODE_KEY, normalizedCode);
    localStorage.setItem(STORAGE_ROLE_KEY, role);
    setStatus("Session geoeffnet.");

    showAppSections();
    updatePersonLabels();
    await loadAndRenderCurrentSection();
    el.lineInput.focus();
  }

  async function onLineSubmit(event) {
    event.preventDefault();
    if (!hasOpenSession()) return;

    const section = SECTION_DEFINITIONS[state.sectionIndex];
    if (!section) return;

    const lineText = (el.lineInput.value || "").trim();
    if (!lineText) {
      setStatus("Bitte eine kurze Zeile eingeben.", true);
      return;
    }

    const payload = {
      relationship_code: state.relationshipCode,
      author_id: state.deviceId,
      section_key: section.key,
      line_text: lineText,
    };

    try {
      await apiRequest({
        method: "POST",
        table: "section_lines",
        body: [payload],
      });
      el.lineForm.reset();
      setStatus("Zeile gespeichert.");
      await loadAndRenderCurrentSection();
      el.lineInput.focus();
    } catch (err) {
      setStatus(`Speichern fehlgeschlagen: ${err.message}`, true);
    }
  }

  async function loadAndRenderCurrentSection() {
    if (!hasOpenSession()) return;

    try {
      const section = SECTION_DEFINITIONS[state.sectionIndex];
      if (!section) return;

      const params = new URLSearchParams({
        relationship_code: `eq.${state.relationshipCode}`,
        section_key: `eq.${section.key}`,
        order: "created_at.asc",
        limit: "300",
      });

      state.lines = await apiRequest({
        method: "GET",
        table: `section_lines?${params.toString()}`,
      });
      renderCurrentSection();
      setStatus("Bereich aktualisiert.");
    } catch (err) {
      setStatus(`Laden fehlgeschlagen: ${err.message}`, true);
    }
  }

  function renderCurrentSection() {
    const section = SECTION_DEFINITIONS[state.sectionIndex];
    if (!section) return;

    const mine = state.lines.filter((line) => line.author_id === state.deviceId);
    const other = state.lines.filter((line) => line.author_id !== state.deviceId);

    updatePersonLabels();
    el.sectionTitle.textContent = section.title;
    el.progressText.textContent = `Bereich ${state.sectionIndex + 1} von ${SECTION_DEFINITIONS.length}`;
    renderLinesList(el.myLinesList, mine, "Noch keine Zeile gespeichert.");
    renderLinesList(el.otherLinesList, other, "Noch keine Zeile vorhanden.");
    el.prevSectionBtn.disabled = state.sectionIndex === 0;
    el.nextSectionBtn.disabled = state.sectionIndex === SECTION_DEFINITIONS.length - 1;
  }

  function renderLinesList(target, lines, emptyMessage) {
    if (!lines.length) {
      target.innerHTML = `<li class="subtle">${escapeHtml(emptyMessage)}</li>`;
      return;
    }

    target.innerHTML = lines
      .map(
        (line) =>
          `<li><div class="line-row"><span class="line-text">${escapeHtml(
            line.line_text
          )}</span><span class="meta">${formatDate(line.created_at)}</span></div></li>`
      )
      .join("");
  }

  function goToPreviousSection() {
    if (state.sectionIndex === 0) return;
    state.sectionIndex -= 1;
    loadAndRenderCurrentSection();
  }

  function goToNextSection() {
    if (state.sectionIndex >= SECTION_DEFINITIONS.length - 1) return;
    state.sectionIndex += 1;
    loadAndRenderCurrentSection();
  }

  async function loadFinalView() {
    if (!hasOpenSession()) return;

    try {
      const params = new URLSearchParams({
        relationship_code: `eq.${state.relationshipCode}`,
        order: "created_at.asc",
        limit: "1200",
      });

      const rows = await apiRequest({
        method: "GET",
        table: `section_lines?${params.toString()}`,
      });
      const mine = rows.filter((row) => row.author_id === state.deviceId);
      const other = rows.filter((row) => row.author_id !== state.deviceId);

      updatePersonLabels();
      renderFinalColumn(el.finalMine, mine);
      renderFinalColumn(el.finalOther, other);
      el.finalView.classList.remove("hidden");
      setStatus("Abschlussansicht geladen.");
    } catch (err) {
      setStatus(`Abschlussansicht fehlgeschlagen: ${err.message}`, true);
    }
  }

  function renderFinalColumn(target, rows) {
    if (!rows.length) {
      target.innerHTML = '<p class="subtle">Noch keine Aussagen vorhanden.</p>';
      return;
    }

    target.innerHTML = SECTION_DEFINITIONS.map((section) => {
      const sectionRows = rows.filter((row) => row.section_key === section.key);
      const sectionLines = sectionRows.length
        ? `<ul class="line-list">${sectionRows
            .map(
              (row) =>
                `<li><div class="line-row"><span class="line-text">${escapeHtml(
                  row.line_text
                )}</span><span class="meta">${formatDate(row.created_at)}</span></div></li>`
            )
            .join("")}</ul>`
        : '<p class="subtle">Keine Aussage.</p>';

      return `<section class="final-section"><h4>${escapeHtml(
        section.title
      )}</h4>${sectionLines}</section>`;
    }).join("");
  }

  function hasOpenSession() {
    if (!state.relationshipCode) {
      setStatus("Bitte zuerst eine Session oeffnen.", true);
      return false;
    }
    return true;
  }

  function showAppSections() {
    el.progressCard.classList.remove("hidden");
    el.sectionCard.classList.remove("hidden");
    el.finalCard.classList.remove("hidden");
    el.toolsCard.classList.remove("hidden");
  }

  function updatePersonLabels() {
    const myName = state.personRole === "sevgi" ? "Sevgi" : "Batu";
    const otherName = state.personRole === "sevgi" ? "Batu" : "Sevgi";

    el.myLinesTitle.textContent = `${myName} - Meine Zeilen`;
    el.otherLinesTitle.textContent = otherName;
    el.finalMineTitle.textContent = myName;
    el.finalOtherTitle.textContent = otherName;
  }

  function setStatus(message, isError = false) {
    el.sessionStatus.textContent = message;
    el.sessionStatus.style.color = isError ? "#8c4d4d" : "";
  }

  function resetLocalSession() {
    localStorage.removeItem(STORAGE_CODE_KEY);
    localStorage.removeItem(STORAGE_ROLE_KEY);
    state.relationshipCode = "";
    state.personRole = "batu";
    state.sectionIndex = 0;
    state.lines = [];
    el.relationshipCode.value = "";
    el.personRole.value = "batu";
    el.progressCard.classList.add("hidden");
    el.sectionCard.classList.add("hidden");
    el.finalCard.classList.add("hidden");
    el.finalView.classList.add("hidden");
    el.toolsCard.classList.add("hidden");
    updatePersonLabels();
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
