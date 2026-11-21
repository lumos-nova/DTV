import {
  MessageSquare,
  MessageSquareOff,
  Move,
  Pause,
  Play,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { api, PLATFORM_LABEL, PLATFORM_LOGO, type DanmakuMessage, type StreamInfo } from "@/api";
import { DanmuOverlay } from "@/features/player/DanmuOverlay";
import { DanmuSettingsControl } from "@/features/player/DanmuSettingsControl";
import type { DanmuUserSettings } from "@/features/player/danmuSettings";
import { ControlsDropdown } from "@/features/player/ControlsDropdown";
import { VolumeSlider } from "@/features/player/VolumeSlider";
import { useXgPlayer } from "@/features/player/useXgPlayer";
import { cn } from "@/lib/cn";
import {
  MONITOR_ROOM_DRAG_TYPE,
  type GridPlacement,
  type MonitorRoom,
  type MonitorTileSize,
} from "./layout";
import styles from "./RoomTile.module.css";

const MAX_MESSAGES = 120;
const MESSAGE_FLUSH_MS = 150;

interface RoomTileProps {
  room: MonitorRoom;
  placement: GridPlacement;
  focused: boolean;
  onAudioFocus: (key: string, multiple: boolean) => void;
  onDanmakuToggle: (key: string) => void;
  onDanmakuSettingsChange: (key: string, patch: Partial<DanmuUserSettings>) => void;
  onVolumeChange: (key: string, volume: number) => void;
  onQualityChange: (key: string, qualityId: string) => void;
  onRemove: (key: string) => void;
  onMove: (fromKey: string, toKey: string) => void;
  onResize: (key: string, size: MonitorTileSize) => void;
}

export function RoomTile({
  room,
  placement,
  focused,
  onAudioFocus,
  onDanmakuToggle,
  onDanmakuSettingsChange,
  onVolumeChange,
  onQualityChange,
  onRemove,
  onMove,
  onResize,
}: RoomTileProps) {
  const tileRef = useRef<HTMLElement>(null);
  const playerHostRef = useRef<HTMLDivElement>(null);
  const resizeGestureRef = useRef<{
    pointerId: number;
    axis: "x" | "y" | "both";
    startX: number;
    startY: number;
    startColumns: MonitorTileSize["columns"];
    startRows: MonitorTileSize["rows"];
    stepX: number;
    stepY: number;
  } | null>(null);
  const messageBufferRef = useRef<DanmakuMessage[]>([]);
  const reconnectAttemptRef = useRef(0);
  const [info, setInfo] = useState<StreamInfo | null>(null);
  const [infoError, setInfoError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [messages, setMessages] = useState<DanmakuMessage[]>([]);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setInfoError("");
    void api
      .getStreamInfo(room.platform, room.roomId)
      .then((next) => {
        if (!cancelled) {
          setInfo(next);
          setInfoError("");
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setInfoError(error instanceof Error ? error.message : "直播信息加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [retryKey, room.platform, room.roomId]);

  const variant =
    info?.variants.find((item) => item.id === room.qualityId) ??
    info?.variants.find((item) => item.label.includes("原画")) ??
    info?.variants[0];
  const source =
    info?.isLive && variant ? { url: variant.url, format: variant.format, nonce: retryKey } : null;
  const player = useXgPlayer(playerHostRef, source, true, { volume: room.volume, muted: !focused });

  const beginResize = (event: PointerEvent<HTMLButtonElement>, axis: "x" | "y" | "both") => {
    event.preventDefault();
    event.stopPropagation();
    const tile = tileRef.current;
    if (!tile) return;
    const rect = tile.getBoundingClientRect();
    const computed = getComputedStyle(tile.parentElement ?? tile);
    const gapX = Number.parseFloat(computed.columnGap) || 0;
    const gapY = Number.parseFloat(computed.rowGap) || 0;
    const cellWidth = (rect.width - gapX * (placement.columns - 1)) / placement.columns;
    const cellHeight = (rect.height - gapY * (placement.rows - 1)) / placement.rows;
    resizeGestureRef.current = {
      pointerId: event.pointerId,
      axis,
      startX: event.clientX,
      startY: event.clientY,
      startColumns: room.size.columns,
      startRows: room.size.rows,
      stepX: cellWidth + gapX,
      stepY: cellHeight + gapY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveResize = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = resizeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const columns =
      gesture.axis === "y"
        ? gesture.startColumns
        : (Math.max(
            1,
            Math.min(
              4,
              gesture.startColumns + Math.round((event.clientX - gesture.startX) / gesture.stepX),
            ),
          ) as MonitorTileSize["columns"]);
    const rows =
      gesture.axis === "x"
        ? gesture.startRows
        : (Math.max(
            1,
            Math.min(
              4,
              gesture.startRows + Math.round((event.clientY - gesture.startY) / gesture.stepY),
            ),
          ) as MonitorTileSize["rows"]);
    if (columns !== room.size.columns || rows !== room.size.rows) {
      onResize(room.key, { columns, rows });
    }
  };

  const endResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (resizeGestureRef.current?.pointerId === event.pointerId) {
      resizeGestureRef.current = null;
    }
  };

  useEffect(() => {
    if (player.state === "playing") {
      reconnectAttemptRef.current = 0;
      return;
    }
    if (player.state !== "error") return;
    reconnectAttemptRef.current += 1;
    const delay = Math.min(30_000, 2_000 * 2 ** Math.min(reconnectAttemptRef.current - 1, 4));
    const timer = window.setTimeout(() => setRetryKey((key) => key + 1), delay);
    return () => window.clearTimeout(timer);
  }, [player.errorNonce, player.state]);

  useEffect(() => {
    if (!info?.roomId || !room.danmakuEnabled) {
      setMessages([]);
      messageBufferRef.current = [];
      return;
    }
    const flush = window.setInterval(() => {
      if (messageBufferRef.current.length === 0) return;
      const batch = messageBufferRef.current;
      messageBufferRef.current = [];
      setMessages((previous) => [...previous, ...batch].slice(-MAX_MESSAGES));
    }, MESSAGE_FLUSH_MS);
    const unsubscribe = api.subscribeDanmaku(info.platform, info.roomId, (message) => {
      const buffer = messageBufferRef.current;
      buffer.push(message);
      if (buffer.length > MAX_MESSAGES) buffer.splice(0, buffer.length - MAX_MESSAGES);
    });
    return () => {
      window.clearInterval(flush);
      messageBufferRef.current = [];
      unsubscribe();
    };
  }, [info?.platform, info?.roomId, room.danmakuEnabled]);

  useEffect(() => {
    const tile = tileRef.current;
    if (!tile) return;
    const handleWheel = (event: globalThis.WheelEvent) => {
      if (!event.ctrlKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest("button, input, select, label")) return;
      event.preventDefault();
      const delta = event.deltaY < 0 ? 1 : -1;
      const columns = Math.max(
        1,
        Math.min(4, room.size.columns + delta),
      ) as MonitorTileSize["columns"];
      const rows = Math.max(1, Math.min(4, room.size.rows + delta)) as MonitorTileSize["rows"];
      if (columns !== room.size.columns || rows !== room.size.rows) {
        onResize(room.key, { columns, rows });
      }
    };
    tile.addEventListener("wheel", handleWheel, { passive: false });
    return () => tile.removeEventListener("wheel", handleWheel);
  }, [onResize, room.key, room.size.columns, room.size.rows]);

  const displayName = info?.nickname || `房间 ${room.roomId}`;
  const active = room.danmakuEnabled;
  const qualityOptions = (info?.variants ?? []).map((item) => ({
    id: item.id,
    label: /蓝光|bluray/i.test(item.label) ? "蓝光" : item.label,
  }));

  return (
    <article
      ref={tileRef}
      className={cn(
        styles.tile,
        focused && styles.audioFocused,
        player.state === "playing" && styles.playing,
      )}
      onClickCapture={(event) => {
        const target = event.target;
        if (event.button !== 0) return;
        if (
          target instanceof Element &&
          target.closest("button, input, select, label, [role='slider'], [draggable='true']")
        )
          return;
        onAudioFocus(room.key, event.shiftKey);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(MONITOR_ROOM_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const fromKey = event.dataTransfer.getData(MONITOR_ROOM_DRAG_TYPE);
        if (!fromKey || fromKey === room.key) return;
        event.preventDefault();
        event.stopPropagation();
        onMove(fromKey, room.key);
      }}
      style={{
        gridColumn: `${placement.column} / span ${placement.columns}`,
        gridRow: `${placement.row} / span ${placement.rows}`,
      }}
      aria-label={`${PLATFORM_LABEL[room.platform]}房间 ${room.roomId}`}
    >
      <div className={styles.media}>
        <div ref={playerHostRef} className={styles.playerHost} />
        {info?.isLive && (
          <DanmuOverlay
            messages={messages}
            enabled={active}
            settings={room.danmakuSettings}
            colorfulSupported={["douyu", "huya", "bilibili"].includes(room.platform)}
            platform={room.platform}
          />
        )}
        {infoError || (info && !info.isLive) || (info?.isLive && !variant) ? (
          <div className={styles.status} role={infoError ? "alert" : "status"}>
            <span>{infoError || (!info?.isLive ? "当前未开播" : "暂无可播放清晰度")}</span>
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => setRetryKey((key) => key + 1)}
            >
              重新获取
            </button>
          </div>
        ) : !info || player.state === "loading" ? (
          <div className={styles.status} role="status">
            正在连接直播间…
          </div>
        ) : null}
        {player.state === "error" && !infoError && (
          <div className={styles.playerError} role="status">
            播放中断，正在尝试重连
          </div>
        )}

        <header className={styles.header}>
          <div
            className={styles.dragHandle}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData(MONITOR_ROOM_DRAG_TYPE, room.key);
            }}
            title="拖到另一房间以交换位置和尺寸"
          >
            <Move size={13} />
          </div>
          <img className={styles.logo} src={PLATFORM_LOGO[room.platform]} alt="" />
          <div className={styles.roomMeta}>
            <span className={styles.nickname}>{displayName}</span>
            <span className={styles.roomNumber}>
              {PLATFORM_LABEL[room.platform]} · {room.roomId}
            </span>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onRemove(room.key)}
            title="从工作台移除"
            aria-label="移除房间"
          >
            <X size={15} />
          </button>
        </header>

        <footer className={styles.footer}>
          <div className={styles.playbackControls}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={player.togglePlay}
              disabled={!info?.isLive || player.state === "idle"}
              title={player.state === "paused" ? "继续播放" : "暂停"}
              aria-label={player.state === "paused" ? "继续播放" : "暂停"}
            >
              {player.state === "paused" ? (
                <Play size={22} strokeWidth={2} fill="currentColor" />
              ) : (
                <Pause size={22} strokeWidth={2} fill="currentColor" />
              )}
            </button>
            <button
              type="button"
              className={cn(
                styles.iconButton,
                (player.state === "loading" || player.state === "buffering") && styles.refreshing,
              )}
              onClick={() => setRetryKey((key) => key + 1)}
              title="刷新直播"
              aria-label="刷新直播"
            >
              <RotateCw size={19} strokeWidth={2} />
            </button>
          </div>
          <div className={styles.volumeControl}>
            <Volume2 size={19} aria-hidden="true" />
            <VolumeSlider
              className={styles.volumeSlider}
              label="房间音量"
              value={room.volume}
              max={2}
              step={0.05}
              onChange={(volume) => {
                if (volume > 1) player.activateAudioBoost();
                onVolumeChange(room.key, volume);
              }}
            />
            <span className={styles.volumeValue}>{Math.round(room.volume * 100)}%</span>
          </div>
          {room.volume > 1 && !player.audioBoostSupported && (
            <span className={styles.boostWarning} role="status">
              增强不可用
            </span>
          )}
          <div className={styles.roomControls}>
            <button
              type="button"
              className={cn(styles.iconButton, focused && styles.activeButton)}
              onClick={() => {
                if (room.volume > 1) player.activateAudioBoost();
                onAudioFocus(room.key, true);
              }}
              aria-pressed={focused}
              title={focused ? "关闭本房间声音" : "开启本房间声音"}
              aria-label={focused ? "关闭本房间声音" : "开启本房间声音"}
            >
              {focused ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button
              type="button"
              className={cn(styles.iconButton, room.danmakuEnabled && styles.activeButton)}
              onClick={() => onDanmakuToggle(room.key)}
              aria-pressed={room.danmakuEnabled}
              title={room.danmakuEnabled ? "关闭本房间弹幕" : "开启本房间弹幕"}
              aria-label={room.danmakuEnabled ? "关闭本房间弹幕" : "开启本房间弹幕"}
            >
              {room.danmakuEnabled ? <MessageSquare size={18} /> : <MessageSquareOff size={18} />}
            </button>
            <DanmuSettingsControl
              settings={room.danmakuSettings}
              onChange={(patch) => onDanmakuSettingsChange(room.key, patch)}
              supportsColor={["douyu", "huya", "bilibili"].includes(room.platform)}
            />
            <ControlsDropdown
              label="清晰度"
              valueId={variant?.id ?? ""}
              valueLabel={variant?.label ?? "清晰度"}
              options={qualityOptions}
              onSelect={(qualityId) => onQualityChange(room.key, qualityId)}
            />
          </div>
        </footer>
        <button
          type="button"
          className={cn(styles.resizeHandle, styles.resizeEast)}
          onPointerDown={(event) => beginResize(event, "x")}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          aria-label="拖动调整卡片宽度"
          title="拖动调整宽度"
        />
        <button
          type="button"
          className={cn(styles.resizeHandle, styles.resizeSouth)}
          onPointerDown={(event) => beginResize(event, "y")}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          aria-label="拖动调整卡片高度"
          title="拖动调整高度"
        />
        <button
          type="button"
          className={cn(styles.resizeHandle, styles.resizeCorner)}
          onPointerDown={(event) => beginResize(event, "both")}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          aria-label="拖动调整卡片宽度和高度"
          title="拖动调整尺寸"
        />
      </div>
    </article>
  );
}
