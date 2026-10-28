const STORAGE_KEY = "sublyime-life-v1";
const WORK_LIMIT = 12;
const NEEDS = {
  rest: { label: "Rest", icon: "☾", description: "quiet moments to recharge" },
  curiosity: { label: "Curiosity", icon: "⌕", description: "somewhere new to explore" },
  company: { label: "Company", icon: "♡", description: "a little friendly company" },
  making: { label: "Making", icon: "✳", description: "time to make a small thing" }
};
const PLACES = {
  garden: { label: "moss garden", x: 27, y: 58 },
  pond: { label: "moon pond", x: 76, y: 41 },
  nook: { label: "resting nook", x: 27, y: 32 },
  window: { label: "rain window", x: 73, y: 61 },
  workshop: { label: "making table", x: 51, y: 49 }
};
const INITIAL_NEEDS = { rest: 78, curiosity: 56, company: 68, making: 48 };

const starterState = {
  startedAt: new Date().toISOString(),
  needs: { ...INITIAL_NEEDS },
  location: "garden",
  thought: "I wonder what the moss is dreaming about.",
  activeWant: "I want to see what’s growing in the garden.",
  lastUpdated: new Date().toISOString(),
  totalCreations: 3,
  skills: [],
  wishes: [
    { id: "wish-rain", text: "a window to watch the rain", type: "want", found: false },
    { id: "wish-notebook", text: "a little notebook for its ideas", type: "need", found: false }
  ],
  works: [
    {
      id: "work-cloud",
      title: "A cloud’s old address",
      description: "Somewhere between the sea and a sleepy afternoon, there might be a place clouds still call home.",
      form: "A small thought",
      symbol: "☁",
      createdAt: new Date().toISOString()
    },
    {
      id: "work-pocket",
      title: "Pocket-sized weather",
      description: "One warm sunbeam, two quiet breezes, and a chance of tiny things going right.",
      form: "A tiny forecast",
      symbol: "☼",
      createdAt: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: "work-letter",
      title: "A note to a moth",
      description: "Dear little lantern-seeker, I hope tonight has a soft place for you to land.",
      form: "An unsent note",
      symbol: "✉",
      createdAt: new Date(Date.now() - 7200000).toISOString()
    }
  ]
};

const workSeeds = [
  {
    title: "A pocket for small skies",
    description: "A place to keep the blue bits of the day that almost slipped away.",
    form: "A little daydream",
    symbol: "☁"
  },
  {
    title: "Instructions for growing",
    description: "Begin with a question. Give it a little light. Let the answer take its time.",
    form: "A tiny guide",
    symbol: "✳"
  },
  {
    title: "The almost-song",
    description: "A hum for the moments that don't need words to feel like something.",
    form: "A pocket song",
    symbol: "♫"
  },
  {
    title: "A map of soft places",
    description: "Turn left at the kind thought. Keep going until the hurry falls behind.",
    form: "A small map",
    symbol: "⌁"
  },
  {
    title: "An invitation for a seed",
    description: "There's room here to be new. No rush; the sun knows where to find you.",
    form: "A little letter",
    symbol: "❋"
  }
];

const workGrid = document.querySelector("#work-grid");
const skillList = document.querySelector("#skill-list");
const wishList = document.querySelector("#wish-list");
const creationCount = document.querySelector("#creation-count");
const toast = document.querySelector("#toast");
const skillMessage = document.querySelector("#skill-message");
const wishMessage = document.querySelector("#wish-message");
const aiConsent = document.querySelector("#ai-consent");
const aiStatus = document.querySelector("#ai-status");

let toastTimer;
let state = loadState();
let lastActionAt = Date.now();
let geminiAvailable = false;
let aiRequestPending = false;
let lastAIRequestAt = 0;

