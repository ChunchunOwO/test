import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ArrowLeft, ChevronRight, Clock3, Factory, Headphones, RefreshCw, Search, SlidersHorizontal, Star, TriangleAlert, X } from 'lucide-react';
import type { EqState } from '../../../shared/types/eq';
import type {
  OpraHeadphoneCorrectionBrowseResult,
  OpraHeadphoneCorrectionPreview,
  OpraHeadphoneCorrectionProductResult,
  OpraHeadphoneCorrectionVendorResult,
} from '../../../shared/types/opra';
import { useOptionalI18n } from '../../i18n/I18nProvider';
import type { Locale } from '../../i18n/locales';
import { getEqBridge } from '../../utils/echoBridge';
import { computeEqResponseGainDbAtFrequency, formatFrequencyLabel } from './eqPanelUtils';
import './headphone-correction.css';

type HeadphoneCorrectionPanelProps = {
  eqState: EqState;
  showTitle?: boolean;
  onApplied?: (state: EqState) => void;
  onAppliedStatusRefresh?: () => Promise<void> | void;
};

type StoredHeadphoneProduct = {
  productId: string;
  productName: string;
  vendorId: string;
  vendorName: string;
  assetUrl: string | null;
};

type HeadphoneCorrectionBrowseView = 'catalog' | 'favorites' | 'recent';

type HeadphoneCorrectionTextKey =
  | 'action.processing'
  | 'action.applyShort'
  | 'action.disable'
  | 'aria.favorites'
  | 'aria.panel'
  | 'aria.preview'
  | 'aria.products'
  | 'aria.recent'
  | 'aria.search'
  | 'aria.vendors'
  | 'control.detail.empty'
  | 'control.master'
  | 'control.status.disabled'
  | 'control.status.enabled'
  | 'control.status.noPreset'
  | 'control.toggle.enable'
  | 'control.toggle.on'
  | 'curve.aria'
  | 'empty.detail'
  | 'empty.favorites'
  | 'empty.recent'
  | 'empty.title'
  | 'favorite.add'
  | 'favorite.remove'
  | 'intro.detail'
  | 'intro.kicker'
  | 'label.allHeadphones'
  | 'label.availableCurves'
  | 'label.bitPerfectWarning'
  | 'label.correctionSource'
  | 'label.curveResponse'
  | 'label.manufacturer'
  | 'label.model'
  | 'label.results'
  | 'message.applied'
  | 'message.cacheEmpty'
  | 'message.chooseBeforeEnable'
  | 'message.disabled'
  | 'message.enabled'
  | 'message.favoriteAdded'
  | 'message.favoriteRemoved'
  | 'message.noMatches'
  | 'message.selectResult'
  | 'message.unavailable'
  | 'metric.adjusted'
  | 'metric.filters'
  | 'metric.preamp'
  | 'preset.filterCount'
  | 'preset.panel.empty'
  | 'product.presetCount.many'
  | 'product.presetCount.one'
  | 'search.clear'
  | 'search.placeholder'
  | 'search.refresh'
  | 'search.submit'
  | 'shortcut.favorites'
  | 'shortcut.recent'
  | 'status.eqCount'
  | 'status.productCount'
  | 'status.source.cache'
  | 'status.source.empty'
  | 'status.source.network'
  | 'status.vendorCount'
  | 'title'
  | 'vendors.all'
  | 'vendor.stats';

type HeadphoneCorrectionTranslateOptions = Record<string, string | number>;

const headphoneCorrectionTextZhCN: Record<HeadphoneCorrectionTextKey, string> = {
  'action.processing': '处理中…',
  'action.applyShort': '应用',
  'action.disable': '关闭',
  'aria.favorites': '收藏型号',
  'aria.panel': '耳机校正',
  'aria.preview': '耳机校正预览',
  'aria.products': '耳机型号',
  'aria.recent': '最近使用',
  'aria.search': '按型号或生产商搜索',
  'aria.vendors': '所有生产商',
  'control.detail.empty': '选择一个型号和预设后启用',
  'control.master': '耳机校正总开关',
  'control.status.disabled': '已关闭',
  'control.status.enabled': '已启用',
  'control.status.noPreset': '未选择预设',
  'control.toggle.enable': '开启',
  'control.toggle.on': '已开启',
  'curve.aria': 'OPRA EQ 曲线预览',
  'empty.detail': '按生产商或型号浏览，找到合适的校正预设。',
  'empty.favorites': '还没有收藏型号。',
  'empty.recent': '应用校正后，最近使用的型号会显示在这里。',
  'empty.title': '未选择预设',
  'favorite.add': '收藏型号',
  'favorite.remove': '取消收藏型号',
  'intro.detail': 'OPRA 是开放、社区维护的耳机型号与 EQ 补偿曲线目录。先按生产商浏览，也可以直接搜索型号。',
  'intro.kicker': 'OPRA by Roon',
  'label.allHeadphones': '全部耳机',
  'label.availableCurves': '可用曲线',
  'label.bitPerfectWarning': '开启后将使用 EQ，Bit-perfect 会暂停',
  'label.correctionSource': '校正来源',
  'label.curveResponse': 'EQ 频率响应',
  'label.manufacturer': '制造商',
  'label.model': '型号',
  'label.results': '搜索结果',
  'message.applied': '已应用 {vendor} {product}',
  'message.cacheEmpty': 'OPRA 数据库还没有缓存，点刷新库获取品牌和型号。',
  'message.chooseBeforeEnable': '先选择一个生产商、型号和预设。',
  'message.disabled': '耳机校正已关闭。',
  'message.enabled': '耳机校正已启用。',
  'message.favoriteAdded': '已收藏 {product}',
  'message.favoriteRemoved': '已取消收藏 {product}',
  'message.noMatches': '没有找到匹配的耳机型号。',
  'message.selectResult': '从左侧选择耳机型号，查看并应用校正曲线。',
  'message.unavailable': '耳机校正数据库暂不可用。',
  'metric.adjusted': '调整',
  'metric.filters': 'OPRA 滤波器',
  'metric.preamp': '前级',
  'preset.filterCount': '{count} 个 OPRA 滤波器',
  'preset.panel.empty': '选择生产商和型号后会显示可用预设。',
  'product.presetCount.many': '{count} 个预设',
  'product.presetCount.one': '{count} 个预设',
  'search.clear': '清除搜索',
  'search.placeholder': '搜索品牌或型号，例如 HD 650',
  'search.refresh': '刷新库',
  'search.submit': '搜索',
  'shortcut.favorites': '收藏型号',
  'shortcut.recent': '最近使用',
  'status.eqCount': '{count} 条曲线',
  'status.productCount': '{count} 款耳机',
  'status.source.cache': '本地缓存',
  'status.source.empty': '未缓存',
  'status.source.network': '刚刚更新',
  'status.vendorCount': '{count} 个品牌',
  'title': '耳机校正',
  'vendors.all': '所有生产商',
  'vendor.stats': '{productCount} 款 / {eqCount} 个预设',
};

