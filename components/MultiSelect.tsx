'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';

export interface MultiSelectOption {
  id: string;
  label: string;
  /** 空間不足時顯示的短標籤（透過 CSS 切換） */
  shortLabel?: string;
  /** 顯示在主標籤下方的次標籤（例：CV 名、成員數） */
  sublabel?: string;
  /** 搜尋時額外比對的字串（例：kana） */
  searchAlias?: string;
}

interface Props {
  /** 顯示用的所有選項（已根據級聯規則過濾完） */
  options: MultiSelectOption[];
  /** 已選的 id 陣列 */
  value: string[];
  onChange: (next: string[]) => void;
  /** 沒有選任何項時的 placeholder */
  placeholder: string;
  /** 搜尋框的 placeholder（panel 內） */
  searchPlaceholder?: string;
  /** 觸發 trigger 左邊的 icon（可選） */
  leftIcon?: React.ReactNode;
  /** 額外 className */
  className?: string;
}

/**
 * 通用多選下拉。
 * - 預設不選任何項；想清除點 X
 * - 點 trigger 開 panel，panel 內可搜尋、勾選多項
 * - 點 trigger 外或 Escape 關閉
 * - OR 語意：呼叫端把 value 視為「任一匹配」即可
 */
export default function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder = '搜尋...',
  leftIcon,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 點外面 / Escape 關 panel
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel?.toLowerCase().includes(q) ?? false) ||
        (o.searchAlias?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query]);

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  function clearAll(e?: React.MouseEvent) {
    e?.stopPropagation();
    onChange([]);
  }

  const selectedLabels = useMemo(() => {
    if (value.length === 0) return null;
    const labelMap = new Map(
      options.map((o) => [o.id, { label: o.label, shortLabel: o.shortLabel }] as const),
    );
    return value.map((id) => {
      const data = labelMap.get(id);
      if (!data) return <span key={id}>(已移除)</span>;
      if (!data.shortLabel) return <span key={id}>{data.label}</span>;
      return (
        <span key={id}>
          <span className="multiselect-label-full">{data.label}</span>
          <span className="multiselect-label-short">{data.shortLabel}</span>
        </span>
      );
    });
  }, [value, options]);

  const renderSelectedLabels = () => {
    if (!selectedLabels) return null;
    // 使用 reduce 插入頓號
    return selectedLabels.reduce((prev, curr) => (
      <React.Fragment key={curr.key + '-join'}>
        {prev}、{curr}
      </React.Fragment>
    ));
  };

  return (
    <div
      ref={rootRef}
      className={`multiselect ${open ? 'is-open' : ''} ${className ?? ''}`}
    >
      <button
        type="button"
        className="multiselect-trigger form-input"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={leftIcon ? { paddingLeft: '38px' } : undefined}
      >
        {leftIcon && (
          <span
            style={{
              position: 'absolute',
              left: '12px',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            {leftIcon}
          </span>
        )}

        <span className="multiselect-trigger-label">
          {value.length === 0 ? (
            <span style={{ color: 'var(--text-muted, #888)' }}>{placeholder}</span>
          ) : value.length <= 2 ? (
            renderSelectedLabels()
          ) : (
            `已選 ${value.length} 項`
          )}
        </span>

        {value.length > 0 && (
          <span
            role="button"
            aria-label="清除所有選擇"
            tabIndex={0}
            onClick={clearAll}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') clearAll();
            }}
            className="multiselect-clear"
            title="清除"
          >
            ×
          </span>
        )}
      </button>

      {open && (
        // 注意：ARIA 規範要求 role="listbox" 內只能有 role="option" 或 group。
        // 之前把它放在外層 div 上、底下含 search <input>，會讓螢幕閱讀器行為異常。
        // 改成 role="listbox" 只套在 <ul> 上，search input 變成 sibling
        <div className="multiselect-panel">
          <div className="multiselect-panel-header">
            <input
              type="text"
              className="form-input multiselect-search"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <div className="multiselect-panel-meta">
              共 {filteredOptions.length} 項
              {value.length > 0 && (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="multiselect-link"
                    onClick={() => clearAll()}
                  >
                    清除已選 ({value.length})
                  </button>
                </>
              )}
            </div>
          </div>

          <ul className="multiselect-options" role="listbox" aria-multiselectable="true">
            {filteredOptions.length === 0 ? (
              <li className="multiselect-empty">沒有符合的項目</li>
            ) : (
              filteredOptions.map((o) => {
                const checked = value.includes(o.id);
                return (
                  <li
                    key={o.id}
                    className={`multiselect-option ${checked ? 'is-checked' : ''}`}
                    onClick={() => toggle(o.id)}
                    role="option"
                    aria-selected={checked}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="multiselect-option-label">
                      {o.label}
                      {o.sublabel && (
                        <small className="multiselect-option-sublabel">
                          {' '}
                          {o.sublabel}
                        </small>
                      )}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
