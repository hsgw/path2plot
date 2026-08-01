import { useCallback, useEffect, useState } from 'react'

// 参照を使い回し、空のまま更新をかけても再レンダを起こさないようにする
const EMPTY: ReadonlyMap<string, string> = new Map()

export interface InvalidFieldsApi {
  /** 数値入力欄の確定値が正しいか(NumberFieldのonValidityChange)を記録する */
  setValidity: (key: string, label: string, valid: boolean) => void
  /**
   * 現在表示されている欄のキーだけを残し、それ以外の記録を捨てる。
   * NumberFieldは不正値のままアンマウントされてもonValidityChange(true)を呼ばないため、
   * 条件表示で隠れた欄の不正値が残り続けてG-codeダウンロードが解除されなくなるのを防ぐ
   */
  retainOnly: (visibleKeys: Set<string>) => void
}

/**
 * 設定パネル共通の「不正な値のまま残っている入力欄」の集計。
 * 変化のたびにラベル一覧を親へ通知し、画面上部の警告バナー(InvalidInputBanner)へ集約する。
 */
export function useInvalidFields(
  onLabelsChange: (labels: string[]) => void,
): InvalidFieldsApi {
  const [fields, setFields] = useState<ReadonlyMap<string, string>>(EMPTY)

  useEffect(() => {
    onLabelsChange(Array.from(fields.values()))
  }, [fields, onLabelsChange])

  const setValidity = useCallback(
    (key: string, label: string, valid: boolean): void => {
      setFields((prev) => {
        if (valid && !prev.has(key)) return prev
        const next = new Map(prev)
        if (valid) next.delete(key)
        else next.set(key, label)
        return next
      })
    },
    [],
  )

  const retainOnly = useCallback((visibleKeys: Set<string>): void => {
    setFields((prev) => {
      const next = new Map(prev)
      let changed = false
      for (const key of prev.keys()) {
        if (!visibleKeys.has(key)) {
          next.delete(key)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  return { setValidity, retainOnly }
}