const headphoneCorrectionTextEnUS: Record<HeadphoneCorrectionTextKey, string> = {
  'action.processing': 'Working…',
  'action.applyShort': 'Apply',
  'action.disable': 'Disable',
  'aria.favorites': 'Favorite models',
  'aria.panel': 'Headphone correction',
  'aria.preview': 'Headphone correction preview',
  'aria.products': 'Headphone models',
  'aria.recent': 'Recently used',
  'aria.search': 'Search by model or manufacturer',
  'aria.vendors': 'All manufacturers',
  'control.detail.empty': 'Choose a model and preset before enabling',
  'control.master': 'Headphone correction master switch',
  'control.status.disabled': 'Disabled',
  'control.status.enabled': 'Enabled',
  'control.status.noPreset': 'No preset selected',
  'control.toggle.enable': 'Enable',
  'control.toggle.on': 'Enabled',
  'curve.aria': 'OPRA EQ curve preview',
  'empty.detail': 'Browse by manufacturer or model to find a matching correction preset.',
  'empty.favorites': 'No favorite models yet.',
  'empty.recent': 'Recently applied models will appear here.',
  'empty.title': 'No preset selected',
  'favorite.add': 'Favorite model',
  'favorite.remove': 'Remove favorite model',
  'intro.detail': 'OPRA is an open, community-maintained catalog of headphone models and EQ compensation curves. Browse by manufacturer first, or search for a model directly.',
  'intro.kicker': 'OPRA by Roon',
  'label.allHeadphones': 'All headphones',
  'label.availableCurves': 'Available curves',
  'label.bitPerfectWarning': 'Enabling this uses EQ and pauses Bit-perfect',
  'label.correctionSource': 'Correction source',
  'label.curveResponse': 'EQ frequency response',
  'label.manufacturer': 'Manufacturer',
  'label.model': 'Model',
  'label.results': 'Search results',
  'message.applied': 'Applied {vendor} {product}',
  'message.cacheEmpty': 'The OPRA database is not cached yet. Refresh the library to fetch brands and models.',
  'message.chooseBeforeEnable': 'Choose a manufacturer, model, and preset first.',
  'message.disabled': 'Headphone correction is disabled.',
  'message.enabled': 'Headphone correction is enabled.',
  'message.favoriteAdded': 'Favorited {product}',
  'message.favoriteRemoved': 'Removed {product} from favorites',
  'message.noMatches': 'No matching headphone models found.',
  'message.selectResult': 'Choose a headphone model on the left to preview and apply its correction curve.',
  'message.unavailable': 'Headphone correction database is unavailable.',
  'metric.adjusted': 'Adjusted',
  'metric.filters': 'OPRA filters',
  'metric.preamp': 'Preamp',
  'preset.filterCount': '{count} OPRA filters',
  'preset.panel.empty': 'Choose a manufacturer and model to show available presets.',
  'product.presetCount.many': '{count} presets',
  'product.presetCount.one': '{count} preset',
  'search.clear': 'Clear search',
  'search.placeholder': 'Search brand or model, for example HD 650',
  'search.refresh': 'Refresh library',
  'search.submit': 'Search',
  'shortcut.favorites': 'Favorite models',
  'shortcut.recent': 'Recently used',
  'status.eqCount': '{count} curves',
  'status.productCount': '{count} headphones',
  'status.source.cache': 'Local cache',
  'status.source.empty': 'Not cached',
  'status.source.network': 'Updated now',
  'status.vendorCount': '{count} brands',
  'title': 'Headphone correction',
  'vendors.all': 'All manufacturers',
  'vendor.stats': '{productCount} models / {eqCount} presets',
};

