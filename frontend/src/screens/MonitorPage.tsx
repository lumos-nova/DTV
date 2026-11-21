import { Check, Grid2X2, MessageSquare, MessageSquareOff } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { PLATFORM_LABEL, type LivePlatform } from "@/api";
import { RoomTile } from "@/features/multiview/RoomTile";
import {
  FOLLOW_ROOM_DRAG_TYPE,
  fitRoomGrid,
  MONITOR_ROOM_DRAG_TYPE,
  packRoomGrid,
  swapRoomPositionsAndSizes,
  type MonitorGridSize,
  type MonitorRoom,
  type MonitorTileSize,
} from "@/features/multiview/layout";
import { parseLiveRoomUrl } from "@/features/multiview/roomUrl";
import { useMonitorWorkspace } from "@/features/multiview/useMonitorWorkspace";
import { cn } from "@/lib/cn";
import styles from "./MonitorPage.module.css";

const MAX_ROOMS = 16;

function platformLabel(platform: LivePlatform): string {
  return PLATFORM_LABEL[platform];
}

function droppedLink(event: DragEvent<HTMLElement>): string {
  const uriList = event.dataTransfer.getData("text/uri-list");
  const uri = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  return uri || event.dataTransfer.getData("text/plain").trim();
}

export function MonitorPage() {
  const { rooms, grid, globalDanmakuEnabled, audioFocusKeys, setWorkspace, setGrid } =
    useMonitorWorkspace();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const placements = useMemo(() => packRoomGrid(rooms, grid), [grid, rooms]);

  const addRoom = (platform: LivePlatform, rawRoomId: string) => {
    const roomId = rawRoomId.replace(/^0+(?=\d)/, "");
    const key = `${platform}:${roomId}`;
    if (rooms.some((room) => room.key === key)) {
      setNotice(`${platformLabel(platform)}房间 ${roomId} 已在工作台中`);
      setError("");
      return;
    }
    if (rooms.length >= MAX_ROOMS) {
      setError("工作台最多同时监看 16 个不同房间");
      setNotice("");
      return;
    }

    const nextRooms: MonitorRoom[] = [
      ...rooms,
      {
        key,
        platform,
        roomId,
        size: { columns: 1, rows: 1 },
        volume: 0.7,
        danmakuEnabled: true,
      },
    ];
    const nextGrid = fitRoomGrid(nextRooms, grid);
    if (!nextGrid) {
      setError("当前网格无法容纳更多房间");
      setNotice("");
      return;
    }
    setWorkspace((previous) => ({
      ...previous,
      rooms: nextRooms,
      grid: nextGrid,
      audioFocusKeys: previous.rooms.length === 0 ? [key] : previous.audioFocusKeys,
    }));
    setError("");
    setNotice(`${platformLabel(platform)}房间 ${roomId} 已加入工作台`);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetKey?: string) => {
    const fromKey = event.dataTransfer.getData(MONITOR_ROOM_DRAG_TYPE);
    if (fromKey) {
      event.preventDefault();
      event.stopPropagation();
      if (!targetKey || targetKey !== fromKey) {
        setWorkspace((previous) => {
          const from = previous.rooms.findIndex((room) => room.key === fromKey);
          const to = targetKey
            ? previous.rooms.findIndex((room) => room.key === targetKey)
            : previous.rooms.length - 1;
          if (from < 0 || to < 0 || from === to) return previous;
          const next = [...previous.rooms];
          const [moved] = next.splice(from, 1);
          if (!moved) return previous;
          next.splice(to, 0, moved);
          return { ...previous, rooms: next };
        });
      }
      return;
    }

    const followPayload = event.dataTransfer.getData(FOLLOW_ROOM_DRAG_TYPE);
    if (followPayload) {
      event.preventDefault();
      event.stopPropagation();
      setDragOver(false);
      try {
        const value: unknown = JSON.parse(followPayload);
        if (
          !value ||
          typeof value !== "object" ||
          !("platform" in value) ||
          !("roomId" in value) ||
          typeof value.platform !== "string" ||
          typeof value.roomId !== "string" ||
          !/^\d+$/.test(value.roomId) ||
          !["douyu", "huya", "douyin", "bilibili"].includes(value.platform)
        ) {
          throw new Error("关注列表拖拽数据无效");
        }
        addRoom(value.platform as LivePlatform, value.roomId);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "无法添加拖入的关注主播");
        setNotice("");
      }
      return;
    }

    const url = droppedLink(event);
    if (!url) return;
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    setError("");
    setNotice("");
    try {
      const parsed = parseLiveRoomUrl(url);
      addRoom(parsed.platform, parsed.roomId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法识别拖入的直播间链接");
    }
  };

  const moveRoom = (fromKey: string, toKey: string) => {
    setWorkspace((previous) => {
      return {
        ...previous,
        rooms: swapRoomPositionsAndSizes(previous.rooms, fromKey, toKey),
      };
    });
  };

  const handleResize = (key: string, size: MonitorTileSize) => {
    const nextRooms = rooms.map((room) => (room.key === key ? { ...room, size } : room));
    const nextGrid = fitRoomGrid(nextRooms, grid);
    if (!nextGrid) {
      setError("卡片尺寸与当前网格不兼容，请缩小卡片或扩大网格");
      setNotice("");
      return;
    }
    setWorkspace((previous) => ({ ...previous, rooms: nextRooms, grid: nextGrid }));
    setError("");
  };

  const handleGridChange = (next: MonitorGridSize) => {
    if (!packRoomGrid(rooms, next)) {
      setError("该网格无法容纳当前房间和卡片尺寸，请先移除房间或缩小卡片");
      setNotice("");
      return;
    }
    setGrid(next);
    setError("");
  };

  const handleAudioFocus = (key: string, multiple: boolean) => {
    setWorkspace((previous) => {
      if (!multiple) return { ...previous, audioFocusKeys: [key] };
      const selected = previous.audioFocusKeys.includes(key);
      return {
        ...previous,
        audioFocusKeys: selected
          ? previous.audioFocusKeys.filter((item) => item !== key)
          : [...previous.audioFocusKeys, key],
      };
    });
  };

  const updateRoom = (key: string, patch: Partial<MonitorRoom>) => {
    setWorkspace((previous) => ({
      ...previous,
      rooms: previous.rooms.map((room) => (room.key === key ? { ...room, ...patch } : room)),
    }));
  };

  const removeRoom = (key: string) => {
    setWorkspace((previous) => ({
      ...previous,
      rooms: previous.rooms.filter((room) => room.key !== key),
      audioFocusKeys: previous.audioFocusKeys.filter((roomKey) => roomKey !== key),
    }));
    setError("");
    setNotice("房间已从工作台移除");
  };

  const handleGridDrop = (event: DragEvent<HTMLDivElement>) => {
    setDragOver(false);
    handleDrop(event);
  };

  return (
    <section className={styles.page}>
      <header className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <div className={styles.icon} aria-hidden="true">
            <Grid2X2 size={20} strokeWidth={1.9} />
          </div>
          <div>
            <h1 className={styles.title}>多房间工作台</h1>
            <p className={styles.subtitle}>
              {rooms.length}/{MAX_ROOMS} · 拖入关注主播 · Ctrl+滚轮/拖边缘缩放 · Shift+左键切换声音
            </p>
          </div>
        </div>

        <div className={styles.toolbarControls}>
          <label className={styles.gridSelect}>
            <span>列</span>
            <select
              value={grid.columns}
              onChange={(event) =>
                handleGridChange({
                  ...grid,
                  columns: Number(event.target.value) as MonitorGridSize["columns"],
                })
              }
            >
              {[1, 2, 3, 4].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <span className={styles.gridTimes}>×</span>
          <label className={styles.gridSelect}>
            <span>行</span>
            <select
              value={grid.rows}
              onChange={(event) =>
                handleGridChange({
                  ...grid,
                  rows: Number(event.target.value) as MonitorGridSize["rows"],
                })
              }
            >
              {[1, 2, 3, 4].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={cn(styles.globalDanmaku, globalDanmakuEnabled && styles.globalDanmakuActive)}
            onClick={() =>
              setWorkspace((previous) => ({
                ...previous,
                globalDanmakuEnabled: !previous.globalDanmakuEnabled,
              }))
            }
            aria-pressed={globalDanmakuEnabled}
            title={globalDanmakuEnabled ? "关闭所有房间弹幕" : "开启所有房间弹幕"}
          >
            {globalDanmakuEnabled ? <MessageSquare size={15} /> : <MessageSquareOff size={15} />}
            <span>全局弹幕</span>
          </button>
        </div>
      </header>

      <div className={styles.feedback} aria-live="polite">
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {!error && notice && (
          <p className={styles.notice}>
            <Check size={13} />
            {notice}
          </p>
        )}
      </div>

      {rooms.length === 0 ? (
        <div
          className={cn(styles.empty, dragOver && styles.dropActive)}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = event.dataTransfer.types.includes(FOLLOW_ROOM_DRAG_TYPE)
              ? "copy"
              : "move";
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleGridDrop}
        >
          <div className={styles.emptyIcon}>
            <Grid2X2 size={22} />
          </div>
          <p className={styles.emptyTitle}>添加第一个直播间</p>
          <p className={styles.emptyHint}>将左侧关注列表中的主播拖到这里即可开始播放</p>
        </div>
      ) : (
        <div
          className={cn(styles.grid, dragOver && styles.dropActive)}
          style={{
            gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${grid.rows}, minmax(180px, 1fr))`,
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = event.dataTransfer.types.includes(FOLLOW_ROOM_DRAG_TYPE)
              ? "copy"
              : "move";
            setDragOver(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDragOver(false);
          }}
          onDrop={handleGridDrop}
        >
          {rooms.map((room) => {
            const placement = placements?.get(room.key);
            if (!placement) return null;
            return (
              <RoomTile
                key={room.key}
                room={room}
                placement={placement}
                focused={audioFocusKeys.includes(room.key)}
                globalDanmakuEnabled={globalDanmakuEnabled}
                onAudioFocus={handleAudioFocus}
                onDanmakuToggle={(key) =>
                  setWorkspace((previous) => ({
                    ...previous,
                    rooms: previous.rooms.map((item) =>
                      item.key === key ? { ...item, danmakuEnabled: !item.danmakuEnabled } : item,
                    ),
                  }))
                }
                onVolumeChange={(key, volume) => updateRoom(key, { volume })}
                onRemove={removeRoom}
                onMove={moveRoom}
                onResize={handleResize}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
