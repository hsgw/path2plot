import { useCallback, useEffect, useRef, useState } from 'react'

const PLAY_INTERVAL_MS = 400

interface UseStepPlaybackArgs {
  /** ステップの総数(ListEntryの件数) */
  totalSteps: number
  /** Worker処理中は総数が確定していないため、ステップ位置の追従を止める */
  isProcessing: boolean
  /** この値が変わったら「新しいファイルの読込」とみなし、確定後に全ステップ描画済みへ戻す */
  revealKey: string | null
}

export interface StepPlayback {
  step: number
  playing: boolean
  setStep: (next: number) => void
  togglePlaying: () => void
}

/**
 * FR-23: ステップ実行プレビュー。ListEntry単位(塗りブロックは1ブロック=1ステップ)で数える。
 * 読込み直後は最終ステップ(全リスト項目描画済み)を初期表示とする。
 *
 * ファイル再読込時、結合ブロック・塗りブロックはWorkerの返信を待って非同期に確定する
 * (ListEntryもそれに伴い遅れて更新される)。そのためrevealKey変化時点では即座に全展開できず、
 * 処理が完了して件数が新ファイルの内容で確定してから全展開する必要がある。
 */
export function useStepPlayback({
  totalSteps,
  isProcessing,
  revealKey,
}: UseStepPlaybackArgs): StepPlayback {
  const [step, setStepState] = useState(0)
  const [playing, setPlaying] = useState(false)
  const pendingFullRevealRef = useRef(false)

  useEffect(() => {
    pendingFullRevealRef.current = true
    setPlaying(false)
  }, [revealKey])

  useEffect(() => {
    if (isProcessing) return
    if (pendingFullRevealRef.current) {
      pendingFullRevealRef.current = false
      setStepState(totalSteps)
      return
    }
    // 設定変更で件数が変わった場合は範囲内にクランプするのみで、ステップ位置自体は極力保持する
    setStepState((s) => Math.min(s, totalSteps))
  }, [isProcessing, totalSteps, revealKey])

  useEffect(() => {
    if (!playing) return
    if (step >= totalSteps) {
      setPlaying(false)
      return
    }
    const timer = setInterval(() => {
      setStepState((s) => {
        if (s + 1 >= totalSteps) {
          setPlaying(false)
          return totalSteps
        }
        return s + 1
      })
    }, PLAY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [playing, step, totalSteps])

  const setStep = useCallback((next: number): void => {
    setPlaying(false)
    setStepState(next)
  }, [])
  const togglePlaying = useCallback((): void => {
    setPlaying((p) => !p)
  }, [])

  return { step, playing, setStep, togglePlaying }
}