const headphoneCorrectionTextJaJP: Record<HeadphoneCorrectionTextKey, string> = {
  'action.processing': '処理中…',
  'action.applyShort': '適用',
  'action.disable': '無効にする',
  'aria.favorites': 'お気に入りのモデル',
  'aria.panel': 'ヘッドホン補正',
  'aria.preview': 'ヘッドホン補正プレビュー',
  'aria.products': 'ヘッドホンモデル',
  'aria.recent': '最近使ったモデル',
  'aria.search': 'モデル名またはメーカーで検索',
  'aria.vendors': 'すべてのメーカー',
  'control.detail.empty': '有効にする前にモデルとプリセットを選択してください',
  'control.master': 'ヘッドホン補正メインスイッチ',
  'control.status.disabled': '無効',
  'control.status.enabled': '有効',
  'control.status.noPreset': 'プリセット未選択',
  'control.toggle.enable': '有効にする',
  'control.toggle.on': '有効',
  'curve.aria': 'OPRA EQ カーブプレビュー',
  'empty.detail': 'メーカーまたはモデルから、対応する補正プリセットを探してください。',
  'empty.favorites': 'お気に入りのモデルはまだありません。',
  'empty.recent': '適用したモデルが最近使用した項目に表示されます。',
  'empty.title': 'プリセット未選択',
  'favorite.add': 'モデルをお気に入りに追加',
  'favorite.remove': 'モデルをお気に入りから削除',
  'intro.detail': 'OPRA は、ヘッドホンモデルと EQ 補正カーブを提供するオープンなコミュニティカタログです。まずメーカーから探すか、モデル名を直接検索できます。',
  'intro.kicker': 'OPRA by Roon',
  'label.allHeadphones': 'すべてのヘッドホン',
  'label.availableCurves': '利用可能なカーブ',
  'label.bitPerfectWarning': '有効にすると EQ を使用し、Bit-perfect は一時停止します',
  'label.correctionSource': '補正ソース',
  'label.curveResponse': 'EQ 周波数特性',
  'label.manufacturer': 'メーカー',
  'label.model': 'モデル',
  'label.results': '検索結果',
  'message.applied': '{vendor} {product} を適用しました',
  'message.cacheEmpty': 'OPRA データベースはまだキャッシュされていません。ライブラリを更新してメーカーとモデルを取得してください。',
  'message.chooseBeforeEnable': 'まずメーカー、モデル、プリセットを選択してください。',
  'message.disabled': 'ヘッドホン補正は無効です。',
  'message.enabled': 'ヘッドホン補正は有効です。',
  'message.favoriteAdded': '{product} をお気に入りに追加しました',
  'message.favoriteRemoved': '{product} をお気に入りから削除しました',
  'message.noMatches': '一致するヘッドホンモデルが見つかりません。',
  'message.selectResult': '左側でヘッドホンを選び、補正カーブを確認して適用してください。',
  'message.unavailable': 'ヘッドホン補正データベースを利用できません。',
  'metric.adjusted': '補正後',
  'metric.filters': 'OPRA フィルター',
  'metric.preamp': 'プリアンプ',
  'preset.filterCount': 'OPRA フィルター {count} 個',
  'preset.panel.empty': 'メーカーとモデルを選択すると、利用可能なプリセットが表示されます。',
  'product.presetCount.many': 'プリセット {count} 個',
  'product.presetCount.one': 'プリセット 1 個',
  'search.clear': '検索をクリア',
  'search.placeholder': 'ブランドまたはモデルを検索（例：HD 650）',
  'search.refresh': 'ライブラリを更新',
  'search.submit': '検索',
  'shortcut.favorites': 'お気に入りのモデル',
  'shortcut.recent': '最近使ったモデル',
  'status.eqCount': 'カーブ {count} 本',
  'status.productCount': 'ヘッドホン {count} 台',
  'status.source.cache': 'ローカルキャッシュ',
  'status.source.empty': '未キャッシュ',
  'status.source.network': '今すぐ更新',
  'status.vendorCount': 'ブランド {count} 件',
  title: 'ヘッドホン補正',
  'vendors.all': 'すべてのメーカー',
  'vendor.stats': '{productCount} モデル / {eqCount} プリセット',
};

const headphoneCorrectionTextKoKR: Record<HeadphoneCorrectionTextKey, string> = {
  'action.processing': '처리 중…',
  'action.applyShort': '적용',
  'action.disable': '끄기',
  'aria.favorites': '즐겨찾는 모델',
  'aria.panel': '헤드폰 보정',
  'aria.preview': '헤드폰 보정 미리보기',
  'aria.products': '헤드폰 모델',
  'aria.recent': '최근 사용',
  'aria.search': '모델 또는 제조사 검색',
  'aria.vendors': '모든 제조사',
  'control.detail.empty': '사용하기 전에 모델과 프리셋을 선택하세요',
  'control.master': '헤드폰 보정 전체 스위치',
  'control.status.disabled': '사용 안 함',
  'control.status.enabled': '사용 중',
  'control.status.noPreset': '프리셋 미선택',
  'control.toggle.enable': '사용',
  'control.toggle.on': '사용 중',
  'curve.aria': 'OPRA EQ 곡선 미리보기',
  'empty.detail': '제조사 또는 모델로 찾아 맞는 보정 프리셋을 선택하세요.',
  'empty.favorites': '즐겨찾는 모델이 아직 없습니다.',
  'empty.recent': '최근 적용한 모델이 여기에 표시됩니다.',
  'empty.title': '프리셋 미선택',
  'favorite.add': '모델 즐겨찾기',
  'favorite.remove': '즐겨찾기 해제',
  'intro.detail': 'OPRA는 커뮤니티가 유지하는 개방형 헤드폰 모델 및 EQ 보정 곡선 카탈로그입니다. 제조사별로 둘러보거나 모델을 바로 검색하세요.',
  'intro.kicker': 'OPRA by Roon',
  'label.allHeadphones': '모든 헤드폰',
  'label.availableCurves': '사용 가능한 곡선',
  'label.bitPerfectWarning': '활성화하면 EQ를 사용하며 Bit-perfect가 일시 중지됩니다',
  'label.correctionSource': '보정 소스',
  'label.curveResponse': 'EQ 주파수 응답',
  'label.manufacturer': '제조사',
  'label.model': '모델',
  'label.results': '검색 결과',
  'message.applied': '{vendor} {product} 적용됨',
  'message.cacheEmpty': 'OPRA 데이터베이스가 아직 캐시되지 않았습니다. 라이브러리를 새로고침해 브랜드와 모델을 가져오세요.',
  'message.chooseBeforeEnable': '먼저 제조사, 모델, 프리셋을 선택하세요.',
  'message.disabled': '헤드폰 보정이 꺼져 있습니다.',
  'message.enabled': '헤드폰 보정이 켜져 있습니다.',
  'message.favoriteAdded': '{product} 즐겨찾기에 추가됨',
  'message.favoriteRemoved': '{product} 즐겨찾기에서 제거됨',
  'message.noMatches': '일치하는 헤드폰 모델을 찾지 못했습니다.',
  'message.selectResult': '왼쪽에서 헤드폰을 선택해 보정 곡선을 확인하고 적용하세요.',
  'message.unavailable': '헤드폰 보정 데이터베이스를 사용할 수 없습니다.',
  'metric.adjusted': '조정',
  'metric.filters': 'OPRA 필터',
  'metric.preamp': '프리앰프',
  'preset.filterCount': 'OPRA 필터 {count}개',
  'preset.panel.empty': '제조사와 모델을 선택하면 사용 가능한 프리셋이 표시됩니다.',
  'product.presetCount.many': '프리셋 {count}개',
  'product.presetCount.one': '프리셋 {count}개',
  'search.clear': '검색 지우기',
  'search.placeholder': '브랜드 또는 모델 검색, 예: HD 650',
  'search.refresh': '라이브러리 새로고침',
  'search.submit': '검색',
  'shortcut.favorites': '즐겨찾는 모델',
  'shortcut.recent': '최근 사용',
  'status.eqCount': '곡선 {count}개',
  'status.productCount': '헤드폰 {count}개',
  'status.source.cache': '로컬 캐시',
  'status.source.empty': '캐시 없음',
  'status.source.network': '방금 업데이트',
  'status.vendorCount': '브랜드 {count}개',
  title: '헤드폰 보정',
  'vendors.all': '모든 제조사',
  'vendor.stats': '모델 {productCount}개 / 프리셋 {eqCount}개',
};

