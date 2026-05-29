'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { BrandIcon } from './BrandIcon';
import { getBrandColor, getBrandDisplayName } from '@/lib/themeUtils';

interface Props {
  /** 可選的 brand id 列表（順序也照這個排）。預設 = 全部 10 個 */
  options: readonly string[];
  /** 已選的 brand id */
  value: string[];
  /** 點完成回傳新的選取 */
  onChange: (next: string[]) => void;
  /** 沒選任何項時的 placeholder 文字 */
  placeholder: string;
  /** 額外 className(用來跟其他 MultiSelect 一起對齊欄位寬) */
  className?: string;
}

/**
 * 品牌選擇器 — 點 trigger 跳 modal、icon + 名稱卡片式多選。
 * - 沒有搜尋框(品牌固定 10 個)，避免手機跳鍵盤
 * - trigger button 樣式跟 MultiSelect 一致
 */
export default function BrandPicker({
  options,
  value,
  onChange,
  placeholder,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  // Modal 內部選取 — 開啟時複製外部值,點完成才回寫
  const [draft, setDraft] = useState<Set<string>>(new Set(value));

  // 每次開啟同步外部選取
  useEffect(() => {
    if (open) setDraft(new Set(value));
  }, [open, value.join(',')]);

  // Esc 關掉
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const selectedLabels = useMemo(() => {
    if (value.length === 0) return null;
    return value.map((id) => getBrandDisplayName(id));
  }, [value]);

  function toggle(id: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleConfirm() {
    // 以 options 順序輸出，保持穩定
    const ordered = options.filter((b) => draft.has(b));
    onChange(ordered);
    setOpen(false);
  }

  function clearAll(e?: React.MouseEvent) {
    e?.stopPropagation();
    onChange([]);
  }

  return (
    <>
      <div className={`multiselect ${className ?? ''}`}>
        <button
          type="button"
          className="multiselect-trigger form-input"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-testid="brand-picker-trigger"
          style={{ paddingLeft: '38px' }}
        >
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
            <BrandIcon brand={value[0] ?? 'all'} className="brand-select-icon" />
          </span>
          <span className="multiselect-trigger-label">
            {value.length === 0 ? (
              <span style={{ color: 'var(--text-muted, #888)' }}>{placeholder}</span>
            ) : value.length <= 2 ? (
              selectedLabels?.join('、')
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
      </div>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div
            className="modal-content brand-picker-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="brand-picker-title"
            style={{ maxWidth: '640px', width: '100%' }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              <h2 id="brand-picker-title" style={{ margin: 0, fontSize: '18px' }}>
                選擇偶像品牌
              </h2>
              {draft.size > 0 && (
                <button
                  type="button"
                  onClick={() => setDraft(new Set())}
                  data-testid="brand-picker-clear"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-color)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: '2px 6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  清除已選 ({draft.size})
                </button>
              )}
            </div>
            <p
              style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                margin: '6px 0 16px',
              }}
            >
              點卡片多選；按完成套用篩選。
            </p>

            <div className="brand-picker-grid">
              {options.map((b) => {
                const checked = draft.has(b);
                const color = getBrandColor(b);
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => toggle(b)}
                    aria-pressed={checked}
                    data-testid={`brand-card-${b}`}
                    className={`brand-card ${checked ? 'is-checked' : ''}`}
                    style={
                      checked
                        ? {
                          borderColor: color,
                          backgroundColor: `${color}10`,
                          boxShadow: `0 0 0 1px ${color}33 inset`,
                        }
                        : undefined
                    }
                  >
                    <span className="brand-card-icon">
                      <BrandIcon brand={b} className="brand-card-svg" />
                    </span>
                    <span className="brand-card-name">{getBrandDisplayName(b)}</span>
                    {checked && (
                      <span
                        className="brand-card-check"
                        style={{ background: color }}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirm}
                data-testid="brand-picker-confirm"
              >
                完成 ({draft.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
