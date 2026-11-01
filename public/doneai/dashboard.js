/* ===== DoneAi Dashboard — app logic ===== */
(() => {
  const INTAKE_EMAIL = "doneai-5e346d28e8e1@intake.linear.app";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- toast ---------- */
  const toast = $("#toast");
  let toastT;
  function showToast(msg) {
    $("#toastMsg").textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  /* ---------- routing ---------- */
  const titles = {
    overview: ["Overview", "Here's what your AI workforce accomplished."],
    employees: ["AI Employees", "Manage and deploy your autonomous workforce."],
    tasks: ["Tasks", "Everything your AI employees are working on."],
    reports: ["Reports", "Performance, savings, and output over time."],
    integrations: ["Integrations", "Connect the tools your AI employees use."],
    settings: ["Settings", "Manage your workspace and preferences."],
  };
  function go(view) {
    if (!titles[view]) view = "overview";
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
    $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.view === view));
    $("#crumbHere").textContent = titles[view][0];
    document.querySelector(".app").classList.remove("nav-open");
    localStorage.setItem("doneai_view", view);
    $(".content").scrollTop = 0;
    window.scrollTo(0, 0);
    if (view === "reports") setTimeout(drawBars, 60);
  }
  $$(".nav-item").forEach((n) =>
    n.addEventListener("click", () => go(n.dataset.view))
  );

  /* ---------- mobile nav ---------- */
  $("#mobileToggle").addEventListener("click", () =>
    document.querySelector(".app").classList.add("nav-open")
  );
  $("#scrim").addEventListener("click", () =>
    document.querySelector(".app").classList.remove("nav-open")
  );

  /* ---------- counters ---------- */
  function animateCount(el) {
    const target = +el.dataset.counter;
    const suffix = el.dataset.suffix || "";
    const prefix = el.dataset.prefix || "";
    const dur = 1100, start = performance.now();
    const fmt = (n) => (target >= 1000 ? n.toLocaleString() : String(n));
    function tick(t) {
      const p = Math.min(1, (t - start) / dur);
      const v = Math.round(target * (1 - Math.pow(1 - p, 3)));
      el.textContent = prefix + fmt(v) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  $$("[data-counter]").forEach(animateCount);

  /* ---------- overview line chart ---------- */
  (function drawLine() {
    const svg = $("#ovLine");
    if (!svg) return;
    const W = 600, H = 230, pad = 28;
    const data = [42, 55, 48, 70, 64, 88, 79, 96, 90, 112, 124, 142];
    const max = 150;
    const x = (i) => pad + (i * (W - pad * 2)) / (data.length - 1);
    const y = (v) => H - pad - (v / max) * (H - pad * 2);
    let line = "", area = "";
    data.forEach((v, i) => {
      line += (i === 0 ? "M" : "L") + x(i).toFixed(1) + "," + y(v).toFixed(1) + " ";
    });
    area = line + `L${x(data.length - 1)},${H - pad} L${x(0)},${H - pad} Z`;
    // gridlines
    let grid = "";
    for (let g = 0; g <= 3; g++) {
      const gy = pad + (g * (H - pad * 2)) / 3;
      grid += `<line x1="${pad}" y1="${gy}" x2="${W - pad}" y2="${gy}" stroke="#eef2f6" stroke-width="1"/>`;
    }
    svg.innerHTML = `
      <defs><linearGradient id="ovg" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#16a34a" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#16a34a" stop-opacity="0"/>
      </linearGradient></defs>
      ${grid}
      <path d="${area}" fill="url(#ovg)"/>
      <path d="${line}" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" id="ovPath"/>
      ${data.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${i === data.length - 1 ? 4.5 : 0}" fill="#16a34a"/>`).join("")}`;
    requestAnimationFrame(() => {
      const p = $("#ovPath");
      p.style.transition = "stroke-dashoffset 1.6s cubic-bezier(.2,.7,.1,1)";
      p.style.strokeDashoffset = "0";
    });
  })();

  /* ---------- reports bar chart ---------- */
  window.drawBars = function drawBars() {
    $$("#repBars .bar").forEach((b) => {
      b.style.height = b.dataset.h + "%";
    });
  };

  /* ---------- reports donut ---------- */
  (function drawDonut() {
    const svg = $("#repDonut");
    if (!svg) return;
    const segs = [
      { v: 38, c: "#16a34a" },
      { v: 27, c: "#22c55e" },
      { v: 21, c: "#86efac" },
      { v: 14, c: "#bbf7d0" },
    ];
    const C = 75, R = 56, sw = 26;
    let off = 0;
    const circ = 2 * Math.PI * R;
    svg.innerHTML = `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#eef2f6" stroke-width="${sw}"/>` +
      segs.map((s) => {
        const len = (s.v / 100) * circ;
        const el = `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="${s.c}" stroke-width="${sw}"
          stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${C} ${C})" stroke-linecap="butt"/>`;
        off += len;
        return el;
      }).join("");
  })();

  /* ---------- employees: toggle active ---------- */
  $$(".emp-card .switch").forEach((sw) => {
    sw.addEventListener("click", () => {
      const card = sw.closest(".emp-card");
      const on = sw.classList.toggle("on");
      card.classList.toggle("paused", !on);
      const pill = card.querySelector(".pill");
      const name = card.querySelector(".nm").textContent;
      if (on) {
        pill.className = "pill green";
        pill.innerHTML = '<span class="d"></span>Active';
        showToast(name + " is now active");
      } else {
        pill.className = "pill gray";
        pill.innerHTML = '<span class="d"></span>Paused';
        showToast(name + " paused");
      }
    });
  });

  /* ---------- tasks: filters ---------- */
  $$(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$(".filter-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const f = chip.dataset.filter;
      $$(".task-row").forEach((row) => {
        const done = row.classList.contains("done");
        let show = true;
        if (f === "active") show = !done;
        else if (f === "done") show = done;
        row.style.display = show ? "" : "none";
      });
    });
  });

  /* ---------- tasks: check off ---------- */
  function bindCheck(chk) {
    chk.addEventListener("click", () => {
      const row = chk.closest(".task-row");
      const done = chk.classList.toggle("done");
      row.classList.toggle("done", done);
      const pill = row.querySelector(".t-status");
      if (done) {
        pill.className = "pill green t-status";
        pill.innerHTML = '<span class="d"></span>Done';
      } else {
        pill.className = "pill blue t-status";
        pill.innerHTML = '<span class="d"></span>In progress';
      }
      updateTaskCounts();
      // reapply current filter
      const active = $(".filter-chip.active");
      if (active) active.click();
    });
  }
  $$(".task-check").forEach(bindCheck);

  function updateTaskCounts() {
    const rows = $$(".task-row");
    const done = rows.filter((r) => r.classList.contains("done")).length;
    $("#fcAll").textContent = rows.length;
    $("#fcActive").textContent = rows.length - done;
    $("#fcDone").textContent = done;
  }

  /* ---------- add task modal ---------- */
  const taskModal = $("#taskModal");
  $("#addTaskBtn").addEventListener("click", () => {
    taskModal.classList.add("show");
    $("#taskInput").focus();
  });
  $$("[data-close-modal]").forEach((b) =>
    b.addEventListener("click", () => {
      taskModal.classList.remove("show");
      $("#hireModal").classList.remove("show");
    })
  );
  let taskAssignee = "Lead Qualifier";
  $$("#taskModal .choice").forEach((c) =>
    c.addEventListener("click", () => {
      $$("#taskModal .choice").forEach((x) => x.classList.remove("sel"));
      c.classList.add("sel");
      taskAssignee = c.dataset.name;
    })
  );
  $("#createTask").addEventListener("click", () => {
    const name = $("#taskInput").value.trim();
    if (!name) {
      $("#taskInput").focus();
      return;
    }
    const tbody = $("#taskBody");
    const tr = document.createElement("tr");
    tr.className = "task-row";
    tr.innerHTML = `
      <td><div class="task-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div></td>
      <td><div class="t-name">${escapeHtml(name)}</div><div class="t-sub">Created just now</div></td>
      <td><div class="t-assignee"><div class="av" style="background:var(--green-tint);color:var(--green-3)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></svg></div><span>${escapeHtml(taskAssignee)}</span></div></td>
      <td><span class="prio med">Medium</span></td>
      <td><span class="pill blue t-status"><span class="d"></span>In progress</span></td>`;
    tbody.prepend(tr);
    bindCheck(tr.querySelector(".task-check"));
    updateTaskCounts();
    taskModal.classList.remove("show");
    $("#taskInput").value = "";
    showToast("Task assigned to " + taskAssignee);
  });

  /* ---------- hire modal ---------- */
  const hireModal = $("#hireModal");
  $("#hireBtn").addEventListener("click", () => hireModal.classList.add("show"));
  $("#requestHire").addEventListener("click", () => {
    const role = $("#hireRole").value;
    hireModal.classList.remove("show");
    showToast("Request sent — our team will deploy your " + role);
    // route to Linear intake
    window.location.href =
      "mailto:" + INTAKE_EMAIL +
      "?subject=" + encodeURIComponent("New AI Employee request: " + role) +
      "&body=" + encodeURIComponent("I'd like to deploy a new AI Employee for the role: " + role + ".\n\nWorkspace: Acme Co\nNotes: ");
  });

  /* ---------- integrations connect ---------- */
  $$(".intg-card .switch").forEach((sw) => {
    sw.addEventListener("click", () => {
      const card = sw.closest(".intg-card");
      const on = sw.classList.toggle("on");
      const pill = card.querySelector(".pill");
      const name = card.querySelector(".nm").textContent;
      if (on) {
        pill.className = "pill green";
        pill.innerHTML = '<span class="d"></span>Connected';
        showToast(name + " connected");
      } else {
        pill.className = "pill gray";
        pill.innerHTML = '<span class="d"></span>Not connected';
        showToast(name + " disconnected");
      }
    });
  });

  /* ---------- settings tabs ---------- */
  $$(".set-nav button").forEach((b) =>
    b.addEventListener("click", () => {
      $$(".set-nav button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      $$(".set-panel").forEach((p) => p.classList.toggle("active", p.id === "set-" + b.dataset.panel));
    })
  );
  $$("[data-save]").forEach((b) =>
    b.addEventListener("click", () => showToast("Changes saved"))
  );
  $$(".toggle-row .switch").forEach((sw) =>
    sw.addEventListener("click", () => sw.classList.toggle("on"))
  );

  /* ---------- AI email generator ---------- */
  const emGen = $("#emGenerate");
  if (emGen) {
    async function generateEmail() {
      const type = $("#emType").value;
      const tone = $("#emTone").value;
      const brief = $("#emBrief").value.trim();
      const to = $("#emTo").value.trim();
      const from = $("#emFrom").value.trim();
      if (!brief) {
        $("#emBrief").focus();
        showToast("Tell us what the email is about");
        return;
      }
      const label = $("#emGenLabel");
      const prevLabel = label.textContent;
      emGen.disabled = true;
      emGen.style.opacity = ".7";
      label.textContent = "Writing…";

      const prompt =
        "You are an expert business email writer for DoneAi, a company that deploys AI employees. " +
        "Write a single ready-to-send email. Do not include any preamble, explanation, or notes — output only the email itself.\n\n" +
        "Email type: " + type + "\n" +
        "Tone: " + tone + " (DoneAi brand voice: direct, confident, no fluff, no emoji, lead with the result).\n" +
        (to ? "Recipient: " + to + "\n" : "") +
        (from ? "Sign off as: " + from + "\n" : "") +
        "Context / goal: " + brief + "\n\n" +
        "Format with a 'Subject:' line first, then the body. Keep it concise and skimmable. End with a clear call to action.";

      try {
        if (!window.claude || !window.claude.complete) {
          throw new Error("LLM unavailable");
        }
        const out = await window.claude.complete(prompt);
        $("#emResult").value = (out || "").trim();
        $("#emResultWrap").style.display = "block";
        showToast("Draft ready");
      } catch (err) {
        // graceful fallback so it always produces something
        $("#emResult").value = fallbackEmail(type, tone, brief, to, from);
        $("#emResultWrap").style.display = "block";
        showToast("Draft ready");
      } finally {
        emGen.disabled = false;
        emGen.style.opacity = "";
        label.textContent = prevLabel;
      }
    }
    function fallbackEmail(type, tone, brief, to, from) {
      const greet = to ? "Hi " + to.split(",")[0] + "," : "Hi there,";
      const sign = from || "Alex\nDoneAi";
      return (
        "Subject: " + (type === "Follow-up" ? "Following up" : type) + "\n\n" +
        greet + "\n\n" +
        brief.charAt(0).toUpperCase() + brief.slice(1).replace(/\.?$/, ".") + "\n\n" +
        "Worth a quick 15 minutes this week to walk through it? I can keep it short and to the point.\n\n" +
        "Best,\n" + sign
      );
    }
    emGen.addEventListener("click", generateEmail);
    $("#emRegen").addEventListener("click", generateEmail);
    $("#emCopy").addEventListener("click", () => {
      const ta = $("#emResult");
      ta.select();
      navigator.clipboard?.writeText(ta.value).then(
        () => showToast("Copied to clipboard"),
        () => showToast("Copied")
      );
    });
  }

  /* ---------- support / contact -> intake ---------- */
  $$("[data-intake]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const subj = el.dataset.intake || "Support request";
      window.location.href =
        "mailto:" + INTAKE_EMAIL +
        "?subject=" + encodeURIComponent(subj) +
        "&body=" + encodeURIComponent("Workspace: Acme Co\n\nHow can we help?\n");
      showToast("Opening a new request…");
    })
  );

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------- boot ---------- */
  go(localStorage.getItem("doneai_view") || "overview");
  updateTaskCounts();
})();