const headphoneCorrectionTexts: Record<Locale, Record<HeadphoneCorrectionTextKey, string>> = {
  'zh-CN': headphoneCorrectionTextZhCN,
  'zh-TW': headphoneCorrectionTextZhCN,
  'ja-JP': headphoneCorrectionTextJaJP,
  'en-US': headphoneCorrectionTextEnUS,
  'ko-KR': headphoneCorrectionTextKoKR,
};

const interpolateText = (text: string, options?: HeadphoneCorrectionTranslateOptions): string => {
  if (!options) {
    return text;
  }

  return Object.entries(options).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    text,
  );
};

const formatDb = (value: number): string => `${value > 0 ? '+' : ''}${Math.round(value * 10) / 10} dB`;


const frequencyToX = (frequencyHz: number): number => {
  const min = Math.log10(20);
  const max = Math.log10(20000);
  return ((Math.log10(Math.max(20, Math.min(20000, frequencyHz))) - min) / (max - min)) * 100;
};

const gainToY = (gainDb: number): number => 50 - (Math.max(-18, Math.min(18, gainDb)) / 36) * 100;

const opraCurveFrequencyTicksHz = [20, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const opraCurveGainTicksDb = [-12, -6, 0, 6, 12];

const createPreviewPath = (preview: OpraHeadphoneCorrectionPreview | null): string => {
  if (!preview) {
    return '';
  }

  const points = Array.from({ length: 96 }, (_, index) => {
    const t = index / 95;
    const frequency = 20 * (20000 / 20) ** t;
    return `${frequencyToX(frequency).toFixed(2)},${gainToY(computeEqResponseGainDbAtFrequency(preview.preset.bands, frequency)).toFixed(2)}`;
  });

  return `M ${points.join(' L ')}`;
};

const opraFavoriteProductsStorageKey = 'echo.opra.favoriteProducts';
const opraRecentProductsStorageKey = 'echo.opra.recentProducts';
const maxStoredProducts = 8;

const readStoredProducts = (key: string): StoredHeadphoneProduct[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((value): StoredHeadphoneProduct | null => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return null;
        }

        const input = value as Partial<StoredHeadphoneProduct>;
        if (!input.productId || !input.productName || !input.vendorId || !input.vendorName) {
          return null;
        }

        return {
          productId: String(input.productId),
          productName: String(input.productName),
          vendorId: String(input.vendorId),
          vendorName: String(input.vendorName),
          assetUrl: typeof input.assetUrl === 'string' ? input.assetUrl : null,
        };
      })
      .filter((value): value is StoredHeadphoneProduct => Boolean(value))
      .slice(0, maxStoredProducts);
  } catch {
    return [];
  }
};

const writeStoredProducts = (key: string, products: StoredHeadphoneProduct[]): void => {
  try {
    window.localStorage.setItem(key, JSON.stringify(products.slice(0, maxStoredProducts)));
  } catch {
    // OPRA history/favorites are UI conveniences; failing to persist should not block correction.
  }
};

const productToStoredProduct = (product: OpraHeadphoneCorrectionProductResult): StoredHeadphoneProduct => ({
  productId: product.productId,
  productName: product.productName,
  vendorId: product.vendorId,
  vendorName: product.vendorName,
  assetUrl: product.assetUrl,
});

const previewToStoredProduct = (preview: OpraHeadphoneCorrectionPreview): StoredHeadphoneProduct => ({
  productId: preview.productId,
  productName: preview.productName,
  vendorId: preview.vendorId,
  vendorName: preview.vendorName,
  assetUrl: null,
});