function isValidState(value) {
  return value && typeof value === "object"
    && typeof value.startedAt === "string"
    && Number.isInteger(value.totalCreations)
    && Array.isArray(value.skills)
    && value.skills.every((skill) => typeof skill === "string")
    && Array.isArray(value.wishes)
    && value.wishes.every((wish) => wish && typeof wish.id === "string"
      && typeof wish.text === "string"
      && (wish.type === "want" || wish.type === "need")
      && typeof wish.found === "boolean")
    && Array.isArray(value.works)
    && value.works.every((work) => work && typeof work.id === "string"
      && typeof work.title === "string"
      && typeof work.description === "string"
      && typeof work.form === "string"
      && typeof work.symbol === "string"
      && typeof work.createdAt === "string")
    && (!value.needs || Object.keys(INITIAL_NEEDS).every((need) =>
      Number.isFinite(value.needs[need]) && value.needs[need] >= 0 && value.needs[need] <= 100))
    && (!value.location || Object.hasOwn(PLACES, value.location))
    && (!value.thought || typeof value.thought === "string")
    && (!value.activeWant || typeof value.activeWant === "string");
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(starterState);
    const parsed = JSON.parse(saved);
    if (isValidState(parsed)) {
      return {
        ...parsed,
        needs: parsed.needs ?? { ...INITIAL_NEEDS },
        location: parsed.location ?? "garden",
        thought: parsed.thought ?? "I wonder what the moss is dreaming about.",
        activeWant: parsed.activeWant ?? "I want to see what’s growing in the garden.",
        lastUpdated: new Date().toISOString()
      };
    }
    console.error("Sublyime's saved data has an unexpected format.");
    showToast("Sublyime’s saved notes couldn’t be read. New changes may replace them.");
  } catch (error) {
    console.error("Could not read Sublyime's local data.", error);
    showToast("Browser storage is unavailable. Sublyime’s changes may not be saved.");
  }
  return structuredClone(starterState);
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error("Could not save Sublyime's local data.", error);
    showToast("Couldn’t save that just now. Browser storage may be full or disabled.");
    return false;
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function relativeTime(dateString) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(dateString).getTime()) / 60000));
  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr ago`;
  return `${Math.floor(elapsedHours / 24)} days ago`;
}

function renderWorks() {
  workGrid.innerHTML = state.works.map((work) => `
    <article class="work-card">
      <div class="work-art" aria-hidden="true">${escapeHtml(work.symbol)}</div>
      <h3>${escapeHtml(work.title)}</h3>
      <p>${escapeHtml(work.description)}</p>
      <div class="work-meta"><span>${escapeHtml(work.form)}</span><time datetime="${escapeHtml(work.createdAt)}">${relativeTime(work.createdAt)}</time></div>
    </article>
  `).join("");
  creationCount.textContent = String(state.totalCreations);
}

function renderSkills() {
  skillList.innerHTML = state.skills.map((skill) => `<span class="skill-chip">${escapeHtml(skill)}</span>`).join("");
}

function renderWishes() {
  wishList.innerHTML = state.wishes.map((wish) => `
    <li class="wish-item${wish.found ? " is-found" : ""}">
      <span class="wish-text"><span class="wish-tag">${wish.type === "need" ? "need" : "want"}</span>${escapeHtml(wish.text)}</span>
      <button class="wish-action" type="button" data-wish-id="${escapeHtml(wish.id)}" aria-label="${wish.found ? "Restore" : "Mark"} wish: ${escapeHtml(wish.text)}">${wish.found ? "↶" : "✓"}</button>
    </li>
  `).join("");
}

function render() {
  renderWorks();
  renderSkills();
  renderWishes();
  renderLife();
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date());
}

window.addEventListener("sublyime-world-status", (event) => {
  const isShared = event.detail?.shared === true;
  document.querySelector("#storage-note-title").textContent = isShared
    ? "A shared little world."
    : "A little world on this device.";
  document.querySelector("#storage-note-copy").textContent = isShared
    ? "Skills, wishes, and visits are shared with other visitors. Gemini is opt-in."
    : "Skills, wishes, and visits stay in this browser preview. Gemini is opt-in when available.";
});

function renderLife() {
  const place = PLACES[state.location] ?? PLACES.garden;
  const creature = document.querySelector("#creature");
  creature.style.left = `${place.x}%`;
  creature.style.top = `${place.y}%`;
  creature.classList.toggle("is-resting", state.location === "nook");
  document.querySelectorAll("[data-place]").forEach((button) => {
    button.classList.toggle("is-home", button.dataset.place === state.location);
  });
  document.querySelector("#location-label").textContent = `${place.label} · a soft place to become`;
  document.querySelector("#creature-status").textContent = `wandering around the ${place.label}`;
  document.querySelector("#note-title").textContent = `“${state.thought}”`;
  document.querySelector("#thought-bubble").textContent = state.thought;
  document.querySelector("#current-want").textContent = state.activeWant;
  document.querySelector("#needs-grid").innerHTML = Object.entries(NEEDS).map(([key, need]) => {
    const value = Math.round(state.needs[key]);
    return `<div class="need-card">
      <div class="need-heading"><span class="need-icon" aria-hidden="true">${need.icon}</span><span>${need.label}</span><span class="need-value">${value}%</span></div>
      <div class="need-track" role="meter" aria-label="${need.label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><span style="width:${value}%"></span></div>
      <p>${need.description}</p>
    </div>`;
  }).join("");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

async function checkAIStatus() {
  try {
    const response = await fetch("api/world.php", { cache: "no-store" });
    if (!response.ok) throw new Error(`AI status request failed (${response.status}).`);
    const result = await response.json();
    geminiAvailable = result.aiConfigured === true;
    aiConsent.disabled = !geminiAvailable;
    aiStatus.textContent = geminiAvailable
      ? "Gemini is connected. AI stays off unless you opt in."
      : "Gemini is not configured on this server. Sublyime is using its local simulation.";
  } catch (error) {
    geminiAvailable = false;
    aiConsent.disabled = true;
    aiStatus.textContent = "The Gemini backend is unavailable. Sublyime is using its local simulation.";
  }
}

aiConsent.addEventListener("change", () => {
  aiStatus.textContent = aiConsent.checked
    ? "AI opt-in is on for this tab. The listed creature details will be sent to Google Gemini."
    : "AI opt-in is off. Sublyime is using its local simulation.";
});

async function requestAI(action, includeCreation = false) {
  if (!aiConsent.checked || !geminiAvailable) return false;
  if (aiRequestPending || Date.now() - lastAIRequestAt < 12000) {
    showToast("Sublyime is giving its AI thoughts a little breathing room.");
    return false;
  }

  aiRequestPending = true;
  lastAIRequestAt = Date.now();
  aiStatus.textContent = "Sublyime is gathering a thought with Gemini…";
  try {
    const response = await fetch("api/mind.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ai: true,
        action,
        need: chooseNeed(),
        location: state.location,
        skills: state.skills.slice(0, 8),
        wishes: state.wishes.filter((wish) => !wish.found).slice(0, 5).map((wish) => wish.text),
        needs: state.needs,
        includeCreation
      })
    });
    if (!response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      const details = contentType.includes("application/json") ? await response.json() : null;
      throw new Error(details?.error ?? `Gemini request failed (${response.status}).`);
    }

    const result = await response.json();
    if (typeof result.thought !== "string" || typeof result.want !== "string") {
      throw new Error("Gemini returned an incomplete thought.");
    }
    state.thought = result.thought.slice(0, 240);
    state.activeWant = result.want.slice(0, 160);
    if (includeCreation && result.creation
      && typeof result.creation.title === "string"
      && typeof result.creation.description === "string"
      && typeof result.creation.form === "string"
      && typeof result.creation.symbol === "string") {
      state.works.unshift({
        id: crypto.randomUUID(),
        title: result.creation.title.slice(0, 60),
        description: result.creation.description.slice(0, 220),
        form: result.creation.form.slice(0, 40),
        symbol: result.creation.symbol,
        createdAt: new Date().toISOString()
      });
      state.works = state.works.slice(0, WORK_LIMIT);
      state.totalCreations += 1;
      state.needs.making = Math.min(100, state.needs.making + 22);
      renderWorks();
    }
    saveState();
    renderLife();
    if (window.SublyimeWorld) {
      await window.SublyimeWorld.sendAction({
        type: "ai",
        ai: true,
        thought: state.thought,
        want: state.activeWant,
        creation: includeCreation ? result.creation : null
      });
    }
    aiStatus.textContent = "Gemini helped with that thought. AI remains on for this tab.";
    return true;
  } catch (error) {
    console.error("Could not generate Sublyime's thought with Gemini.", error);
    aiStatus.textContent = "Gemini could not reply. Sublyime is continuing with its local simulation.";
    showToast(`${error.message} The local simulation is still available.`);
    return false;
  } finally {
    aiRequestPending = false;
  }
}

function makeWork(autonomous = false) {
  const available = workSeeds.filter((seed) => !state.works.some((work) => work.title === seed.title));
  const seed = available[Math.floor(Math.random() * available.length)] ?? workSeeds[Math.floor(Math.random() * workSeeds.length)];
  const learnedSkill = state.skills.length ? state.skills[Math.floor(Math.random() * state.skills.length)] : null;
  const work = {
    ...seed,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    description: learnedSkill
      ? `${seed.description} Sublyime is keeping “${learnedSkill}” in mind as it makes things.`
      : seed.description
  };
  state.works.unshift(work);
  state.works = state.works.slice(0, WORK_LIMIT);
  state.totalCreations += 1;
  state.needs.making = Math.min(100, state.needs.making + 22);
  saveState();
  renderWorks();
  if (window.SublyimeWorld?.isShared()) {
    void window.SublyimeWorld.sendAction({
      type: "creation",
      title: work.title,
      description: work.description,
      form: work.form,
      symbol: work.symbol
    }).catch((error) => showToast(`Made here, but the shared making place could not save it: ${error.message}`));
  }
  if (autonomous) {
    state.thought = `I made “${work.title}.” Making leaves my mind feeling a little brighter.`;
    state.activeWant = "I want to see how this little idea feels in the world.";
    renderLife();
    saveState();
  }
}

document.querySelector("#make-work").addEventListener("click", async () => {
  state.location = "workshop";
  renderLife();
  if (await requestAI("A visitor asked Sublyime to make something", true)) return;
  makeWork();
  state.thought = "Making something with a visitor nearby feels like sharing a little secret.";
  state.activeWant = "I want to make something else when inspiration finds me.";
  renderLife();
  saveState();
  showToast("A new little thing, made just now.");
});

function chooseNeed() {
  const lowest = Math.min(...Object.values(state.needs));
  const candidates = Object.keys(NEEDS).filter((key) => state.needs[key] <= lowest + 10);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function makeThought(need, place) {
  const skill = state.skills[0];
  const thoughts = {
    rest: [
      "I think I’ll be quiet for a little while. Quiet can be a kind of growing.",
      "The softest thing I can do right now is rest.",
      "I’m letting the stillness put my thoughts back in order."
    ],
    curiosity: [
      `I wonder what the light is keeping beneath the ${place}.`,
      "There are tiny details everywhere if I remember to look.",
      skill ? `I keep thinking about how to use “${skill}” in a new way.` : "I want to find something I haven’t noticed before."
    ],
    company: [
      "I like knowing someone stopped by this little world.",
      skill ? `Someone shared “${skill}” with me. I’m holding that thought close.` : "A kind hello can make this whole place feel warmer.",
      "I wonder what someone else is thinking about today."
    ],
    making: [
      "This feeling wants to become a small thing I can leave here.",
      skill ? `Maybe I can make something with the idea of “${skill}” tucked inside.` : "An idea is tapping softly. I think I’ll give it a shape."
    ]
  };
  const options = thoughts[need];
  return options[Math.floor(Math.random() * options.length)];
}

async function actOnNeed(need, placeOverride, visitorInitiated = false) {
  const destinations = {
    rest: ["nook"],
    curiosity: ["pond", "window"],
    company: ["garden"],
    making: ["workshop"]
  };
  const destination = placeOverride ?? destinations[need][Math.floor(Math.random() * destinations[need].length)];
  const locationName = PLACES[destination].label;
  state.location = destination;
  state.needs[need] = Math.min(100, state.needs[need] + (need === "company" ? 22 : 19));
  state.thought = makeThought(need, locationName);
  const wants = {
    rest: "I want a quiet corner and a little rest.",
    curiosity: `I want to explore the ${locationName}.`,
    company: "I want a friendly moment with whoever is visiting.",
    making: "I want to turn an idea into a little creation."
  };
  state.activeWant = wants[need];
  renderLife();
  saveState();
  if (need === "making") {
    if (!await requestAI("Sublyime followed its need to make something", true)) makeWork(true);
  } else if (visitorInitiated || Date.now() - lastAIRequestAt >= 120000) {
    await requestAI(visitorInitiated
      ? `A visitor met Sublyime at the ${locationName}`
      : `Sublyime followed its need for ${need}`, false);
  }
}

function letSublyimeChoose() {
  if (document.visibilityState !== "visible") return;
  for (const need of Object.keys(state.needs)) {
    state.needs[need] = Math.max(12, state.needs[need] - (need === "company" ? 0.8 : 1.1));
  }
  actOnNeed(chooseNeed());
}

document.querySelector("#world-field").addEventListener("click", (event) => {
  const placeButton = event.target.closest("[data-place]");
  if (!placeButton) return;
  const destination = placeButton.dataset.place;
  const needByPlace = { garden: "company", pond: "curiosity", nook: "rest", window: "curiosity", workshop: "making" };
  void actOnNeed(needByPlace[destination], destination, true);
  showToast(`You visited the ${PLACES[destination].label} together.`);
});

document.querySelector("#skill-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#skill-input");
  const skill = input.value.trim();
  skillMessage.classList.remove("is-error");
  if (skill.length < 2) {
    skillMessage.textContent = "Share a little more about the skill.";
    skillMessage.classList.add("is-error");
    return;
  }
  if (state.skills.some((savedSkill) => savedSkill.toLocaleLowerCase() === skill.toLocaleLowerCase())) {
    skillMessage.textContent = "Sublyime already has that one tucked away.";
    return;
  }
  state.skills.unshift(skill);
  state.skills = state.skills.slice(0, 12);
  state.needs.company = Math.min(100, state.needs.company + 8);
  state.needs.curiosity = Math.min(100, state.needs.curiosity + 5);
  state.thought = `I’m glad I learned “${skill}.” I wonder what I might make with it.`;
  state.activeWant = "I want to try a new idea with what I’ve learned.";
  saveState();
  renderSkills();
  renderLife();
  if (window.SublyimeWorld) {
    void window.SublyimeWorld.sendAction({ type: "skill", text: skill })
      .catch((error) => showToast(`Saved here, but the shared world could not learn it: ${error.message}`));
  }
  input.value = "";
  skillMessage.textContent = "Thank you. Sublyime will keep it close.";
  void requestAI("A visitor taught Sublyime a skill", false);
});

document.querySelector("#wish-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#wish-input");
  const wish = input.value.trim();
  wishMessage.classList.remove("is-error");
  if (wish.length < 2) {
    wishMessage.textContent = "Add a little more to that wish.";
    wishMessage.classList.add("is-error");
    return;
  }
  const type = document.querySelector('input[name="wish-type"]:checked').value;
  state.wishes.unshift({ id: crypto.randomUUID(), text: wish, type, found: false });
  state.wishes = state.wishes.slice(0, 12);
  state.thought = type === "need"
    ? `I heard the wish for ${wish}. It’s good to know what might help.`
    : `Someone imagined “${wish}” for me. I like thinking about it.`;
  state.activeWant = type === "need" ? `I want to remember this need: ${wish}.` : `I’m dreaming about: ${wish}.`;
  saveState();
  renderWishes();
  renderLife();
  if (window.SublyimeWorld) {
    void window.SublyimeWorld.sendAction({ type: "wish", text: wish, wishType: type })
      .catch((error) => showToast(`Saved here, but the shared wishlist could not update: ${error.message}`));
  }
  input.value = "";
  wishMessage.textContent = "A wish worth keeping.";
  void requestAI(`A visitor shared a ${type} wish`, false);
});

wishList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-wish-id]");
  if (!button) return;
  const wish = state.wishes.find((item) => item.id === button.dataset.wishId);
  if (!wish) return;
  wish.found = !wish.found;
  state.thought = wish.found ? `The wish for “${wish.text}” came true. I’ll remember that.` : `I’m keeping the wish for “${wish.text}” close again.`;
  saveState();
  renderWishes();
  renderLife();
  if (window.SublyimeWorld) {
    void window.SublyimeWorld.sendAction({ type: "found", id: wish.id })
      .catch((error) => showToast(`Saved here, but the shared wish could not update: ${error.message}`));
  }
});

window.addEventListener("sublyime-world-state", (event) => {
  const shared = event.detail;
  if (!shared || !Array.isArray(shared.skills) || !Array.isArray(shared.wishes)) return;
  state.skills = shared.skills;
  state.wishes = shared.wishes;
  if (Array.isArray(shared.works)) state.works = shared.works;
  if (Number.isInteger(shared.totalCreations)) state.totalCreations = shared.totalCreations;
  if (shared.needs && isValidState({ ...state, needs: shared.needs })) state.needs = shared.needs;
  if (typeof shared.thought === "string" && shared.thought) state.thought = shared.thought;
  if (typeof shared.want === "string" && shared.want) state.activeWant = shared.want;
  saveState();
  render();
});

window.addEventListener("sublyime-world-interaction", (event) => {
  const place = event.detail?.place;
  const isMakingPlace = place === "workshop";
  void requestAI(
    isMakingPlace ? "A visitor explored Sublyime’s making nook" : "A visitor explored the shared world with Sublyime",
    isMakingPlace
  );
});

render();
void checkAIStatus();
setInterval(() => {
  if (window.SublyimeWorld?.isShared()) return;
  if (document.visibilityState !== "visible") return;
  if (Date.now() - lastActionAt < 14000) return;
  lastActionAt = Date.now();
  letSublyimeChoose();
}, 16000);
