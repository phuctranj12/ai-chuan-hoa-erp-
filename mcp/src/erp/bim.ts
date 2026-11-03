// Gọi BIM Service (danh mục vật tư ERP) bằng token của CHÍNH người dùng. Chỉ có GET.
import type { Config } from "../config.ts";
import { ErpUnavailable } from "./oidc.ts";
import { SessionExpired, type SessionStore } from "./session.ts";

export class ErpForbidden extends Error {}

export type Paged<T> = { items: T[]; totalCount: number };

export type BimItemGroup = { id: number; name: string; code: string; isActive: number };
export type BimItem = {
  id: number; name: string; code: string; itemNumber?: string; description?: string | null; isActive: number;
  unitName?: string; itemGroupName: string; itemGroupCode: string; shapeMajor?: string; shapeMinor?: string;
};
export type BimGroupLink = { itemGroupCode: string; itemGroupName: string; isActive: number };
export type BimValue = {
  id: number; name?: string; code?: string; description?: string | null; sizeName?: string; isActive: number;
  itemGroupSizes?: BimGroupLink[]; itemGroupRanges?: BimGroupLink[];
};
export type BimMatrixGroup = {
  itemGroupId: number; itemGroupCode: string; itemGroupName: string;
  configStatus: { field: string; status: number }[];
  items: { itemName: string; itemCode: string; itemId: number; fields: string[]; isExisting: boolean; isActive: number }[];
};

type Query = Record<string, string | number | undefined>;

/** Cache ngắn hạn cho danh mục dùng chung (giống nhau với mọi người). Chỉ phục vụ người đã qua kiểm quyền của tool. */
class TtlCache {
  private readonly entries = new Map<string, { at: number; value: unknown }>();
  private readonly ttlMs: number;
  private readonly max: number;
  constructor(ttlMs: number, max = 2000) {
    this.ttlMs = ttlMs;
    this.max = max;
  }
  get<T>(key: string): T | undefined {
    const hit = this.entries.get(key);
    if (!hit || Date.now() - hit.at > this.ttlMs) return undefined;
    return hit.value as T;
  }
  set(key: string, value: unknown): void {
    if (this.entries.size >= this.max) this.entries.delete(this.entries.keys().next().value as string);
    this.entries.set(key, { at: Date.now(), value });
  }
  clear(): void {
    this.entries.clear();
  }
}

export class BimClient {
  private readonly cache = new TtlCache(10 * 60 * 1000);
  private readonly config: Config;
  private readonly sessions: SessionStore;

  constructor(config: Config, sessions: SessionStore) {
    this.config = config;
    this.sessions = sessions;
  }

  private async get<T>(sessionId: string, path: string, query: Query = {}, cacheable = true): Promise<T | undefined> {
    const url = new URL(path, this.config.erp.bimBase + "/");
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    const key = url.toString();
    if (cacheable) {
      const hit = this.cache.get<T>(key);
      if (hit !== undefined) return hit;
    }
    let token = await this.sessions.accessToken(sessionId);
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { authorization: `Bearer ${token}`, accept: "application/json" },
          signal: AbortSignal.timeout(this.config.erp.timeoutMs),
        });
      } catch (error) {
        if (attempt === 0) continue;
        throw new ErpUnavailable(`Không gọi được ERP (BIM): ${(error as Error).message}`);
      }
      if (response.status === 401 && attempt === 0) {
        token = await this.sessions.forceRefresh(sessionId);
        continue;
      }
      if (response.status === 401) throw new SessionExpired("ERP không chấp nhận phiên đăng nhập, cần kết nối lại");
      if (response.status === 403) throw new ErpForbidden("ERP từ chối: tài khoản không có quyền xem dữ liệu này");
      if (response.status === 204) return undefined;
      if (response.status >= 500 && attempt === 0) continue;
      if (!response.ok) throw new ErpUnavailable(`ERP (BIM) trả lỗi HTTP ${response.status} cho ${url.pathname}`);
      const body = await response.json() as T;
      if (cacheable) this.cache.set(key, body);
      return body;
    }
    throw new ErpUnavailable("ERP (BIM) không phản hồi");
  }

  async itemGroups(sessionId: string): Promise<BimItemGroup[]> {
    const page = await this.get<Paged<BimItemGroup>>(sessionId, "api/ItemGroup/list", { MaxResultCount: 1000 });
    return page?.items ?? [];
  }

  async searchItems(sessionId: string, keyword: string, groupCode?: string, max = 50): Promise<Paged<BimItem>> {
    const query: Query = { Keyword: keyword, MaxResultCount: max };
    if (groupCode) query["Filters[itemGroupCode__eq]"] = groupCode;
    return await this.get<Paged<BimItem>>(sessionId, "api/Item/list", query) ?? { items: [], totalCount: 0 };
  }

  async itemsInGroup(sessionId: string, groupCode: string): Promise<BimItem[]> {
    const page = await this.get<Paged<BimItem>>(sessionId, "api/Item/list", { "Filters[itemGroupCode__eq]": groupCode, MaxResultCount: 2000 });
    return page?.items ?? [];
  }

  /** Ma trận quản lý thông số của một nhóm: `fields` của từng vật tư là các cột bắt buộc (dấu V). */
  async matrix(sessionId: string, groupCode: string): Promise<BimMatrixGroup | undefined> {
    return this.get<BimMatrixGroup>(sessionId, "CodeGenConditionField/items-in-group", { itemGroupCode: groupCode, type: 0, isExisting: 1 });
  }

  async searchValues(sessionId: string, list: ValueList, keyword: string): Promise<BimValue[]> {
    const page = await this.get<Paged<BimValue>>(sessionId, `api/${list}/list`, { Keyword: keyword, MaxResultCount: 200 });
    return page?.items ?? [];
  }

  async reachable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.erp.apiBase}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5000) });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export type ValueList = "Size" | "Range" | "Specification" | "Finish" | "InstallType" | "Origin" | "InstallationSpace";
