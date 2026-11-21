import { ArrowRight, Link2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { PLATFORM_LABEL, PLATFORM_LOGO } from "@/api";
import { useOpenPlayer } from "@/lib/navigation";
import { parseLiveRoomUrl, type ParsedLiveRoomUrl } from "@/features/multiview/roomUrl";
import styles from "./MonitorPage.module.css";

export function MonitorPage() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ParsedLiveRoomUrl | null>(null);
  const [error, setError] = useState("");
  const openPlayer = useOpenPlayer();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult(null);
    setError("");

    try {
      setResult(parseLiveRoomUrl(input));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法识别该直播间链接");
    }
  };

  return (
    <section className={styles.page}>
      <div className={styles.content}>
        <div className={styles.icon} aria-hidden="true">
          <Link2 size={24} strokeWidth={1.8} />
        </div>
        <p className={styles.eyebrow}>多平台直播工作台</p>
        <h1 className={styles.title}>识别直播间链接</h1>
        <p className={styles.description}>
          粘贴斗鱼、虎牙、抖音或 B 站的直播间链接，识别平台和房间号。
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="live-room-url">
            直播间链接
          </label>
          <div className={styles.inputRow}>
            <input
              id="live-room-url"
              className={styles.input}
              type="text"
              inputMode="url"
              autoComplete="url"
              placeholder="粘贴直播间链接，例如 https://live.bilibili.com/6"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setError("");
                setResult(null);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "live-room-url-error" : "live-room-url-hint"}
            />
            <button type="submit" className={styles.submit}>
              识别链接
            </button>
          </div>
          {error ? (
            <p className={styles.error} id="live-room-url-error" role="alert">
              {error}
            </p>
          ) : (
            <p className={styles.hint} id="live-room-url-hint">
              暂不解析抖音分享短链，请粘贴直播间页面链接。
            </p>
          )}
        </form>

        {result && (
          <div className={styles.result} role="status" aria-live="polite">
            <div className={styles.platform}>
              <img src={PLATFORM_LOGO[result.platform]} alt="" />
              <span>{PLATFORM_LABEL[result.platform]}</span>
            </div>
            <div className={styles.roomInfo}>
              <span className={styles.roomLabel}>房间号</span>
              <code className={styles.roomId}>{result.roomId}</code>
            </div>
            <button
              type="button"
              className={styles.openButton}
              onClick={() => openPlayer(result.platform, result.roomId)}
            >
              打开直播间
              <ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
