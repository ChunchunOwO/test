export const echoLinkAlbumSeaThemeCss = String.raw`
    /* Album Sea immersive selected-album layout. */
    :root {
      --album-sea-blue: #2495ff;
      --album-sea-panel: rgba(8, 14, 24, 0.9);
      --album-sea-panel-soft: rgba(9, 16, 28, 0.78);
      --album-sea-hairline: rgba(206, 226, 255, 0.15);
    }
    body {
      background:
        radial-gradient(circle at 38% 46%, rgba(67, 76, 174, 0.25), transparent 34%),
        radial-gradient(circle at 68% 58%, rgba(31, 119, 169, 0.18), transparent 38%),
        radial-gradient(circle at 58% 78%, rgba(155, 66, 139, 0.13), transparent 34%),
        #040912;
    }
    .stage {
      background:
        radial-gradient(circle at 38% 46%, rgba(67, 76, 174, 0.25), transparent 34%),
        radial-gradient(circle at 68% 58%, rgba(31, 119, 169, 0.18), transparent 38%),
        radial-gradient(circle at 58% 78%, rgba(155, 66, 139, 0.13), transparent 34%),
        #040912;
    }
    .stage::before {
      background:
        linear-gradient(180deg, rgba(2, 7, 15, 0.58), transparent 20%, transparent 76%, rgba(2, 7, 15, 0.54)),
        linear-gradient(90deg, rgba(2, 7, 15, 0.48), transparent 20%, transparent 78%, rgba(2, 7, 15, 0.44));
      background-size: auto;
      opacity: 1;
    }
    .stage::after {
      background:
        radial-gradient(circle at center, transparent 46%, rgba(1, 5, 12, 0.34) 100%),
        linear-gradient(180deg, rgba(2, 7, 15, 0.08), transparent 24%, transparent 72%, rgba(2, 7, 15, 0.42));
    }
    .album-mural {
      background:
        radial-gradient(circle at 44% 48%, rgba(92, 109, 224, 0.16), transparent 36%),
        radial-gradient(circle at 68% 58%, rgba(32, 145, 197, 0.12), transparent 38%),
        radial-gradient(circle at 58% 76%, rgba(188, 77, 154, 0.09), transparent 34%);
      opacity: 0.72;
    }
    .custom-background img,
    .custom-background video {
      filter: saturate(1.04) brightness(0.62);
    }
    .custom-background::after {
      background:
        radial-gradient(circle at 42% 46%, transparent 22%, rgba(3, 8, 17, 0.2) 68%),
        linear-gradient(180deg, rgba(2, 7, 15, 0.38), rgba(2, 7, 15, 0.2) 32%, rgba(2, 7, 15, 0.56));
    }
    .topbar {
      top: 20px;
      left: 30px;
      right: 30px;
      width: auto;
      max-width: none;
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      backdrop-filter: none;
      opacity: 1;
      transform: none;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 20px;
      min-width: 0;
    }
    .brand strong {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
      font-weight: 520;
      letter-spacing: -0.01em;
    }
    .brand .echo-word {
      font-size: 24px;
      font-weight: 850;
      letter-spacing: -0.04em;
    }
    .brand .brand-cn {
      position: relative;
      padding-left: 13px;
      color: rgba(248, 250, 255, 0.92);
      font-weight: 650;
    }
    .brand .brand-cn::before {
      content: "·";
      position: absolute;
      left: 0;
      color: rgba(211, 222, 239, 0.5);
      font-weight: 500;
    }
    .brand small {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: rgba(211, 222, 239, 0.74);
      font-size: 13px;
      font-weight: 540;
      letter-spacing: 0;
      text-transform: none;
    }
    .brand-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--album-sea-blue);
      box-shadow: 0 0 14px rgba(36, 149, 255, 0.78);
    }
    .view-switch {
      display: inline-flex;
      flex: 0 0 auto;
      gap: 3px;
      padding: 3px;
      border: 0;
      border-radius: 999px;
      background: rgba(18, 20, 26, 0.22);
      box-shadow: 0 12px 30px -18px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      -webkit-backdrop-filter: blur(18px) saturate(1.5);
      backdrop-filter: blur(18px) saturate(1.5);
    }
    .view-switch button {
      min-width: 52px;
      min-height: 30px;
      padding: 0 14px;
      border: 0;
      border-radius: 999px;
      color: rgba(203, 216, 235, 0.66);
      background: transparent;
      font-size: 12px;
      font-weight: 620;
      line-height: 1;
    }
    .view-switch button:hover:not(:disabled) {
      color: rgba(239, 246, 255, 0.9);
      background: rgba(255, 255, 255, 0.06);
      transform: none;
    }
    .view-switch button[data-active="true"] {
      color: #f7fbff;
      background: rgba(255, 255, 255, 0.18);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
    }
    .beta-badge {
      display: none;
    }
    .controls {
      margin-left: auto;
      flex-wrap: nowrap;
      gap: 9px;
    }
    .controls button,
    .selected-controls button {
      display: inline-grid;
      width: 38px;
      min-width: 38px;
      min-height: 38px;
      padding: 0;
      place-items: center;
      border-color: transparent;
      border-radius: 999px;
      color: rgba(239, 246, 255, 0.84);
      background: transparent;
      box-shadow: none;
    }
    .controls button:hover:not(:disabled),
    .selected-controls button:hover:not(:disabled) {
      border-color: rgba(208, 231, 255, 0.18);
      background: rgba(255, 255, 255, 0.08);
      transform: none;
    }
    .controls button.primary,
    .selected-controls button.primary {
      width: 50px;
      min-width: 50px;
      min-height: 50px;
      color: #ffffff;
      border: 1px solid rgba(84, 171, 255, 0.68);
      background: rgba(28, 104, 190, 0.56);
      box-shadow: 0 14px 34px rgba(0, 76, 172, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.14);
    }
    .icon {
      width: 19px;
      height: 19px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .controls .primary .icon,
    .selected-controls .primary .icon {
      width: 23px;
      height: 23px;
      stroke-width: 1.9;
    }
    .now {
      top: 20px;
      right: 300px;
      bottom: auto;
      left: auto;
      display: block;
      width: 160px;
      max-width: 160px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      backdrop-filter: none;
      opacity: 1;
      transform: none;
    }
    .now-art,
    .now p,
    .now .progress-row,
    .now .search {
      display: none;
    }
    .now small {
      color: rgba(205, 219, 238, 0.62);
      font-size: 11px;
      font-weight: 560;
      letter-spacing: 0;
      text-transform: none;
    }
    .now h1 {
      overflow: hidden;
      margin-top: 3px;
      color: rgba(245, 249, 255, 0.9);
      font-size: 13px;
      font-weight: 620;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .sea-head {
      top: auto;
      right: auto;
      bottom: 24px;
      left: 30px;
      display: block;
      max-width: none;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      backdrop-filter: none;
      opacity: 1;
      transform: none;
    }
    .sea-head > div {
      display: none;
    }
    .sea-head button {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      min-height: 38px;
      padding: 0 12px;
      border-color: transparent;
      border-radius: 999px;
      color: rgba(155, 207, 255, 0.9);
      background: transparent;
      font-size: 13px;
      font-weight: 580;
    }
    .sea-head button:hover:not(:disabled) {
      border-color: rgba(112, 184, 255, 0.15);
      background: rgba(28, 108, 190, 0.14);
      transform: none;
    }
    .album-card {
      border: 0;
      border-radius: 20px;
      isolation: isolate;
      background:
        radial-gradient(130% 92% at 8% -8%, rgba(var(--glass-rgb, 128, 154, 236), 0.24), transparent 54%),
        radial-gradient(105% 72% at 50% 114%, rgba(var(--glass-rgb, 128, 154, 236), 0.22), transparent 68%),
        linear-gradient(145deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.035) 28%, rgba(9, 12, 20, 0.2) 72%),
        rgba(18, 20, 26, 0.3);
      box-shadow:
        0 18px 44px -16px rgba(0, 0, 0, 0.55),
        0 0 0 1px rgba(255, 255, 255, 0.48),
        inset 0 1px 0 rgba(255, 255, 255, 0.34),
        inset 0 -1px 0 rgba(var(--glass-rgb, 128, 154, 236), 0.16);
      -webkit-backdrop-filter: blur(22px) saturate(1.62);
      backdrop-filter: blur(22px) saturate(1.62);
    }
    .album-card::before {
      display: block;
      inset: 1px;
      z-index: 1;
      border-radius: 19px;
      background:
        radial-gradient(82% 46% at 16% 0%, rgba(255, 255, 255, 0.28), transparent 72%),
        linear-gradient(118deg, transparent 42%, rgba(255, 255, 255, 0.075) 50%, transparent 59%);
      mix-blend-mode: screen;
      opacity: 0.48;
    }
    .album-card::after {
      display: block;
      inset: 0;
      z-index: 1;
      width: auto;
      height: auto;
      border-radius: inherit;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.055), transparent 24%, transparent 72%, rgba(var(--glass-rgb, 128, 154, 236), 0.08));
      box-shadow: inset 0 0 24px rgba(var(--glass-rgb, 128, 154, 236), 0.075);
      opacity: 1;
      transform: none;
    }
    .album-card:hover,
    .album-card[data-spotlight="true"] {
      box-shadow:
        0 18px 44px -16px rgba(0, 0, 0, 0.55),
        0 0 0 1px rgba(255, 255, 255, 0.56),
        inset 0 1px 0 rgba(255, 255, 255, 0.38),
        inset 0 -1px 0 rgba(var(--glass-rgb, 128, 154, 236), 0.2);
    }
    .album-card[data-selected="true"] {
      box-shadow:
        0 28px 72px -18px rgba(0, 0, 0, 0.68),
        0 0 0 1px rgba(120, 194, 255, 0.72),
        inset 0 1px 0 rgba(255, 255, 255, 0.34);
    }
    .album-card[data-spotlight="true"],
    .album-card[data-spotlight="true"][data-selected="true"] {
      border-radius: 20px;
      box-shadow:
        0 18px 44px -16px rgba(0, 0, 0, 0.55),
        0 0 0 1px rgba(255, 255, 255, 0.45),
        inset 0 1px 0 rgba(255, 255, 255, 0.28);
    }
    .album-card[data-spotlight="true"]::before {
      opacity: 0.58;
    }
    .album-card[data-featured="true"] {
      background:
        radial-gradient(138% 100% at 7% -10%, rgba(var(--glass-rgb, 128, 154, 236), 0.3), transparent 56%),
        radial-gradient(108% 76% at 50% 112%, rgba(var(--glass-rgb, 128, 154, 236), 0.34), transparent 68%),
        linear-gradient(145deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.04) 28%, rgba(8, 11, 19, 0.18) 72%),
        rgba(18, 20, 26, 0.25);
    }
    .album-card button {
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
    }
    .album-cover {
      position: relative;
      inset: auto;
      flex: 1 1 auto;
      width: 100%;
      height: auto;
      min-height: 0;
      border-radius: 12px;
      box-shadow: 0 6px 16px -6px rgba(0, 0, 0, 0.5);
    }
    .album-cover::before {
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.14), transparent 28%);
      opacity: 0.5;
    }
    .album-cover::after {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 24%, rgba(3, 8, 16, 0.08));
    }
    .album-copy,
    .album-card[data-focused="true"] .album-copy,
    .album-card[data-spotlight="true"] .album-copy {
      position: relative;
      left: auto;
      right: auto;
      bottom: auto;
      flex: 0 0 auto;
      min-height: 0;
      padding: 0;
      text-align: center;
      background: transparent;
      box-shadow: none;
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
    .album-copy strong {
      -webkit-line-clamp: 1;
      padding-right: 0;
      font-size: 16px;
      font-weight: 620;
      line-height: 1.2;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
    }
    .album-copy span {
      display: block;
      margin-top: 1px;
      color: rgba(255, 255, 255, 0.74);
      font-size: 13px;
      line-height: 1.22;
    }
    .track-duration {
      display: none;
    }
    .album-more {
      display: none;
    }
    .album-mini-controls {
      position: relative;
      inset: auto;
      flex: 0 0 35px;
      width: 100%;
      grid-template-columns: 1fr 1.18fr 1fr 1fr;
      gap: 0;
    }
    .album-mini-controls .icon {
      width: 16px;
      height: 16px;
      stroke-width: 1.55;
    }
    .album-mini-controls i,
    .album-mini-controls em,
    .album-mini-controls span {
      display: grid;
      width: 100%;
      max-width: 16px;
      height: 35px;
      place-items: center;
      color: rgba(225, 236, 250, 0.72);
      background: transparent;
      font-style: normal;
    }
    .album-mini-controls i {
      width: 35px;
      max-width: 35px;
      height: 35px;
      border-radius: 999px;
      color: rgba(244, 249, 255, 0.92);
      background: rgba(255, 255, 255, 0.2);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
    }
    .album-card[data-size-tier="hero"] button {
      gap: 12px;
      padding: 14px;
    }
    .album-card[data-size-tier="hero"] .album-cover {
      border-radius: 14px;
    }
    .album-card[data-size-tier="hero"] .album-copy {
      flex-basis: auto;
      min-height: 0;
      padding-bottom: 0;
    }
    .album-card[data-size-tier="hero"] .album-mini-controls .icon {
      width: 19px;
      height: 19px;
    }
    .album-card[data-size-tier="hero"] .album-mini-controls i,
    .album-card[data-size-tier="hero"] .album-mini-controls em {
      height: 44px;
    }
    .album-card[data-size-tier="hero"] .album-mini-controls {
      flex-basis: 44px;
    }
    .album-card[data-size-tier="hero"] .album-mini-controls i {
      width: 44px;
      max-width: 44px;
    }
    .album-mini-controls em::before,
    .album-mini-controls em::after,
    .album-mini-controls i::before,
    .album-mini-controls span::before,
    .album-mini-controls span::after {
      display: none;
    }
    .album-selection {
      position: fixed;
      inset: 98px 28px 28px;
      z-index: 12;
      display: none;
      grid-template-columns: minmax(40px, 1fr) minmax(340px, 390px) minmax(64px, 1fr) 360px;
      align-items: center;
      pointer-events: none;
    }
    .album-selection[data-open="true"] {
      display: grid;
    }
    .selected-album-card {
      grid-column: 2;
      overflow: hidden;
      width: 100%;
      border: 1px solid rgba(62, 157, 255, 0.82);
      border-radius: 22px;
      color: var(--text);
      background: rgba(5, 12, 22, 0.95);
      box-shadow: 0 34px 100px rgba(0, 0, 0, 0.56), 0 0 0 1px rgba(87, 170, 255, 0.12);
      pointer-events: auto;
    }
    .selected-cover {
      aspect-ratio: 1;
      overflow: hidden;
      background: rgba(24, 38, 58, 0.82);
    }
    .selected-cover img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }
    .selected-copy {
      padding: 20px 22px 18px;
    }
    .selected-state {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #2d9bff;
      font-size: 12px;
      font-weight: 650;
    }
    .selected-state .icon {
      width: 17px;
      height: 17px;
    }
    .selected-copy h2 {
      overflow: hidden;
      margin: 12px 0 5px;
      font-size: clamp(25px, 2vw, 31px);
      font-weight: 690;
      letter-spacing: -0.035em;
      line-height: 1.08;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .selected-copy p {
      overflow: hidden;
      margin: 0;
      color: rgba(203, 216, 234, 0.64);
      font-size: 14px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .selected-controls {
      display: grid;
      grid-template-columns: 1fr auto 1fr 1fr;
      align-items: center;
      justify-items: center;
      gap: 12px;
      margin-top: 20px;
    }
    .selected-controls button:first-child {
      justify-self: end;
    }
    .selected-controls button:last-child {
      justify-self: start;
    }
    .album-detail,
    .album-detail[data-open="true"] {
      position: static;
      inset: auto;
      grid-column: 4;
      display: grid;
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 0;
      width: 360px;
      max-width: none;
      height: min(650px, calc(100vh - 136px));
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--album-sea-hairline);
      border-radius: 20px;
      color: var(--text);
      background: var(--album-sea-panel);
      box-shadow: 0 32px 90px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.035);
      backdrop-filter: blur(26px) saturate(1.08);
      pointer-events: auto;
    }
    .album-detail .detail-head {
      padding: 20px 22px 12px;
    }
    .album-detail .detail-back {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      min-height: 32px;
      padding: 0;
      border: 0;
      color: rgba(224, 234, 248, 0.78);
      background: transparent;
      font-size: 13px;
      font-weight: 560;
    }
    .album-detail .detail-back:hover:not(:disabled) {
      color: #ffffff;
      background: transparent;
      transform: none;
    }
    .album-detail .detail-back .icon {
      width: 17px;
      height: 17px;
    }
    .album-detail .detail-title-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 14px;
      margin-top: 22px;
      padding-bottom: 14px;
      border-bottom: 1px solid rgba(205, 225, 250, 0.12);
    }
    .album-detail .detail-title-row h2 {
      margin: 0;
      font-size: 21px;
      font-weight: 680;
      letter-spacing: -0.02em;
    }
    .album-detail .detail-title-row small {
      color: rgba(199, 214, 233, 0.48);
      font-size: 11px;
      font-weight: 560;
      letter-spacing: 0;
      text-transform: none;
    }
    .track-list {
      display: block;
      grid-column: auto;
      min-height: 0;
      max-height: none;
      overflow: auto;
      padding: 0 22px;
      scrollbar-color: rgba(119, 159, 203, 0.32) transparent;
      scrollbar-width: thin;
    }
    .track-row {
      display: grid;
      grid-template-columns: 32px minmax(0, 1fr) auto 22px;
      gap: 10px;
      align-items: center;
      width: 100%;
      min-height: 65px;
      padding: 0;
      border: 0;
      border-bottom: 1px solid rgba(205, 225, 250, 0.09);
      border-radius: 0;
      color: rgba(238, 244, 253, 0.82);
      text-align: left;
      background: transparent;
    }
    .track-row:hover,
    .track-row:focus-visible {
      border-color: rgba(205, 225, 250, 0.09);
      color: #ffffff;
      background: rgba(255, 255, 255, 0.035);
      outline: 0;
      transform: none;
    }
    .track-row .track-index,
    .track-row time {
      color: rgba(193, 208, 229, 0.5);
      font-size: 12px;
      font-style: normal;
      font-variant-numeric: tabular-nums;
    }
    .track-row .track-leading {
      position: relative;
      display: grid;
      width: 32px;
      height: 22px;
      place-items: center;
      overflow: visible;
    }
    .track-row .track-index,
    .track-row .track-signal {
      grid-area: 1 / 1;
    }
    .track-row .track-title {
      overflow: hidden;
      font-size: 13px;
      font-weight: 560;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .track-row .track-heart {
      display: grid;
      place-items: center;
      color: rgba(210, 224, 242, 0.62);
    }
    .track-row .track-heart .icon {
      width: 15px;
      height: 15px;
    }
    .track-row .track-signal {
      display: none;
      color: var(--album-sea-blue);
    }
    .track-row .track-signal .icon {
      width: 17px;
      height: 17px;
    }
    .track-row[data-current="true"] {
      color: #2d9bff;
    }
    .track-row[data-current="true"] .track-index {
      display: none;
    }
    .track-row[data-current="true"] .track-signal {
      display: grid;
    }
    .album-detail .detail-foot {
      display: flex;
      align-items: center;
      gap: 9px;
      min-height: 58px;
      margin: 0 22px;
      color: rgba(196, 211, 232, 0.48);
      font-size: 12px;
    }
    .album-detail .detail-foot .icon {
      width: 16px;
      height: 16px;
    }
    .album-selection[data-open="true"] ~ .toast {
      bottom: 24px;
    }
    @media (max-width: 1100px) {
      .now {
        display: none;
      }
      .album-selection {
        grid-template-columns: minmax(26px, 1fr) minmax(300px, 350px) minmax(42px, 1fr) 330px;
      }
      .album-detail,
      .album-detail[data-open="true"] {
        width: 330px;
      }
    }
    @media (max-width: 820px) {
      .topbar {
        top: 16px;
        left: 16px;
        right: 16px;
      }
      .brand strong {
        gap: 9px;
      }
      .brand .brand-cn,
      .brand small {
        display: none;
      }
      .view-switch {
        gap: 2px;
        padding: 2px;
      }
      .view-switch button {
        min-width: 42px;
        min-height: 28px;
        padding: 0 10px;
      }
      .controls {
        gap: 3px;
      }
      .controls button {
        width: 34px;
        min-width: 34px;
        min-height: 34px;
      }
      .controls button.primary {
        width: 42px;
        min-width: 42px;
        min-height: 42px;
      }
      .sea-head {
        left: 14px;
        bottom: 14px;
      }
      .album-selection,
      .album-selection[data-open="true"] {
        inset: 76px 12px 12px;
        display: block;
        overflow: auto;
        padding: 8px 0 22px;
      }
      .selected-album-card {
        width: min(100%, 340px);
        margin: 0 auto 18px;
      }
      .album-detail,
      .album-detail[data-open="true"] {
        width: min(100%, 430px);
        height: min(560px, calc(100vh - 112px));
        margin: 0 auto;
      }
    }
    @media (max-width: 620px) {
      .brand strong > span:nth-child(2) {
        display: none;
      }
      .topbar {
        gap: 10px;
      }
    }
`;
