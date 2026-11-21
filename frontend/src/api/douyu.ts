import { Events } from "@wailsio/runtime";
import * as Douyu from "../../bindings/dtv/internal/services/douyuservice";

import {
  mapCategory,
  mapCategoryGroup,
  mapSearchHit,
  mapStreamInfo,
  mapStreamer,
  mapStreamerPage,
} from "./mappers";
import type {
  Category,
  CategoryGroup,
  DanmakuMessage,
  LivePlatform,
  SearchHit,
  StreamInfo,
  Streamer,
  StreamerPage,
} from "./types";

/**
 * 斗鱼后端适配层。
 *
 * 职责：Wails 绑定 ↔ `DtvApi` 契约之间的翻译（字段映射见 mappers.ts），
 * 以及把后端弹幕事件转成订阅回调。
 *
 * 之所以不把绑定直接铺到组件里：绑定是生成物（`wails3 generate bindings`
 * 会清空重写），而 `DtvApi` 是稳定契约，两者之间必须有一层隔离。
 */

/** 后端弹幕事件的 payload（与 Go 侧 common.DanmakuEvent 一一对应）。 */
interface DanmakuEventPayload {
  roomId: string;
  platform: string;
  message: DanmakuMessage;
}

/** 后端全局弹幕事件名。按房间的事件名是 `danmaku-<roomId>`。 */
const DANMAKU_EVENT = "danmaku-message";

/** 列表页大小（斗鱼接口会按此截断）。 */
const PAGE_SIZE = 30;

/**
 * Wails 绑定返回的是 Promise 子类（CancellablePromise），
 * 这里统一成普通 Promise，避免上层被迫依赖 runtime 类型。
 */
function toPromise<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    p.then(resolve, reject);
  });
}

/**
 * 订阅弹幕的通用实现。先安装事件监听，再启动房间 session；
 * 取消订阅时等待 Start 完成后再 Stop，避免 IPC 调用竞态留下后台连接。
 */
export function createDanmakuSubscription(
  roomId: string,
  start: (roomId: string) => Promise<void>,
  stop: (roomId: string) => Promise<void>,
  onMessage: (msg: DanmakuMessage) => void,
  platform: LivePlatform,
): () => void {
  let stopped = false;
  const off = Events.On(DANMAKU_EVENT, (ev: { data: DanmakuEventPayload }) => {
    if (stopped) return;
    const payload = ev?.data;
    // 房间切换的瞬间可能收到上一个房间的残留消息，必须过滤
    if (!payload || payload.roomId !== roomId || payload.platform !== platform) return;
    onMessage(payload.message);
  });
  const startPromise = start(roomId).catch((err: unknown) => {
    console.error("[danmaku] 启动监听失败", err);
  });

  return () => {
    stopped = true;
    off();
    void startPromise
      .then(() => stop(roomId))
      .catch((err: unknown) => console.error("[danmaku] 停止监听失败", err));
  };
}

export const douyuApi = {
  listCategories(): Promise<CategoryGroup[]> {
    return toPromise(Douyu.FetchCategories()).then((list) => (list ?? []).map(mapCategoryGroup));
  },

  listStreamers(categoryId: string, page = 1): Promise<StreamerPage> {
    return toPromise(Douyu.FetchLiveList(categoryId, page, PAGE_SIZE)).then((page_) =>
      mapStreamerPage(page_, "douyu"),
    );
  },

  /** 三级分区列表（首页"更多分类"入口用）。 */
  listStreamersForCate3(cate3Id: string, page = 1): Promise<StreamerPage> {
    return toPromise(Douyu.FetchLiveListForCate3(cate3Id, page, PAGE_SIZE)).then((page_) =>
      mapStreamerPage(page_, "douyu"),
    );
  },

  /** 某个二级分区下的三级分类。 */
  listSubCategories(cate2Id: string): Promise<Category[]> {
    return toPromise(Douyu.FetchThreeCate(cate2Id)).then((list) => (list ?? []).map(mapCategory));
  },
  search(keyword: string): Promise<SearchHit[]> {
    return toPromise(Douyu.SearchAnchor(keyword)).then((hits) => (hits ?? []).map(mapSearchHit));
  },

  getStreamInfo(roomId: string, line?: string | null): Promise<StreamInfo> {
    return toPromise(Douyu.GetStreamInfo(roomId, line ?? "")).then((info) => {
      if (!info) throw new Error(`房间 ${roomId} 未返回信息`);
      return mapStreamInfo(info, "douyu");
    });
  },

  /** 房间卡片信息（关注列表刷新用，不含取流）。 */
  getRoomInfo(roomId: string): Promise<Streamer> {
    return toPromise(Douyu.FetchRoomInfo(roomId)).then((info) => mapStreamer(info, "douyu"));
  },

  getStreamURL(roomId: string, quality = "", line = ""): Promise<string> {
    return toPromise(Douyu.GetStreamURL(roomId, quality, line));
  },

  subscribeDanmaku(roomId: string, onMessage: (msg: DanmakuMessage) => void): () => void {
    return createDanmakuSubscription(
      roomId,
      (id) => toPromise(Douyu.StartDanmaku(id)),
      (id) => toPromise(Douyu.StopDanmaku(id)),
      onMessage,
      "douyu",
    );
  },
};
