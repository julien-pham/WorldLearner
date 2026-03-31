const $ = (id) => document.getElementById(id);

function storageGetHigh() {
  const v = Number(localStorage.getItem("wl_high") || "0");
  return Number.isFinite(v) ? v : 0;
}

function setHigh() {
  const el = $("pillHigh");
  if (el) el.textContent = String(storageGetHigh());
}

function wireSegButtons() {
  for (const b of document.querySelectorAll(".segBtn")) {
    b.addEventListener("click", () => {
      const seg = b.getAttribute("data-seg");
      const val = b.getAttribute("data-value");
      if (!seg || !val) return;

      // only toggle within the same group
      const group = b.closest(".seg");
      if (group) for (const x of group.querySelectorAll(".segBtn")) x.classList.remove("isActive");
      b.classList.add("isActive");

      const input = $(seg);
      if (input) input.value = val;
    });
  }
}

function goPlay() {
  const continent = $("continent")?.value || "All";
  const count = $("count")?.value || "10";
  const difficulty = $("difficulty")?.value || "normal";
  const params = new URLSearchParams({ continent, count, difficulty });
  window.location.href = `./game.html?${params.toString()}`;
}

function main() {
  setHigh();
  wireSegButtons();
  $("btnPlay")?.addEventListener("click", goPlay);
  $("btnResetHigh")?.addEventListener("click", () => {
    localStorage.removeItem("wl_high");
    setHigh();
  });
}

main();

