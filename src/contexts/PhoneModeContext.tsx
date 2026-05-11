import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { secureGetItem, secureSetItem } from "@/utils/secureStorage";

const STORAGE_KEYS = {
  phoneMode: "wowwoo_phone_mode",
  wallpaper: "wowwoo_phone_wallpaper",
  lockScreenType: "wowwoo_phone_lock_screen_type",
} as const;

export type LockScreenType = "password" | "slide";

export type PhoneScreenTab = "chat" | "moments" | "entertainment" | "profile";

type PhoneModeContextValue = {
  phoneModeEnabled: boolean;
  setPhoneModeEnabled: (v: boolean) => void;
  wallpaperUri: string | null;
  setWallpaperUri: (v: string | null) => void;
  isLocked: boolean;
  unlock: () => void;
  lock: () => void;
  /** 锁屏方式：password=密码(默认000000)，slide=滑动解锁 */
  lockScreenType: LockScreenType;
  setLockScreenType: (v: LockScreenType) => void;
  /** 手机模式下当前界面：desktop = 手机桌面，否则为对应 tab */
  phoneScreen: "desktop" | PhoneScreenTab;
  setPhoneScreen: (v: "desktop" | PhoneScreenTab) => void;
};

const PhoneModeContext = createContext<PhoneModeContextValue | null>(null);

export function PhoneModeProvider({ children }: { children: React.ReactNode }) {
  const [phoneModeEnabled, setPhoneModeEnabledState] = useState(false);
  const [wallpaperUri, setWallpaperUriState] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [phoneScreen, setPhoneScreenState] = useState<
    "desktop" | PhoneScreenTab
  >("desktop");
  const [lockScreenType, setLockScreenTypeState] =
    useState<LockScreenType>("password");
  const [hydrated, setHydrated] = useState(false);

  // 仅恢复壁纸与锁屏方式；不恢复手机模式，这样用户刷新/重启应用后会回到原始模式
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [wallpaper, savedLockType] = await Promise.all([
          secureGetItem(STORAGE_KEYS.wallpaper),
          secureGetItem(STORAGE_KEYS.lockScreenType),
        ]);
        if (!cancelled) {
          setWallpaperUriState(wallpaper || null);
          if (savedLockType === "slide" || savedLockType === "password") {
            setLockScreenTypeState(savedLockType);
          }
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPhoneModeEnabled = useCallback((v: boolean) => {
    setPhoneModeEnabledState(v);
    secureSetItem(STORAGE_KEYS.phoneMode, v ? "1" : "0");
    if (v) setIsLocked(true);
  }, []);

  const setWallpaperUri = useCallback((v: string | null) => {
    setWallpaperUriState(v);
    secureSetItem(STORAGE_KEYS.wallpaper, v ?? "");
  }, []);

  const unlock = useCallback(() => {
    setIsLocked(false);
    setPhoneScreenState("desktop");
  }, []);
  const lock = useCallback(() => setIsLocked(true), []);

  const setLockScreenType = useCallback((v: LockScreenType) => {
    setLockScreenTypeState(v);
    secureSetItem(STORAGE_KEYS.lockScreenType, v);
  }, []);

  const setPhoneScreen = useCallback((v: "desktop" | PhoneScreenTab) => {
    setPhoneScreenState(v);
  }, []);

  const value: PhoneModeContextValue = {
    phoneModeEnabled,
    setPhoneModeEnabled,
    wallpaperUri,
    setWallpaperUri,
    isLocked,
    unlock,
    lock,
    lockScreenType,
    setLockScreenType,
    phoneScreen,
    setPhoneScreen,
  };

  return (
    <PhoneModeContext.Provider value={value}>
      {children}
    </PhoneModeContext.Provider>
  );
}

export function usePhoneMode(): PhoneModeContextValue {
  const ctx = useContext(PhoneModeContext);
  if (!ctx) {
    throw new Error("usePhoneMode must be used within PhoneModeProvider");
  }
  return ctx;
}

export function usePhoneModeOptional(): PhoneModeContextValue | null {
  return useContext(PhoneModeContext);
}
