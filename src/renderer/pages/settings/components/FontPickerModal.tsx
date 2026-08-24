import { FolderOpen, Search, X } from 'lucide-react';
import { EchoSearchFieldTools } from '../../../components/common/EchoSearchFieldTools';
import { matchesSearchText } from '../../../utils/smartTextSearch';

export const FontPickerModal = ({
  currentFont,
  fonts,
  onClose,
  onChooseFile,
  onSelect,
  query,
  setQuery,
  title,
}: {
  currentFont: string;
  fonts: string[];
  onClose: () => void;
  onChooseFile: () => void;
  onSelect: (fontFamily: string) => void;
  query: string;
  setQuery: (query: string) => void;
  title: string;
}): JSX.Element => {
  const queryText = query.trim();
  const filteredFonts = queryText ? fonts.filter((font) => matchesSearchText(queryText, font)) : fonts;

  return (
    <div className="settings-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-font-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-font-modal-header">
          <h3>{title}</h3>
          <button className="settings-icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </header>
        <label className="settings-font-search echo-search-surface">
          <Search size={15} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
          {queryText ? (
            <EchoSearchFieldTools
              clearLabel="清除搜索"
              count={filteredFonts.length}
              onClear={() => setQuery('')}
            />
          ) : null}
        </label>
        <button className="settings-font-file-button" type="button" onClick={onChooseFile}>
          <FolderOpen size={15} aria-hidden="true" />
          从资源管理器选择
        </button>
        <div className="settings-font-list">
          {filteredFonts.map((font) => (
            <button
              className={`settings-font-option ${font === currentFont ? 'active' : ''}`}
              key={font}
              type="button"
              style={{ fontFamily: `"${font}", var(--echo-font-family)` }}
              onClick={() => onSelect(font)}
            >
              <span>{font}</span>
              <em>Echo font preview Aa 你好</em>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
