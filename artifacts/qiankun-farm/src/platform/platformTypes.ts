/**
 * 平台級好友資料型別（御策羅盤主程式管轄）。
 *
 * 乾坤福田不得自建獨立好友資料結構 — 所有跨 App 共用的好友身份資料
 * 一律以此型別為準，未來洞府、宗門、天機、命理 App 皆共用同一份資料。
 *
 * 僅允許公開欄位，嚴禁包含任何命理／個資欄位
 * （真實姓名、八字、紫微命盤、出生資料、AI 分析、親友命理資料等）。
 */

export interface PlatformFriend {
  /** 平台使用者 UID（跨 App 唯一識別） */
  uid: string;
  /** 暱稱（公開資料） */
  nickname: string;
  /** 頭像（emoji 佔位，正式版為圖片 URL） */
  avatar: string;
  /** 最後上線時間戳 */
  lastOnlineAt: number;
  /** 是否公開個人資料 */
  isPublic: boolean;
  /** 是否公開福田狀態（是否允許被拜訪/借運，交由乾坤福田顯示） */
  farmPublic: boolean;
}

export interface PlatformFriendRequest {
  id: string;
  fromUid: string;
  fromNickname: string;
  toUid: string;
  createdAt: number;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface PlatformUserProfile {
  uid: string;
  nickname: string;
  avatar: string;
  lastOnlineAt: number;
  isPublic: boolean;
  farmPublic: boolean;
}
