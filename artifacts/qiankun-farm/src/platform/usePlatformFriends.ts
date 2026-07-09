import { useCallback, useState } from 'react';
import type { PlatformFriend } from './platformTypes';
import { addDemoPlatformFriend, getPlatformFriends } from './platformFriendsStore';

/**
 * 讀取平台級好友資料（platformFriends）。
 * 乾坤福田好友頁只能透過此 hook 讀取好友資料，不得自建獨立好友狀態。
 */
export function usePlatformFriends() {
  const [friends, setFriends] = useState<PlatformFriend[]>(() => getPlatformFriends());

  const refresh = useCallback(() => {
    setFriends(getPlatformFriends());
  }, []);

  const addFriend = useCallback((nickname: string) => {
    const trimmed = nickname.trim();
    if (!trimmed) return;
    addDemoPlatformFriend(trimmed);
    refresh();
  }, [refresh]);

  return { friends, addFriend, refresh };
}
