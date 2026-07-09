/**
 * 平台好友資料存取層（Mock）。
 *
 * 這是御策羅盤主程式「平台級好友系統」的前端模擬層。
 * 目前主程式尚未提供真實 API，因此以 localStorage 暫代，
 * 但資料結構與存取方式完全比照未來主程式 API 設計：
 *
 *   - platformFriends         — 好友列表（公開資料）
 *   - platformFriendRequests  — 好友邀請（送出/接受/拒絕）
 *   - platformUserProfile     — 目前使用者的平台公開資料
 *
 * 乾坤福田只能「讀取」這份資料做好友列表 / 拜訪 / 借運 / 結緣代收，
 * 不得自建 farmFriends、farmFriendRequests 等獨立好友關係。
 * 未來洞府、宗門、天機、命理 App 都會共用同一份 platformFriends。
 *
 * ⚠️ 這裡不得出現任何命理／個資欄位（真實姓名、八字、紫微命盤、
 * 出生資料、AI 分析、親友命理資料）。只允許 PlatformFriend 定義的公開欄位。
 */
import type { PlatformFriend, PlatformFriendRequest, PlatformUserProfile } from './platformTypes';

const FRIENDS_KEY = 'platform.friends.v1';
const REQUESTS_KEY = 'platform.friendRequests.v1';
const PROFILE_KEY = 'platform.userProfile.v1';

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 儲存失敗（如無痕模式）不影響遊戲運作 */
  }
}

/** 主程式尚未提供真實好友資料時，建立 demo 用的 platformFriends（僅用於前端展示）。 */
function seedIfEmpty() {
  if (typeof window === 'undefined') return;

  if (window.localStorage.getItem(PROFILE_KEY) === null) {
    const profile: PlatformUserProfile = {
      uid: 'demo-self-uid',
      nickname: '福田道友',
      avatar: '🧑‍🌾',
      lastOnlineAt: Date.now(),
      isPublic: true,
      farmPublic: true,
    };
    writeJson(PROFILE_KEY, profile);
  }

  if (window.localStorage.getItem(FRIENDS_KEY) === null) {
    const demoFriends: PlatformFriend[] = [
      { uid: 'friend-001', nickname: '清風道友', avatar: '🧝', lastOnlineAt: Date.now(), isPublic: true, farmPublic: true },
      { uid: 'friend-002', nickname: '墨衍師姐', avatar: '🧙‍♀️', lastOnlineAt: Date.now(), isPublic: true, farmPublic: true },
      { uid: 'friend-003', nickname: '玄夜真人', avatar: '🧙', lastOnlineAt: Date.now(), isPublic: true, farmPublic: true },
    ];
    writeJson(FRIENDS_KEY, demoFriends);
  }

  if (window.localStorage.getItem(REQUESTS_KEY) === null) {
    writeJson(REQUESTS_KEY, [] as PlatformFriendRequest[]);
  }
}

export function getPlatformUserProfile(): PlatformUserProfile {
  seedIfEmpty();
  return readJson(PROFILE_KEY, {
    uid: 'demo-self-uid',
    nickname: '福田道友',
    avatar: '🧑‍🌾',
    lastOnlineAt: Date.now(),
    isPublic: true,
    farmPublic: true,
  });
}

export function getPlatformFriends(): PlatformFriend[] {
  seedIfEmpty();
  return readJson<PlatformFriend[]>(FRIENDS_KEY, []);
}

export function getPlatformFriendRequests(): PlatformFriendRequest[] {
  seedIfEmpty();
  return readJson<PlatformFriendRequest[]>(REQUESTS_KEY, []);
}

/**
 * Demo 用：以暱稱新增一位好友。
 * 模擬「送出邀請 → 立即接受」的流程（正式版將由主程式好友邀請 API 取代），
 * 並同步寫入 platformFriendRequests（歷史紀錄）與 platformFriends（好友列表）。
 * 乾坤福田本身不保存這份資料，寫入的都是平台層資料。
 */
export function addDemoPlatformFriend(nickname: string): PlatformFriend {
  seedIfEmpty();
  const trimmed = nickname.trim();
  const profile = getPlatformUserProfile();
  const uid = `friend-${Date.now()}`;

  const newFriend: PlatformFriend = {
    uid,
    nickname: trimmed,
    avatar: '🙂',
    lastOnlineAt: Date.now(),
    isPublic: true,
    farmPublic: true,
  };

  const requests = getPlatformFriendRequests();
  const request: PlatformFriendRequest = {
    id: `req-${Date.now()}`,
    fromUid: uid,
    fromNickname: trimmed,
    toUid: profile.uid,
    createdAt: Date.now(),
    status: 'accepted',
  };
  writeJson(REQUESTS_KEY, [...requests, request]);

  const friends = getPlatformFriends();
  const updated = [...friends, newFriend];
  writeJson(FRIENDS_KEY, updated);
  return newFriend;
}
