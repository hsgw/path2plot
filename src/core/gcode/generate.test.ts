import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PRUSA_PEN_GCODE_SETTINGS,
  type DrawGroup,
  type GcodeSettings,
} from './types'
import { generateGcode } from './generate'
import { uploadGcodeToMoonraker } from '../../app/downloadFile'

const groups: DrawGroup[] = [
  [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
]

describe('generateGcode', () => {
  it('描画・移動座標には描画可能領域の原点オフセット(bedOriginXMm/YMm)を加算する', () => {
    const settings = {
      ...PRUSA_PEN_GCODE_SETTINGS,
      bedOriginXMm: 44,
      bedOriginYMm: 30,
    }
    const gcode = generateGcode(groups, settings)
    // ローカル(0,0)→(10,0)の移動・描画が、原点オフセット加算後の機械絶対座標で出力される
    expect(gcode).toContain('G00 X44 Y30')
    expect(gcode).toContain('G01 X54 Y30')
  })

  it('パーク位置(FR-30)は原点オフセットの対象外(絶対座標のまま)', () => {
    const settings = {
      ...PRUSA_PEN_GCODE_SETTINGS,
      bedOriginXMm: 44,
      bedOriginYMm: 30,
      parkX: 85,
      parkY: 175,
    }
    const gcode = generateGcode(groups, settings)
    expect(gcode).toContain('X85 Y175')
  })

  it('原点オフセットが0のときはローカル座標のまま出力される', () => {
    const settings = {
      ...PRUSA_PEN_GCODE_SETTINGS,
      bedOriginXMm: 0,
      bedOriginYMm: 0,
    }
    const gcode = generateGcode(groups, settings)
    expect(gcode).toContain('G00 X0 Y0')
    expect(gcode).toContain('G01 X10 Y0')
  })

  it('Y反転を有効にすると移動・描画のYをベッド高さ基準で反転して原点を加算する', () => {
    const settings = {
      ...PRUSA_PEN_GCODE_SETTINGS,
      bedHeightMm: 100,
      bedOriginYMm: 30,
      flipY: true,
    }
    const gcode = generateGcode(groups, settings)
    expect(gcode).toContain('G00 X49 Y130')
    expect(gcode).toContain('G01 X59 Y130')
    expect(gcode).not.toContain('{flipY}')
  })

  it('Y反転が未設定の既存設定では無効として扱う', () => {
    const { flipY: _flipY, ...legacySettings } = PRUSA_PEN_GCODE_SETTINGS
    const gcode = generateGcode(groups, legacySettings as GcodeSettings)
    expect(gcode).toContain('G00 X49 Y35')
    expect(gcode).toContain('G01 X59 Y35')
  })

  it('結合ブロック(FR-14)は1グループ内で1回のペンダウン/アップのみ出力し、連続してG01を出力する', () => {
    const settings = {
      ...PRUSA_PEN_GCODE_SETTINGS,
      bedOriginXMm: 0,
      bedOriginYMm: 0,
    }
    const joined: DrawGroup[] = [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
      ],
    ]
    const gcode = generateGcode(joined, settings)
    const penDownLine = `G00 Z${settings.penDownZ} F${settings.penFeedRate}`
    const penUpLine = `G00 Z${settings.penUpZ} F${settings.penFeedRate}`
    expect(gcode.split(penDownLine).length - 1).toBe(1)
    expect(gcode.split(penUpLine).length - 1).toBe(1)
    expect(gcode).toContain('G01 X10 Y0')
    expect(gcode).toContain('G01 X10 Y5')
  })

  it('複数グループはそれぞれ独立してペンダウン/アップする', () => {
    const settings = {
      ...PRUSA_PEN_GCODE_SETTINGS,
      bedOriginXMm: 0,
      bedOriginYMm: 0,
    }
    const multi: DrawGroup[] = [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      [
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ],
    ]
    const gcode = generateGcode(multi, settings)
    const penDownLine = `G00 Z${settings.penDownZ} F${settings.penFeedRate}`
    expect(gcode.split(penDownLine).length - 1).toBe(2)
  })
})

describe('uploadGcodeToMoonraker', () => {
  const confirm = vi.fn()

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function setWindow() {
    vi.stubGlobal('window', {
      location: { protocol: 'http:', hostname: '192.168.0.31' },
      confirm,
    })
  }

  it('Moonrakerの一覧から同名ファイルを見つけ、上書きを拒否したら送信しない', async () => {
    setWindow()
    confirm.mockReturnValueOnce(false)
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ result: [{ path: 'drawing.gcode' }] })),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      uploadGcodeToMoonraker('G1 X1', 'drawing.gcode'),
    ).resolves.toEqual({ saved: false })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.0.31:7125/server/files/list?root=gcodes',
    )
    expect(confirm).toHaveBeenCalledWith(
      'Moonrakerに「drawing.gcode」が既にあります。上書きしますか？',
    )
  })

  it('一覧を確認後、印刷を開始せずG-codeとgcodesルートを送信する', async () => {
    setWindow()
    confirm.mockReturnValueOnce(true)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: [{ path: 'drawing.gcode' }] })),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      uploadGcodeToMoonraker('G1 X1', 'drawing.gcode'),
    ).resolves.toEqual({ saved: true, printStatus: 'not_requested' })

    const [url, options] = fetchMock.mock.calls[1]
    expect(url).toBe('http://192.168.0.31:7125/server/files/upload')
    expect(options?.method).toBe('POST')
    const body = options?.body as FormData
    expect(body.get('root')).toBe('gcodes')
    expect(body.get('print')).toBe('false')
    expect((body.get('file') as File).name).toBe('drawing.gcode')
    expect(await (body.get('file') as File).text()).toBe('G1 X1')
  })

  it('一覧取得とアップロードの失敗をエラーにする', async () => {
    setWindow()
    const listFailure = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 500 }))
    vi.stubGlobal('fetch', listFailure)
    await expect(
      uploadGcodeToMoonraker('G1 X1', 'drawing.gcode'),
    ).rejects.toThrow('Moonraker応答エラー (500)')

    const uploadFailure = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: [] })))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
    vi.stubGlobal('fetch', uploadFailure)
    await expect(
      uploadGcodeToMoonraker('G1 X1', 'drawing.gcode'),
    ).rejects.toThrow('Moonraker保存エラー (500)')
  })

  it('印刷要求の開始・キュー状態を識別し、開始状態なしはunknownで返す', async () => {
    const printResponse = (payload: unknown) =>
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ result: [] })))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(payload), { status: 201 }),
        )
    for (const [payload, expected] of [
      [{ print_started: true }, 'started'],
      [{ print_queued: true }, 'queued'],
      [{ print_started: false, print_queued: false }, 'not_started'],
      [null, 'unknown'],
    ] as const) {
      const fetchMock = printResponse(payload)
      vi.stubGlobal('fetch', fetchMock)
      await expect(
        uploadGcodeToMoonraker('G1 X1', 'drawing.gcode', {
          baseUrl: 'http://127.0.0.1:7125',
          print: true,
        }),
      ).resolves.toEqual({ saved: true, printStatus: expected })
      const form = fetchMock.mock.calls[1][1]?.body as FormData
      expect(form.get('print')).toBe('true')
    }
  })
})
