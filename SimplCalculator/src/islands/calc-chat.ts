// AI chat island. Lets the user ask follow-up questions about their current
// calculation. Server enforces the anonymous cap; on a gated response we open
// the auth modal. localStorage only mirrors UI message count.
import { getCalcContext } from "../lib/calc-context";
import { getAccessToken, authEnabled } from "../lib/supabase";
import { OPEN_AUTH_EVENT } from "./auth";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function initCalcChat(): void {
  const mount = document.querySelector<HTMLElement>("[data-chat]");
  if (!mount) return;

  mount.innerHTML = `
    <details class="group rounded-lg border border-hairline bg-canvas">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-body-sm-strong font-medium text-ink [&::-webkit-details-marker]:hidden">
        Ask about this calculation
        <span class="text-caption text-mute group-open:hidden">Open chat →</span>
      </summary>
      <div class="border-t border-hairline px-5 py-4">
        <div data-chat-log class="grid gap-3 max-h-72 overflow-y-auto"></div>
        <form data-chat-form class="mt-3 flex items-center gap-2">
          <input data-chat-input type="text" autocomplete="off"
            placeholder="e.g. How can I lower this?"
            class="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm text-ink outline-none focus:border-hairline-strong" />
          <button type="submit" class="inline-flex h-10 shrink-0 items-center rounded-md bg-primary px-4 text-body-sm font-medium text-on-primary hover:opacity-90">Send</button>
        </form>
        <p data-chat-note class="mt-2 text-caption text-mute"></p>
      </div>
    </details>`;

  const log = mount.querySelector<HTMLElement>("[data-chat-log]")!;
  const form = mount.querySelector<HTMLFormElement>("[data-chat-form]")!;
  const input = mount.querySelector<HTMLInputElement>("[data-chat-input]")!;
  const note = mount.querySelector<HTMLElement>("[data-chat-note]")!;

  const history: { role: "user" | "assistant"; content: string }[] = [];

  function bubble(role: "user" | "assistant", text: string): HTMLElement {
    const el = document.createElement("div");
    el.className =
      role === "user"
        ? "justify-self-end max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3 py-2 text-body-sm text-on-primary"
        : "justify-self-start max-w-[90%] rounded-lg rounded-bl-sm bg-canvas-soft px-3 py-2 text-body-sm text-ink";
    el.innerHTML = esc(text).replace(/\n/g, "<br>");
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function showGate() {
    note.innerHTML = authEnabled()
      ? `You've reached the free limit. <button data-chat-signin class="font-medium text-link hover:underline">Sign in</button> to keep chatting.`
      : "You've reached the free chat limit.";
    const btn = note.querySelector("[data-chat-signin]");
    btn?.addEventListener("click", () => window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT)));
    input.disabled = true;
    form.querySelector("button")?.setAttribute("disabled", "");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    bubble("user", q);
    history.push({ role: "user", content: q });

    const thinking = bubble("assistant", "…");
    form.querySelector("button")?.setAttribute("disabled", "");

    try {
      const ctx = getCalcContext();
      const token = await getAccessToken();
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title: ctx.title, summary: ctx.summary, messages: history }),
      });
      const data = await res.json();
      if (data.gated) {
        thinking.remove();
        showGate();
        return;
      }
      if (data.available === false) {
        thinking.innerHTML = "AI chat is unavailable right now. Your results above are fully accurate.";
        return;
      }
      thinking.innerHTML = esc(data.reply).replace(/\n/g, "<br>");
      history.push({ role: "assistant", content: data.reply });
      if (typeof data.remaining === "number") {
        note.textContent = data.remaining > 0 ? `${data.remaining} free messages left.` : "";
        if (data.remaining <= 0 && !data.signedIn) showGate();
      }
    } catch {
      thinking.innerHTML = "Couldn't reach the assistant. Please try again.";
    } finally {
      form.querySelector("button")?.removeAttribute("disabled");
    }
  });
}