export const HeadphoneCorrectionPanel = ({ eqState, showTitle = true, onApplied, onAppliedStatusRefresh }: HeadphoneCorrectionPanelProps): JSX.Element => {
  const i18n = useOptionalI18n();
  const localText = headphoneCorrectionTexts[i18n?.locale ?? 'zh-CN'] ?? headphoneCorrectionTextZhCN;
  const t = useCallback((key: HeadphoneCorrectionTextKey, options?: HeadphoneCorrectionTranslateOptions): string => {
    return interpolateText(localText[key], options);
  }, [localText]);
  const [query, setQuery] = useState('');
  const [browse, setBrowse] = useState<OpraHeadphoneCorrectionBrowseResult | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedEqId, setSelectedEqId] = useState('');
  const [busy, setBusy] = useState<'browse' | 'refresh' | 'apply' | 'toggle' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [favoriteProducts, setFavoriteProducts] = useState<StoredHeadphoneProduct[]>(() => readStoredProducts(opraFavoriteProductsStorageKey));
  const [recentProducts, setRecentProducts] = useState<StoredHeadphoneProduct[]>(() => readStoredProducts(opraRecentProductsStorageKey));
  const [browseView, setBrowseView] = useState<HeadphoneCorrectionBrowseView>('catalog');
  const discoveryRef = useRef<HTMLDivElement>(null);
  const detailScrollRef = useRef<HTMLDivElement>(null);

  const selectedProduct = useMemo<OpraHeadphoneCorrectionProductResult | null>(() => {
    if (!browse) {
      return null;
    }

    return browse.products.find((product) => product.productId === selectedProductId)
      ?? browse.selectedProduct
      ?? null;
  }, [browse, selectedProductId]);
  const selectedVendor = useMemo<OpraHeadphoneCorrectionVendorResult | null>(() => {
    if (!browse || !selectedVendorId) {
      return null;
    }

    return browse.vendors.find((vendor) => vendor.vendorId === selectedVendorId) ?? null;
  }, [browse, selectedVendorId]);
  const selectedPreview = selectedProduct?.eqs.find((preview) => preview.eqId === selectedEqId) ?? selectedProduct?.eqs[0] ?? null;
  const previewPath = createPreviewPath(selectedPreview);
  const selectedPreviewActiveFilterCount = selectedPreview?.preset.bands.filter((band) => band.enabled !== false).length ?? 0;
  const status = browse?.status;
  const selectedProductFavorited = Boolean(selectedProduct && favoriteProducts.some((product) => product.productId === selectedProduct.productId));
  const hasAppliedHeadphoneCorrection = eqState.presetName.startsWith('耳机校正 -');
  const headphoneCorrectionEnabled = hasAppliedHeadphoneCorrection && eqState.enabled;
  const selectedPreviewIsApplied = Boolean(selectedPreview && eqState.presetName === selectedPreview.preset.name);
  const controlDetail = hasAppliedHeadphoneCorrection
    ? eqState.presetName.replace(/^耳机校正 -\s*/u, '')
    : selectedPreview
      ? `${selectedPreview.vendorName} / ${selectedPreview.productName} / ${selectedPreview.author}`
      : t('control.detail.empty');

  const loadBrowse = useCallback(async (next: {
    vendorId?: string | null;
    productId?: string | null;
    query?: string;
    refresh?: boolean;
    stayInCollection?: boolean;
  } = {}): Promise<void> => {
    const eq = getEqBridge();
    if (!eq?.browseHeadphoneCorrections) {
      setMessage(t('message.unavailable'));
      return;
    }

    const nextVendorId = next.vendorId !== undefined ? next.vendorId : selectedVendorId;
    const nextProductId = next.productId !== undefined ? next.productId : selectedProductId;
    const nextQuery = next.query !== undefined ? next.query : query;
    setBusy(next.refresh ? 'refresh' : 'browse');
    setMessage(null);
    try {
      const result = await eq.browseHeadphoneCorrections({
        vendorId: nextVendorId,
        productId: nextProductId,
        query: nextQuery.trim(),
        limit: 90,
        refresh: next.refresh === true,
      });
      setBrowse(result);
      setSelectedVendorId(next.stayInCollection ? null : result.vendorId);
      const nextSelectedProduct = result.selectedProduct ?? null;
      setSelectedProductId(nextSelectedProduct?.productId ?? null);
      setSelectedEqId(nextSelectedProduct?.eqs[0]?.eqId ?? '');
      if (result.status.source === 'empty') {
        setMessage(t('message.cacheEmpty'));
      } else if (result.products.length === 0 && (nextVendorId || nextQuery.trim())) {
        setMessage(t('message.noMatches'));
      }
    } catch (browseError) {
      setMessage(browseError instanceof Error ? browseError.message : String(browseError));
    } finally {
      setBusy(null);
    }
  }, [query, selectedProductId, selectedVendorId, t]);

  useEffect(() => {
    void loadBrowse();
    // Initial OPRA catalog load is intentionally one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (query.trim() === (browse?.query ?? '')) {
      return undefined;
    }

    const searchTimer = window.setTimeout(() => {
      void loadBrowse({ vendorId: null, productId: null, query });
    }, 280);

    return () => window.clearTimeout(searchTimer);
  }, [browse?.query, loadBrowse, query]);

  useEffect(() => {
    if (detailScrollRef.current) {
      detailScrollRef.current.scrollTop = 0;
    }
  }, [selectedProductId]);

  const chooseProduct = (product: OpraHeadphoneCorrectionProductResult): void => {
    setSelectedProductId(product.productId);
    setSelectedEqId(product.eqs[0]?.eqId ?? '');
  };

  const chooseVendor = (vendor: OpraHeadphoneCorrectionVendorResult): void => {
    setBrowseView('catalog');
    setQuery('');
    setSelectedVendorId(vendor.vendorId);
    setSelectedProductId(null);
    setSelectedEqId('');
    void loadBrowse({ vendorId: vendor.vendorId, productId: null, query: '' });
  };

  const showAllVendors = (): void => {
    setBrowseView('catalog');
    setQuery('');
    setSelectedVendorId(null);
    setSelectedProductId(null);
    setSelectedEqId('');
    void loadBrowse({ vendorId: null, productId: null, query: '' });
  };

  const switchBrowseView = (nextView: HeadphoneCorrectionBrowseView): void => {
    setBrowseView(nextView);
    setQuery('');
    setSelectedVendorId(null);
    if (nextView === 'catalog') {
      setSelectedProductId(null);
      setSelectedEqId('');
      void loadBrowse({ vendorId: null, productId: null, query: '' });
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape' && (query || selectedVendorId)) {
      event.preventDefault();
      showAllVendors();
      return;
    }

    if (event.key === 'ArrowDown') {
      const firstResult = discoveryRef.current?.querySelector<HTMLButtonElement>('.hc-vendor-card, .hc-result-row, .hc-collection-row');
      if (firstResult) {
        event.preventDefault();
        firstResult.focus();
      }
    }
  };

  const openStoredProduct = (product: StoredHeadphoneProduct): void => {
    setQuery('');
    setSelectedProductId(product.productId);
    setSelectedEqId('');
    void loadBrowse({
      vendorId: product.vendorId,
      productId: product.productId,
      query: '',
      stayInCollection: browseView !== 'catalog',
    });
  };

  const rememberRecentProduct = useCallback((product: StoredHeadphoneProduct): void => {
    setRecentProducts((current) => {
      const next = [product, ...current.filter((item) => item.productId !== product.productId)].slice(0, maxStoredProducts);
      writeStoredProducts(opraRecentProductsStorageKey, next);
      return next;
    });
  }, []);

  const toggleFavoriteProduct = (): void => {
    if (!selectedProduct) {
      return;
    }

    const stored = productToStoredProduct(selectedProduct);
    const willFavorite = !selectedProductFavorited;
    setFavoriteProducts((current) => {
      const exists = current.some((product) => product.productId === stored.productId);
      const next = exists
        ? current.filter((product) => product.productId !== stored.productId)
        : [stored, ...current].slice(0, maxStoredProducts);
      writeStoredProducts(opraFavoriteProductsStorageKey, next);
      return next;
    });
    setMessage(t(willFavorite ? 'message.favoriteAdded' : 'message.favoriteRemoved', { product: selectedProduct.productName }));
  };

  const applyCorrection = useCallback(async (preview: OpraHeadphoneCorrectionPreview | null): Promise<void> => {
    if (!preview) {
      return;
    }

    const eq = getEqBridge();
    if (!eq?.applyHeadphoneCorrection) {
      setMessage(t('message.unavailable'));
      return;
    }

    setBusy('apply');
    setMessage(null);
    try {
      const result = await eq.applyHeadphoneCorrection({ eqId: preview.eqId, enableEq: true });
      onApplied?.(result.state);
      await onAppliedStatusRefresh?.();
      rememberRecentProduct(previewToStoredProduct(result.preview));
      setMessage(t('message.applied', { vendor: result.preview.vendorName, product: result.preview.productName }));
    } catch (applyError) {
      setMessage(applyError instanceof Error ? applyError.message : String(applyError));
    } finally {
      setBusy(null);
    }
  }, [onApplied, onAppliedStatusRefresh, rememberRecentProduct, t]);

  const toggleHeadphoneCorrection = useCallback(async (): Promise<void> => {
    const eq = getEqBridge();
    if (!eq) {
      setMessage(t('message.unavailable'));
      return;
    }

    if (hasAppliedHeadphoneCorrection && eq.setEnabled) {
      setBusy('toggle');
      setMessage(null);
      try {
        const nextState = await eq.setEnabled(!eqState.enabled);
        onApplied?.(nextState);
        await onAppliedStatusRefresh?.();
        setMessage(nextState.enabled ? t('message.enabled') : t('message.disabled'));
      } catch (toggleError) {
        setMessage(toggleError instanceof Error ? toggleError.message : String(toggleError));
      } finally {
        setBusy(null);
      }
      return;
    }

    if (selectedPreview) {
      await applyCorrection(selectedPreview);
      return;
    }

    setMessage(t('message.chooseBeforeEnable'));
  }, [applyCorrection, eqState.enabled, hasAppliedHeadphoneCorrection, onApplied, onAppliedStatusRefresh, selectedPreview, t]);

  return (
    <section
      className="hc-workbench"
      aria-label={t('aria.panel')}
      data-busy={busy !== null}
      data-has-selection={Boolean(selectedProduct)}
    >
      {showTitle ? (
        <header className="hc-standalone-heading">
          <span>{t('intro.kicker')}</span>
          <strong>{t('title')}</strong>
          <p>{t('intro.detail')}</p>
        </header>
      ) : null}

      <div className="hc-topline">
        <div className="hc-master-control">
          <span>
            <strong>{t('title')}</strong>
            <small>{controlDetail}</small>
          </span>
          <label data-active={headphoneCorrectionEnabled} data-disabled={!hasAppliedHeadphoneCorrection && !selectedPreview}>
            <input
              type="checkbox"
              aria-label={t('control.master')}
              checked={headphoneCorrectionEnabled}
              disabled={busy !== null || (!hasAppliedHeadphoneCorrection && !selectedPreview)}
              onChange={() => void toggleHeadphoneCorrection()}
            />
            <span aria-hidden="true" />
            <strong>
              {busy === 'apply' || busy === 'toggle'
                ? t('action.processing')
                : headphoneCorrectionEnabled ? t('control.toggle.on') : t('control.toggle.enable')}
            </strong>
          </label>
        </div>
        {message && (browse?.products.length ?? 0) > 0 ? (
          <p className="hc-feedback" role="status" aria-live="polite">{message}</p>
        ) : null}
        <div className="hc-safety-note">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>{t('label.bitPerfectWarning')}</span>
        </div>
      </div>

      <div className="hc-layout">
        <div className="hc-discovery" ref={discoveryRef}>
          <form
            className="hc-search"
            onSubmit={(event) => {
              event.preventDefault();
              setBrowseView('catalog');
              void loadBrowse({ vendorId: null, productId: null, query });
            }}
          >
            <Search size={19} aria-hidden="true" />
            <input
              aria-label={t('aria.search')}
              aria-controls="headphone-correction-results"
              placeholder={t('search.placeholder')}
              value={query}
              onChange={(event) => {
                setBrowseView('catalog');
                setQuery(event.currentTarget.value);
              }}
              onKeyDown={handleSearchKeyDown}
            />
            {query ? (
              <button className="hc-icon-button" type="button" aria-label={t('search.clear')} onClick={showAllVendors}>
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
            <button
              className="hc-icon-button"
              type="button"
              aria-label={t('search.refresh')}
              title={t('search.refresh')}
              disabled={busy !== null}
              onClick={() => {
                setBrowseView('catalog');
                void loadBrowse({ vendorId: null, productId: null, query, refresh: true });
              }}
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </form>

          <div className="hc-library-tabs" role="tablist" aria-label={t('aria.panel')}>
            <button
              type="button"
              role="tab"
              aria-selected={browseView === 'catalog'}
              aria-controls="headphone-correction-results"
              onClick={() => switchBrowseView('catalog')}
            >
              <Factory size={14} aria-hidden="true" />
              <span>{t('vendors.all')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={browseView === 'favorites'}
              aria-controls="headphone-correction-results"
              onClick={() => switchBrowseView('favorites')}
            >
              <Star size={14} aria-hidden="true" />
              <span>{t('shortcut.favorites')}</span>
              {favoriteProducts.length > 0 ? <small>{favoriteProducts.length}</small> : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={browseView === 'recent'}
              aria-controls="headphone-correction-results"
              onClick={() => switchBrowseView('recent')}
            >
              <Clock3 size={14} aria-hidden="true" />
              <span>{t('shortcut.recent')}</span>
              {recentProducts.length > 0 ? <small>{recentProducts.length}</small> : null}
            </button>
          </div>

          {!query.trim() && !selectedVendorId && browseView !== 'catalog' ? (
            <section
              className="hc-results hc-collection-page"
              id="headphone-correction-results"
              role="tabpanel"
              aria-label={browseView === 'favorites' ? t('aria.favorites') : t('aria.recent')}
            >
              <header className="hc-results-heading">
                <span className="hc-results-title hc-collection-title">
                  {browseView === 'favorites' ? <Star size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}
                  <strong>{browseView === 'favorites' ? t('shortcut.favorites') : t('shortcut.recent')}</strong>
                </span>
                <span>{browseView === 'favorites' ? favoriteProducts.length : recentProducts.length}</span>
              </header>
              <div className="hc-collection-list">
                {(browseView === 'favorites' ? favoriteProducts : recentProducts).map((product) => (
                  <button
                    className="hc-collection-row"
                    type="button"
                    key={product.productId}
                    data-active={selectedProduct?.productId === product.productId}
                    aria-pressed={selectedProduct?.productId === product.productId}
                    onClick={() => openStoredProduct(product)}
                  >
                    <span className="hc-product-art" aria-hidden="true">
                      {product.assetUrl ? <img src={product.assetUrl} alt="" loading="lazy" /> : <Headphones size={21} />}
                    </span>
                    <span>
                      <strong>{product.productName}</strong>
                      <small>{product.vendorName}</small>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                ))}
                {(browseView === 'favorites' ? favoriteProducts : recentProducts).length === 0 ? (
                  <div className="hc-no-results">
                    {browseView === 'favorites' ? <Star size={22} aria-hidden="true" /> : <Clock3 size={22} aria-hidden="true" />}
                    <span>{browseView === 'favorites' ? t('empty.favorites') : t('empty.recent')}</span>
                  </div>
                ) : null}
              </div>
            </section>
          ) : !query.trim() && !selectedVendorId ? (
            <section
              className="hc-results hc-vendors"
              id="headphone-correction-results"
              aria-label={t('aria.vendors')}
              aria-busy={busy === 'browse' || busy === 'refresh'}
            >
              <header className="hc-results-heading">
                <span className="hc-results-title">
                  <strong>{t('vendors.all')}</strong>
                  {status ? <small>{t('status.productCount', { count: status.productCount })} · {t('status.eqCount', { count: status.eqCount })}</small> : null}
                </span>
                <span>{browse?.vendors.length ?? 0}</span>
              </header>
              <div className="hc-vendor-grid">
                {(browse?.vendors ?? []).map((vendor) => (
                  <button
                    className="hc-vendor-card"
                    type="button"
                    key={vendor.vendorId}
                    onClick={() => chooseVendor(vendor)}
                  >
                    <span className="hc-vendor-logo" aria-hidden="true">
                      {vendor.logoUrl ? <img src={vendor.logoUrl} alt="" loading="lazy" /> : <Headphones size={28} />}
                    </span>
                    <span className="hc-vendor-copy">
                      <strong>{vendor.vendorName}</strong>
                      <small>{t('vendor.stats', { productCount: vendor.productCount, eqCount: vendor.eqCount })}</small>
                    </span>
                  </button>
                ))}
                {!busy && (browse?.vendors.length ?? 0) === 0 ? (
                  <div className="hc-no-results hc-no-results--wide">
                    <Search size={22} aria-hidden="true" />
                    <span>{message ?? t('message.cacheEmpty')}</span>
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <section
              className="hc-results"
              id="headphone-correction-results"
              aria-label={t('aria.products')}
              aria-busy={busy === 'browse' || busy === 'refresh'}
            >
              <header className="hc-results-heading hc-results-heading--models">
                <span className="hc-model-heading">
                  {selectedVendor ? (
                    <button type="button" aria-label={t('vendors.all')} onClick={showAllVendors}>
                      <ArrowLeft size={16} aria-hidden="true" />
                    </button>
                  ) : null}
                  <span className="hc-results-title">
                    <strong>{query.trim() ? t('label.results') : selectedVendor?.vendorName ?? t('label.allHeadphones')}</strong>
                    {selectedVendor ? <small>{t('vendor.stats', { productCount: selectedVendor.productCount, eqCount: selectedVendor.eqCount })}</small> : null}
                  </span>
                </span>
                <span>{browse?.products.length ?? 0}</span>
              </header>
              <div className="hc-results-columns" data-vendor-scoped={Boolean(selectedVendor)} aria-hidden="true">
                <span>{selectedVendor ? '' : t('label.manufacturer')}</span>
                <span>{t('label.model')}</span>
                <span>{t('label.availableCurves')}</span>
              </div>
              <div className="hc-result-list">
                {(browse?.products ?? []).map((product) => (
                  <button
                    className="hc-result-row"
                    type="button"
                    data-active={selectedProduct?.productId === product.productId}
                    data-vendor-scoped={Boolean(selectedVendor)}
                    aria-pressed={selectedProduct?.productId === product.productId}
                    key={product.productId}
                    onClick={() => chooseProduct(product)}
                  >
                    <span className="hc-result-vendor">
                      <span className="hc-product-art" aria-hidden="true">
                        {product.assetUrl ? <img src={product.assetUrl} alt="" loading="lazy" /> : <Headphones size={22} />}
                      </span>
                      {!selectedVendor ? <span>{product.vendorName}</span> : null}
                    </span>
                    <span className="hc-result-model">
                      <strong>{product.productName}</strong>
                      {product.productSubtype ? <small>{product.productSubtype}</small> : null}
                    </span>
                    <span className="hc-result-count">{product.eqs.length}</span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                ))}
                {!busy && (browse?.products.length ?? 0) === 0 ? (
                  <div className="hc-no-results">
                    <Search size={22} aria-hidden="true" />
                    <span>{message ?? t('message.noMatches')}</span>
                  </div>
                ) : null}
              </div>
            </section>
          )}
        </div>

        <aside className="hc-detail" aria-label={t('aria.preview')}>
          {selectedProduct ? (
            <>
              <div className="hc-detail-scroll" ref={detailScrollRef}>
                <header className="hc-selected-product">
                  <span className="hc-product-art hc-product-art--large" aria-hidden="true">
                    {selectedProduct.assetUrl ? <img src={selectedProduct.assetUrl} alt="" loading="lazy" /> : <Headphones size={30} />}
                  </span>
                  <span>
                    <small>{selectedProduct.vendorName}</small>
                    <strong>{selectedProduct.productName}</strong>
                  </span>
                  <div className="hc-selected-actions">
                    <button
                      className="hc-inline-apply"
                      type="button"
                      data-active={selectedPreviewIsApplied && headphoneCorrectionEnabled}
                      aria-pressed={selectedPreviewIsApplied && headphoneCorrectionEnabled}
                      disabled={!selectedPreview || busy === 'apply' || busy === 'toggle'}
                      onClick={() => selectedPreviewIsApplied
                        ? void toggleHeadphoneCorrection()
                        : void applyCorrection(selectedPreview)}
                    >
                      {busy === 'apply' || busy === 'toggle'
                        ? t('action.processing')
                        : selectedPreviewIsApplied
                        ? headphoneCorrectionEnabled ? t('action.disable') : t('control.toggle.enable')
                        : t('action.applyShort')}
                    </button>
                    <button
                      className="hc-favorite-button"
                      type="button"
                      aria-label={selectedProductFavorited ? t('favorite.remove') : t('favorite.add')}
                      aria-pressed={selectedProductFavorited}
                      data-active={selectedProductFavorited}
                      onClick={toggleFavoriteProduct}
                    >
                      <Star size={17} aria-hidden="true" />
                    </button>
                  </div>
                </header>

                <section className="hc-curve-section">
                  <header>
                    <strong>{t('label.curveResponse')}</strong>
                    {selectedPreview ? <span>{selectedPreview.author}</span> : null}
                  </header>
                  <div className="hc-curve">
                    <svg viewBox="0 0 100 100" role="img" aria-label={t('curve.aria')} preserveAspectRatio="none">
                      <g className="hc-curve-grid">
                        {[20, 32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((frequency) => <line key={frequency} x1={frequencyToX(frequency)} x2={frequencyToX(frequency)} y1="0" y2="100" />)}
                        {[-18, -12, -6, 0, 6, 12, 18].map((gain) => <line key={gain} x1="0" x2="100" y1={gainToY(gain)} y2={gainToY(gain)} />)}
                      </g>
                      {previewPath ? <path className="hc-curve-line" d={previewPath} /> : null}
                    </svg>
                    <div className="hc-curve-frequency-axis" aria-hidden="true">
                      {opraCurveFrequencyTicksHz.map((frequency) => (
                        <span key={frequency} style={{ '--hc-axis-position': `${frequencyToX(frequency)}%` } as CSSProperties}>
                          {formatFrequencyLabel(frequency)}
                        </span>
                      ))}
                    </div>
                    <div className="hc-curve-gain-axis" aria-hidden="true">
                      {opraCurveGainTicksDb.map((gain) => (
                        <span key={gain} style={{ '--hc-axis-position': `${gainToY(gain)}%` } as CSSProperties}>
                          {formatDb(gain)}
                        </span>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="hc-source-section">
                  <header><strong>{t('label.correctionSource')}</strong></header>
                  <div className="hc-source-list">
                    {selectedProduct.eqs.map((preview) => (
                      <button
                        type="button"
                        data-active={selectedPreview?.eqId === preview.eqId}
                        aria-pressed={selectedPreview?.eqId === preview.eqId}
                        key={preview.eqId}
                        onClick={() => setSelectedEqId(preview.eqId)}
                      >
                        <strong>{preview.author}</strong>
                        <small>{preview.details ?? t('preset.filterCount', { count: preview.importedBandCount })}</small>
                      </button>
                    ))}
                  </div>
                </section>

                {selectedPreview ? (
                  <>
                  <div className="hc-metrics">
                    <span><em>{t('metric.preamp')}</em><strong>{formatDb(selectedPreview.preset.preampDb)}</strong></span>
                    <span><em>{t('metric.filters')}</em><strong>{selectedPreviewActiveFilterCount}/{selectedPreview.originalBandCount}</strong></span>
                    <span><em>{t('metric.adjusted')}</em><strong>{selectedPreview.adjustedBandCount}</strong></span>
                  </div>
                  {selectedPreview.warnings.length > 0 ? <p className="hc-warning">{selectedPreview.warnings.join(' ')}</p> : null}
                  </>
                ) : null}

              </div>

            </>
          ) : (
            <div className="hc-empty-detail">
              <span><Headphones size={34} aria-hidden="true" /></span>
              <strong>{t('empty.title')}</strong>
              <p>{selectedVendor ? t('message.selectResult') : t('empty.detail')}</p>
              <div className="hc-step-guide" aria-hidden="true">
                <span data-current={!selectedVendor}><Factory size={16} /><small>{t('label.manufacturer')}</small></span>
                <ChevronRight size={14} />
                <span data-current={Boolean(selectedVendor)}><Headphones size={16} /><small>{t('label.model')}</small></span>
                <ChevronRight size={14} />
                <span><SlidersHorizontal size={16} /><small>{t('label.correctionSource')}</small></span>
              </div>
              {status ? (
                <small className="hc-catalog-summary">
                  {t('status.vendorCount', { count: status.vendorCount })} · {t('status.productCount', { count: status.productCount })}
                </small>
              ) : null}
            </div>
          )}
        </aside>
      </div>

    </section>
  );
};
