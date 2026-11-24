/**
 * 类目能力推断：不依赖类目 ID，也不依赖写死的键名清单。
 *
 * 拼多多的类目规则接口（/glide/v2/mms/query/rules/limit/new）每个类目返回同一套
 * 几百个键，但同一件事在不同类目下有三种状态：提供、不提供、必须提供。
 * 后台改版时会新增键，所以这里不枚举键，而是「按键名归类 + 按取值判定」：
 *
 *   available   类目提供这项能力（资料填了就照常下发）
 *   unavailable 类目不提供（跳过，并在执行记录里说明，不算失败）
 *   required    类目要求必须设置（我们发不了时才需要人工介入）
 *   unknown     规则里看不出（按 available 处理，交给后面的读回核对兜底）
 *
 * 只做判定，不发请求、不抛异常，方便单测和界面复用。
 */

export type CapabilityState = 'available' | 'unavailable' | 'required' | 'unknown';

export type CapabilityKey =
  | 'invoice'
  | 'specTemplate'
  | 'installService'
  | 'promiseDelivery'
  | 'refundable'
  | 'authenticity'
  | 'video'
  | 'whiteBackground'
  | 'buyLimit';

/** 每个能力对应「哪些键名算它的能力位」。键名用正则，后台加新键也能自动归类。 */
const FAMILIES: Record<CapabilityKey, RegExp> = {
  invoice: /invoice/i,
  specTemplate: /spec_?template|spec_?module/i,
  // 注意：rules 里只有 `can_set_wp_service`（上门/同城服务），并不代表「到店安装」；
  // 轮胎类目 can_set_wp_service=false 但编辑页明确有到店安装入口，因此这里只认明确的
  // 「支持」类键名，`can_set_wp_service` 一律不参与判定（判不准就 unknown，交给页面读回）。
  installService: /(?:support|allow|enable)_install_?service|install_?service_?support|srv_template|install_?convert/i,
  promiseDelivery: /promise_?delivery|same_?city/i,
  refundable: /refundable/i,
  authenticity: /fake_?one_?lose_?ten|authenticity|is_?folt/i,
  video: /video/i,
  whiteBackground: /white_?bg|white_?background/i,
  buyLimit: /buy_?limit|purchase_?limit/i,
};

/** 能力的展示名，用于执行记录和界面提示。 */
export const CAPABILITY_LABEL: Record<CapabilityKey, string> = {
  invoice: '正品发票',
  specTemplate: '规格模板',
  installService: '到店安装',
  promiseDelivery: '配送到家模板',
  refundable: '7天无理由退货',
  authenticity: '假一赔十',
  video: '商品视频',
  whiteBackground: '白底图',
  buyLimit: '限购',
};

const isTrue = (value: unknown) =>
  value === true || (Array.isArray(value) && value.length > 0);

const isFalse = (value: unknown) =>
  value === false || value === null || value === undefined || value === 0 || value === '';

function judge(rules: Record<string, unknown>, family: RegExp): CapabilityState {
  const keys = Object.keys(rules);
  // must_not_refundable 这类「必须没有」是反向要求，先判，否则会被 must_ 前缀误读成「必须提供」。
  const forbidKeys = keys.filter((key) => /^must_not_/i.test(key) && family.test(key));
  if (forbidKeys.some((key) => isTrue(rules[key]))) return 'unavailable';

  // 「必须提供」一般写成 must_set_xxx / must_xxx（不含 must_not_），优先于「提供/不提供」。
  const mustKeys = keys.filter((key) => /^must_(?!not_)/i.test(key) && family.test(key));
  if (mustKeys.some((key) => isTrue(rules[key]))) return 'required';

  const plainKeys = keys.filter((key) => family.test(key) && !/^(must_)?not_/i.test(key) && !/^must_/i.test(key));
  if (!plainKeys.length) return 'unknown';
  const values = plainKeys.map((key) => rules[key]);
  if (values.some(isTrue)) return 'available';
  if (values.every(isFalse)) return 'unavailable';
  return 'unknown';
}

/**
 * 从一个类目的规则对象（可带类目模板）推断能力矩阵。
 * 模板只用来补「规格模板」：接口里带 spec_module 就说明该类目提供模板。
 */
export function capabilities(
  rules: Record<string, unknown> = {},
  template: Record<string, unknown> = {},
): Record<CapabilityKey, CapabilityState> {
  const result = {} as Record<CapabilityKey, CapabilityState>;
  for (const key of Object.keys(FAMILIES) as CapabilityKey[])
    result[key] = judge(rules, FAMILIES[key]);

  const specModule = template.spec_module;
  if (specModule && typeof specModule === 'object' && Object.keys(specModule).length)
    result.specTemplate = result.specTemplate === 'required' ? 'required' : 'available';

  return result;
}

/**
 * 把「资料里要求的能力」和「类目实际能给的」对齐，产出可执行的结论：
 *  - skip：类目不提供，跳过并写一条说明（不是错误）
 *  - stop：类目必须提供，但我们的流程发不了，需要人工先设置
 *  - go：正常下发
 */
export type CapabilityDecision =
  | { action: 'go' }
  | { action: 'skip'; note: string }
  | { action: 'stop'; reason: string };

export function decide(
  key: CapabilityKey,
  wanted: boolean,
  states: Record<CapabilityKey, CapabilityState>,
): CapabilityDecision {
  if (!wanted) return { action: 'go' };
  const state = states[key];
  const label = CAPABILITY_LABEL[key];
  if (state === 'unavailable')
    return { action: 'skip', note: `该类目不提供${label}，资料里的设置已跳过` };
  if (state === 'required')
    return {
      action: 'stop',
      reason: `该类目要求设置${label}，请先在浏览器里手工设置一次，再点「继续原任务」`,
    };
  return { action: 'go' };
}
