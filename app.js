(function () {
  "use strict";

  const STORAGE_CODE_KEY = "calm_app_relationship_code";
  const STORAGE_DEVICE_KEY = "calm_app_device_id";
  const STORAGE_ROLE_KEY = "calm_app_person_role";
  const STORAGE_ROMANCE_KEY = "calm_app_romance_enabled";
  const TURKISH_POEMS = [
    "Kalbim, senin yanında sakinleşiyor.",
    "Aşk bazen konuşmak değil, anlamaktır.",
    "Seninle en zor gün bile biraz daha yumuşak.",
    "Bakışında evim var, sesinde huzurum.",
    "Kalbime en çok sen iyi geliyorsun.",
    "Birlikte susunca bile birbirimizi duyuyoruz.",
    "Yanımda olduğunda dünya daha nazik.",
    "Kırıldığımız yerde bile sevgiyi seçiyoruz.",
    "Sevgi, aynı yöne birlikte yürümektir.",
    "Kalbim, adını her gün yeniden öğreniyor.",
    "Sana bakınca içimdeki fırtına diner.",
    "Biz, birbirine iyi gelmeyi seçen iki kalbiz.",
  ];
  const SECTION_DEFINITIONS = [
    { key: "appreciation", title: "1) Was ich an dir mag / schätze" },
    { key: "my_mistakes", title: "2) Was ich falsch gemacht habe" },
    { key: "wishes", title: "3) Was ich mir von dir wünsche" },
    {
      key: "my_self_reflection",
      title: "4) Was ich selbst besser hätte machen können",
    },
    { key: "future_rules", title: "5) Was wir künftig besser machen wollen" },
  ];

  const config = window.APP_CONFIG || {};
  const supabaseUrl = (config.SUPABASE_URL || "").replace(/\/$/, "");
  const supabaseKey = config.SUPABASE_ANON_KEY || "";

  const state = {
    relationshipCode: "",
    deviceId: getOrCreateDeviceId(),
    personRole: "batu",
    romanceEnabled: true,
    popupTimerId: null,
    sectionIndex: 0,
    lines: [],
    sharedGoalText: "",
    gratitudeRows: [],
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
    closureForm: document.getElementById("closureForm"),
    sharedGoalInput: document.getElementById("sharedGoalInput"),
    gratitudeInput: document.getElementById("gratitudeInput"),
    saveClosureBtn: document.getElementById("saveClosureBtn"),
    loadFinalBtn: document.getElementById("loadFinalBtn"),
    closureSummary: document.getElementById("closureSummary"),
    sharedGoalText: document.getElementById("sharedGoalText"),
    gratitudeList: document.getElementById("gratitudeList"),
    finalView: document.getElementById("finalView"),
    finalMine: document.getElementById("finalMine"),
    finalOther: document.getElementById("finalOther"),
    finalMineTitle: document.getElementById("finalMineTitle"),
    finalOtherTitle: document.getElementById("finalOtherTitle"),

    toolsCard: document.getElementById("toolsCard"),
    romanceToggle: document.getElementById("romanceToggle"),
    resetSessionBtn: document.getElementById("resetSessionBtn"),
    poemPopup: document.getElementById("poemPopup"),
    poemPopupText: document.getElementById("poemPopupText"),
    closePoemPopupBtn: document.getElementById("closePoemPopupBtn"),
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
    const savedRomanceSetting = localStorage.getItem(STORAGE_ROMANCE_KEY);
    if (savedRomanceSetting === "false") {
      state.romanceEnabled = false;
    }
    el.romanceToggle.checked = state.romanceEnabled;

    el.openSessionBtn.addEventListener("click", openSession);
    el.lineForm.addEventListener("submit", onLineSubmit);
    el.prevSectionBtn.addEventListener("click", goToPreviousSection);
    el.nextSectionBtn.addEventListener("click", goToNextSection);
    el.reloadSectionBtn.addEventListener("click", loadAndRenderCurrentSection);
    el.closureForm.addEventListener("submit", onClosureSubmit);
    el.loadFinalBtn.addEventListener("click", loadFinalView);
    el.romanceToggle.addEventListener("change", onRomanceToggleChange);
    el.resetSessionBtn.addEventListener("click", resetLocalSession);
    el.closePoemPopupBtn.addEventListener("click", hidePoemPopup);

    registerServiceWorker();
  }

  async function openSession() {
    const rawCode = (el.relationshipCode.value || "").trim();
    const normalizedCode = rawCode.replace(/\D/g, "");

    if (!/^\d{6}$/.test(normalizedCode)) {
      setStatus("Bitte einen gültigen 6-stelligen Code eingeben.", true);
      return;
    }
    const role = (el.personRole.value || "").trim();
    if (role !== "batu" && role !== "sevgi") {
      setStatus("Bitte wählen, ob du Batu oder Sevgi bist.", true);
      return;
    }

    state.relationshipCode = normalizedCode;
    state.personRole = role;
    localStorage.setItem(STORAGE_CODE_KEY, normalizedCode);
    localStorage.setItem(STORAGE_ROLE_KEY, role);
    setStatus("Session geöffnet.");

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
      maybeShowPoem("save");
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
    maybeShowPoem("section");
  }

  function goToNextSection() {
    if (state.sectionIndex >= SECTION_DEFINITIONS.length - 1) return;
    state.sectionIndex += 1;
    loadAndRenderCurrentSection();
    maybeShowPoem("section");
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
      await loadClosureData();
      renderFinalColumn(el.finalMine, mine);
      renderFinalColumn(el.finalOther, other);
      el.finalView.classList.remove("hidden");
      el.closureSummary.classList.remove("hidden");
      setStatus("Abschlussansicht geladen.");
    } catch (err) {
      setStatus(`Abschlussansicht fehlgeschlagen: ${err.message}`, true);
    }
  }

  async function onClosureSubmit(event) {
    event.preventDefault();
    if (!hasOpenSession()) return;

    const sharedGoalText = (el.sharedGoalInput.value || "").trim();
    const gratitudeText = (el.gratitudeInput.value || "").trim();

    if (!sharedGoalText || !gratitudeText) {
      setStatus("Bitte gemeinsames Ziel und Danke-Satz ausfüllen.", true);
      return;
    }

    try {
      await apiRequest({
        method: "POST",
        table: "shared_24h_goals?on_conflict=relationship_code",
        body: [
          {
            relationship_code: state.relationshipCode,
            goal_text: sharedGoalText,
            author_id: state.deviceId,
            updated_at: new Date().toISOString(),
          },
        ],
        extraHeaders: {
          Prefer: "resolution=merge-duplicates",
        },
      });

      await apiRequest({
        method: "POST",
        table: "gratitude_notes?on_conflict=relationship_code,author_id",
        body: [
          {
            relationship_code: state.relationshipCode,
            author_id: state.deviceId,
            gratitude_text: gratitudeText,
            updated_at: new Date().toISOString(),
          },
        ],
        extraHeaders: {
          Prefer: "resolution=merge-duplicates",
        },
      });

      setStatus("Abschluss gespeichert.");
      await loadClosureData();
      el.closureSummary.classList.remove("hidden");
      maybeShowPoem("save");
    } catch (err) {
      const message = String(err.message || "");
      if (message.includes("Could not find the table")) {
        setStatus(
          "Abschluss-Tabellen fehlen noch in Supabase. Bitte den neuen SQL-Block aus README ausführen.",
          true
        );
        return;
      }
      setStatus(`Abschluss speichern fehlgeschlagen: ${err.message}`, true);
    }
  }

  async function loadClosureData() {
    const goalParams = new URLSearchParams({
      relationship_code: `eq.${state.relationshipCode}`,
      limit: "1",
    });
    const gratitudeParams = new URLSearchParams({
      relationship_code: `eq.${state.relationshipCode}`,
      order: "updated_at.asc",
      limit: "20",
    });

    const [goalRows, gratitudeRows] = await Promise.all([
      apiRequest({
        method: "GET",
        table: `shared_24h_goals?${goalParams.toString()}`,
      }),
      apiRequest({
        method: "GET",
        table: `gratitude_notes?${gratitudeParams.toString()}`,
      }),
    ]);

    state.sharedGoalText = goalRows[0] && goalRows[0].goal_text ? goalRows[0].goal_text : "";
    state.gratitudeRows = gratitudeRows || [];
    const myGratitude = state.gratitudeRows.find((row) => row.author_id === state.deviceId);
    el.sharedGoalInput.value = state.sharedGoalText || "";
    el.gratitudeInput.value = myGratitude ? myGratitude.gratitude_text : "";
    renderClosureSummary();
  }

  function renderClosureSummary() {
    if (state.sharedGoalText) {
      el.sharedGoalText.textContent = state.sharedGoalText;
      el.sharedGoalText.classList.remove("subtle");
    } else {
      el.sharedGoalText.textContent = "Noch kein Ziel gespeichert.";
      el.sharedGoalText.classList.add("subtle");
    }

    const mine = state.gratitudeRows.find((row) => row.author_id === state.deviceId) || null;
    const other = state.gratitudeRows.find((row) => row.author_id !== state.deviceId) || null;
    const myName = state.personRole === "sevgi" ? "Sevgi" : "Batu";
    const otherName = state.personRole === "sevgi" ? "Batu" : "Sevgi";

    const gratitudeItems = [];
    if (mine) {
      gratitudeItems.push(
        `<li><div class="line-row"><span class="line-text"><strong>${escapeHtml(
          myName
        )}:</strong> ${escapeHtml(mine.gratitude_text)}</span><span class="meta">${formatDate(
          mine.updated_at
        )}</span></div></li>`
      );
    }
    if (other) {
      gratitudeItems.push(
        `<li><div class="line-row"><span class="line-text"><strong>${escapeHtml(
          otherName
        )}:</strong> ${escapeHtml(other.gratitude_text)}</span><span class="meta">${formatDate(
          other.updated_at
        )}</span></div></li>`
      );
    }

    if (!gratitudeItems.length) {
      el.gratitudeList.innerHTML = '<li class="subtle">Noch keine Danke-Sätze gespeichert.</li>';
      return;
    }
    el.gratitudeList.innerHTML = gratitudeItems.join("");
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
      setStatus("Bitte zuerst eine Session öffnen.", true);
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

  function onRomanceToggleChange() {
    state.romanceEnabled = Boolean(el.romanceToggle.checked);
    localStorage.setItem(STORAGE_ROMANCE_KEY, String(state.romanceEnabled));
    if (!state.romanceEnabled) {
      hidePoemPopup();
    }
  }

  function maybeShowPoem(reason) {
    if (!state.romanceEnabled) return;
    if (reason === "save" && Math.random() > 0.45) return;
    if (reason === "section" && Math.random() > 0.3) return;
    showPoemPopup(randomPoem());
  }

  function showPoemPopup(text) {
    if (!text) return;
    clearPopupTimer();
    el.poemPopupText.textContent = text;
    el.poemPopup.classList.remove("hidden");
    el.poemPopup.classList.add("show");
    state.popupTimerId = window.setTimeout(hidePoemPopup, 5500);
  }

  function hidePoemPopup() {
    clearPopupTimer();
    el.poemPopup.classList.remove("show");
    el.poemPopup.classList.add("hidden");
  }

  function clearPopupTimer() {
    if (state.popupTimerId) {
      window.clearTimeout(state.popupTimerId);
      state.popupTimerId = null;
    }
  }

  function randomPoem() {
    const randomIndex = Math.floor(Math.random() * TURKISH_POEMS.length);
    return TURKISH_POEMS[randomIndex];
  }

  function setStatus(message, isError = false) {
    el.sessionStatus.textContent = message;
    el.sessionStatus.style.color = isError ? "#8c4d4d" : "";
  }

  function resetLocalSession() {
    localStorage.removeItem(STORAGE_CODE_KEY);
    localStorage.removeItem(STORAGE_ROLE_KEY);
    localStorage.removeItem(STORAGE_ROMANCE_KEY);
    state.relationshipCode = "";
    state.personRole = "batu";
    state.romanceEnabled = true;
    state.sectionIndex = 0;
    state.lines = [];
    state.sharedGoalText = "";
    state.gratitudeRows = [];
    el.relationshipCode.value = "";
    el.personRole.value = "batu";
    el.romanceToggle.checked = true;
    el.sharedGoalInput.value = "";
    el.gratitudeInput.value = "";
    el.sharedGoalText.textContent = "Noch kein Ziel gespeichert.";
    el.sharedGoalText.classList.add("subtle");
    el.gratitudeList.innerHTML = '<li class="subtle">Noch keine Danke-Sätze gespeichert.</li>';
    el.closureSummary.classList.add("hidden");
    hidePoemPopup();
    el.progressCard.classList.add("hidden");
    el.sectionCard.classList.add("hidden");
    el.finalCard.classList.add("hidden");
    el.finalView.classList.add("hidden");
    el.toolsCard.classList.add("hidden");
    updatePersonLabels();
    setStatus("Lokale Session-Daten wurden gelöscht.");
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
