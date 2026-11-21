import { describe, expect, it } from "vitest";
import { parseLiveRoomUrl } from "./roomUrl";

describe("parseLiveRoomUrl", () => {
  it.each([
    ["https://www.douyu.com/9999?source=share", "douyu", "9999"],
    ["m.huya.com/123456", "huya", "123456"],
    ["https://live.douyin.com/933572413882?enter_from=share", "douyin", "933572413882"],
    ["https://www.douyin.com/follow/live/933572413882", "douyin", "933572413882"],
    ["https://live.bilibili.com/6/", "bilibili", "6"],
    ["//live.bilibili.com/7734200?from=home", "bilibili", "7734200"],
  ] as const)("recognizes %s", (url, platform, roomId) => {
    expect(parseLiveRoomUrl(url)).toEqual({ platform, roomId });
  });

  it.each([
    "",
    "https://live.bilibili.com.evil.example/123",
    "https://live.bilibili.com:8443/123",
    "https://live.bilibili.com/not-a-room",
    "https://live.bilibili.com/123/extra",
    "https://v.douyin.com/abc123",
    "javascript://live.bilibili.com/123",
  ])("rejects unsupported or unsafe URL %s", (url) => {
    expect(() => parseLiveRoomUrl(url)).toThrow();
  });
});
