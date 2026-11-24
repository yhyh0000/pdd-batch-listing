import type { BrowserBridge } from './browser-bridge';

/** 类目树节点：只有 id 与名称是稳定的，其余字段后台随时会变。 */
export type CategoryNode = { id: number; name: string; leaf: boolean };
/** 按 ID 反查出来的类目全路径，用于回显与校验。 */
export type CategoryDetail = { id: number; path: string; names: string[]; leaf: boolean };

const TTL = 7 * 24 * 60 * 60 * 1000;

/**
 * 类目树来自商家后台自己的接口（在商品编辑页同源请求）：
 *   GET /vodka/v2/mms/cat1List                  一级类目（只含本店可发布的）
 *   GET /vodka/v2/mms/categories?parentId=      子类目；叶子类目返回 null
 *   GET /vodka/v2/mms/category/detail?catId=    反查全路径
 * 结果按 parentId 缓存 7 天：类目树一年改几次，没必要每次都问。
 */
export class CategoryService {
  private readonly cache = new Map<string, { at: number; value: CategoryNode[] }>();
  private details = new Map<number, CategoryDetail>();

  constructor(private readonly bridge: BrowserBridge) {}

  private async request<T>(path: string): Promise<T | undefined> {
    // 直接用 fetch 会拿到 { verifyAuthToken } 的挑战响应：后台接口要带 anti-content，
    // 页面运行时已经注入了 __mms.fetch，走它才有完整签名。
    const code = `(async () => {
      // 页面运行时 __mms.fetch.get 直接把 result 返回出来（数组或对象），不套 { result }；
      // 原生 fetch 才是完整响应体。两种形状都认。
      const pick = (json) => {
        if (Array.isArray(json)) return { ok: true, result: json };
        if (json && typeof json === 'object' && 'result' in json)
          return { ok: json.success !== false, result: json.result };
        return { ok: !!json, result: json };
      };
      try {
        const runtime = (window && window.__mms && window.__mms.fetch) || null;
        if (runtime && typeof runtime.get === 'function') {
          const json = await runtime.get(${JSON.stringify(path)});
          const first = pick(json);
          if (first.result && !first.result.verifyAuthToken) return first;
        }
        const res = await fetch(${JSON.stringify(path)}, { credentials: 'include' });
        const json = await res.json();
        return pick(json);
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    })()`;
    const raw = await this.bridge.eval<{ ok: boolean; result?: unknown; error?: string }>(code, 15000);
    if (!raw?.ok) return undefined;
    return raw.result as T;
  }

  async roots(): Promise<CategoryNode[]> {
    const hit = this.cache.get('roots');
    if (hit && Date.now() - hit.at < TTL) return hit.value;
    const rows = (await this.request<Array<{ id: number; name: string }>>('/vodka/v2/mms/cat1List')) || [];
    const nodes = rows
      .filter((row) => Number.isInteger(row?.id) && row.id > 0)
      .map((row) => ({ id: row.id, name: String(row.name || ''), leaf: false }));
    this.cache.set('roots', { at: Date.now(), value: nodes });
    return nodes;
  }

  async children(parentId: number): Promise<CategoryNode[]> {
    if (!Number.isInteger(parentId) || parentId <= 0) return [];
    const key = `children:${parentId}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.value;
    const rows =
      (await this.request<Array<Record<string, unknown>> | null>(
        `/vodka/v2/mms/categories?parentId=${parentId}`,
      )) || [];
    const nodes = rows
      .map((row) => ({
        id: Number(row?.id),
        name: String(row?.cat_name || ''),
        // is_leaf=1 才是可选末级；leaf=2 表示还有下一层
        leaf: Number(row?.is_leaf) === 1,
      }))
      .filter((node) => Number.isInteger(node.id) && node.id > 0 && node.name);
    this.cache.set(key, { at: Date.now(), value: nodes });
    return nodes;
  }

  async detail(catId: number): Promise<CategoryDetail | undefined> {
    if (!Number.isInteger(catId) || catId <= 0) return undefined;
    const hit = this.details.get(catId);
    if (hit) return hit;
    const row = await this.request<Record<string, unknown> | null>(
      `/vodka/v2/mms/category/detail?catId=${catId}`,
    );
    if (!row) return undefined;
    const names = [1, 2, 3, 4]
      .map((index) => String(row[`cat_id_${index}_name`] || '').trim())
      .filter(Boolean);
    if (!names.length) return undefined;
    const detail: CategoryDetail = {
      id: catId,
      path: names.join(' > '),
      names,
      leaf: Number(row.level) >= 2,
    };
    this.details.set(catId, detail);
    return detail;
  }
}
