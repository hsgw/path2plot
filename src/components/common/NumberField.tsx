import { useEffect, useRef, useState } from 'react'
import { InfoHint } from './InfoHint'

interface NumberFieldProps {
  label: string
  value: number
  step?: number
  min?: number
  /** 補足説明。指定すると?アイコンを添え、ホバー/クリックで表示する */
  hint?: string
  onCommit: (value: number) => void
  onValidityChange: (valid: boolean) => void
}

function parseValidNumber(raw: string, min?: number): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  if (min !== undefined && n < min) return null
  return n
}

/**
 * 数値入力欄。入力中は自由に編集でき(空文字・マイナス記号のみ等の中間状態も許容し、
 * 1文字ごとに前の値へ戻されることはない)、フォーカスが外れる/Enter確定時にのみ値を確定する。
 * 確定時の値が不正な場合は親には反映せず(draftはそのまま残す)、onValidityChange(false)を通知する。
 */
export function NumberField({
  label,
  value,
  step = 1,
  min,
  hint,
  onCommit,
  onValidityChange,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value))
  const [invalid, setInvalid] = useState(false)
  // 直近に確定した値。外部要因(親側の更新)によるvalue変化とdraftを同期させるために使う
  const committedRef = useRef(value)

  useEffect(() => {
    if (value !== committedRef.current && !invalid) {
      committedRef.current = value
      setDraft(String(value))
    }
  }, [value, invalid])

  const commit = (): void => {
    const parsed = parseValidNumber(draft, min)
    if (parsed === null) {
      setInvalid(true)
      onValidityChange(false)
      return
    }
    setInvalid(false)
    committedRef.current = parsed
    onValidityChange(true)
    onCommit(parsed)
  }

  return (
    <label>
      {hint ? (
        <InfoHint text={hint}>{label}</InfoHint>
      ) : (
        <span className="field-label">{label}</span>
      )}
      <input
        type="number"
        step={step}
        min={min}
        value={draft}
        className={invalid ? 'number-field-invalid' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
    </label>
  )
}
