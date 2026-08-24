import { memo } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, AudioLines, MoveDown } from 'lucide-react';
import { formatTime } from '../player/playerFormat';
import type { LyricsCutBoardLayout } from './lyricsCutBoardLayout';

type LyricsCutBoardChromeProps = {
  durationSeconds: number;
  layout: LyricsCutBoardLayout;
  positionSeconds: number;
};

const sliceEdges = {
  top: [11.8, 21, 32.1, 44.6, 55.6, 66.7, 74.4, 90.2],
  bottom: [5.9, 8.8, 17.2, 37.8, 48.8, 58.2, 70.3, 91.3],
} as const;

const LyricsCutBoardChromeComponent = ({ durationSeconds, layout, positionSeconds }: LyricsCutBoardChromeProps): JSX.Element => {
  return (
    <div className="lyrics-cut-board-chrome" aria-hidden="true">
      <div className="lyrics-cut-board-slices">
        {layout.columns.map((column, index) => {
          const topStart = sliceEdges.top[index];
          const topEnd = sliceEdges.top[index + 1];
          const bottomStart = sliceEdges.bottom[index];
          const bottomEnd = sliceEdges.bottom[index + 1];
          return (
            <span
              className="lyrics-cut-board-slice"
              data-accent={index === layout.accentIndex ? 'true' : undefined}
              key={`${index}-${column}`}
              style={{
                '--lyrics-cut-board-clip': `polygon(${topStart}% 0, ${topEnd}% 0, ${bottomEnd}% var(--lyrics-cut-board-stage-end), ${bottomStart}% var(--lyrics-cut-board-stage-end))`,
                '--lyrics-cut-board-slice-index': index,
                '--lyrics-cut-board-slice-shade': layout.sliceShades[index] ?? 0.16,
              } as CSSProperties}
            />
          );
        })}
      </div>
      <div className="lyrics-cut-board-brand"><strong>ECHO</strong><AudioLines size={18} strokeWidth={1.8} /></div>
      <div className="lyrics-cut-board-rail" data-side="previous"><ArrowLeft size={18} /><span>PREV</span></div>
      <div className="lyrics-cut-board-rail" data-side="next"><ArrowRight size={18} /><span>NEXT</span></div>
      <div className="lyrics-cut-board-timecode">
        <strong>{formatTime(positionSeconds)}</strong>
        <MoveDown size={17} strokeWidth={1.4} />
        <span>{formatTime(durationSeconds)}</span>
      </div>
    </div>
  );
};

export const LyricsCutBoardChrome = memo(LyricsCutBoardChromeComponent);
