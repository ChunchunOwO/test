export const crashGuardCss = `
.echo-crash-guard,
.echo-crash-guard *,
.echo-crash-guard *::before,
.echo-crash-guard *::after {
  box-sizing: border-box;
}

.echo-crash-guard {
  --cg-ink: #3a41ad;
  --cg-ink-deep: #232963;
  --cg-ink-line: rgba(58, 65, 173, 0.28);
  --cg-ink-strong: rgba(58, 65, 173, 0.82);
  --cg-muted: #565c92;
  --cg-cyan: #5ad4f2;
  --cg-cyan-pale: #ecfafe;
  --cg-lemon: #ffe97d;
  --cg-lemon-pale: #fff8d6;
  --cg-pink: #f470bd;
  --cg-pink-deep: #d84f9f;
  --cg-pink-pale: #ffe6f3;
  --cg-paper: #fbfdff;
  --cg-station: #e7f6fb;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  color: var(--cg-ink-deep);
  background: var(--cg-station);
  font-family: Outfit, "Segoe UI Variable", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
}

.echo-crash-guard-stage {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  overflow: hidden;
  height: 100%;
  padding: clamp(16px, 2vw, 28px);
  background-color: var(--cg-station);
  background-position: 62% 46%;
  background-repeat: no-repeat;
  background-size: cover;
}

.echo-crash-guard-stage::before,
.echo-crash-guard-stage::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: "";
}

.echo-crash-guard-stage::before {
  z-index: 0;
  opacity: 0.28;
  background:
    radial-gradient(circle at 14% 10%, rgba(255, 233, 125, 0.34), transparent 26%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='52' height='52' viewBox='0 0 52 52'%3E%3Cpath d='M23 13h6v10h10v6H29v10h-6V29H13v-6h10z' fill='%23ffffff' fill-opacity='0.7'/%3E%3C/svg%3E") 0 0 / 52px 52px;
  mask-image: linear-gradient(108deg, rgba(0, 0, 0, 0.92), rgba(0, 0, 0, 0.16) 38%, transparent 64%);
}

.echo-crash-guard-stage::after {
  z-index: 0;
  background: linear-gradient(90deg, rgba(231, 246, 251, 0.58) 0%, rgba(231, 246, 251, 0.18) 28%, transparent 48%);
}

.echo-crash-guard-rail {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.echo-crash-guard-chart {
  position: relative;
  z-index: 2;
  width: min(500px, 100%);
  max-height: calc(100% - 12px);
  overflow: auto;
  overscroll-behavior: contain;
  display: grid;
  align-content: start;
  padding: 22px 24px 18px 32px;
  border: 2px solid var(--cg-ink);
  border-radius: 26px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(251, 253, 255, 0.94));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.92),
    0 4px 0 rgba(58, 65, 173, 0.2),
    0 24px 36px rgba(35, 41, 99, 0.12);
  animation: echoCrashGuardChartIn 480ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.echo-crash-guard-chart::-webkit-scrollbar {
  width: 8px;
}

.echo-crash-guard-chart::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(58, 65, 173, 0.28);
  background-clip: padding-box;
}

.echo-crash-guard-chart-holes {
  position: absolute;
  top: 24px;
  bottom: 24px;
  left: 9px;
  width: 10px;
  pointer-events: none;
  background: radial-gradient(circle, var(--cg-station) 3.4px, rgba(58, 65, 173, 0.22) 3.6px, rgba(58, 65, 173, 0.22) 4.2px, transparent 4.4px) 0 0 / 10px 34px;
}

.echo-crash-guard-chart-clip {
  position: absolute;
  top: -11px;
  left: 50%;
  z-index: 3;
  width: 44px;
  height: 22px;
  border: 2px solid var(--cg-ink);
  border-radius: 8px 8px 11px 11px;
  background: linear-gradient(#ffe97d, #ffd24a);
  box-shadow: 0 3px 0 rgba(58, 65, 173, 0.28);
  transform: translateX(-50%);
  pointer-events: none;
}

.echo-crash-guard-chart-clip::after {
  position: absolute;
  top: 5px;
  left: 50%;
  width: 14px;
  height: 8px;
  border: 2px solid var(--cg-ink);
  border-radius: 4px;
  background: #fff;
  transform: translateX(-50%);
  content: "";
}

.echo-crash-guard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 2px dashed rgba(58, 65, 173, 0.22);
}

.echo-crash-guard-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.echo-crash-guard-seal {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  color: var(--cg-ink-deep);
  border: 2px solid var(--cg-ink);
  border-radius: 13px;
  background: var(--cg-cyan);
  box-shadow: 0 3px 0 rgba(58, 65, 173, 0.4);
}

.echo-crash-guard-eyebrow {
  margin: 0;
  color: var(--cg-pink-deep);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.echo-crash-guard-brand strong {
  position: relative;
  z-index: 0;
  display: block;
  width: max-content;
  margin-top: 1px;
  color: var(--cg-ink-deep);
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.echo-crash-guard-brand strong::after {
  position: absolute;
  right: -4px;
  bottom: 2px;
  left: -3px;
  z-index: -1;
  height: 8px;
  border-radius: 4px;
  background: var(--cg-lemon);
  transform: rotate(-1.4deg);
  content: "";
}

.echo-crash-guard-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.echo-crash-guard-chip,
.echo-crash-guard-reason {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 11px;
  color: var(--cg-ink);
  border: 2px solid var(--cg-ink-line);
  border-radius: 999px;
  background: #fff;
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 2px 0 rgba(58, 65, 173, 0.12);
}

.echo-crash-guard-chip[data-online="false"] {
  color: var(--cg-pink-deep);
  border-color: rgba(216, 79, 159, 0.35);
  background: var(--cg-pink-pale);
}

.echo-crash-guard-reason {
  border-color: var(--cg-ink);
  background: var(--cg-lemon);
  letter-spacing: 0.04em;
}

.echo-crash-guard-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3bb98a;
  box-shadow: 0 0 0 4px rgba(59, 185, 138, 0.16);
}

.echo-crash-guard-chip[data-online="false"] .echo-crash-guard-chip-dot {
  background: var(--cg-pink-deep);
  box-shadow: 0 0 0 4px rgba(216, 79, 159, 0.14);
}

.echo-crash-guard-kicker {
  margin: 14px 0 0;
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  padding: 0 10px;
  color: var(--cg-ink-deep);
  border: 2px solid rgba(58, 65, 173, 0.2);
  border-radius: 999px;
  background: var(--cg-lemon-pale);
  font-size: 12px;
  font-weight: 800;
}

.echo-crash-guard-title {
  max-width: 16ch;
  margin: 10px 0 0;
  color: var(--cg-ink-deep);
  font-size: clamp(26px, 2.6vw, 36px);
  line-height: 1.16;
  font-weight: 800;
  letter-spacing: -0.045em;
}

.echo-crash-guard-lead {
  max-width: 42ch;
  margin: 8px 0 0;
  color: var(--cg-muted);
  font-size: 13px;
  line-height: 1.6;
}

.echo-crash-guard-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  margin: 14px 0 0;
  padding: 0;
  overflow: hidden;
  border: 2px solid var(--cg-ink-line);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 2px 0 rgba(58, 65, 173, 0.1);
}

.echo-crash-guard-fact {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 8px 10px;
  border: 0;
  border-right: 1px solid var(--cg-ink-line);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.echo-crash-guard-fact:last-child {
  border-right: 0;
}

.echo-crash-guard-fact dt {
  color: var(--cg-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.echo-crash-guard-fact dd {
  margin: 0;
  overflow: hidden;
  color: var(--cg-ink-deep);
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.echo-crash-guard-steps {
  display: grid;
  gap: 0;
  list-style: none;
  margin: 12px 0 0;
  padding: 2px 0 0;
  border-top: 2px dashed rgba(58, 65, 173, 0.22);
}

.echo-crash-guard-step {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  column-gap: 10px;
  row-gap: 1px;
  padding: 9px 0;
  border: 0;
  border-bottom: 1px dashed rgba(58, 65, 173, 0.18);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  animation: echoCrashGuardFadeUp 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.echo-crash-guard-step:nth-child(1) { animation-delay: 70ms; }
.echo-crash-guard-step:nth-child(2) { animation-delay: 120ms; }
.echo-crash-guard-step:nth-child(3) { animation-delay: 170ms; }

.echo-crash-guard-step:last-child {
  border-bottom: 0;
}

.echo-crash-guard-step-index {
  grid-row: 1 / span 2;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  color: var(--cg-ink-deep);
  border: 2px solid var(--cg-ink);
  border-radius: 9px;
  background: var(--cg-lemon);
  font-size: 11px;
  font-weight: 800;
  box-shadow: 0 2px 0 rgba(58, 65, 173, 0.28);
}

.echo-crash-guard-step[data-step="2"] .echo-crash-guard-step-index {
  background: var(--cg-cyan);
}

.echo-crash-guard-step[data-step="3"] .echo-crash-guard-step-index {
  background: var(--cg-pink-pale);
}

.echo-crash-guard-step strong {
  display: block;
  color: var(--cg-ink-deep);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.35;
}

.echo-crash-guard-step-body {
  color: var(--cg-muted);
  font-size: 12px;
  line-height: 1.45;
}

.echo-crash-guard-groups {
  display: grid;
  gap: 12px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 2px dashed rgba(58, 65, 173, 0.22);
  animation: echoCrashGuardFadeUp 520ms cubic-bezier(0.16, 1, 0.3, 1) 200ms both;
}

.echo-crash-guard-group {
  display: grid;
  gap: 8px;
}

.echo-crash-guard-group-label {
  color: var(--cg-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.echo-crash-guard-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.echo-crash-guard-action {
  min-height: 40px;
  min-width: 108px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 12px;
  color: var(--cg-ink-deep);
  border: 2px solid var(--cg-ink-line);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 3px 0 rgba(58, 65, 173, 0.14);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease, border-color 140ms ease;
}

.echo-crash-guard-action svg {
  flex: 0 0 auto;
}

.echo-crash-guard-action:hover:not(:disabled) {
  border-color: var(--cg-ink-strong);
  background: var(--cg-cyan-pale);
  box-shadow: 0 4px 0 rgba(58, 65, 173, 0.18);
  transform: translateY(-1px);
}

.echo-crash-guard-action:active:not(:disabled) {
  box-shadow: 0 1px 0 rgba(58, 65, 173, 0.28);
  transform: translateY(2px);
}

.echo-crash-guard-action[data-variant="primary"] {
  color: #fff;
  border-color: var(--cg-ink-deep);
  background: var(--cg-ink);
  box-shadow: 0 4px 0 var(--cg-ink-deep);
}

.echo-crash-guard-action[data-variant="primary"]:hover:not(:disabled) {
  color: #fff;
  background: #4750c4;
  box-shadow: 0 5px 0 var(--cg-ink-deep);
}

.echo-crash-guard-action[data-variant="danger"] {
  color: var(--cg-pink-deep);
  border-color: rgba(216, 79, 159, 0.38);
  background: var(--cg-pink-pale);
}

.echo-crash-guard-action[data-variant="danger"]:hover:not(:disabled) {
  border-color: var(--cg-pink-deep);
  background: #ffd7ec;
}

.echo-crash-guard-action[data-variant="quiet"] {
  color: var(--cg-muted);
  border-style: dashed;
  background: transparent;
  box-shadow: none;
}

.echo-crash-guard-action[data-variant="quiet"]:hover:not(:disabled) {
  color: var(--cg-ink-deep);
  background: rgba(255, 255, 255, 0.78);
  box-shadow: none;
  transform: none;
}

.echo-crash-guard-action[data-pending="true"] {
  border-color: var(--cg-pink-deep);
  animation: echoCrashGuardPending 1.1s ease-in-out infinite;
}

.echo-crash-guard-action:disabled {
  cursor: not-allowed;
  opacity: 0.48;
  transform: none;
  box-shadow: none;
}

.echo-crash-guard-action:focus-visible {
  outline: 3px solid rgba(90, 212, 242, 0.8);
  outline-offset: 2px;
}

.echo-crash-guard-status {
  min-height: 22px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 0 0;
  color: var(--cg-muted);
  font-size: 12px;
  font-weight: 700;
  word-break: break-word;
}

.echo-crash-guard-status[data-tone="ok"] { color: #1c7a5c; }
.echo-crash-guard-status[data-tone="warn"] { color: #9a3412; }
.echo-crash-guard-status[data-tone="busy"] { color: var(--cg-ink); }

.echo-crash-guard-status-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--cg-cyan);
}

.echo-crash-guard-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: center;
  margin: 10px 0 0;
}

.echo-crash-guard-keys span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--cg-muted);
  font-size: 11px;
  font-weight: 800;
}

.echo-crash-guard-keys kbd {
  min-width: 20px;
  height: 20px;
  display: inline-grid;
  place-items: center;
  padding: 0 5px;
  color: var(--cg-ink-deep);
  border: 2px solid var(--cg-ink-line);
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 2px 0 rgba(58, 65, 173, 0.16);
  font: inherit;
  font-size: 11px;
  font-weight: 800;
}

.echo-crash-guard-hint {
  margin: 6px 0 0;
  color: rgba(86, 92, 146, 0.78);
  font-size: 11px;
}

.echo-crash-guard-floor {
  position: absolute;
  z-index: 0;
  left: 54%;
  bottom: 5%;
  width: min(380px, 38vw);
  height: 48px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(35, 41, 99, 0.16), transparent 70%);
  transform: translateX(-20%);
}

.echo-crash-guard-sticker {
  position: absolute;
  z-index: 2;
  display: block;
  opacity: 0.88;
  pointer-events: none;
  filter: drop-shadow(0 12px 12px rgba(35, 41, 99, 0.12));
  animation: echoCrashGuardStickerIn 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.echo-crash-guard-sticker-art {
  width: 100%;
  height: 100%;
  display: block;
  background-image: var(--cg-sticker-sprite);
  background-repeat: no-repeat;
  transform-origin: center;
  will-change: transform;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-fill-mode: both;
}

.echo-crash-guard-sticker-art[data-motion="sway"] { animation-name: echoCrashGuardStickerSway; }
.echo-crash-guard-sticker-art[data-motion="bob"] { animation-name: echoCrashGuardStickerBob; }
.echo-crash-guard-sticker-art[data-motion="bounce"] { animation-name: echoCrashGuardStickerBounce; }
.echo-crash-guard-sticker-art[data-motion="pulse"] { animation-name: echoCrashGuardStickerPulse; }
.echo-crash-guard-sticker-art[data-motion="twinkle"] { animation-name: echoCrashGuardStickerTwinkle; }
.echo-crash-guard-sticker-art[data-motion="drift"] { animation-name: echoCrashGuardStickerDrift; }

.echo-crash-guard-rail-monitor,
.echo-crash-guard-rail-ticket {
  position: absolute;
  z-index: 2;
  color: var(--cg-ink-deep);
  border: 2px solid rgba(58, 65, 173, 0.7);
  background: rgba(251, 253, 255, 0.94);
  box-shadow:
    0 4px 0 rgba(58, 65, 173, 0.16),
    0 18px 32px rgba(35, 41, 99, 0.09);
}

.echo-crash-guard-rail-monitor {
  top: 15%;
  left: clamp(32%, 35vw, 38%);
  width: min(276px, 23vw);
  padding: 13px 14px 12px;
  border-radius: 20px;
  background:
    linear-gradient(145deg, rgba(236, 250, 254, 0.96), rgba(251, 253, 255, 0.96));
  transform: rotate(1deg);
  animation: echoCrashGuardMonitorIn 420ms cubic-bezier(0.16, 1, 0.3, 1) 80ms both;
}

.echo-crash-guard-rail-monitor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.echo-crash-guard-rail-monitor-header span {
  color: var(--cg-pink-deep);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.echo-crash-guard-rail-monitor-header strong {
  overflow: hidden;
  color: var(--cg-ink);
  font-size: 11px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.echo-crash-guard-rail-signal {
  height: 34px;
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 9px;
  padding: 0 10px;
  overflow: hidden;
  border: 1px dashed rgba(58, 65, 173, 0.24);
  border-radius: 10px;
  background:
    repeating-linear-gradient(90deg, transparent 0 17px, rgba(58, 65, 173, 0.05) 17px 18px),
    rgba(255, 255, 255, 0.72);
}

.echo-crash-guard-rail-signal i {
  width: 5px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 3px;
  background: var(--cg-cyan);
  box-shadow: 0 0 0 1px rgba(58, 65, 173, 0.12);
}

.echo-crash-guard-rail-signal i:nth-child(2),
.echo-crash-guard-rail-signal i:nth-child(7) { height: 15px; }
.echo-crash-guard-rail-signal i:nth-child(3),
.echo-crash-guard-rail-signal i:nth-child(6) { height: 24px; background: var(--cg-ink); }
.echo-crash-guard-rail-signal i:nth-child(4) { height: 13px; background: var(--cg-pink); }
.echo-crash-guard-rail-signal i:nth-child(5) { height: 20px; background: var(--cg-lemon); }

.echo-crash-guard-rail-monitor-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 9px;
}

.echo-crash-guard-rail-monitor-facts > span {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.echo-crash-guard-rail-monitor-facts small {
  color: var(--cg-muted);
  font-size: 9px;
  font-weight: 800;
}

.echo-crash-guard-rail-monitor-facts strong {
  overflow: hidden;
  font-size: 11px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.echo-crash-guard-rail-board {
  position: absolute;
  z-index: 2;
  top: 35%;
  left: clamp(35%, 40vw, 43%);
  width: min(248px, 22vw);
  padding: 16px 16px 14px;
  color: var(--cg-ink-deep);
  border: 2px solid rgba(58, 65, 173, 0.72);
  border-radius: 20px;
  background: rgba(251, 253, 255, 0.94);
  box-shadow:
    0 4px 0 rgba(58, 65, 173, 0.16),
    0 18px 34px rgba(35, 41, 99, 0.1);
  transform: rotate(-1.4deg);
  animation: echoCrashGuardBoardIn 460ms cubic-bezier(0.16, 1, 0.3, 1) 120ms both;
}

.echo-crash-guard-rail-board::before {
  position: absolute;
  top: -9px;
  left: 22px;
  width: 62px;
  height: 16px;
  border: 1px solid rgba(58, 65, 173, 0.2);
  border-radius: 4px;
  background: rgba(255, 233, 125, 0.88);
  transform: rotate(2deg);
  content: "";
}

.echo-crash-guard-rail-board-header {
  display: grid;
  gap: 3px;
  padding-bottom: 10px;
  border-bottom: 2px dashed rgba(58, 65, 173, 0.2);
}

.echo-crash-guard-rail-board-header small {
  color: var(--cg-pink-deep);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
}

.echo-crash-guard-rail-board-header strong {
  overflow: hidden;
  font-size: 13px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.echo-crash-guard-rail-board-list {
  display: grid;
  gap: 0;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.echo-crash-guard-rail-board-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  min-height: 42px;
  border-bottom: 1px dashed rgba(58, 65, 173, 0.18);
}

.echo-crash-guard-rail-board-item:last-child {
  border-bottom: 0;
}

.echo-crash-guard-rail-board-index {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  color: var(--cg-ink-deep);
  border: 2px solid var(--cg-ink);
  border-radius: 8px;
  background: var(--cg-lemon);
  box-shadow: 0 2px 0 rgba(58, 65, 173, 0.22);
  font-size: 10px;
  font-weight: 800;
}

.echo-crash-guard-rail-board-item:nth-child(2) .echo-crash-guard-rail-board-index {
  background: var(--cg-cyan);
}

.echo-crash-guard-rail-board-item:nth-child(3) .echo-crash-guard-rail-board-index {
  background: var(--cg-pink-pale);
}

.echo-crash-guard-rail-board-item strong {
  font-size: 12px;
  font-weight: 800;
  line-height: 1.35;
}

.echo-crash-guard-rail-ticket {
  left: clamp(33%, 36vw, 40%);
  bottom: 8%;
  width: min(276px, 24vw);
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 11px;
  padding: 12px 14px 12px 11px;
  border-radius: 18px;
  transform: rotate(1.4deg);
  animation: echoCrashGuardTicketIn 440ms cubic-bezier(0.16, 1, 0.3, 1) 180ms both;
}

.echo-crash-guard-rail-ticket-mark {
  min-width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: var(--cg-ink-deep);
  border: 2px solid var(--cg-ink);
  border-radius: 12px;
  background: var(--cg-cyan);
  box-shadow: 0 3px 0 rgba(58, 65, 173, 0.26);
  font-size: 10px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.echo-crash-guard-rail-ticket > span:last-child {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.echo-crash-guard-rail-ticket small {
  color: var(--cg-pink-deep);
  font-size: 9px;
  font-weight: 800;
}

.echo-crash-guard-rail-ticket strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.echo-crash-guard-rail-ticket > span:last-child > span {
  overflow: hidden;
  color: var(--cg-muted);
  font-size: 10px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.echo-crash-guard-rail-message {
  position: absolute;
  z-index: 3;
  top: 9%;
  left: clamp(47%, 52vw, 56%);
  width: min(258px, 26vw);
  display: grid;
  gap: 4px;
  padding: 11px 13px;
  color: var(--cg-ink-deep);
  border: 2px solid var(--cg-ink);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 3px 0 rgba(58, 65, 173, 0.32);
  animation: echoCrashGuardBubbleIn 340ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.echo-crash-guard-rail-message::after {
  position: absolute;
  right: 28px;
  bottom: -8px;
  width: 14px;
  height: 14px;
  border-right: 2px solid var(--cg-ink);
  border-bottom: 2px solid var(--cg-ink);
  background: #fff;
  transform: rotate(45deg);
  content: "";
}

.echo-crash-guard-rail-message small {
  color: var(--cg-pink-deep);
  font-size: 11px;
  font-weight: 800;
}

.echo-crash-guard-rail-message strong {
  font-size: 14px;
  line-height: 1.45;
  font-weight: 800;
}

.echo-crash-guard-character {
  position: absolute;
  z-index: 1;
  left: clamp(42%, 52vw, 58%);
  right: auto;
  bottom: -4vh;
  width: auto;
  height: min(94vh, 860px);
  object-fit: contain;
  object-position: center bottom;
  filter: drop-shadow(0 22px 18px rgba(35, 41, 99, 0.18));
  transform-origin: 50% 100%;
  animation: echoCrashGuardFloat 5.6s ease-in-out infinite;
}

.echo-crash-guard-details {
  margin-top: 12px;
  padding: 10px 12px;
  color: var(--cg-muted);
  border: 2px solid var(--cg-ink-line);
  border-radius: 14px;
  background: var(--cg-cyan-pale);
}

.echo-crash-guard-details summary {
  cursor: pointer;
  color: var(--cg-ink);
  font-size: 12px;
  font-weight: 800;
}

.echo-crash-guard-details pre {
  max-height: 120px;
  overflow: auto;
  margin: 10px 0 0;
  padding: 10px;
  color: var(--cg-ink-deep);
  border: 2px dashed rgba(58, 65, 173, 0.28);
  border-radius: 10px;
  background: #fff;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

@keyframes echoCrashGuardChartIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes echoCrashGuardFadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes echoCrashGuardBubbleIn {
  from { opacity: 0; transform: translateY(6px) scale(0.86); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes echoCrashGuardBoardIn {
  from { opacity: 0; transform: translateY(10px) rotate(-3deg); }
  to { opacity: 1; transform: translateY(0) rotate(-1.4deg); }
}

@keyframes echoCrashGuardMonitorIn {
  from { opacity: 0; transform: translateY(8px) rotate(3deg); }
  to { opacity: 1; transform: translateY(0) rotate(1deg); }
}

@keyframes echoCrashGuardTicketIn {
  from { opacity: 0; transform: translateY(8px) rotate(3.2deg); }
  to { opacity: 1; transform: translateY(0) rotate(1.4deg); }
}

@keyframes echoCrashGuardStickerIn {
  from { opacity: 0; }
  to { opacity: 0.88; }
}

@keyframes echoCrashGuardStickerSway {
  0%, 100% { transform: translate3d(-2px, 1px, 0) rotate(-3deg); }
  50% { transform: translate3d(3px, -7px, 0) rotate(3deg); }
}

@keyframes echoCrashGuardStickerBob {
  0%, 100% { transform: translate3d(0, 2px, 0) rotate(-2deg); }
  50% { transform: translate3d(0, -9px, 0) rotate(2deg); }
}

@keyframes echoCrashGuardStickerBounce {
  0%, 100% { transform: translate3d(0, 1px, 0) rotate(-2deg); }
  46% { transform: translate3d(0, -10px, 0) rotate(3deg); }
  64% { transform: translate3d(0, -5px, 0) rotate(1deg); }
}

@keyframes echoCrashGuardStickerPulse {
  0%, 45%, 100% { transform: scale(0.98); }
  12% { transform: scale(1.09); }
  24% { transform: scale(1); }
  34% { transform: scale(1.06); }
}

@keyframes echoCrashGuardStickerTwinkle {
  0%, 100% { opacity: 0.68; transform: scale(0.9) rotate(-5deg); }
  50% { opacity: 1; transform: scale(1.12) rotate(5deg); }
}

@keyframes echoCrashGuardStickerDrift {
  0%, 100% { transform: translate3d(-3px, 2px, 0) rotate(-5deg); }
  50% { transform: translate3d(4px, -7px, 0) rotate(6deg); }
}

@keyframes echoCrashGuardFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@keyframes echoCrashGuardPending {
  0%, 100% { box-shadow: 0 3px 0 rgba(58, 65, 173, 0.14); }
  50% { box-shadow: 0 3px 0 rgba(216, 79, 159, 0.4); }
}

@media (prefers-reduced-motion: reduce) {
  .echo-crash-guard-chart,
  .echo-crash-guard-step,
  .echo-crash-guard-groups,
  .echo-crash-guard-rail-monitor,
  .echo-crash-guard-rail-board,
  .echo-crash-guard-rail-ticket,
  .echo-crash-guard-sticker,
  .echo-crash-guard-sticker-art,
  .echo-crash-guard-rail-message,
  .echo-crash-guard-character,
  .echo-crash-guard-action[data-pending="true"] {
    animation: none !important;
  }
}

@media (max-width: 1120px) {
  .echo-crash-guard-rail-monitor,
  .echo-crash-guard-rail-board,
  .echo-crash-guard-rail-ticket,
  .echo-crash-guard-sticker {
    display: none;
  }

  .echo-crash-guard-character {
    left: auto;
    right: -36px;
    height: min(70vh, 540px);
  }

  .echo-crash-guard-floor {
    left: auto;
    right: 8%;
    transform: none;
  }

  .echo-crash-guard-rail-message {
    left: auto;
    right: 18px;
    top: 16px;
    width: min(220px, 42vw);
  }
}

@media (max-width: 720px) {
  .echo-crash-guard-stage {
    align-items: stretch;
    padding: 14px 12px 0;
  }

  .echo-crash-guard-chart {
    width: 100%;
    max-height: calc(100% - 138px);
    padding: 18px 16px 14px;
  }

  .echo-crash-guard-chart-holes,
  .echo-crash-guard-chart-clip {
    display: none;
  }

  .echo-crash-guard-facts,
  .echo-crash-guard-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .echo-crash-guard-fact {
    border-right: 0;
    border-bottom: 1px solid var(--cg-ink-line);
  }

  .echo-crash-guard-fact:last-child {
    border-bottom: 0;
  }

  .echo-crash-guard-action {
    width: 100%;
  }

  .echo-crash-guard-title {
    max-width: none;
    font-size: 26px;
  }

  .echo-crash-guard-character {
    height: 168px;
    right: -6px;
    bottom: -8px;
  }

  .echo-crash-guard-floor {
    width: 160px;
    right: 16px;
    bottom: 10px;
  }

  .echo-crash-guard-rail-message {
    width: min(196px, 64%);
  }
}
`;
